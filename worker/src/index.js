/**
 * MoneyNote API —— Cloudflare Workers + D1
 *
 * 和 backend/ 的 Express 版保持同一套 REST 协议：
 *   GET    /api/health
 *   GET    /api/records?month=YYYY-MM
 *   POST   /api/records
 *   GET    /api/records/:id
 *   PUT    /api/records/:id
 *   DELETE /api/records/:id
 *   GET    /api/stats?month=YYYY-MM
 *
 * 为什么不用 Express / Hono？
 *   这里只有 6 个接口，直接用 Web 标准 Request/Response + D1，
 *   没有依赖、没有构建步骤，wrangler deploy 上去就是最终代码。
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TYPES = new Set(['expense', 'income']);
const MAX_CATEGORY_LEN = 20;
const MAX_NOTE_LEN = 200;
const MAX_AMOUNT = 10_000_000;
const MAX_LIMIT = 1000;
const MAX_OFFSET = 1_000_000;
const MAX_BODY_BYTES = 256 * 1024;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    try {
      if (!env.DB) {
        throw new HttpError(500, 'NO_DB', 'D1 binding DB 未配置');
      }
      return await route(request, env);
    } catch (err) {
      return errorResponse(err);
    }
  },
};

async function route(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (path === '/') {
    return json({
      name: 'MoneyNote API',
      version: '1.0.0',
      runtime: 'cloudflare-workers',
      storage: 'cloudflare-d1',
      endpoints: {
        'GET    /api/health': '健康检查',
        'GET    /api/records?month=YYYY-MM': '按月列出记录（也支持 from/to）',
        'POST   /api/records': '新建记录',
        'GET    /api/records/:id': '查单条',
        'PUT    /api/records/:id': '整体更新',
        'DELETE /api/records/:id': '删除',
        'GET    /api/stats?month=YYYY-MM': '统计：总额 / 分类占比 / 每日趋势',
      },
    });
  }

  if (path === '/api/health') {
    // 真查一次 D1，避免“Worker 活着但数据库绑定坏了”还报健康。
    await env.DB.prepare('SELECT 1 AS ok').first();
    return json({
      ok: true,
      service: 'moneynote-api',
      storage: 'cloudflare-d1',
      time: new Date().toISOString(),
    });
  }

  if (path === '/api/records') {
    if (method === 'GET') return listRecordsRoute(url, env);
    if (method === 'POST') return createRecordRoute(request, env);
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${method} 不支持`);
  }

  if (path === '/api/stats') {
    if (method !== 'GET') {
      throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${method} 不支持`);
    }
    return statsRoute(url, env);
  }

  const single = path.match(/^\/api\/records\/([^/]+)$/);
  if (single) {
    if (method === 'GET') return getRecordRoute(single[1], env);
    if (method === 'PUT') return updateRecordRoute(single[1], request, env);
    if (method === 'DELETE') return deleteRecordRoute(single[1], env);
    throw new HttpError(405, 'METHOD_NOT_ALLOWED', `${method} 不支持`);
  }

  throw new HttpError(404, 'NOT_FOUND', `没有这个接口：${method} ${url.pathname}`);
}

/* ------------------------------- 响应工具 ------------------------------- */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}

function errorResponse(err) {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('[500]', err);
  return json(
    { error: { code: 'INTERNAL_ERROR', message: '服务器内部错误' } },
    500,
  );
}

async function readJsonBody(request) {
  const text = await request.text();
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) {
    throw new HttpError(413, 'BODY_TOO_LARGE', '请求体不能超过 256KB');
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'BAD_JSON', '请求体不是合法 JSON');
  }
}

/* ------------------------------- 路由实现 ------------------------------- */

