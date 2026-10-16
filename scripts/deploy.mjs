#!/usr/bin/env node
/**
 * 一键交付 —— 把招聘要的两样东西自动做出来：**项目链接** 和 **应用功能录屏**。
 *
 * 用法：双击根目录的「一键交付.bat」。第一次会要你粘贴一个 GitHub 令牌，
 *       之后每次都是真·双击，不用再输任何东西。
 *
 * ---------------------------------------------------------------------------
 * 这个脚本做什么（六步，全自动）
 * ---------------------------------------------------------------------------
 *   [1/6] 检查环境，拿到 GitHub 令牌
 *   [2/6] 在 GitHub 上建一个公开仓库（已存在就跳过）
 *   [3/6] 把代码推上去（令牌只用这一次，不落盘）
 *   [4/6] 触发云端的 iOS 构建 + 模拟器录屏（GitHub 的免费 macOS 机器）
 *   [5/6] 等它跑完，把录屏下载到 dist\
 *   [6/6] 打印交付清单
 *
 * ---------------------------------------------------------------------------
 * 为什么是「iOS 录屏」而不是「安卓录屏」
 * ---------------------------------------------------------------------------
 * 因为只有 iOS 这一段能被完整自动化：GitHub 免费给一台 macOS 机器，
 * 装 Flutter、编译 iOS、启动模拟器、录屏、打包上传，全程无人值守，
 * 本机不需要装任何东西。
 *
 * 安卓录屏做不到自动化 —— 它需要在本机装 Android SDK、插一根真机数据线、
 * 用 scrcpy 对着手机操作，全是物理动作。所以安卓那一段仍然留在
 * docs/05-录屏与打包.md 里作为可选手动步骤。
 *
 * 招聘原文要的是「至少展示一个」。iOS 录屏这一个，加上仓库里真实存在的
 * app/android/ 和 app/ios/ 两个原生工程，就是「双端原生 demo」的证据。
 *
 * ---------------------------------------------------------------------------
 * 有且只有两件事**没法**自动化（这是硬约束，不是偷懒）
 * ---------------------------------------------------------------------------
 *   1. GitHub 个人访问令牌（PAT）
 *      GitHub 的安全规则不允许任何程序给自己签发凭据 —— 否则一个恶意脚本
 *      就能拿到你账号的永久访问权。必须你本人在网页点一次。
 *      这个脚本会把创建页面直接给你打开、scope 预先填好，你只需要
 *      点一下 Generate、复制、粘贴。一次 30 秒，之后永久免。
 *
 *   2. Render 账号（部署后端到云端）
 *      Render 的「授权连接 GitHub」是 OAuth 流程，只能在浏览器里点。
 *      所以后端部署没有塞进这个脚本（塞进来会让「双击就好」卡在一个
 *      自动化不了的地方），而是在第 6 步的清单里指路到 docs/06。
 *
 * ---------------------------------------------------------------------------
 * 关于令牌的存放（重要）
 * ---------------------------------------------------------------------------
 * 令牌存在 secrets/token.txt，**这个目录已经写进 .gitignore**，
 * 永远不会被提交。但这个文件是明文，所以：
 *   - 别把它发任何人
 *   - 别拷到网盘
 *   - 怀疑泄露了就去 GitHub → Settings → Developer settings 撤销重发一个
 * 脚本不打印令牌内容，任何地方都只显示前 4 位。
 */
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/* ============================ 配置 ============================ */

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** GitHub 用户名。要换账号就改这一行。 */
const OWNER = 'EL77LE';
/** 仓库名。 */
const REPO = 'moneynote';
/** 主分支名。 */
const BRANCH = 'main';
/** iOS 工作流的文件名（在 .github/workflows/ 下）。 */
const WORKFLOW_FILE = 'ios-build.yml';

/** 令牌存放位置 */
const SECRETS_DIR = join(ROOT, 'secrets');
const TOKEN_FILE = join(SECRETS_DIR, 'token.txt');

/** 产物下载到这里 */
const DIST_DIR = join(ROOT, 'dist');

/** 等构建完成的上限：40 分钟。iOS 那套平时 15~25 分钟，40 分钟还没完基本是卡住了。 */
const BUILD_TIMEOUT_MS = 40 * 60 * 1000;
/** 轮询间隔 */
const POLL_MS = 30 * 1000;

const UA = 'moneynote-oneclick-deploy';

/* ========================== 终端输出 ========================== */

const BAR = '='.repeat(60);
const THIN = '-'.repeat(60);

let exitCode = 0;

function title(t) {
  console.log('');
  console.log(BAR);
  console.log(`  ${t}`);
  console.log(BAR);
}
function step(n, total, t) {
  console.log('');
  console.log(`[${n}/${total}] ${t}`);
  console.log(THIN);
}
function ok(msg) {
  console.log(`[OK]   ${msg}`);
}
function info(msg) {
  console.log(`       ${msg}`);
}
function warn(msg) {
  console.log(`[注意] ${msg}`);
}
function fail(msg) {
  console.log(`[FAIL] ${msg}`);
  exitCode = 1;
}

/**
 * 失败时统一走这里：把原始报错原样打出来，并告诉用户怎么把它交给 AI。
 *
 * 为什么不"美化"成一句人话：因为**原始报错本身就是最有用的信息**。
 * 把它翻译成"看起来友好的话"，往往会把定位问题需要的那个关键词丢掉。
 * 这个项目里其他地方（docs/09、run-tests.mjs）也是这个思路。
 */
function bail(stepName, err) {
  console.log('');
  console.log('------------------------------------------------------------');
  console.log(`  卡在「${stepName}」这一步了`);
  console.log('------------------------------------------------------------');
  console.log('');
  console.log('不要慌，也不要自己猜。把下面这一整段原样复制给 AI（或贴给我），');
  console.log('说「这是一键交付脚本的报错，帮我看看」：');
  console.log('');
  console.log('  ---------- 从这里开始复制 ----------');
  console.log(`  步骤：${stepName}`);
  console.log(`  报错：${err && err.message ? err.message : String(err)}`);
  if (err && err.detail) {
    console.log('  详情：');
    console.log(String(err.detail).split('\n').map((l) => '    ' + l).join('\n'));
  }
  console.log('  ---------- 复制到这里 ----------');
  console.log('');
  // ⚠️ 这里**不能**用 process.exit(1) —— 我们多半是刚刚 fetch 失败进来的，
  // 带 --use-system-ca 的 Node 在这时候强退会触发 libuv 断言崩溃，
  // 把本来清晰的报错淹在一段看不懂的 C 源码断言下面。
  // 设 exitCode 让进程自然结束就行（原因见 probeGithub 上面的注释）。
  exitCode = 1;
}

