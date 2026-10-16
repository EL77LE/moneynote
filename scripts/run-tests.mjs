#!/usr/bin/env node
/**
 * 一键测试。跑四件事：
 *   工作流检查 -> 后端接口测试 -> App 静态检查 -> App 单元测试。
 *
 * 为什么逻辑写在这儿，而不是写在 .bat 里？
 * 因为 **.bat 文件里不能放中文**。
 * cmd.exe 是按当前代码页（中文 Windows 上是 GBK）逐字节解析批处理文件的，
 * 而文件本身存的是 UTF-8 —— 一个中文字符占 3 个字节，cmd 按 GBK 读就是
 * 1.5 个字符，"当前读到第几字节"会算错，于是**下一行会被从头吃掉一两个字符**：
 *   pause        -> 实际执行了 ause
 *   node_modules -> 实际执行了 _modules
 * 这不是能靠 chcp 65001 修好的（那行本身也要被解析）。
 *
 * 所以 .bat 只保留纯 ASCII 的几行（切编码 + 调用本文件），
 * 所有中文都从 Node 打印 —— Node 写 stdout 用的是确定的 UTF-8。
 *
 * 用法：
 *   node scripts/run-tests.mjs
 *   或者双击根目录的 run-tests.bat
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NEEDED_NODE = [22, 13, 0];

const bar = '='.repeat(52);
const thin = '-'.repeat(52);

let failed = false;

/** 在指定目录跑一条命令，输出直接透传到终端。返回是否成功。 */
function runIn(cwd, command) {
  const r = spawnSync(command, {
    cwd: join(ROOT, cwd),
    stdio: 'inherit',
    // Windows 上 npm / flutter 实际是 .cmd / .bat，必须过 shell 才找得到
    shell: true,
  });
  return r.status === 0;
}

/** 命令在不在 PATH 里 */
function hasCommand(name) {
  return spawnSync('where', [name], { stdio: 'ignore', shell: true }).status === 0;
}

function check(name, label) {
  if (!name) {
    console.log(`[FAIL] ${label}`);
    failed = true;
  } else {
    console.log(`[OK]   ${label}`);
  }
  console.log('');
}

/* ------------------------------ 0. 环境自检 ------------------------------ */

console.log('');
console.log(bar);
console.log('  MoneyNote 一键测试');
console.log(bar);
console.log('');

const nodeVer = process.versions.node.split('.').map(Number);
const nodeOk =
  nodeVer[0] > NEEDED_NODE[0] ||
  (nodeVer[0] === NEEDED_NODE[0] &&
    (nodeVer[1] > NEEDED_NODE[1] ||
      (nodeVer[1] === NEEDED_NODE[1] && nodeVer[2] >= NEEDED_NODE[2])));

if (!nodeOk) {
  console.log(`[FAIL] Node.js 版本太低：当前 ${process.versions.node}，需要 22.13 以上。`);
  console.log('       低版本要用 node:sqlite 得加实验性参数，会多出一堆警告。');
  console.log('       详见 docs/01-环境搭建.md');
  console.log('');
  process.exit(1);
}

if (!hasCommand('flutter')) {
  console.log('[FAIL] 找不到 flutter 命令。');
  console.log('       装好 Flutter SDK 后要把它的 bin 目录加进 PATH，');
  console.log('       然后【重开这个窗口】—— PATH 改了不重开是不生效的。');
  console.log('       详见 docs/01-环境搭建.md');
  console.log('');
  process.exit(1);
}

/* --------------------------- 1. 工作流检查 --------------------------- */

// 放在最前面：不用等 npm、不用等 Flutter，一秒钟出结果。
// 查的是 .github/workflows/ 里"引用了不存在的步骤 id / 没声明的输入"
// 这一类只在推到 GitHub 之后才会炸的错 —— 那时候一次要等 20 分钟。
// 详见 scripts/check-workflows.mjs 顶部的注释。
console.log('[1/4] 工作流检查');
console.log(thin);

check(runIn('.', 'node scripts/check-workflows.mjs'), '工作流引用检查通过');

/* --------------------------- 2. 后端接口测试 --------------------------- */

console.log('[2/4] 后端接口测试');
console.log(thin);

if (!existsSync(join(ROOT, 'backend', 'node_modules'))) {
  console.log('      第一次跑，先装依赖，要等一两分钟...');
  console.log('');
  if (!runIn('backend', 'npm install --no-audit --no-fund')) {
    console.log('');
    console.log('[FAIL] 后端依赖装失败 —— 往上翻看 npm 的报错');
    process.exit(1);
  }
  console.log('');
}

check(runIn('backend', 'npm run smoke'), '后端接口测试通过');

/* ---------------------------- 3. 静态检查 ---------------------------- */

console.log('[3/4] App 静态检查');
console.log(thin);

if (!existsSync(join(ROOT, 'app', '.dart_tool'))) {
  console.log('      第一次跑，先拉依赖...');
  console.log('');
  if (!runIn('app', 'flutter pub get')) {
    console.log('');
    console.log('[FAIL] flutter pub get 失败 —— 多半是网络，见 docs/01-环境搭建.md 的镜像配置');
    process.exit(1);
  }
  console.log('');
}

// --no-fatal-infos：info 级的风格提示不算失败（不管也能跑）。
// warning 和 error 仍然会让它失败 —— 那两个基本都是真问题。
check(runIn('app', 'flutter analyze --no-fatal-infos'), '静态检查通过');

/* ---------------------------- 4. 单元测试 ---------------------------- */

console.log('[4/4] App 单元测试');
console.log(thin);

check(runIn('app', 'flutter test'), '单元测试通过');

/* ------------------------------ 总结 ------------------------------ */

console.log(bar);
if (failed) {
  console.log('  有测试没通过');
  console.log('');
  console.log('  往上翻，找 [FAIL] 那一行，它下面就是具体原因。');
  console.log('  看不懂就把那一整段复制给 AI，问法见 docs/09-排错速查.md');
} else {
  console.log('  全部通过 —— 可以截图发给面试官了');
}
console.log(bar);
console.log('');

process.exit(failed ? 1 : 0);
