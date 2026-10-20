#!/usr/bin/env node
/**
 * 静态检查 .github/workflows/ 下的工作流文件 —— 专查「引用对不上」这类错。
 *
 * **为什么需要它**：工作流是"跑在别人机器上"的代码。
 * 你在本机 `node scripts/run-tests.mjs` 全绿，证明不了那三个 yml 是对的 ——
 * 它们要推到 GitHub **才会第一次被解析**。
 *
 * 而 GitHub 报错的代价特别高：推一次、等 20 分钟、挂在第 5 步，
 * 报错还可能是 `Input required and not supplied: xxx` 这种
 * 和真正原因隔了一层的话。对不熟悉 CI 的人来说，这是最劝退的一环。
 *
 * 这个脚本把其中**最常翻车、又最容易在本地查出来**的三类提前查掉：
 *
 *   1. `${{ github.event.inputs.X }}` 引用了 `workflow_dispatch.inputs`
 *      里没声明的 X —— 输入框没声明，运行时直接报"缺少必填输入"。
 *   2. `${{ steps.X.outputs.Y }}` 引用了不存在的步骤 id X。
 *      最常见的成因：后来给步骤改了名，或者在 YAML 里**漏写了 `id:`**。
 *      注意 `id:` 和 `name:` 是两回事 —— 有 `name` 不代表有 `id`，
 *      而 `steps.` 后面跟的是 `id`。这个坑非常多人踩。
 *   3. 步骤 id 存在，但它从没往 `$GITHUB_OUTPUT` 写过那个 key
 *      （key 拼错，或者少写了一步）。
 *
 * 顺带还查 `uses: owner/repo@版本` 的格式、以及有没有 `runs-on`。
 *
 * **它不查什么**（说清楚，免得你以为过了就万无一失）：
 *   - **YAML 语法本身**。缩进错、冒号错这类，GitHub 页面会直接标出
 *     第几行第几列，报错反而是最好懂的一种，不需要我们提前拦。
 *     硬要在本地查就得引一个 YAML 解析库，而这个项目从第一天起
 *     就没往根目录放过任何依赖，为它破例不划算。
 *   - 镜像标签 `macos-14` 是不是还存在、`actions/checkout@v4`
 *     这个版本还有效吗 —— 只有真跑一次才知道。
 *   - 里面的命令能不能跑通（Flutter 版本对不对、模拟器起不起得来）。
 *
 * 用法：
 *   node scripts/check-workflows.mjs
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WF_DIR = join(ROOT, '.github', 'workflows');

/** 去掉行尾注释。字符串里的 # 不算注释（YAML 要求 # 前有空白）。 */
function stripComment(line) {
  let inSingle = false;
  let inDouble = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
    else if (c === '#' && !inSingle && !inDouble && (i === 0 || /\s/.test(line[i - 1]))) {
      return line.slice(0, i);
    }
  }
  return line;
}

/**
 * 声明了哪些手动输入。
 *
 * 只认 `inputs:` 下面**紧挨着的那一层**子键：
 *   inputs:
 *     record_seconds:      <- 要的是这个
 *       description: '...'  <- 不要这个
 *       default: '30'
 */
function collectDeclaredInputs(lines) {
  const out = new Set();
  let inInputs = false;
  let inputsIndent = -1;
  for (const raw of lines) {
    const line = stripComment(raw);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (/^inputs\s*:\s*$/.test(body)) {
      inInputs = true;
      inputsIndent = indent;
      continue;
    }
    if (!inInputs) continue;
    if (indent <= inputsIndent) { inInputs = false; continue; } // 出了 inputs 块
    const m = body.match(/^([\w-]+)\s*:/);
    if (m && indent === inputsIndent + 2) out.add(m[1]);
  }
  return out;
}

/**
 * 把文件按 **job** 切开。
 *
 * **为什么必须按 job 切**：`steps.xxx` 只能引用**同一个 job 里**的步骤。
 * 一开始我把整个文件当一个作用域扫，结果 web-deploy.yml 报警说
 * `steps.deployment` 找不到 —— 其实它在 `deploy` 那个 job 里好好写着，
 * 只是和我扫到的另一个 job 不是同一个。
 * **这种误报比不检查更坏**：它会教人忽略这个脚本的输出。
 *
 * 切法：`jobs:` 这个键的缩进是 0，它下面每个 job 名缩进是 2。
 * 找 `^  [\w-]+:$` 就是 job 的分界线。
 */