/* ========================== 小工具 ========================== */

/**
 * 在项目根目录跑一条命令。返回 { ok, stdout, stderr, status }。
 *
 * 这里**刻意不用 shell**（`shell: false`），有两个原因：
 *
 *   1. Node 24 会为「shell:true + 参数数组」打一条 DEP0190 警告，
 *      说这样有注入风险（参数只是被拼起来、没有转义）。警告看着烦，
 *      而且会让用户以为脚本有问题。
 *   2. 更实在的一条：推送时要传一个**带令牌的地址**。走 shell 的话，
 *      那串字符会被 shell 再解析一遍 —— 万一令牌里出现特殊字符
 *      （虽然 ghp_ 开头的令牌不会），就是命令注入。直接作为参数传给
 *      进程，不过 shell，才是对的。
 *
 * 实测 `git` 在 Windows 上不用 shell 也能正常解析和调用。
 */
function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd ?? ROOT,
    encoding: 'utf8',
    shell: false,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    ok: r.status === 0,
    status: r.status,
    stdout: (r.stdout ?? '').trim(),
    stderr: (r.stderr ?? '').trim(),
  };
}

/** 跑一条 git 命令。 */
const git = (args, opts) => run('git', args, opts);

/** 把毫秒数说成人话 */
function human(ms) {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} 秒`;
  return `${Math.floor(s / 60)} 分 ${s % 60} 秒`;
}

/** 令牌只显示前 4 位，别把整串打进终端/日志 */
const mask = (t) => (t.length > 4 ? `${t.slice(0, 4)}…（已隐藏）` : '（已隐藏）');

/**
 * 失败就重试（异步）。`shouldRetry(e)` 返回 false 时立刻放弃，不浪费时间。
 *
 * **为什么非要有这个**（同样是真踩出来的）：
 * 2026-10-16 实测本机连 `github.com:443`，**连续 6 次 TCP 连接里有 2 次直接
 * 20 秒超时** —— 大约 1/3 的失败率。而 `api.github.com` 一直很稳
 * （0.4 秒连上），因为它俩解析到的是**不同的 IP**。
 *
 * 于是现象特别气人：脚本前面几步全都正常，就在推代码那一下
 *   Failed to connect to github.com port 443 after 21277 ms: Timed out
 * 一次性 push 撞上那 1/3 就整个失败。用户看到"连接超时"根本无从下手 ——
 * 网络明明是通的，他自己打开浏览器就能上 github.com。
 *
 * **重试在这里是安全的**，因为只对"传输层错误"重试：
 *   - `git push` 本身幂等，推成功了再推一次什么都不做；
 *   - `api()` 只在网络层异常时重试，那种情况下请求根本没送到 GitHub，
 *     不存在"重复创建仓库"之类的副作用。
 * 而 `non-fast-forward`、`401` 这类**业务错误**由 shouldRetry 挡掉，立刻失败 ——
 * 那些重试一百次也是同样的结果。
 *
 * 退避 2s / 4s / 8s：三次重试最多多等 14 秒，
 * 比让用户自己重跑一遍整个流程便宜太多了。
 */
async function retry(label, attempts, fn, { shouldRetry = () => true, noisy = true } = {}) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      if (i === attempts || !shouldRetry(e)) break;
      const wait = 2000 * 2 ** (i - 1);
      if (noisy) {
        warn(`${label}没成功（第 ${i}/${attempts} 次）：${String(e.message).split('\n')[0]}`);
        info(`网络有点抖，等 ${wait / 1000} 秒自动重试 —— 不用你做任何事。`);
      }
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}

/** 判断一个 git/网络的报错是不是"传输层抽风"，值得重试。 */
function isTransportError(text) {
  return /timed out|Failed to connect|Could not resolve|Could not read from remote|Connection reset|Connection refused|Recv failure|Send failure|early EOF|RPC failed|TLS|ECONNRESET|ETIMEDOUT|ENETUNREACH|socket hang up/i.test(
    text ?? '',
  );
}

/* ======================= 第 1 步：自检 ======================= */

function checkEnvironment() {
  step(1, 6, '检查环境');

  // --- Node 版本 ---
  // 需要 22.13+，和 run-tests.mjs 是同一个理由：低版本用 node:sqlite 要加
  // 实验性参数。这里其实只用到 fetch（18+ 就有），但保持和项目一致，
  // 免得"一键测试能跑、一键交付不能跑"这种让人困惑的差异。
  const v = process.versions.node.split('.').map(Number);
  const need = [22, 13, 0];
  const nodeOk =
    v[0] > need[0] || (v[0] === need[0] && (v[1] > need[1] || (v[1] === need[1] && v[2] >= need[2])));
  if (!nodeOk) {
    fail(`Node.js 版本太低：当前 ${process.versions.node}，需要 22.13 以上。`);
    info('装法见 docs/01-环境搭建.md');
    return null;
  }
  ok(`Node.js ${process.versions.node}`);

  // --- git ---
  const gv = git(['--version']);
  if (!gv.ok) {
    fail('找不到 git 命令。装法见 docs/11-上传到GitHub.md 第 1 节。');
    return null;
  }
  ok(gv.stdout);

  // --- 本目录是不是 git 仓库 ---
  const isRepo = git(['rev-parse', '--git-dir']).ok;
  if (!isRepo) {
    fail('这个目录还不是 git 仓库，先跑一次「一键测试.bat」，或看 docs/11 第 3 节。');
    return null;
  }
  ok('本目录已经是 git 仓库');

  // --- 有没有提交 ---
  const hasCommit = git(['rev-parse', '--verify', 'HEAD']).ok;
  if (!hasCommit) {
    fail('还没有任何提交。先在项目根目录跑一次 git commit，或看 docs/11 第 3 节。');
    return null;
  }
  ok(`已有提交 ${git(['log', '--oneline', '-1']).stdout}`);

  // --- 令牌 ---
  const token = loadOrAskToken();
  if (!token) return null;
  ok(`GitHub 令牌 ${mask(token)}`);

  return token;
}

/**
 * 问用户要令牌时显示的那行提示。
 *
 * ⚠️⚠️ **它必须写进 stderr，绝不能写 stdout。**
 *
 * 这是本项目最阴的一个 bug，值得完整记下来：
 *
 * `askForTokenSync()` 起了一个子进程，用 `stdio: ['inherit','pipe','inherit']`
 * 让**子进程的 stdout 被管道捕获**，父进程再从 `r.stdout` 里取出用户粘贴的令牌。
 * 而子进程顺手把自己那句提示语也 `process.stdout.write()` 到了 stdout ——
 * 于是提示语和令牌被拼成了一串，一起当成令牌用了：
 *
 *     secrets/token.txt 里实际存的是：
 *     「把刚刚复制的那串粘贴到这里，然后按回车：⏎  > ghp_xxxxxxxx…」
 *
 * 用户看到的现象是一句莫名其妙的
 *   Cannot convert argument to a ByteString because the character at index 7
 *   has a value of 25226 which is greater than 255
 * 然后**用户粘的其实是完全正确的令牌**，他却会以为是自己复制错了，
 * 反复去 GitHub 重新签发 —— 而问题在这行提示语上，和他一点关系都没有。
 *
 * 修法：提示语走 stderr（stderr 配的是 'inherit'，直接进控制台，不进管道），
 * stdout 里就只剩下用户粘的那串了。
 *
 * 下面 loadOrAskToken() 里还有一段"修复历史污染"的代码，
 * 用来救回已经被这个 bug 写坏的文件（令牌在 GitHub 上只显示一次，
 * 不救回来用户就得重新签发一个）。
 */
const TOKEN_PROMPT = '  把刚刚复制的那串粘贴到这里，然后按回车：\n  > ';

/**
 * 检查一串字符**长得像不像** GitHub 令牌。像 → 返回 null；不像 → 返回一句人话。
 *
 * **为什么必须有这一步**（这是真踩出来的，不是防患于未然）：
 * 2026-10-16 第一次真跑，用户把一段**中文说明**粘进了令牌输入框。
 * 脚本当时照单全收，一路走到 fetch 才炸，报的是：
 *
 *   Cannot convert argument to a ByteString because the character at index 7
 *   has a value of 25226 which is greater than 255
 *
 * 然后这句又被网络层的 catch 接住，显示成「检查一下网络」——
 * 和真实原因差了十万八千里，白白浪费一轮排查。
 *
 * 关键知识：**Node 的 fetch 在"设置请求头"时就会逐字节检查，非 ASCII 直接抛
 * TypeError**，这时候一个包都还没发出去。所以凡是带 ByteString 的报错，
 * 永远不可能是网络问题 —— 只能是令牌（或别的请求头）里混进了非法字符。
 *
 * 检查顺序不能反：先查空白，再查非 ASCII。
 * 因为制表符(0x09)、换行(0x0A)本身就在 ASCII 范围外，
 * 先查非 ASCII 的话，一个混了换行的令牌会被报成"里面有中文字符"，又误导人。
 */
function tokenProblem(raw) {
  const t = (raw ?? '').trim();
  if (!t) return '它是空的。';
  if (/\s/.test(t)) return '中间混进了空格、制表符或换行。';

  if (/[^\x20-\x7E]/.test(t)) {
    const bad = [...t].find((c) => c.codePointAt(0) > 255) ?? '?';
    return `里面有非 ASCII 字符（第一个是「${bad}」）——这看起来是**一段话**，不是令牌。`;
  }

  // 真实令牌长度：classic PAT 是 40 字符。给到 20 是为了
  // "复制了一半"这种最常见的情况也能被拦住，同时不误伤将来的格式变化。
  if (t.length < 20) return `只有 ${t.length} 个字符，太短了 —— 多半只复制到一半。`;

  if (!/^(ghp_|github_pat_)/.test(t)) {
    return '不是 GitHub 令牌的样子（应该以 ghp_ 或 github_pat_ 开头）。';
  }
  return null;
}

/** 提示用户去哪儿重新拿一个令牌。多处失败路径共用，避免文案漂移。 */
function tokenHelp() {
  info('重新拿一个令牌：');
  info('  https://github.com/settings/tokens/new?scopes=repo,workflow&description=MoneyNote-oneclick');
  info('注意：要复制的是页面**顶部出现的那串字符**旁边的小复制按钮；');
  info('不要把页面上的说明文字选中复制 —— 那是中文，粘进来必然失败。');
}

/** 读令牌；没有就问用户要一次，然后存起来。 */
function loadOrAskToken() {
  // 不管令牌从哪儿来（环境变量、文件、现场粘贴），**一律先过格式检查**。
  // 漏掉任何一条路径，就等于留了一个"要跑到 fetch 才炸"的后门。
  const fromEnv = (process.env.GITHUB_TOKEN ?? '').trim();
  if (fromEnv) {
    const p = tokenProblem(fromEnv);
    if (p) {
      fail(`环境变量 GITHUB_TOKEN 里放的不是 GitHub 令牌：${p}`);
      return null;
    }
    info('用的是环境变量 GITHUB_TOKEN');
    return fromEnv;
  }

  if (existsSync(TOKEN_FILE)) {
    let t = readFileSync(TOKEN_FILE, 'utf8').trim();

    // 救回被旧版本 bug 写坏的文件：提示语 + 令牌被拼在了一起。
    // 只剥离**本脚本自己那句提示语**这个已知前缀，不做任何"猜其中一个 ghp_ 出来"
    // 之类的聪明事 —— 那种做法会掩盖真正的错误。
    // 详见 TOKEN_PROMPT 上面那段注释。
    const promptPrefix = TOKEN_PROMPT.trim();
    if (t.startsWith(promptPrefix)) {
      t = t.slice(promptPrefix.length).trim();
      warn('secrets/token.txt 里混进了一段提示语（脚本旧版本的 bug），已经自动剥离。');
      // 顺手把干净的版本写回去，下次就不用再剥离一遍
      try {
        writeFileSync(TOKEN_FILE, t + '\n', 'utf8');
      } catch {
        /* 写不回去也不影响本次运行，最多下次再剥一遍 */
      }
    }

    if (t) {
      const p = tokenProblem(t);
      if (!p) {
        info(`从 secrets/token.txt 读到令牌 ${mask(t)}（以后不用再输了）`);
        return t;
      }
      // 存过、但存的是坏的。
      // **这里不直接失败退出** —— 让用户重新粘一次就好了，没必要让他先去手动删文件。
      // 重新粘成功后会把坏内容**覆盖掉**，所以也不需要清理。
      warn(`secrets/token.txt 里的内容不是令牌：${p}`);
      info('（这是上次粘贴时写进去的，重新粘一次就会覆盖它。）');
      console.log('');
    }
  }

  // 没有令牌 —— 这是第一次，也是整个流程里唯一需要你动手的地方
  console.log('');
  console.log('------------------------------------------------------------');
  console.log('  第一次运行，需要你给一个 GitHub 令牌（只需这一次）');
  console.log('------------------------------------------------------------');
  console.log('');
  console.log('  这是 GitHub 的安全规定：任何程序都不能自己给自己签发凭据。');
  console.log('  所以必须你本人在网页上点一次。大概 30 秒。');
  console.log('');
  console.log('  我已经帮你把创建页面打开了（如果没弹出来，手动复制下面这个地址）：');
  console.log('');
  const url =
    'https://github.com/settings/tokens/new' +
    '?scopes=repo,workflow' +
    '&description=MoneyNote-oneclick';
  console.log(`  ${url}`);
  console.log('');
  console.log('  页面上的操作，三步：');
  console.log('');
  console.log('    1. Note 已经填好了（MoneyNote-oneclick），不用改');
  console.log('    2. Expiration 可以选 30 days 或 No expiration，随你');
  console.log('    3. 往下拉，勾选这两个（页面应该已经替你勾好了）：');
  console.log('         [x] repo        —— 用来建仓库和推代码');
  console.log('         [x] workflow    —— 用来触发 iOS 构建');
  console.log('       然后点最下面的绿色按钮「Generate token」');
  console.log('');
  console.log('    4. 页面顶部会出现一串 ghp_ 开头的字符，点它旁边的复制按钮');
  console.log('       ⚠️ 这串字符**只显示这一次**，刷新页面就再也看不到了');
  console.log('');

  // 尝试自动打开浏览器（失败也不要紧，上面已经给了地址）
  try {
    spawnSync(`start "" "${url}"`, { shell: true, stdio: 'ignore' });
  } catch {
    /* 打不开就算了，用户自己复制地址 */
  }

  return askForTokenSync();
}

/**
 * 同步地问用户要令牌。
 *
 * 为什么要起一个子进程 + 读它的输出，而不是直接用 readline？
 * 因为本文件后面的流程是「从头到尾一条直线」的同步代码，
 * 而 readline 是异步的 —— 混在一起会让整个脚本变成 async 传染。
 * 用一个只干「读一行」的小子进程，读到的字符串直接当返回值用，
 * 主线逻辑保持同步，好读也好改。
 */
function askForTokenSync() {
  // 子进程只干一件事：读一行，原样写回 stdout。
  //
  // ⚠️ 提示语写的是 **stderr**，不是 stdout。这一行是本次 bug 的根因修复，
  //    理由见 TOKEN_PROMPT 上面那段注释（stdout 配的是 pipe，是父进程用来
  //    接收令牌的通道，往里面多写一个字符都会污染令牌）。
  //    stderr 配的是 inherit，直接进控制台，不进管道。
  //
  // 提示语用 JSON.stringify 注入而不是手拼字符串 —— 它里面有中文和换行，
  // 手拼一个引号或反斜杠就容易出错，而且错了会很难看出来。
  const childCode = [
    'const rl = require("readline").createInterface({ input: process.stdin, output: process.stdout });',
    `process.stderr.write(${JSON.stringify(TOKEN_PROMPT)});`,
    'rl.once("line", (l) => { rl.close(); process.stdout.write(l.trim()); });',
  ].join('\n');

  const r = spawnSync(process.execPath, ['-e', childCode], {
    encoding: 'utf8',
    stdio: ['inherit', 'pipe', 'inherit'],
    shell: false,
  });

  const raw = r.stdout ?? '';
  const token = raw.trim();

  // 哨兵：正常情况下这个管道里**只应该有令牌那一行**。
  // 万一以后有人（包括我）又往子进程的 stdout 里写了别的东西，
  // 这里会立刻喊出来 —— 而不是像上次那样，把污染后的字符串
  // 一路带到 fetch 才炸，还报成"检查一下网络"。
  if (raw.split('\n').filter((l) => l.trim() !== '').length > 1) {
    warn('内部错误：接收令牌的通道里出现了多余的内容 —— 这是脚本自身的 bug，不是你的操作问题。');
    info('（还是按整段处理了。请把这段话复制给 AI。）');
  }
  console.log('');

  const problem = tokenProblem(token);
  if (problem) {
    // 硬拦。存一个坏的进去，只会让下一次运行在一模一样的地方再炸一次，
    // 而且那时候用户已经不记得自己粘过什么了。
    fail(`这不是一个能用的 GitHub 令牌：${problem}`);
    tokenHelp();
    info('（这次没有把它存进 secrets/token.txt —— 改好之后再跑一次就行。）');
    return null;
  }

  try {
    mkdirSync(SECRETS_DIR, { recursive: true });
    writeFileSync(TOKEN_FILE, token + '\n', 'utf8');
    ok('令牌已存到 secrets/token.txt（这个目录不会进 git，下次不用再输）');
  } catch (e) {
    warn(`令牌存不下来（${e.message}），这次能跑，但下次还得重新粘贴。`);
  }

  return token;
}

/* ====================== GitHub API 封装 ====================== */

async function api(path, { method = 'GET', body, allow404 = false, token } = {}) {
  let res;
  try {
    res = await retry(
      `${method} ${path}`,
      3,
      () =>
        fetch(`https://api.github.com${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'User-Agent': UA,
            ...(body ? { 'Content-Type': 'application/json' } : {}),
          },
          body: body ? JSON.stringify(body) : undefined,
        }),
      {
        // 请求头里有非法字符属于**输入错误**（比如令牌粘错了），
        // 重试一百次也是同样的结果 —— 必须立刻报出来，别浪费用户 14 秒。
        // 其余（DNS、超时、连接被重置）都是网络抽风，值得重试。
        shouldRetry: (e) => !/ByteString|invalid header|header value/i.test(e.message ?? ''),
      },
    );
  } catch (e) {
    // ⚠️ 这一个 catch 里混着**两种毫无关系**的失败，别一锅端地都说成"检查一下网络"。
    //
    //   1. 真的网络问题：DNS 解析不了、断网、被墙、证书验不过。
    //   2. 请求头里有非法字符：Node 的 fetch 在**设置请求头**时就逐字节检查，
    //      非 ASCII 直接抛 TypeError，报文里带 "ByteString"。
    //      这时候一个包都还没发出去，和网络半点关系都没有。
    //
    // 这两种原来被报成同一句话，于是"令牌里混了中文"显示成了"检查一下网络"，
    // 排查方向整个跑偏 —— 2026-10-16 真事，就是这次。
    const headerIssue = /ByteString|invalid header|header value/i.test(e.message ?? '');
    const err = new Error(`连不上 api.github.com：${e.message}`);
    err.detail = headerIssue
      ? '这不是网络问题 —— 请求头里有非法字符，几乎一定是**令牌里混进了中文、空格或换行**。\n' +
        '删掉 secrets\\token.txt 再跑一次，会让你重新粘一个。'
      : '检查一下网络。如果开着代理/加速器，试着关掉再跑一次。';
    throw err;
  }

  if (res.status === 404 && allow404) return null;

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* 不是 JSON，留着原文 */
  }

  if (!res.ok) {
    const err = new Error(`GitHub API ${method} ${path} 返回 ${res.status}`);
    err.detail = json?.message ? `${json.message}\n${text}` : text;

    if (res.status === 401) {
      err.detail +=
        '\n\n401 = 令牌无效。多半是：复制少了字符、令牌过期了、或者已经被撤销。' +
        '\n删掉 secrets\\token.txt 再跑一次，会让你重新粘一个。';
    }
    if (res.status === 403) {
      err.detail +=
        '\n\n403 = 权限不够或者被限流。检查令牌是不是只勾了 repo 和 workflow；' +
        '\n如果是刚跑过很多次，等一小时再试（GitHub 对匿名/低配额请求有速率限制）。';
    }
    if (res.status === 422) {
      err.detail += '\n\n422 = 请求内容不合法，通常是仓库名重复或格式不对。';
    }
    throw err;
  }

  return json;
}

