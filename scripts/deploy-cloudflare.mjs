#!/usr/bin/env node
/**
 * 一键把 Cloudflare Workers + D1 后端部署上线。
 *
 * 做的事：
 *   1. 优先复用已登录的 Cloudflare 账号；没有登录就自动创建「临时预览账号」
 *      （不需要注册、不需要 API token，60 分钟内领取即可永久保留）
 *   2. 找到或创建 D1 数据库 moneynote-d1
 *   3. 写入 D1 表结构；空库时灌入和本地后端同一批演示数据
 *   4. wrangler deploy
 *   5. 把 Worker 地址写入 dist/cloudflare-url.txt
 *
 * 之后双击「一键交付.bat」时，脚本会自动读取这个文件，
 * 把 Android APK 编译成连 Cloudflare 的版本。
 *
 * 想用永久账号 / API Token：
 *   wrangler login
 *   或 set CLOUDFLARE_API_TOKEN=...（Workers Scripts:Edit + D1:Edit）
 *   set CLOUDFLARE_ACCOUNT_ID=...   （可选，多账号时建议填）
 *   一键部署Cloudflare.bat
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WORKER_DIR = join(ROOT, 'worker');
const CONFIG = join(WORKER_DIR, 'wrangler.generated.toml');
const BOOTSTRAP_CONFIG = join(WORKER_DIR, 'wrangler.bootstrap.toml');
const DIST_DIR = join(ROOT, 'dist');
const DB_NAME = 'moneynote-d1';
const WORKER_NAME = 'moneynote-api';
const WRANGLER_PKG = 'wrangler@latest';
const TEMP_ACCOUNT_FILE = 'wrangler-temporary-account.toml';

/**
 * Windows 上直接 spawn('npx.cmd') 会报 EINVAL，必须过 cmd.exe；
 * 但过 shell 又会把带空格的 SQL 参数拆开。最稳的办法是直接
 * 用当前 node 去跑 npm 自带的 npx-cli.js，参数原样传递。
 */