function splitJobs(lines) {
  const start = lines.findIndex((l) => /^jobs\s*:\s*$/.test(stripComment(l).trimEnd()));
  if (start === -1) return [];

  const jobs = [];
  let current = null;

  for (let i = start + 1; i < lines.length; i++) {
    const body = stripComment(lines[i]).trimEnd();
    const nameMatch = body.match(/^ {2}([\w-]+):\s*$/);
    if (nameMatch) {
      if (current) jobs.push(current);
      current = { name: nameMatch[1], startLine: i + 1, lines: [] };
      continue;
    }
    if (current) current.lines.push(lines[i]);
  }
  if (current) jobs.push(current);
  return jobs;
}

/**
 * 逐个步骤收集：步骤 id，以及这个 id 往 $GITHUB_OUTPUT 写过哪些 key。
 *
 * ⚠️ 这里**不解析 YAML**，只按缩进做"够用"的判断：
 *   - `steps:` 的缩进决定列表项在哪一层
 *   - 同层以 `- ` 开头的行 = 新的一步 → 清掉当前 id
 *   - `id: xxx` 记下来
 *   - 某行往 $GITHUB_OUTPUT 写 key 时，归到当前 id 名下
 *
 * `run:` 块里的 shell 缩进更深，不会和一个步骤的起头行撞上，
 * 所以这个近似是安全的。真换成非标准写法再改，别把它改成一个半吊子解析器。
 */