/* ==================== 第 2 步：建仓库 ==================== */

async function ensureRepo(token) {
  step(2, 6, '在 GitHub 上准备仓库');

  const existing = await api(`/repos/${OWNER}/${REPO}`, { allow404: true, token });

  if (existing) {
    ok(`仓库已存在：${existing.full_name}`);
    const vis = existing.private ? '私有' : '公开';
    if (existing.private) {
      warn(`⚠️ 这个仓库现在是「私有」的。`);
      info('招聘方要的是「项目链接」，私有仓库别人点开是 404 —— 他不会来问你，只会认为链接是坏的。');
      info(`去这里改成公开：https://github.com/${OWNER}/${REPO}/settings`);
      info('（Settings 页拉到最下面 Danger Zone → Change repository visibility）');
    } else {
      ok(`可见性：${vis} ✓`);
    }
    return existing;
  }

  info('仓库不存在，正在创建...');
  const created = await api('/user/repos', {
    method: 'POST',
    body: {
      name: REPO,
      description: '双端原生记账 App · Flutter + Node.js',
      private: false,
      // auto_init: false 是关键 —— 让它别自动生成 README。
      // 一旦远端有了提交，我们本地的 push 就会被拒（non-fast-forward），
      // 而这一步的报错对新手来说很难懂。空仓库推起来最干净。
      auto_init: false,
      has_issues: true,
      has_wiki: false,
    },
    token,
  });
  ok(`仓库已创建：${created.html_url}`);
  return created;
}