function resolveNpxCli() {
  const nodeDir = dirname(process.execPath);
  const candidates = [
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
    join(nodeDir, 'lib', 'node_modules', 'npm', 'bin', 'npx-cli.js'),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

const NPX_CLI = resolveNpxCli();

let exitCode = 0;

/* ------------------------------- 终端输出 ------------------------------- */

const BAR = '='.repeat(60);

function title(text) {
  console.log('');
  console.log(BAR);
  console.log(`  ${text}`);
  console.log(BAR);
}

function step(text) {
  console.log('');
  console.log(`>> ${text}`);
}

function ok(text) {
  console.log(`   OK  ${text}`);
}

function info(text) {
  console.log(`   ${text}`);
}

function stripAnsi(text) {
  return String(text).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

/* ------------------------------- 执行命令 ------------------------------- */

function wranglerArgs(args) {
  return [NPX_CLI, '--yes', WRANGLER_PKG, ...args];
}

/**
 * @param {string[]} args
 * @param {{capture?: boolean, allowFail?: boolean, quiet?: boolean}} [options]
 */
function runWrangler(args, options = {}) {
  const capture = options.capture === true;
  const allowFail = options.allowFail === true;
  const quiet = options.quiet === true;

  if (!NPX_CLI) {
    throw new Error('找不到 npm 自带的 npx-cli.js。请用官方 Node.js 安装包重装 Node（会自带 npm）。');
  }

  const result = spawnSync(process.execPath, wranglerArgs(args), {
    cwd: ROOT,
    env: process.env,
    stdio: capture ? 'pipe' : 'inherit',
    encoding: capture ? 'utf8' : undefined,
  });

  if (result.error) {
    throw new Error(`无法启动 wrangler：${result.error.message}`);
  }

  const output = stripAnsi(`${result.stdout ?? ''}${result.stderr ?? ''}`);
  if (capture && !quiet && output.trim()) {
    // 让用户看到 wrangler 的进度/警告，但不要把它和脚本自己的输出混在一起。
    process.stdout.write(`${output.trimEnd()}\n`);
  }

  if (!allowFail && result.status !== 0) {
    // 安静模式只是不想让 80 多条 INSERT 的 JSON 刷屏；
    // 真失败时还是要把 wrangler 的原始错误完整打出来。
    if (capture && quiet && output.trim()) {
      process.stderr.write(`${output.trimEnd()}\n`);
    }
    throw new Error(`wrangler ${args.join(' ')} 失败（退出码 ${result.status}）`);
  }

  return { status: result.status, output };
}

function runNode(script, args = []) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.error) {
    throw new Error(`无法启动 node：${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`${script} 失败（退出码 ${result.status}）`);
  }
}

/* ------------------------------- 登录检查 ------------------------------- */

function isAuthed(text) {
  return !/not authenticated|not logged in|you are not authenticated|failed to authenticate/i.test(text);
}

/**
 * wrangler deploy --temporary 会把临时账号凭据写在这个文件里。
 * 每次部署都会复用它，直到 60 分钟领取窗口结束。
 */
function temporaryAccountPaths() {
  const paths = [];
  if (process.env.WRANGLER_TEMPORARY_ACCOUNT_PATH) {
    paths.push(process.env.WRANGLER_TEMPORARY_ACCOUNT_PATH);
  }
  if (process.env.APPDATA) {
    paths.push(join(process.env.APPDATA, 'xdg.config', '.wrangler', TEMP_ACCOUNT_FILE));
  }
  if (process.env.XDG_CONFIG_HOME) {
    paths.push(join(process.env.XDG_CONFIG_HOME, '.wrangler', TEMP_ACCOUNT_FILE));
  }
  paths.push(join(homedir(), '.config', '.wrangler', TEMP_ACCOUNT_FILE));
  paths.push(join(homedir(), '.wrangler', TEMP_ACCOUNT_FILE));
  return [...new Set(paths)];
}

function tomlSection(raw, name) {
  const start = raw.indexOf(`[${name}]`);
  if (start === -1) return '';
  const rest = raw.slice(start + name.length + 2);
  const next = rest.search(/\n\[/);
  return next === -1 ? rest : rest.slice(0, next);
}

function tomlValue(section, key) {
  const match = section.match(new RegExp(`^\\s*${key}\\s*=\\s*"([^"]*)"`, 'm'));
  return match ? match[1] : null;
}

function readTemporaryAccount() {
  for (const file of temporaryAccountPaths()) {
    if (!existsSync(file)) continue;
    let raw;
    try {
      raw = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const account = tomlSection(raw, 'account');
    const claim = tomlSection(raw, 'claim');
    const id = tomlValue(account, 'id');
    const apiToken = tomlValue(account, 'apiToken');
    if (!id || !apiToken) continue;
    return {
      file,
      id,
      apiToken,
      expiresAt: tomlValue(account, 'expiresAt'),
      claimUrl: tomlValue(claim, 'url'),
      claimExpiresAt: tomlValue(claim, 'expiresAt'),
    };
  }
  return null;
}

function temporaryAccountUsable(account) {
  if (!account) return false;
  if (!account.expiresAt) return true;
  const expires = Date.parse(account.expiresAt);
  if (!Number.isFinite(expires)) return true;
  return expires > Date.now() + 30_000;
}

function applyTemporaryAccount(account) {
  process.env.CLOUDFLARE_API_TOKEN = account.apiToken;
  process.env.CLOUDFLARE_ACCOUNT_ID = account.id;
}

function createBootstrapConfig() {
  const config = [
    `name = "${WORKER_NAME}"`,
    'main = "src/index.js"',
    'compatibility_date = "2025-01-01"',
    'workers_dev = true',
    '',
  ].join('\n');
  writeFileSync(BOOTSTRAP_CONFIG, config, 'utf8');
}

function extractClaimUrl(text) {
  const match = stripAnsi(text).match(
    /https:\/\/dash\.cloudflare\.com\/claim-preview\?claimToken=[A-Za-z0-9_-]+/i,
  );
  return match ? match[0] : null;
}

function ensureAuth() {
  step('检查 Cloudflare 登录状态');

  const who = runWrangler(['whoami'], { capture: true, allowFail: true });
  if (who.status === 0 && isAuthed(who.output)) {
    ok('已登录 Cloudflare（永久账号）');
    return { mode: 'permanent' };
  }

  if (process.env.CLOUDFLARE_API_TOKEN) {
    throw new Error(
      '检测到 CLOUDFLARE_API_TOKEN，但认证失败。请确认 token 有 Workers Scripts:Edit、D1:Edit 权限。',
    );
  }

  const cached = readTemporaryAccount();
  if (temporaryAccountUsable(cached)) {
    applyTemporaryAccount(cached);
    ok('复用刚才创建的临时预览账号（不用再注册）');
    info(`领取截止：${cached.expiresAt || '约 60 分钟内'}`);
    return {
      mode: 'temporary',
      claimUrl: cached.claimUrl,
      expiresAt: cached.expiresAt,
    };
  }

  info('没有登录，正在自动创建临时预览账号（不需要注册、不需要 token）。');
  info('Cloudflare 要先做一次 proof-of-work，通常几秒到几十秒。');
  createBootstrapConfig();

  const result = runWrangler(
    ['deploy', '--temporary', '--config', BOOTSTRAP_CONFIG],
    { capture: true, allowFail: true },
  );
  if (result.status !== 0) {
    throw new Error(
      '临时账号创建失败。请检查网络能否访问 api.cloudflare.com，或先运行 wrangler login 用永久账号。',
    );
  }

  const account = readTemporaryAccount();
  if (!account) {
    throw new Error('临时账号已创建，但没有找到 wrangler-temporary-account.toml。请重跑本文件。');
  }
  applyTemporaryAccount(account);
  const claimUrl = extractClaimUrl(result.output) || account.claimUrl;
  if (!claimUrl) {
    throw new Error('临时账号已创建，但没有拿到领取链接。请重跑本文件，或改用 wrangler login。');
  }
  ok('临时预览账号已创建');
  info(`领取截止：${account.expiresAt || '约 60 分钟内'}`);
  return {
    mode: 'temporary',
    claimUrl,
    expiresAt: account.expiresAt,
  };
}

/* ------------------------------- D1 数据库 ------------------------------- */

function extractJson(text) {
  const clean = stripAnsi(text);
  const start = clean.indexOf('[');
  const end = clean.lastIndexOf(']');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(clean.slice(start, end + 1));
  } catch {
    return null;
  }
}

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value && Array.isArray(value.result)) return value.result;
  if (value && Array.isArray(value.databases)) return value.databases;
  return [];
}

