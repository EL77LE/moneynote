/**
 * 路由层。负责：参数校验 -> 调 repo -> 拼响应。
 * 所有校验错误都抛出 HttpError，交给 server.js 的错误中间件统一转成 JSON。
 */
import { Router } from 'express';
import {
  countRecords,
  createRecord,
  deleteRecord,
  getRecord,
  getStats,
  listRecords,
  replaceRecord,
  toCents,
} from './repo.js';

export const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;
const TYPES = new Set(['expense', 'income']);
const MAX_CATEGORY_LEN = 20;
const MAX_NOTE_LEN = 200;
const MAX_AMOUNT = 10_000_000; // 一千万，超过基本是误输入
const MAX_LIMIT = 1000;
// offset 的上界。为什么非得有个上界，见下面 GET /records 里的注释。
const MAX_OFFSET = 1_000_000;

export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

/* ------------------------------- 工具函数 ------------------------------- */

/** 把 '2026-10' 转成 { from: '2026-10-01', to: '2026-10-31' } */
function monthRange(month) {
  if (!MONTH_RE.test(month)) {
    throw new HttpError(400, 'BAD_MONTH', 'month 参数格式应为 YYYY-MM，例如 2026-10');
  }
  const [year, mon] = month.split('-').map(Number);
  if (mon < 1 || mon > 12) {
    throw new HttpError(400, 'BAD_MONTH', `月份 ${mon} 不合法`);
  }
  // Date.UTC(year, mon, 0) = mon+1 月的第 0 天 = 本月最后一天
  const lastDay = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` };
}

export function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * 解析查询里的区间。优先级：month > (from + to) > 当月
 */
function parseRange(query) {
  if (query.month) return monthRange(String(query.month));

  const from = query.from ? String(query.from) : null;
  const to = query.to ? String(query.to) : null;

  if (from || to) {
    if (!from || !to) {
      throw new HttpError(400, 'BAD_RANGE', 'from 和 to 必须成对出现');
    }
    if (!DATE_RE.test(from) || !DATE_RE.test(to)) {
      throw new HttpError(400, 'BAD_RANGE', 'from / to 格式应为 YYYY-MM-DD');
    }
    if (from > to) {
      throw new HttpError(400, 'BAD_RANGE', 'from 不能晚于 to');
    }
    return { from, to };
  }

  return monthRange(currentMonth());
}

/** 校验一个日期字符串是不是真实存在的日期（拦掉 2026-02-30 这种） */
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

/**
 * 取一个字符串字段并 trim。
 *
 * **为什么不用 `String(body.x ?? '')`** —— 那个写法有两个坑：
 *
 * 1. 它会**隐式转换**，把数组、数字、布尔统统"转"成字符串静默存下去：
 *      category: ["餐饮"]  -> "餐饮"
 *      note: 123           -> "123"
 *    前端传错了类型，服务端一声不吭地收下，脏数据就这么进库了。
 *    下面的 amount 早就防住了这个问题（见那段注释），
 *    但 category / note / date 当时漏了。
 *
 * 2. 更糟的是，如果传进来一个 toString 不是函数的对象，
 *    比如 `{"toString": "x"}` —— 这串 JSON 完全合法 ——
 *    `String()` 会抛 TypeError，被错误中间件兜成 **500**。
 *    参数传错是前端的问题，不该报成"服务器内部错误"。
 *
 * `typeof` 检查一次解决这两个问题：要么是干净的字符串，
 * 要么直接 400 说清楚是哪个字段。
 *
 * null / undefined 返回空串，交给调用方各自的"不能为空"检查去报，
 * 这样报出来的错误码和提示还是原来那套（BAD_CATEGORY / BAD_DATE ...）。
 */
function asString(value, code, field) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new HttpError(400, code, `${field} 必须是字符串`);
  }
  return value.trim();
}

/** 校验并归一化写请求的 body。POST 和 PUT 共用。 */
function parseRecordBody(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'BAD_BODY', '请求体必须是 JSON 对象');
  }

  const type = asString(body.type, 'BAD_TYPE', 'type');
  if (!TYPES.has(type)) {
    throw new HttpError(400, 'BAD_TYPE', "type 只能是 'expense'（支出）或 'income'（收入）");
  }

  // 必须是 JSON 里的数字，不能是别的类型。
  // 注意别偷懒写成 `Number(body.amount)` 再判断 —— Number() 会做隐式转换：
  //   Number(true)  -> 1
  //   Number([5])   -> 5
  //   Number('')    -> 0
  // 于是 amount: true 也能建出一条 1 元的记录，前端传错了你都不知道。
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
  // 入库是按"分"存的，所以小于半分钱的金额四舍五入后是 0 分，
  // 会撞上表上的 CHECK (amount_cents > 0)，抛出一个没人处理的
  // SQLite 错误 -> 500「服务器内部错误」。
  // 那是**前端传错了**，不是服务器坏了，就该在这里返回 400 说清楚。
  // 这里复用 repo 的 toCents，保证"校验时算出来的分"和
  // "真正存进去的分"永远是同一个数。
  if (toCents(amount) < 1) {
    throw new HttpError(400, 'BAD_AMOUNT', 'amount 不能小于 0.01');
  }

  const category = asString(body.category, 'BAD_CATEGORY', 'category');
  if (!category) {
    throw new HttpError(400, 'BAD_CATEGORY', 'category 不能为空');
  }
  if (category.length > MAX_CATEGORY_LEN) {
    throw new HttpError(400, 'BAD_CATEGORY', `category 最长 ${MAX_CATEGORY_LEN} 个字符`);
  }

  const note = asString(body.note, 'BAD_NOTE', 'note');
  if (note.length > MAX_NOTE_LEN) {
    throw new HttpError(400, 'BAD_NOTE', `note 最长 ${MAX_NOTE_LEN} 个字符`);
  }

  const date = asString(body.date, 'BAD_DATE', 'date');
  if (!DATE_RE.test(date)) {
    throw new HttpError(400, 'BAD_DATE', 'date 格式应为 YYYY-MM-DD');
  }
  assertRealDate(date);

  return { type, amount, category, note, date };
}

/* --------------------------------- 路由 --------------------------------- */

router.get('/health', (req, res) => {
  res.json({ ok: true, service: 'moneynote-api', time: new Date().toISOString() });
});

/** 列表 */
router.get('/records', (req, res) => {
  const { from, to } = parseRange(req.query);

  const limitRaw = req.query.limit === undefined ? 500 : Number(req.query.limit);
  if (!Number.isInteger(limitRaw) || limitRaw <= 0 || limitRaw > MAX_LIMIT) {
    throw new HttpError(400, 'BAD_LIMIT', `limit 必须是 1~${MAX_LIMIT} 的整数`);
  }

  // offset 光判 "是整数且非负" 是不够的，还得有上界。
  //
  // 因为 JS 的 Number 是双精度浮点，`Number.isInteger(1e20)` 返回 **true**
  // —— 1e20 在它眼里确实是个"整数"。但这个值绑进 SQLite 的
  // `LIMIT ? OFFSET ?` 时，node:sqlite 要的是 64 位整数，装不下，
  // 直接抛 ERR_SQLITE_ERROR: datatype mismatch。
  // 那本该是"参数不合法"，结果报成了 500「服务器内部错误」，
  // 还把内部错误码和堆栈一起吐给客户端、打进日志。
  //
  // （limit 没这个问题，因为 MAX_LIMIT 已经把它夹住了。）
  //
  // 上界取一百万：这个数据集是人自己记账，一个月撑死几百条，
  // 翻到一百万条之外不是正常访问，是有人在探接口。
  const offsetRaw = req.query.offset === undefined ? 0 : Number(req.query.offset);
  if (!Number.isInteger(offsetRaw) || offsetRaw < 0 || offsetRaw > MAX_OFFSET) {
    throw new HttpError(400, 'BAD_OFFSET', `offset 必须是 0~${MAX_OFFSET} 的整数`);
  }

  const items = listRecords({ from, to, limit: limitRaw, offset: offsetRaw });
  res.json({ range: { from, to }, total: countRecords({ from, to }), items });
});

/** 新建 */
router.post('/records', (req, res) => {
  const record = createRecord(parseRecordBody(req.body));
  res.status(201).json(record);
});

/** 单条查询 */
router.get('/records/:id', (req, res) => {
  const record = getRecord(parseId(req.params.id));
  if (!record) throw new HttpError(404, 'RECORD_NOT_FOUND', '找不到这条记录');
  res.json(record);
});

/** 整体更新 */
router.put('/records/:id', (req, res) => {
  const record = replaceRecord(parseId(req.params.id), parseRecordBody(req.body));
  if (!record) throw new HttpError(404, 'RECORD_NOT_FOUND', '找不到这条记录');
  res.json(record);
});

/** 删除 */
router.delete('/records/:id', (req, res) => {
  const ok = deleteRecord(parseId(req.params.id));
  if (!ok) throw new HttpError(404, 'RECORD_NOT_FOUND', '找不到这条记录');
  res.status(204).end();
});

/** 统计：总额 / 分类占比 / 每日趋势，一次返回 */
router.get('/stats', (req, res) => {
  const { from, to } = parseRange(req.query);
  res.json({ range: { from, to }, ...getStats({ from, to }) });
});