/* ===================== 第 3 步：推代码 ===================== */

async function pushCode(token) {
  step(3, 6, '把代码推上去');

  // 确保在 main 分支上（git init -b main 已经是了，这里是兜底）
  const cur = git(['branch', '--show-current']).stdout;
  if (cur && cur !== BRANCH) {
    info(`当前分支是 ${cur}，切到 ${BRANCH}...`);
    const r = git(['branch', '-M', BRANCH]);
    if (!r.ok) throw Object.assign(new Error('切分支失败'), { detail: r.stderr });
  }

  // origin 配成不带令牌的干净地址，方便你以后自己用 git 命令
  const cleanUrl = `https://github.com/${OWNER}/${REPO}.git`;
  const hasOrigin = git(['remote', 'get-url', 'origin']).ok;
  if (hasOrigin) {
    git(['remote', 'set-url', 'origin', cleanUrl]);
  } else {
    git(['remote', 'add', 'origin', cleanUrl]);
  }
  ok(`origin → ${cleanUrl}`);

  // 待推送的文件数（让你知道这次要传多少）
  const tracked = git(['ls-files']).stdout.split('\n').filter(Boolean).length;
  info(`本次要推送 ${tracked} 个文件（最大的那个是 8 MB 的中文字体，慢几十秒是正常的，别以为卡死）`);

  // ⚠️ 令牌只出现在这一条命令里，不写进 .git/config。
  //
  // 为什么用 `git push <带令牌的地址>` 而不是 `git remote set-url`：
  // set-url 会把令牌**永久写进 .git/config 这个明文文件**，
  // 谁拿到你的项目目录就拿到你的 GitHub 写权限。
  // 直接作为参数传，只在这一次进程里存在。
  //
  // 也刻意**不加 -u**：加了会把带令牌的地址记成上游分支，等于写进配置。
  const pushUrl = `https://x-access-token:${token}@github.com/${OWNER}/${REPO}.git`;
  info('正在推送...');

  // 把"推一次，失败就 throw"包成一个函数交给 retry，
  // 重试的编排就不用掺进这段主流程里。
  const pushOnce = () => {
    const res = git(['push', pushUrl, `${BRANCH}:${BRANCH}`]);
    if (res.ok) return res;

    const err = new Error('git push 失败');
    // git 会把带令牌的地址原样打进报错里 —— 必须抹掉再给用户看，
    // 否则用户复制报错去问 AI 的时候就把令牌一起发出去了。
    err.detail = (res.stderr || res.stdout || '').split(token).join('***已隐藏***');

    if (/non-fast-forward|rejected/i.test(err.detail)) {
      err.detail +=
        '\n\n原因：远端仓库里已经有提交了（多半是建仓库时勾了 "Add a README file"）。' +
        '\n两个办法：' +
        '\n  A. 去 GitHub 把那个仓库删掉，重新跑这个脚本（最干净）' +
        '\n  B. 在项目根目录执行：git push -f <地址> main:main  —— 会覆盖远端' +
        '\n推荐 A。';
    }
    if (/Authentication failed|403|denied/i.test(err.detail)) {
      err.detail +=
        '\n\n原因：令牌没有推送权限。去 GitHub 检查令牌的 scope 是不是勾了 repo。' +
        '\n改完删掉 secrets\\token.txt 重新跑。';
    }
    throw err;
  };

  const r = await retry('推送', 4, async () => pushOnce(), {
    // 只对"连接/传输抽风"重试。non-fast-forward、401 这类是业务错误，
    // 重试一百次也是同样的结果，立刻失败反而更有用。
    shouldRetry: (e) => isTransportError(e.detail ?? e.message),
  });

  ok('推送完成');
  if (r.stdout) info(r.stdout.split('\n')[0]);
}