function databaseIdOf(row) {
  return row?.uuid ?? row?.id ?? row?.database_id ?? row?.databaseId ?? null;
}

function listDatabases() {
  const result = runWrangler(['d1', 'list', '--json'], {
    capture: true,
    allowFail: true,
    quiet: true,
  });
  if (result.status !== 0) return null;
  return asArray(extractJson(result.output));
}

function findDatabaseId() {
  const rows = listDatabases();
  if (!rows) return { id: null, rows: null };
  const row = rows.find((item) => item?.name === DB_NAME || item?.database_name === DB_NAME);
  return { id: row ? databaseIdOf(row) : null, rows };
}

function uuidFrom(text) {
  const match = stripAnsi(text).match(
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
  );
  return match ? match[0] : null;
}

function ensureDatabase() {
  step('查找 Cloudflare D1 数据库');

  const found = findDatabaseId();
  if (found.id) {
    ok(`已存在：${DB_NAME} (${found.id})`);
    return { id: found.id, created: false };
  }

  info(`没有找到 ${DB_NAME}，现在创建（免费额度足够这个 demo）。`);
  const created = runWrangler(['d1', 'create', DB_NAME, '--location', 'apac'], {
    capture: true,
    allowFail: true,
  });
  if (created.status !== 0) {
    // 可能是并发/重复创建，也可能真的失败；再查一次比猜测可靠。
    const retry = findDatabaseId();
    if (retry.id) {
      ok(`已存在：${DB_NAME} (${retry.id})`);
      return { id: retry.id, created: false };
    }
    throw new Error('D1 数据库创建失败。请确认 Cloudflare 账号已启用 D1，并且 token 有 D1:Edit 权限。');
  }

  const id = uuidFrom(created.output);
  if (!id) {
    throw new Error('D1 创建成功，但没从 wrangler 输出里解析到 database_id。请重跑本脚本。');
  }
  ok(`创建成功：${DB_NAME} (${id})`);
  return { id, created: true };
}

function writeGeneratedConfig(databaseId) {
  const template = readFileSync(join(WORKER_DIR, 'wrangler.toml'), 'utf8');
  if (!template.includes('REPLACE_WITH_D1_DATABASE_ID')) {
    throw new Error('worker/wrangler.toml 模板缺少 REPLACE_WITH_D1_DATABASE_ID 占位符。');
  }
  const config = template.replace('REPLACE_WITH_D1_DATABASE_ID', databaseId);
  writeFileSync(CONFIG, config, 'utf8');
  ok(`已生成 ${CONFIG}`);
}

function executeSqlFile(file, label) {
  step(label);
  runWrangler(
    [
      'd1',
      'execute',
      DB_NAME,
      '--remote',
      '--config',
      CONFIG,
      '--file',
      file,
      '--yes',
    ],
    { capture: true, quiet: true },
  );
  ok('执行完成');
}