async function listRecordsRoute(url, env) {
  const { from, to } = parseRange(url.searchParams);

  const limitRaw = url.searchParams.get('limit') === null
    ? 500
    : Number(url.searchParams.get('limit'));
  if (!Number.isInteger(limitRaw) || limitRaw <= 0 || limitRaw > MAX_LIMIT) {
    throw new HttpError(400, 'BAD_LIMIT', `limit 必须是 1~${MAX_LIMIT} 的整数`);
  }

  const offsetRaw = url.searchParams.get('offset') === null
    ? 0
    : Number(url.searchParams.get('offset'));
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0 || offsetRaw > MAX_OFFSET) {
    throw new HttpError(400, 'BAD_OFFSET', `offset 必须是 0~${MAX_OFFSET} 的整数`);
  }

  const items = (await all(
    env,
    `SELECT * FROM records
      WHERE date >= ? AND date <= ?
      ORDER BY date DESC, id DESC
      LIMIT ? OFFSET ?`,
    from,
    to,
    limitRaw,
    offsetRaw,
  )).map(rowToRecord);

  const totalRow = await first(
    env,
    'SELECT COUNT(*) AS n FROM records WHERE date >= ? AND date <= ?',
    from,
    to,
  );

  return json({ range: { from, to }, total: Number(totalRow?.n ?? 0), items });
}

async function createRecordRoute(request, env) {
  const input = parseRecordBody(await readJsonBody(request));
  const ts = new Date().toISOString();
  const info = await run(
    env,
    `INSERT INTO records
       (type, amount_cents, category, note, date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    input.type,
    toCents(input.amount),
    input.category,
    input.note,
    input.date,
    ts,
    ts,
  );

  const record = await getRecord(env, Number(info.meta.last_row_id));
  if (!record) throw new HttpError(500, 'CREATE_FAILED', '记录创建后读取失败');
  return json(record, 201);
}

async function getRecordRoute(rawId, env) {
  const record = await getRecord(env, parseId(rawId));
  if (!record) {
    throw new HttpError(404, 'RECORD_NOT_FOUND', '找不到这条记录');
  }
  return json(record);
}

async function updateRecordRoute(rawId, request, env) {
  const id = parseId(rawId);
  const input = parseRecordBody(await readJsonBody(request));
  const info = await run(
    env,
    `UPDATE records
        SET type = ?, amount_cents = ?, category = ?, note = ?, date = ?, updated_at = ?
      WHERE id = ?`,
    input.type,
    toCents(input.amount),
    input.category,
    input.note,
    input.date,
    new Date().toISOString(),
    id,
  );

  if (Number(info.meta.changes) <= 0) {
    throw new HttpError(404, 'RECORD_NOT_FOUND', '找不到这条记录');
  }

  const record = await getRecord(env, id);
  if (!record) {
    throw new HttpError(404, 'RECORD_NOT_FOUND', '找不到这条记录');
  }
  return json(record);
}

async function deleteRecordRoute(rawId, env) {
  const id = parseId(rawId);
  const info = await run(env, 'DELETE FROM records WHERE id = ?', id);
  if (Number(info.meta.changes) <= 0) {
    throw new HttpError(404, 'RECORD_NOT_FOUND', '找不到这条记录');
  }
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

async function statsRoute(url, env) {
  const { from, to } = parseRange(url.searchParams);

  const totals = await first(
    env,
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense_cents,
       COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income_cents,
       COUNT(*) AS n
     FROM records
     WHERE date >= ? AND date <= ?`,
    from,
    to,
  );

  const byCategory = (await all(
    env,
    `SELECT category, SUM(amount_cents) AS cents, COUNT(*) AS n
       FROM records
      WHERE type = 'expense' AND date >= ? AND date <= ?
      GROUP BY category
      ORDER BY cents DESC`,
    from,
    to,
  )).map((row) => ({
    category: row.category,
    amount: toYuan(row.cents),
    count: Number(row.n),
  }));

  const daily = (await all(
    env,
    `SELECT date, SUM(amount_cents) AS cents
       FROM records
      WHERE type = 'expense' AND date >= ? AND date <= ?
      GROUP BY date
      ORDER BY date ASC`,
    from,
    to,
  )).map((row) => ({ date: row.date, amount: toYuan(row.cents) }));

  const expenseTotal = toYuan(totals?.expense_cents ?? 0);
  const incomeTotal = toYuan(totals?.income_cents ?? 0);

  return json({
    range: { from, to },
    expenseTotal,
    incomeTotal,
    balance: Math.round((incomeTotal - expenseTotal) * 100) / 100,
    count: Number(totals?.n ?? 0),
    byCategory,
    daily,
  });
}

/* ------------------------------- 数据访问 ------------------------------- */