/* ================== 第 4 步：触发 iOS 构建 ================== */

/**
 * 等 GitHub 把我们的 workflow 文件注册好。
 *
 * 坑：刚 push 完的那几秒，GitHub 还在后台索引 .github/workflows/，
 * 这时候调 dispatch 接口会返回 404「找不到这个 workflow」——
 * 而文件明明就在那儿。直接报错会让用户以为是自己哪里做错了。
 * 所以这里要重试，而不是一失败就放弃。
 */
async function dispatchWorkflow(token) {
  const path = `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`;
  const body = { ref: BRANCH, inputs: { record_seconds: '30' } };

  let lastErr = null;
  for (let i = 1; i <= 12; i++) {
    try {
      await api(path, { method: 'POST', body, token });
      return;
    } catch (e) {
      lastErr = e;
      const notReady = /返回 404/.test(e.message);
      if (!notReady) throw e;
      if (i === 1) info('GitHub 还在索引工作流文件，稍等一下...');
      await sleep(10_000);
    }
  }

  const err = new Error('触发了 12 次都没成功（每次间隔 10 秒，共 2 分钟）');
  err.detail =
    `${lastErr?.detail ?? ''}\n\n` +
    `如果一直是 404，最可能的原因是：工作流文件没被推上去。\n` +
    `去 https://github.com/${OWNER}/${REPO}/actions 看看页面上有没有\n` +
    `「iOS 模拟器构建与录屏」这一项。没有的话，说明 .github/workflows/ 没传上去。`;
  throw err;
}