function countRecords() {
  const result = runWrangler(
    [
      'd1',
      'execute',
      DB_NAME,
      '--remote',
      '--config',
      CONFIG,
      '--command',
      'SELECT COUNT(*) AS n FROM records',
      '--json',
      '--yes',
    ],
    { capture: true, allowFail: true, quiet: true },
  );

  if (result.status !== 0) return null;
  const parsed = extractJson(result.output);
  const rows = asArray(parsed);
  const n = rows[0]?.results?.[0]?.n ?? rows[0]?.results?.[0]?.N;
  if (Number.isFinite(Number(n))) return Number(n);

  // 有些 wrangler 版本会在 JSON 前面多打一行提示；直接兜底抓 "n": 数字。
  const fallback = result.output.match(/"n"\s*:\s*(\d+)/i);
  return fallback ? Number(fallback[1]) : null;
}

function seedIfEmpty(created) {
  const count = countRecords();
  if (count === null) {
    if (created) {
      info('读不到记录数（新库可能还没建表），直接灌演示数据。');
    } else {
      console.log('   警告：无法确认 D1 里是否已有数据，本次跳过往里灌数据，避免重复。');
      return;
    }
  } else if (count > 0) {
    ok(`D1 里已有 ${count} 条记录，保留现有数据`);
    return;
  }

  step('生成演示数据 SQL');
  runNode(join(ROOT, 'scripts', 'cloudflare-seed.mjs'));
  executeSqlFile(join(WORKER_DIR, 'seed.generated.sql'), '写入演示数据到 D1');
}

/* ------------------------------- 部署 Worker ------------------------------- */

function wranglerLogDirs() {
  const dirs = [];
  const home = homedir();
  if (process.env.WRANGLER_LOG_PATH) dirs.push(process.env.WRANGLER_LOG_PATH);
  if (process.env.APPDATA) dirs.push(join(process.env.APPDATA, 'xdg.config', '.wrangler', 'logs'));
  if (process.env.XDG_CONFIG_HOME) dirs.push(join(process.env.XDG_CONFIG_HOME, '.wrangler', 'logs'));
  dirs.push(join(home, '.config', '.wrangler', 'logs'));
  dirs.push(join(home, '.wrangler', 'logs'));
  return [...new Set(dirs)];
}

function newestLogSince(startedAt) {
  let best = null;
  for (const dir of wranglerLogDirs()) {
    if (!existsSync(dir)) continue;
    let names;
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.log')) continue;
      const file = join(dir, name);
      try {
        const stat = statSync(file);
        if (stat.mtimeMs < startedAt - 2000) continue;
        if (!best || stat.mtimeMs > best.mtimeMs) {
          best = { file, mtimeMs: stat.mtimeMs };
        }
      } catch {
        // 日志文件可能正在被 wrangler 写入，忽略这一条。
      }
    }
  }
  return best ? best.file : null;
}

function parseWorkerUrl(text) {
  const clean = stripAnsi(text);
  const specific = clean.match(
    new RegExp(`https://${WORKER_NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.[a-z0-9-]+\\.workers\\.dev`, 'i'),
  );
  if (specific) return specific[0];
  const any = clean.match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i);
  return any ? any[0] : null;
}

