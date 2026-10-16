#!/usr/bin/env node
/**
 * 把 app/build/web 这个静态目录端起来，好让浏览器访问。
 *
 * 为什么不用 `python -m http.server`？两个原因：
 *   1. 它不给 .wasm 发 `application/wasm` 这个 MIME 类型。
 *      CanvasKit 用的是 WebAssembly.compileStreaming()，类型不对会直接报错。
 *   2. 它不给 .otf 发字体类型，中文字体可能加载失败。
 *
 * 用法：
 *   node scripts/serve.mjs [目录] [端口]
 * 默认：app/build/web，端口 8080
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

// MIME 类型表。少一个都可能让某个资源加载不出来。
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.wasm': 'application/wasm',       // ← 必须是这个，不能是 octet-stream
  '.png': 'image/png',
  '.otf': 'font/otf',
  '.ttf': 'font/ttf',
  '.css': 'text/css; charset=utf-8',
  '.symbols': 'text/plain; charset=utf-8',
};

const target = process.argv[2] ?? join(ROOT_DIR, 'app', 'build', 'web');
const port = Number(process.argv[3] ?? 8080);

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://placeholder').pathname);
  if (path === '/') path = '/index.html';

  // normalize + 去掉开头的斜杠，防止 ../ 跑到目标目录外面去
  const file = join(target, normalize(path).replace(/^[/\\]+/, ''));

  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(`404 ${path}`);
  }
}).listen(port, () => {
  console.log(`静态服务器已启动：http://localhost:${port}`);
  console.log(`目录：${target}`);
  console.log('按 Ctrl + C 停止。');
  console.log('');
  console.log('注意：只是静态文件，不含后端。');
  console.log('要用真实数据，得另开终端跑 cd backend && npm run dev');
});