/**
 * 找到刚才触发的那次运行。
 *
 * dispatch 接口**不返回 run id**（这是个已知的 API 设计问题），
 * 所以只能反过来查列表，再按创建时间挑出我们这一次。
 */
async function findRun(token, dispatchedAtMs) {
  const path =
    `/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs` +
    `?event=workflow_dispatch&per_page=10`;

  for (let i = 0; i < 20; i++) {
    const data = await api(path, { token });
    const runs = data?.workflow_runs ?? [];
    // 留 60 秒余量，防止本机时钟和 GitHub 有偏差
    const mine = runs.find((r) => new Date(r.created_at).getTime() >= dispatchedAtMs - 60_000);
    if (mine) return mine;
    await sleep(5_000);
  }
  throw new Error('触发了构建，但 100 秒内没在列表里找到它。去仓库的 Actions 页面看一眼。');
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 轮询到这次运行结束。 */
async function waitForRun(token, initialRun) {
  const started = Date.now();
  let run = initialRun;

  for (;;) {
    if (run.status === 'completed') return run;

    const elapsed = Date.now() - started;
    if (elapsed > BUILD_TIMEOUT_MS) {
      const err = new Error(`等了 ${human(elapsed)} 还没结束，先不等了`);
      err.detail =
        `这次运行还在跑：${run.html_url}\n` +
        `你可以直接打开那个链接看进度。跑完之后在页面底部的 Artifacts 里下载录屏。`;
      throw err;
    }

    const label = run.status === 'queued' ? '排队中' : '构建中';
    process.stdout.write(
      `\r       ${label}… 已等 ${human(elapsed)}（每 30 秒看一次，不用管它）   `,
    );

    await sleep(POLL_MS);
    run = await api(`/repos/${OWNER}/${REPO}/actions/runs/${run.id}`, { token });
  }
}

/* =================== 第 5 步：下载录屏 =================== */

/**
 * 下载 artifact。
 *
 * GitHub 的这个接口先返回 302，跳到另一个域名上的**签名地址**。
 * 关键点：**重定向之后不能再带 Authorization 头** —— 那个域名不认它，
 * 带了会返回 401。所以这里手动处理跳转，第二步不带令牌。
 * 用 fetch 的默认 follow 行为会踩到这个坑，务必别改回去。
 */
async function downloadArtifact(url, token, destZip) {
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': UA,
    },
    redirect: 'manual',
  });

  if (res.status !== 302) {
    const err = new Error(`下载产物时预期 302 跳转，实际拿到 ${res.status}`);
    err.detail = await res.text().catch(() => '');
    throw err;
  }

  const location = res.headers.get('location');
  const blob = await fetch(location, { redirect: 'follow' });
  if (!blob.ok) {
    const err = new Error(`从签名地址下载失败：HTTP ${blob.status}`);
    err.detail = '签名地址有时效（通常几分钟）。重新运行一次这个脚本即可。';
    throw err;
  }

  writeFileSync(destZip, Buffer.from(await blob.arrayBuffer()));
  return statSync(destZip).size;
}

/**
 * 解压 zip。
 *
 * ⚠️ 实测踩到的坑，别改：
 * 在这台机器上，`tar` 走 PATH 命中的是 **Git 自带的 GNU tar**，
 * 它**不认识 zip**，会报 "This does not look like a tar archive"。
 * 而 Windows 自带的 `C:\Windows\System32\tar.exe` 是 bsdtar，**认识 zip**。
 * 所以必须用**绝对路径**，不能图省事写 `tar`。
 * （实测 `C:\Windows\System32\tar.exe -xf x.zip -C out` 解出来的中文文件名也正常。）
 *
 * 兜底：PowerShell 的 Expand-Archive（Windows 自带，一定能用，只是慢一点）。
 */
function unzip(zipPath, outDir) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const bsdtar = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe');
  if (existsSync(bsdtar)) {
    const r = spawnSync(bsdtar, ['-xf', zipPath, '-C', outDir], { encoding: 'utf8' });
    if (r.status === 0) return 'bsdtar';
  }

  const r = spawnSync(
    'powershell',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath}' -DestinationPath '${outDir}' -Force`,
    ],
    { encoding: 'utf8', shell: false },
  );
  if (r.status === 0) return 'PowerShell';

  const err = new Error('解压失败：bsdtar 和 PowerShell 两条路都没成功');
  err.detail = `${r.stderr ?? ''}\n${r.stdout ?? ''}`;
  throw err;
}

/** 在目录树里找第一个指定后缀的文件 */
function findFile(dir, ext) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      const hit = findFile(p, ext);
      if (hit) return hit;
    } else if (name.toLowerCase().endsWith(ext)) {
      return p;
    }
  }
  return null;
}