async function ask(question) {
  if (!stdin.isTTY) {
    throw new Error('当前不是交互终端，无法询问 Worker 地址。请手动把地址写入 dist/cloudflare-url.txt。');
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function deployWorker() {
  step('部署 Worker 到 Cloudflare');
  info('如果这是第一次部署，wrangler 可能会问 workers.dev 子域名：直接回车用默认，或输入一个名字。');

  const startedAt = Date.now();
  const result = runWrangler(['deploy', '--config', CONFIG], { allowFail: true });
  if (result.status !== 0) {
    throw new Error('Worker 部署失败。请把上面最后一段红色错误发出来。');
  }

  // wrangler 的终端输出不保证能直接拿到（有颜色/进度条），
  // 但它会把同一份输出写进日志文件；从日志里抓 URL 最稳。
  let url = null;
  const logFile = newestLogSince(startedAt);
  if (logFile) {
    try {
      url = parseWorkerUrl(readFileSync(logFile, 'utf8'));
    } catch {
      url = null;
    }
  }

  if (!url) {
    console.log('');
    info('没能自动识别 Worker 地址。请看上面输出里的 https://...workers.dev。');
    url = await ask('把地址粘贴到这里后回车：');
  }

  url = url.trim().replace(/\/+$/, '');
  if (!/^https:\/\/[a-z0-9.-]+\.workers\.dev$/i.test(url)) {
    throw new Error(`地址格式不对：${url || '(空)'}。应该形如 https://moneynote-api.xxx.workers.dev`);
  }
  ok(`Worker 地址：${url}`);
  return url;
}

async function waitForHealth(baseUrl) {
  step('检查线上 /api/health');
  let last = '';
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/api/health`, {
        signal: AbortSignal.timeout(10000),
      });
      const text = await response.text();
      last = `HTTP ${response.status} ${text.slice(0, 200)}`;
      if (response.ok && text.includes('"ok":true')) {
        ok(`后端在线：${last}`);
        return true;
      }
    } catch (err) {
      last = err instanceof Error ? err.message : String(err);
    }
    if (attempt < 4) {
      info(`第 ${attempt} 次没通，2 秒后重试...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // 国内网络/DNS 可能拦截 workers.dev，但部署本身已经成功。
  // 不让健康检查把整个流程判死，否则用户会误以为没部署上。
  info(`健康检查没通：${last}`);
  info('这不一定是部署失败；换手机网络或等 DNS 生效后再试即可。');
  return false;
}

function writeUrlFile(url) {
  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(join(DIST_DIR, 'cloudflare-url.txt'), `${url}\n`, 'utf8');
  ok(`已写入 dist/cloudflare-url.txt`);
}

function writeClaimFile(claimUrl) {
  mkdirSync(DIST_DIR, { recursive: true });
  writeFileSync(join(DIST_DIR, 'cloudflare-claim.txt'), `${claimUrl}\n`, 'utf8');
  ok('已写入 dist/cloudflare-claim.txt（领取链接，不要发到公开群）');
}

function openUrl(url) {
  try {
    if (process.platform === 'win32') {
      spawnSync('cmd', ['/c', 'start', '', url], { stdio: 'ignore', windowsHide: true });
    } else if (process.platform === 'darwin') {
      spawnSync('open', [url], { stdio: 'ignore' });
    } else {
      spawnSync('xdg-open', [url], { stdio: 'ignore' });
    }
  } catch {
    // 打不开浏览器也没关系，链接已经打印在终端里。
  }
}

/* ------------------------------- 主流程 ------------------------------- */

async function main() {
  title('MoneyNote · Cloudflare Workers + D1 一键上线');
  info('免费、常在线；部署完成后你的电脑关机也不影响 API。');
  info('没有 Cloudflare 账号也能先上线：脚本会自动开一个 60 分钟临时账号。');

  const auth = ensureAuth();
  const database = ensureDatabase();
  writeGeneratedConfig(database.id);
  executeSqlFile(join(WORKER_DIR, 'schema.sql'), '建表 / 更新表结构');
  seedIfEmpty(database.created);

  const url = await deployWorker();
  writeUrlFile(url);
  await waitForHealth(url);

  if (auth.mode === 'temporary' && auth.claimUrl) {
    writeClaimFile(auth.claimUrl);
    title('最后一步：60 分钟内领取临时账号');
    console.log('  临时地址现在就能访问，但 60 分钟内必须领取，否则 Cloudflare 会删除它。');
    console.log('  浏览器已经打开领取页；登录或注册 Cloudflare，然后点 Claim / 领取。');
    console.log('');
    console.log(`  领取链接：${auth.claimUrl}`);
    if (auth.expiresAt) {
      console.log(`  截止时间：${auth.expiresAt}`);
    }
    console.log('');
    openUrl(auth.claimUrl);
  }

  title('完成');
  console.log(`  云端 API：${url}`);
  console.log(`  健康检查：${url}/api/health`);
  console.log('');
  if (auth.mode === 'temporary') {
    console.log('  先完成上面的领取，再双击「一键交付.bat」。');
    console.log('  领取后地址和 D1 数据都会保留，不需要重新部署。');
  } else {
    console.log('  下一步：双击「一键交付.bat」。');
    console.log('  它会自动读取 dist/cloudflare-url.txt，把 Android APK 编译成连 Cloudflare 的版本。');
  }
  console.log('');
}

main().catch((err) => {
  exitCode = 1;
  console.error('');
  console.error('部署失败：');
  console.error(`  ${err instanceof Error ? err.message : String(err)}`);
  console.error('');
  console.error('常见原因：');
  console.error('  - api.cloudflare.com 被网络/代理拦截：关掉代理或换网络再试');
  console.error('  - 临时账号已过期：直接重跑本文件，会重新开一个');
  console.error('  - 已登录账号没启用 D1：到 dash.cloudflare.com 左侧 Workers & Pages 看一下');
  console.error('  - 想用永久账号：先运行 wrangler login，再重跑本文件');
}).finally(() => {
  process.exitCode = exitCode;
});
