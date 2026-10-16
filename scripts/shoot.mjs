#!/usr/bin/env node
/**
 * 给 README 拍三张 App 截图（明细 / 统计 / 记一笔）。
 *
 * 它自己启动一个 headless 浏览器，用 Chrome DevTools Protocol 驱动：
 * 设定视口 -> 打开页面 -> 截图 -> 点底部导航 -> 再截图。
 *
 * 为什么不用浏览器自带的 `--screenshot` 参数？两个硬伤：
 *   1. 视口宽度对不上。窗口设 430，页面却按更宽的视口排版，右边被切掉一块。
 *      只有 CDP 的 Emulation.setDeviceMetricsOverride 能精确控制。
 *   2. 拍完第一屏就没了 —— 它没法点击，拍不到第二、第三个界面。
 *
 * 用法（三个终端）：
 *   1) cd backend && npm run dev
 *   2) cd app && flutter build web --release --no-web-resources-cdn \
 *        --dart-define=API_BASE_URL=http://localhost:3000
 *      node scripts/serve.mjs
 *   3) node scripts/shoot.mjs docs/images
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = process.argv[2] ?? join(ROOT_DIR, 'docs', 'images');
const PAGE_URL = process.env.SHOOT_URL ?? 'http://localhost:8080/';
const CDP_PORT = 9222;

// 默认拍深色（README 里放的那三张就是深色）。
// 想核对浅色下的效果，用：
//   SHOOT_SCHEME=light SHOOT_PREFIX=light- node scripts/shoot.mjs /tmp/shots
// （文件名加前缀，避免把 README 里的图覆盖掉。）
const SCHEME = process.env.SHOOT_SCHEME === 'light' ? 'light' : 'dark';
const PREFIX = process.env.SHOOT_PREFIX ?? '';

// 手机尺寸。430x900 是 iPhone 15 Pro Max 的逻辑像素。
const VIEW_W = 430;
const VIEW_H = 900;
const DPR = 2; // 2 倍图，README 里放大了也清晰

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------- 1. 找到浏览器 ------------------------- */

function findBrowser() {
  const candidates = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
  ].filter(Boolean);
  return candidates.find((p) => existsSync(p));
}

/* ------------------------- 2. CDP 小客户端 ------------------------- */

let seq = 0;
const pending = new Map();
let ws;

function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

async function connect(timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const list = await (await fetch(`http://localhost:${CDP_PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* 调试端口还没起来，继续等 */ }
    await sleep(400);
  }
  throw new Error(
    `连不上浏览器的调试端口 ${CDP_PORT}。\n` +
    '可能是浏览器没起来，或者 9222 端口被别的程序占了。',
  );
}

function openSocket(url) {
  return new Promise((resolve, reject) => {
    ws = new WebSocket(url);
    ws.addEventListener('open', () => resolve());
    ws.addEventListener('error', reject);
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && pending.has(msg.id)) {
        const { resolve: ok, reject: bad } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) bad(new Error(JSON.stringify(msg.error)));
        else ok(msg.result ?? {});
      }
    });
  });
}

/* ------------------------- 3. 动作 ------------------------- */

async function shot(name) {
  const { data } = await send('Page.captureScreenshot', { format: 'png' });
  const bytes = Buffer.from(data, 'base64');
  await writeFile(join(OUT_DIR, `${name}.png`), bytes);
  console.log(`  ${name}.png   ${(bytes.length / 1024).toFixed(0)} KB`);
}

/** 点一下。坐标是 CSS 像素，不是上面 DPR 放大后的物理像素。 */
async function click(x, y) {
  for (const type of ['mousePressed', 'mouseReleased']) {
    await send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
  }
  await sleep(1500); // 等界面动画走完再截
}

/* ------------------------- 4. 主流程 ------------------------- */

const browser = findBrowser();
if (!browser) {
  console.error('找不到 Chrome 或 Edge。装一个，或用 CHROME_PATH 环境变量指定路径。');
  process.exit(1);
}
console.log(`浏览器：${browser}`);

const profileDir = join(tmpdir(), `moneynote-shoot-${Date.now()}`);
await mkdir(OUT_DIR, { recursive: true });

const child = spawn(browser, [
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${CDP_PORT}`,
  `--window-size=${VIEW_W},${VIEW_H}`,
  // 把 Google 的字体 CDN 解析成"不存在"，模拟国内网络。
  // 这样拍出来的图才是 HR 在国内真实会看到的画面。
  // 如果中文是方块，说明 assets/fonts/ 里的中文字体没生效。
  '--host-resolver-rules=MAP fonts.gstatic.com ~NOTFOUND, MAP www.gstatic.com ~NOTFOUND, MAP fonts.googleapis.com ~NOTFOUND',
  'about:blank',
], { stdio: 'ignore' });

let ok = false;
try {
  const page = await connect();
  await openSocket(page.webSocketDebuggerUrl);

  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', {
    width: VIEW_W, height: VIEW_H, deviceScaleFactor: DPR, mobile: true,
  });
  await send('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-color-scheme', value: SCHEME }],
  });
  console.log(`配色：${SCHEME === 'dark' ? '深色' : '浅色'}`);

  console.log(`打开 ${PAGE_URL}`);
  await send('Page.navigate', { url: PAGE_URL });

  // Flutter 要先下载 main.dart.js（约 2 MB）再下载 canvaskit.wasm（约 5 MB），
  // 然后才画第一帧。给足时间，别急着截图。
  await sleep(12000);

  console.log('截图：');
  await shot(`${PREFIX}app-home`);

  // 底部导航两项，宽度 430，中心在 1/4 和 3/4 处；导航条贴底，约 80px 高。
  await click(Math.round(VIEW_W * 0.75), VIEW_H - 40);
  await shot(`${PREFIX}app-stats`);

  await click(Math.round(VIEW_W * 0.25), VIEW_H - 40);
  // 右下角悬浮按钮「记一笔」
  await click(VIEW_W - 40, VIEW_H - 110);
  await shot(`${PREFIX}app-edit`);

  ok = true;
} finally {
  ws?.close();
  child.kill();
  await sleep(300);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

if (ok) {
  console.log('');
  console.log(`三张图已写入 ${OUT_DIR}`);
  console.log('');
  console.log('请自己看一眼：如果中文是 □□□ 方块，说明中文字体没生效，');
  console.log('检查 app/pubspec.yaml 里的 fonts 段和 assets/fonts/ 目录。');
}
process.exit(ok ? 0 : 1);