async function fetchRecording(token, run) {
  step(5, 6, '下载录屏');

  const { artifacts } = await api(`/repos/${OWNER}/${REPO}/actions/runs/${run.id}/artifacts`, {
    token,
  });

  if (!artifacts || artifacts.length === 0) {
    const err = new Error('这次运行没有产出任何 artifact');
    err.detail =
      `去 ${run.html_url} 看一眼「上传录屏和截图」那一步是不是被跳过了。\n` +
      `通常是因为前面某一步已经先失败了 —— 往上翻，找第一个红色的叉。`;
    throw err;
  }

  // 优先挑我们那个；万一名字变了，就挑最大的那个（录屏肯定最大）
  const target =
    artifacts.find((a) => a.name === 'ios-simulator-recording') ??
    [...artifacts].sort((a, b) => b.size_in_bytes - a.size_in_bytes)[0];

  info(`产物：${target.name}（${(target.size_in_bytes / 1024 / 1024).toFixed(1)} MB）`);

  mkdirSync(DIST_DIR, { recursive: true });
  const zipPath = join(DIST_DIR, `${target.name}.zip`);

  info('正在下载...');
  await downloadArtifact(target.archive_download_url, token, zipPath);
  ok('下载完成');

  const extractDir = join(DIST_DIR, 'ios');
  const how = unzip(zipPath, extractDir);
  ok(`解压完成（用的 ${how}）`);

  const mp4 = findFile(extractDir, '.mp4');
  const png = findFile(extractDir, '.png');

  const out = { mp4: null, png: null };

  if (mp4) {
    // 换个好认的名字，方便你直接拖进邮件
    out.mp4 = join(DIST_DIR, 'demo-ios.mp4');
    rmSync(out.mp4, { force: true });
    renameSync(mp4, out.mp4);
    ok(`录屏：${out.mp4}（${(statSync(out.mp4).size / 1024 / 1024).toFixed(1)} MB）`);
  } else {
    warn('解压出来没找到 .mp4 —— 去 dist\\ios\\ 里看看有什么。');
  }

  if (png) {
    out.png = join(DIST_DIR, 'ios-截图.png');
    rmSync(out.png, { force: true });
    renameSync(png, out.png);
    ok(`截图：${out.png}`);
  }

  // zip 留着占地方，删掉（内容已经解出来了）
  rmSync(zipPath, { force: true });

  return out;
}

/* ===================== 第 6 步：交付清单 ===================== */

function summary(recording) {
  step(6, 6, '你现在有了什么');

  const repoUrl = `https://github.com/${OWNER}/${REPO}`;

  console.log('  招聘原文要两样东西，这两样现在都在你手上了：');
  console.log('');
  console.log('  ┌─ ① 项目链接 ────────────────────────────────────────────');
  console.log(`  │  ${repoUrl}`);
  console.log('  │');
  console.log('  │  这就是要填进邮件的那一行。先自己点开看一眼：');
  console.log('  │  能看到文件列表 = 好的；跳到登录页 = 仓库还是私有的。');
  console.log('  └─────────────────────────────────────────────────────────');
  console.log('');
  console.log('  ┌─ ② 应用功能录屏 ────────────────────────────────────────');
  if (recording.mp4) {
    console.log(`  │  ${recording.mp4}`);
  } else {
    console.log('  │  （这次没下到 mp4，去 dist\\ 里看看）');
  }
  if (recording.png) {
    console.log(`  │  ${recording.png}   ← 顺手截的一张，可以当邮件配图`);
  }
  console.log('  │');
  console.log('  │  这是 iOS 模拟器上的真实录屏，在 GitHub 的云端 macOS 上跑的。');
  console.log('  └─────────────────────────────────────────────────────────');
  console.log('');
  console.log('  另外，考核「双端原生」的证据也不用另外准备 —— 它们已经在仓库里了：');
  console.log(`     ${repoUrl}/tree/main/app/android   ← 安卓原生工程`);
  console.log(`     ${repoUrl}/tree/main/app/ios       ← iOS 原生工程`);
  console.log('');
  console.log(THIN);
  console.log('  接下来还剩三件事（都不影响你现在就把邮件发出去）：');
  console.log('');
  console.log('   1. 部署后端到云端 —— 让「电脑关机了 App 还能用」，也让 APK 发给别人能直接用');
  console.log('      看 docs/06-部署后端到公网.md。约 30 分钟，免费。');
  console.log('');
  console.log('   2. 网页版 —— 面试官点开就能玩，不用装任何东西。转化率最高的一项');
  console.log('      看 docs/12-部署到网页端.md。');
  console.log('');
  console.log('   3. 写邮件 —— 看 docs/07-发邮件给HR.md，收件人 ltx@techlz.com');
  console.log('');
  console.log('  ⚠️ 录屏已经下到本地了，所以 Render 那边休眠、丢数据都不影响你手上这一段。');
  console.log('     但如果你想再录一次，记得先打开后端地址把服务唤醒（它会睡）。');
  console.log('');
}

/* ======================= 证书自愈（很关键） ======================= */

/**
 * 让 Node 认得住本机的 HTTPS 证书。
 *
 * ---------------------------------------------------------------------------
 * 这个函数是实测踩出来的，不加的话脚本**一行都跑不动**
 * ---------------------------------------------------------------------------
 * 现象：Node 自带的 fetch 连 api.github.com 报
 *   UNABLE_TO_VERIFY_LEAF_SIGNATURE
 *   "unable to verify the first certificate"
 * 但同一个域名用 curl 能连上（只是 curl 也报证书问题），
 * 而且 TCP 握手只要 4.5 毫秒 —— 从国内连 GitHub 的新加坡节点不可能这么快。
 *
 * 结论：**本机有一个 TLS 拦截层**（常见来源：杀毒软件的"网页防护/HTTPS 扫描"、
 * 公司代理、本机代理工具）。它把证书换成了由**本地根证书**签发的那一份。
 *
 * 而 **Node 不读 Windows 的证书库** —— 它用的是自己捆绑的一份 Mozilla CA 列表，
 * 里面没有那个本地根证书，所以验不过。Windows 系统证书库里是有的。
 *
 * 实测对照（同一台机器、同一时刻）：
 *   Node 自带 CA      ：api.github.com ❌  百度 ✅  npm ✅  ipinfo ✅
 *   --use-system-ca  ：api.github.com ✅  百度 ✅  npm ✅
 * 也就是说**只有 GitHub 中招**，别的站点都正常 ——
 * 所以光看"别的网站能上"会误判成"网络没问题"，格外难查。
 *
 * 做法：先探一下。自带 CA 能通就什么都不做；不能通就用 --use-system-ca
 * 把自己重新启动一遍。这样在**没有拦截的正常网络里也不会被影响**。
 */
