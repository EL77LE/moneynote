/**
 * 冒烟测试：  npm run smoke
 *
 * 自己拉起一个临时服务（独立端口 + 临时数据库），把所有接口打一遍，
 * 跑完自动清理。不改动你 data/ 里的真实数据。
 *
 * 全部通过退出码 0，有任何一条失败退出码 1。
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 4399;
const BASE = `http://127.0.0.1:${PORT}`;

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ✓ ${name}`);
  } else {
    failures.push(`${name}${detail ? ` -> ${detail}` : ''}`);
    console.log(`  ✗ ${name}${detail ? ` -> ${detail}` : ''}`);
  }
}

function eq(name, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  check(name, ok, ok ? '' : `期望 ${JSON.stringify(expected)}，实际 ${JSON.stringify(actual)}`);
}

async function req(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: res.status, body: json };
}

const tmpDir = mkdtempSync(join(tmpdir(), 'moneynote-smoke-'));
const child = spawn(
  process.execPath,
  ['--disable-warning=ExperimentalWarning', 'src/server.js'],
  {
    cwd: backendRoot,
    env: { ...process.env, PORT: String(PORT), DB_PATH: join(tmpDir, 'smoke.db') },
    stdio: ['ignore', 'pipe', 'pipe'],
  },
);

let serverLog = '';
child.stdout.on('data', (d) => {
  serverLog += d.toString();
});
child.stderr.on('data', (d) => {
  serverLog += d.toString();
});

function cleanup() {
  if (!child.killed) child.kill();
  try {
    rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* 文件被占用就交给系统清理 */
  }
}

async function waitForServer() {
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return true;
    } catch {
      /* 还没起来，继续等 */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return false;
}