async function all(env, sql, ...params) {
  const result = await env.DB.prepare(sql).bind(...params).all();
  return result.results ?? [];
}

async function first(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).first();
}

async function run(env, sql, ...params) {
  return env.DB.prepare(sql).bind(...params).run();
}

async function getRecord(env, id) {
  const row = await first(env, 'SELECT * FROM records WHERE id = ?', id);
  return row ? rowToRecord(row) : null;
}

function rowToRecord(row) {
  return {
    id: row.id,
    type: row.type,
    amount: toYuan(row.amount_cents),
    category: row.category,
    note: row.note,
    date: row.date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const toCents = (yuan) => Math.round(Number(yuan) * 100);
const toYuan = (cents) => Math.round(Number(cents)) / 100;

/* ------------------------------- 参数校验 ------------------------------- */

function monthRange(month) {
  if (!MONTH_RE.test(month)) {
    throw new HttpError(400, 'BAD_MONTH', 'month 参数格式应为 YYYY-MM，例如 2026-10');
  }
  const [year, mon] = month.split('-').map(Number);
  if (mon < 1 || mon > 12) {
    throw new HttpError(400, 'BAD_MONTH', `月份 ${mon} 不合法`);
  }
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function parseRange(searchParams) {
  const month = searchParams.get('month');
  if (month) return monthRange(month);

  const from = searchParams.get('from');
  const to = searchParams.get('to');
  if (from || to) {
    if (!from || !to) {
      throw new HttpError(400, 'BAD_RANGE', 'from 和 to 必须成对出现');
    }
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new HttpError(400, 'BAD_RANGE', 'from / to 格式应为 YYYY-MM-DD');
    }
    assertRealDate(from);
    assertRealDate(to);
    if (from > to) {
      throw new HttpError(400, 'BAD_RANGE', 'from 不能晚于 to');
    }
    return { from, to };
  }

  return monthRange(currentMonth());
}

function assertRealDate(date) {
  const parsed = new Date(`${date}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new HttpError(400, 'BAD_DATE', `日期 ${date} 不存在`);
  }
}

function parseId(raw) {
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) {
    throw new HttpError(400, 'BAD_ID', `id 必须是正整数，收到的是 ${raw}`);
  }
  return id;
}

function asString(value, code, field) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new HttpError(400, code, `${field} 必须是字符串`);
  }
  return value.trim();
}

function parseRecordBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_BODY', '请求体必须是 JSON 对象');
  }

  const type = asString(body.type, 'BAD_TYPE', 'type');
  if (!TYPES.has(type)) {
    throw new HttpError(400, 'BAD_TYPE', "type 只能是 'expense'（支出）或 'income'（收入）");
  }

  const amount = body.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new HttpError(400, 'BAD_AMOUNT', 'amount 必须是数字');
  }
  if (amount <= 0) {
    throw new HttpError(400, 'BAD_AMOUNT', 'amount 必须大于 0');
  }
  if (amount > MAX_AMOUNT) {
    throw new HttpError(400, 'BAD_AMOUNT', `amount 不能超过 ${MAX_AMOUNT}`);
  }
  if (amount < 0.01) {
    throw new HttpError(400, 'BAD_AMOUNT', 'amount 不能小于 0.01');
  }

  const category = asString(body.category, 'BAD_CATEGORY', 'category');
  if (!category) {
    throw new HttpError(400, 'BAD_CATEGORY', 'category 不能为空');
  }
  if (category.length > MAX_CATEGORY_LEN) {
    throw new HttpError(400, 'BAD_CATEGORY', `category 最多 ${MAX_CATEGORY_LEN} 个字符`);
  }

  const note = asString(body.note, 'BAD_NOTE', 'note');
  if (note.length > MAX_NOTE_LEN) {
    throw new HttpError(400, 'BAD_NOTE', `note 最多 ${MAX_NOTE_LEN} 个字符`);
  }

  const date = asString(body.date, 'BAD_DATE', 'date');
  if (!DATE_RE.test(date)) {
    throw new HttpError(400, 'BAD_DATE', 'date 格式应为 YYYY-MM-DD');
  }
  assertRealDate(date);

  return { type, amount, category, note, date };
}