function ensureSystemCa() {
  // 已经是用系统 CA 重启过的进程，别再套娃
  if (process.env.MONEYNOTE_CA_MODE === 'system') return;

  if (probeGithub()) return;

  if (!probeGithub('--use-system-ca')) {
    // 两条路都不通 —— 那就不是证书的事（可能是断网或真被墙），
    // 交给后面的 API 调用去报错，那里的提示更具体
    return;
  }

  console.log('');
  console.log('  检测到本机的 HTTPS 证书由本地根证书签发（杀毒软件的网页扫描、');
  console.log('  公司代理或本机代理工具都会这样）。Node 自带的证书库认不出它，');
  console.log('  正在用 Windows 系统证书库重新启动自己...');
  console.log('');

  const r = spawnSync(
    process.execPath,
    ['--use-system-ca', fileURLToPath(import.meta.url), ...process.argv.slice(2)],
    {
      stdio: 'inherit',
      env: { ...process.env, MONEYNOTE_CA_MODE: 'system' },
    },
  );

  // 子进程已经干完了全部活，父进程到此为止
  process.exit(r.status ?? 1);
}

/**
 * 探一下 api.github.com 通不通。flag 传 '--use-system-ca' 就带那个参数试。
 *
 * ⚠️ 这里有两处是实测踩出来的，改之前先看完：
 *
 * 【一】判断依据是**写进文件的标记**，不是退出码。
 *   带 --use-system-ca 的 Node，如果 fetch 之后立刻调 process.exit()，
 *   会在退出阶段触发 libuv 断言崩溃：
 *     Assertion failed: !(handle->flags & UV_HANDLE_CLOSING),
 *     file src\win\async.c, line 76
 *   退出码变成 127 —— 而它**其实已经成功拿到了 HTTP 200**。
 *   实测三种写法（同一台机器、同一时刻）：
 *     fetch 后立刻 process.exit(0)   -> 打印了 HTTP 200，但退出码 127 ❌
 *     await fetch 后自然结束          -> 退出码 0 ✅
 *     await fetch + 等 2 秒           -> 退出码 0 ✅
 *   所以：这里不靠退出码；脚本主体那头把 process.exit() 换成 process.exitCode。
 *
 * 【二】标记用 writeFileSync 写文件，不走 console.log。
 *   管道里的 stdout 是**异步**的，进程崩掉时可能还没冲刷出去，
 *   这样"其实成功了"又会被误判成失败。writeFileSync 是同步的，
 *   在崩溃之前一定已经落盘。
 */
function probeGithub(flag) {
  const marker = join(
    tmpdir(),
    `moneynote-ca-probe-${process.pid}-${Math.random().toString(36).slice(2)}.txt`,
  );
  rmSync(marker, { force: true });

  const code =
    "const fs=require('fs');" +
    `const w=(s)=>fs.writeFileSync(${JSON.stringify(marker)},s);` +
    `fetch('https://api.github.com/rate_limit',{headers:{'User-Agent':${JSON.stringify(UA)}}})` +
    ".then(()=>w('OK'),()=>w('FAIL'));";

  spawnSync(process.execPath, [...(flag ? [flag] : []), '-e', code], {
    stdio: 'ignore',
    timeout: 25_000,
  });

  const result = existsSync(marker) ? readFileSync(marker, 'utf8') : '';
  rmSync(marker, { force: true });
  return result === 'OK';
}

/* ============================ 主流程 ============================ */

async function main() {
  // 必须在任何网络请求**之前**跑
  ensureSystemCa();

  title('MoneyNote 一键交付');
  console.log('  目标：自动做出「项目链接 + 应用功能录屏」');
  console.log('  预计耗时：第一次约 20~30 分钟（大部分时间在等云端的 macOS 编译）');

  const token = checkEnvironment();
  if (!token) {
    console.log('');
    console.log('  环境没准备好，先把上面 [FAIL] 那条解决掉再跑一次。');
    console.log('');
    exitCode = 1;
    finish();
    return;
  }

  try {
    await ensureRepo(token);
    await pushCode(token);

    step(4, 6, '触发云端的 iOS 构建 + 录屏');
    info('用的是 GitHub 的免费 macOS 机器，不需要你有 Mac');
    info(`工作流：.github/workflows/${WORKFLOW_FILE}`);

    const dispatchedAt = Date.now();
    await dispatchWorkflow(token);
    ok('已触发');

    const run = await findRun(token, dispatchedAt);
    ok(`已找到这次运行（编号 ${run.run_number}）`);
    info(run.html_url);

    console.log('');
    console.log('  现在要等 15~25 分钟。这一步是整条路里唯一一个');
    console.log('  我没办法在本地替你验证的环节，所以它也是最可能失败的。');
    console.log('  真失败了不要紧 —— 脚本会把怎么把报错交给 AI 写清楚。');
    console.log('');
    console.log('  期间你可以去干别的，但**别关这个窗口**。');

    const finished = await waitForRun(token, run);
    console.log('');
    console.log('');

    if (finished.conclusion !== 'success') {
      const err = new Error(`构建没有成功，结论是「${finished.conclusion}」`);
      err.detail =
        `运行页面：${finished.html_url}\n\n` +
        '打开它，往下滚，找到第一个打红叉的那一步，把它的日志整段复制给 AI。\n' +
        '最常见的原因是 Xcode 版本和 Flutter 3.47.7 对不上 —— ' +
        '如果是这一类，把 ios-build.yml 里的 macos-15 改成 macos-26 再试一次。';
      throw err;
    }

    ok(`构建成功（用时 ${human(Date.now() - dispatchedAt)}）`);

    const recording = await fetchRecording(token, finished);
    summary(recording);
  } catch (e) {
    bail('交付流程', e);
  }

  finish();
}

/**
 * 收尾。
 *
 * ⚠️ 关键：**这里不调 process.exit()**。
 * 最后一步刚好是下载录屏（一次 fetch），在这之后强退会触发
 * --use-system-ca 在 Windows 上的 libuv 断言崩溃（原因见 probeGithub 的注释），
 * 用户会在一切都成功之后看到一段吓人的 C 源码报错。
 *
 * 改成设 process.exitCode，让进程把手里的事做完、自然结束。
 * 万一真有个句柄赖着不走，再用一个 unref 的定时器兜底 ——
 * unref 的意思是"这个定时器不拦着进程退出"，
 * 只有当进程因为别的原因还活着时，它才会响。
 */
function finish() {
  console.log(BAR);
  console.log(exitCode === 0 ? '  完成。' : '  没跑完，看上面的提示。');
  console.log(BAR);
  console.log('');

  process.exitCode = exitCode;
  setTimeout(() => process.exit(exitCode), 8000).unref();
}

main().catch((e) => {
  bail('启动', e);
  finish();
});