async function main() {
  console.log('\n启动临时服务...');
  const up = await waitForServer();
  if (!up) {
    console.error('服务 15 秒内没起来。服务端输出：\n' + serverLog);
    cleanup();
    process.exit(1);
  }

  console.log('\n[1] 健康检查与根路径');
  {
    const h = await req('GET', '/api/health');
    check('GET /api/health -> 200', h.status === 200, `实际 ${h.status}`);
    eq('health.ok = true', h.body?.ok, true);

    const root = await req('GET', '/');
    check('GET / -> 200 且有 endpoints', root.status === 200 && !!root.body?.docs);
  }

  console.log('\n[2] 空库查询');
  {
    const r = await req('GET', '/api/records?month=2026-10');
    eq('空库 total = 0', r.body?.total, 0);
    eq('空库 items = []', r.body?.items, []);
    eq('range.to = 2026-10-31', r.body?.range?.to, '2026-10-31');
  }

  console.log('\n[3] 月份边界');
  {
    const feb2026 = await req('GET', '/api/records?month=2026-02');
    eq('2026-02（平年）末日 = 02-28', feb2026.body?.range?.to, '2026-02-28');

    const feb2024 = await req('GET', '/api/records?month=2024-02');
    eq('2024-02（闰年）末日 = 02-29', feb2024.body?.range?.to, '2024-02-29');

    const bad = await req('GET', '/api/records?month=2026-13');
    check('month=2026-13 -> 400', bad.status === 400, `实际 ${bad.status}`);
    eq('错误码 BAD_MONTH', bad.body?.error?.code, 'BAD_MONTH');
  }

  console.log('\n[4] 新建记录');
  let lunchId = null;
  {
    const created = await req('POST', '/api/records', {
      type: 'expense',
      amount: 25.5,
      category: '餐饮',
      note: '午饭',
      date: '2026-10-15',
    });
    check('POST -> 201', created.status === 201, `实际 ${created.status} ${JSON.stringify(created.body)}`);
    eq('amount 回显 25.5', created.body?.amount, 25.5);
    eq('note 回显', created.body?.note, '午饭');
    check('返回了自增 id', Number.isInteger(created.body?.id), JSON.stringify(created.body));
    lunchId = created.body?.id;
  }

  console.log('\n[5] 参数校验（应全部被拦下）');
  {
    const cases = [
      ['amount = 0', { type: 'expense', amount: 0, category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      ['amount = -5', { type: 'expense', amount: -5, category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      ['amount = "abc"', { type: 'expense', amount: 'abc', category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      // 下面这几个是防"隐式类型转换"的。
      // 校验如果写成 Number(body.amount)，true 会变成 1、[5] 会变成 5，
      // 于是前端传错类型也能建记录，而且金额还悄悄变了个样。
      ['amount = true', { type: 'expense', amount: true, category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      ['amount = [5]', { type: 'expense', amount: [5], category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      ['amount = null', { type: 'expense', amount: null, category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      ['amount = "12"（数字字符串）', { type: 'expense', amount: '12', category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      // 这两个是防"不足一分"的：四舍五入后是 0 分，会撞上
      // 表上的 CHECK (amount_cents > 0)，之前会变成 500 而不是 400。
      ['amount = 0.001（不足一分）', { type: 'expense', amount: 0.001, category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      ['amount = 0.004（不足一分）', { type: 'expense', amount: 0.004, category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      // 0.005 四舍五入后是 1 分，曾经会被收下并存成 0.01 ——
      // 用户输 0.005，回显 0.01，属于"悄悄改掉你的输入"。
      // API 的最小单位是 0.01，所以这里也必须 400。
      ['amount = 0.005（会四舍五入成 1 分）', { type: 'expense', amount: 0.005, category: '餐饮', date: '2026-10-15' }, 'BAD_AMOUNT'],
      ['type = 乱填', { type: 'xxx', amount: 10, category: '餐饮', date: '2026-10-15' }, 'BAD_TYPE'],
      ['category 为空', { type: 'expense', amount: 10, category: '  ', date: '2026-10-15' }, 'BAD_CATEGORY'],
      ['date 格式错', { type: 'expense', amount: 10, category: '餐饮', date: '2026/10/15' }, 'BAD_DATE'],
      ['date 不存在 2026-02-30', { type: 'expense', amount: 10, category: '餐饮', date: '2026-02-30' }, 'BAD_DATE'],
      ['note 超 200 字', { type: 'expense', amount: 10, category: '餐饮', note: 'x'.repeat(201), date: '2026-10-15' }, 'BAD_NOTE'],
      // 下面这几条是防"字符串字段被隐式转换"的。
      // 之前这几个字段的写法是 `String(body.x ?? '')`，它有两个坑：
      //  - 数组/数字会被默默转成字符串存下来（category: ['餐饮'] -> '餐饮'），
      //    前端传错了类型，服务端一声不吭收下，脏数据就进库了；
      //  - `{"toString":"x"}` 这种合法 JSON 会让 String() 抛 TypeError，
      //    被兜成 500 —— 参数错报成服务器错。
      ['type 传数组', { type: ['expense'], amount: 10, category: '餐饮', date: '2026-10-15' }, 'BAD_TYPE'],
      ['type 传对象（toString 不是函数）', { type: { toString: 'x' }, amount: 10, category: '餐饮', date: '2026-10-15' }, 'BAD_TYPE'],
      ['category 传数组', { type: 'expense', amount: 10, category: ['餐饮'], date: '2026-10-15' }, 'BAD_CATEGORY'],
      ['category 传数字', { type: 'expense', amount: 10, category: 1, date: '2026-10-15' }, 'BAD_CATEGORY'],
      ['note 传数字', { type: 'expense', amount: 10, category: '餐饮', note: 123, date: '2026-10-15' }, 'BAD_NOTE'],
      ['date 传数字', { type: 'expense', amount: 10, category: '餐饮', date: 20261015 }, 'BAD_DATE'],
      ['date 传数组', { type: 'expense', amount: 10, category: '餐饮', date: ['2026-10-15'] }, 'BAD_DATE'],
    ];
    for (const [label, payload, code] of cases) {
      const r = await req('POST', '/api/records', payload);
      check(`${label} -> 400 ${code}`, r.status === 400 && r.body?.error?.code === code,
        `实际 ${r.status} ${JSON.stringify(r.body?.error)}`);
    }

    const noBody = await fetch(`${BASE}/api/records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{ 这不是合法 JSON',
    });
    check('坏 JSON -> 400', noBody.status === 400, `实际 ${noBody.status}`);

    // 反过来：刚好一分的金额必须存得进去。
    // 上面那两条"不足一分"的边界就是照着它画的 —— 只测拒绝不测接受的话，
    // 以后有人把阈值调大（比如手滑写成 < 1），这里不会有人发现。
    // 建完立刻删掉，免得影响后面几段对条数和合计的断言。
    const oneCent = await req('POST', '/api/records', {
      type: 'expense', amount: 0.01, category: '餐饮', date: '2026-10-15',
    });
    check('amount = 0.01（刚好一分）-> 201', oneCent.status === 201,
      `实际 ${oneCent.status} ${JSON.stringify(oneCent.body)}`);
    eq('0.01 元存下来还是 0.01', oneCent.body?.amount, 0.01);
    if (Number.isInteger(oneCent.body?.id)) {
      await req('DELETE', `/api/records/${oneCent.body.id}`);
    }
  }

  console.log('\n[6] 单条查询 / 更新 / 删除');
  {
    const one = await req('GET', `/api/records/${lunchId}`);
    check('GET /records/:id -> 200', one.status === 200);
    eq('note = 午饭', one.body?.note, '午饭');

    const updated = await req('PUT', `/api/records/${lunchId}`, {
      type: 'expense',
      amount: 42,
      category: '餐饮',
      note: '晚饭（改过了）',
      date: '2026-10-16',
    });
    check('PUT -> 200', updated.status === 200, `实际 ${updated.status}`);
    eq('amount 改成 42', updated.body?.amount, 42);
    eq('date 改成 10-16', updated.body?.date, '2026-10-16');

    const badId = await req('GET', '/api/records/abc');
    check('id 非数字 -> 400', badId.status === 400, `实际 ${badId.status}`);

    const missing = await req('GET', '/api/records/999999');
    check('id 不存在 -> 404', missing.status === 404, `实际 ${missing.status}`);

    const putMissing = await req('PUT', '/api/records/999999', {
      type: 'expense', amount: 1, category: '餐饮', date: '2026-10-15',
    });
    check('PUT 不存在的 id -> 404', putMissing.status === 404, `实际 ${putMissing.status}`);
  }

  console.log('\n[7] 金额精度（0.1 + 0.2 必须是 0.3）');
  {
    for (const amount of [0.1, 0.2]) {
      await req('POST', '/api/records', {
        type: 'expense', amount, category: '测试', date: '2026-11-01',
      });
    }
    const stats = await req('GET', '/api/stats?month=2026-11');
    eq('0.1 + 0.2 === 0.3', stats.body?.expenseTotal, 0.3);
  }

  console.log('\n[8] 统计');
  {
    await req('POST', '/api/records', {
      type: 'income', amount: 1000, category: '工资', date: '2026-10-01',
    });
    const stats = await req('GET', '/api/stats?month=2026-10');
    check('GET /api/stats -> 200', stats.status === 200);
    eq('支出合计 = 42', stats.body?.expenseTotal, 42);
    eq('收入合计 = 1000', stats.body?.incomeTotal, 1000);
    eq('结余 = 958', stats.body?.balance, 958);
    eq('记录条数 = 2', stats.body?.count, 2);
    eq('分类聚合长度 = 1', stats.body?.byCategory?.length, 1);
    eq('分类名 = 餐饮', stats.body?.byCategory?.[0]?.category, '餐饮');
    eq('分类金额 = 42', stats.body?.byCategory?.[0]?.amount, 42);
    eq('daily 长度 = 1', stats.body?.daily?.length, 1);
    eq('daily[0].date = 2026-10-16', stats.body?.daily?.[0]?.date, '2026-10-16');
  }

  console.log('\n[9] 列表排序与筛选');
  {
    const list = await req('GET', '/api/records?from=2026-10-01&to=2026-10-31');
    eq('from/to 区间内 2 条', list.body?.items?.length, 2);
    eq('按日期倒序，第一条是 10-16', list.body?.items?.[0]?.date, '2026-10-16');

    const badRange = await req('GET', '/api/records?from=2026-10-31&to=2026-10-01');
    check('from > to -> 400', badRange.status === 400, `实际 ${badRange.status}`);

    const half = await req('GET', '/api/records?from=2026-10-01');
    check('只有 from -> 400', half.status === 400, `实际 ${half.status}`);

    const fakeDate = await req('GET', '/api/records?from=2026-02-30&to=2026-03-01');
    check('from/to 里不存在的日期 -> 400', fakeDate.status === 400, `实际 ${fakeDate.status}`);

    const badLimit = await req('GET', '/api/records?limit=99999');
    check('limit 越界 -> 400', badLimit.status === 400, `实际 ${badLimit.status}`);

    // offset 光判"是不是非负整数"不够，还得有上界：
    // Number.isInteger(1e20) 返回 true，但这个值 SQLite 的 64 位整数
    // 装不下，之前会抛 datatype mismatch -> 500（而且内部错误码漏给了客户端）。
    const RANGE = 'from=2026-10-01&to=2026-10-31';
    const hugeOffset = await req('GET', `/api/records?${RANGE}&offset=99999999999999999999`);
    check('offset = 1e20 -> 400', hugeOffset.status === 400, `实际 ${hugeOffset.status} ${JSON.stringify(hugeOffset.body?.error)}`);

    const maxIntOffset = await req('GET', `/api/records?${RANGE}&offset=9223372036854775807`);
    check('offset = 2^63 -> 400', maxIntOffset.status === 400, `实际 ${maxIntOffset.status}`);

    const negOffset = await req('GET', `/api/records?${RANGE}&offset=-1`);
    check('offset 负数 -> 400', negOffset.status === 400, `实际 ${negOffset.status}`);

    const nanOffset = await req('GET', `/api/records?${RANGE}&offset=abc`);
    check('offset 非数字 -> 400', nanOffset.status === 400, `实际 ${nanOffset.status}`);

    const floatOffset = await req('GET', `/api/records?${RANGE}&offset=1.5`);
    check('offset 小数 -> 400', floatOffset.status === 400, `实际 ${floatOffset.status}`);

    const okOffset = await req('GET', `/api/records?${RANGE}&offset=1`);
    check('offset = 1（合法）-> 200', okOffset.status === 200, `实际 ${okOffset.status}`);
    eq('offset = 1 时 total 仍是总数', okOffset.body?.total, 2);
  }

  console.log('\n[10] 删除与 404');
  {
    const del = await req('DELETE', `/api/records/${lunchId}`);
    check('DELETE -> 204', del.status === 204, `实际 ${del.status}`);

    const after = await req('GET', `/api/records/${lunchId}`);
    check('删完再查 -> 404', after.status === 404, `实际 ${after.status}`);

    const delAgain = await req('DELETE', `/api/records/${lunchId}`);
    check('重复删除 -> 404', delAgain.status === 404, `实际 ${delAgain.status}`);

    const unknown = await req('GET', '/api/不存在的接口');
    check('未知路由 -> 404 NOT_FOUND', unknown.status === 404 && unknown.body?.error?.code === 'NOT_FOUND',
      `实际 ${unknown.status} ${JSON.stringify(unknown.body)}`);
  }

  console.log('\n[11] 服务端无未捕获异常');
  {
    check('服务进程仍存活', child.exitCode === null, `退出码 ${child.exitCode}`);
    check('日志里没有 500 错误', !serverLog.includes('[500]'), serverLog.slice(0, 400));
  }

  cleanup();

  console.log(`\n${'-'.repeat(52)}`);
  if (failures.length === 0) {
    console.log(`  全部通过：${passed} 项断言`);
    console.log(`${'-'.repeat(52)}\n`);
    process.exit(0);
  } else {
    console.log(`  通过 ${passed} 项，失败 ${failures.length} 项：`);
    for (const f of failures) console.log(`    - ${f}`);
    console.log(`${'-'.repeat(52)}\n`);
    process.exit(1);
  }
}

process.on('SIGINT', () => {
  cleanup();
  process.exit(130);
});

main().catch((err) => {
  console.error('测试脚本自身出错：', err);
  console.error('服务端输出：\n' + serverLog);
  cleanup();
  process.exit(1);
});