function collectSteps(lines) {
  const steps = []; // { id, hasRun, hasUses, writes: Set }
  const noIdWrites = [];
  let cur = null;
  let stepsIndent = null;

  const flush = () => {
    if (cur) steps.push(cur);
    cur = null;
  };

  for (const raw of lines) {
    const line = stripComment(raw);
    if (line.trim() === '') continue;
    const indent = line.length - line.trimStart().length;
    const body = line.trim();

    if (/^steps\s*:\s*$/.test(body)) {
      flush();
      stepsIndent = indent;
      continue;
    }
    if (stepsIndent === null) continue; // `steps:` 之前的内容（runs-on 等）不管

    // 新的一步：`- ` 出现在 steps 同层或下一层
    if ((indent === stepsIndent || indent === stepsIndent + 2) && body.startsWith('- ')) {
      flush();
    }
    if (!cur) cur = { id: null, hasRun: false, hasUses: false, writes: new Set() };

    // `id:` 有两种写法，都要认：
    //     - name: 启动 iOS 模拟器       - id: deployment
    //       id: sim         ← 这种       uses: actions/deploy-pages@v4  ← 和 `-` 同一行
    // 只认前一种的话，`steps.deployment` 会被判成"找不到这个 id" —— 又一个误报。
    const idMatch = body.match(/^(?:-\s*)?id\s*:\s*([\w-]+)\s*$/);
    if (idMatch) {
      cur.id = idMatch[1];
      continue;
    }

    if (/^(?:-\s*)?uses\s*:/.test(body)) cur.hasUses = true;
    if (/^(?:-\s*)?run\s*:/.test(body)) cur.hasRun = true;

    // 往 $GITHUB_OUTPUT 写。**两种写法都要认**：
    //   echo "udid=$UDID" >> "$GITHUB_OUTPUT"
    //   echo "udid=$UDID" >> $GITHUB_OUTPUT
    // 一开始我只认"key 在行首、紧跟等号"那一种，于是把
    // `echo "udid=$UDID"` 判成"没写过 udid"，四个引用全报错 —— 全是误报。
    if (/>>\s*"?\$GITHUB_OUTPUT\b/.test(body)) {
      const keyMatch = body.match(/(?:echo\s+["']|printf\s+["']|^)([\w-]+)=/);
      if (keyMatch) {
        if (cur.id === null) noIdWrites.push(keyMatch[1]);
        else cur.writes.add(keyMatch[1]);
      }
    }
  }
  flush();

  return { steps, noIdWrites };
}

function checkWorkflow(file, text) {
  const problems = [];
  const lines = text.split(/\r?\n/);
  const declaredInputs = collectDeclaredInputs(lines);

  for (const key of ['name', 'on', 'jobs']) {
    if (!new RegExp(`^${key}\\s*:`, 'm').test(text)) problems.push(`缺少顶层 \`${key}:\``);
  }

  const jobs = splitJobs(lines);
  if (jobs.length === 0) problems.push('`jobs:` 下面一个 job 都没有。');

  const stepIds = new Set();

  for (const job of jobs) {
    const { steps, noIdWrites } = collectSteps(job.lines);
    const byId = new Map(steps.filter((s) => s.id).map((s) => [s.id, s]));
    const ids = new Set(byId.keys());
    for (const id of ids) stepIds.add(id);

    if (!/runs-on\s*:/.test(job.lines.join('\n'))) {
      problems.push(`job \`${job.name}\` 没有 \`runs-on:\` —— 不知道该跑在哪种机器上。`);
    }
    for (const key of noIdWrites) {
      problems.push(
        `job \`${job.name}\`：有一步写了 \`${key}=... >> $GITHUB_OUTPUT\`，` +
        `但那个步骤没有 \`id:\` —— 外面引用不到它。`,
      );
    }

    // 行号要还原成整个文件里的行号，报错才点得准
    const offset = job.startLine;
    job.lines.forEach((raw, idx) => {
      const n = offset + idx + 1;
      for (const expr of raw.matchAll(/\$\{\{([^}]*)\}\}/g)) {
        const e = expr[1].trim();

        // 1) github.event.inputs.X
        for (const m of e.matchAll(/\bgithub\.event\.inputs\.([\w-]+)/g)) {
          if (!declaredInputs.has(m[1])) {
            problems.push(
              `${n} 行：引用 \`github.event.inputs.${m[1]}\`，但 \`workflow_dispatch.inputs\` 里没声明它。` +
              `（已声明：${[...declaredInputs].join('、') || '一个都没有'}）`,
            );
          }
        }

        // 2)+3) steps.<id>.outputs.<key>，只在同一个 job 里找
        for (const m of e.matchAll(/\bsteps\.([\w-]+)\.outputs\.([\w-]+)/g)) {
          const [, id, key] = m;
          if (!ids.has(id)) {
            problems.push(
              `${n} 行：job \`${job.name}\` 里引用步骤 id \`${id}\`，但这个 job 里没有 \`id: ${id}\`。` +
              `（\`name:\` 和 \`id:\` 是两回事，\`steps.\` 后面跟的是 id；` +
              `另外 id 只在同一个 job 内可见）`,
            );
          } else if (byId.get(id).hasRun && !byId.get(id).writes.has(key)) {
            // 只查 shell 步骤：它的输出靠手写 `echo "k=v" >> $GITHUB_OUTPUT`，
            // 能对得上。`uses:` 步骤（比如 deploy-pages 的 page_url）的输出
            // 是 action 自己产生的，静态**查不出来**，跳过 —— 硬查就是误报。
            problems.push(
              `${n} 行：读 \`steps.${id}.outputs.${key}\`，` +
              `但该步骤从没往 $GITHUB_OUTPUT 写过 \`${key}\`。` +
              `（它写过：${[...byId.get(id).writes].join('、') || '什么都没有'}）`,
            );
          }
        }
      }
    });
  }

  // uses: owner/repo@ref
  lines.forEach((raw, idx) => {
    const m = stripComment(raw).trim().match(/^uses\s*:\s*(.+)$/);
    if (!m) return;
    const uses = m[1].trim().replace(/^['"]|['"]$/g, '');
    if (uses.startsWith('./')) return; // 本地 action
    // owner/repo@ref，也允许子路径：owner/repo/sub/action@ref
    if (!/^[\w.-]+\/[\w.-]+(?:\/[\w.-]+)*@[\w.]+$/.test(uses)) {
      problems.push(`${idx + 1} 行：\`uses: ${uses}\` 格式不对，应该是 \`owner/repo@版本\`。`);
    }
  });

  return { problems, declaredInputs, stepIds };
}

/* ---------------------------------- 主流程 --------------------------------- */

console.log('');
console.log('检查 .github/workflows/');
console.log('-'.repeat(52));

if (!existsSync(WF_DIR)) {
  console.log('没有 .github/workflows/ 目录。');
  process.exit(0);
}
const files = readdirSync(WF_DIR).filter((f) => /\.ya?ml$/.test(f));
if (files.length === 0) {
  console.log('目录是空的。');
  process.exit(0);
}

let bad = 0;
for (const f of files) {
  const text = readFileSync(join(WF_DIR, f), 'utf8');
  const { problems, declaredInputs, stepIds } = checkWorkflow(f, text);
  if (problems.length === 0) {
    console.log(`[OK]   ${f}`);
    if (declaredInputs.size) console.log(`       手动输入：${[...declaredInputs].join('、')}`);
    if (stepIds.size) console.log(`       步骤 id：${[...stepIds].join('、')}`);
  } else {
    bad++;
    console.log(`[FAIL] ${f}`);
    for (const p of problems) console.log(`       - ${p}`);
  }
  console.log('');
}

if (bad > 0) {
  console.log(`${bad} 个工作流有问题 —— 现在改，比推到 GitHub 等 20 分钟再改便宜得多。`);
  process.exit(1);
}
console.log('工作流引用检查通过。');
console.log('（这类错查不出来：YAML 缩进、镜像标签是否还有效、action 版本是否还支持。）');
console.log('');
