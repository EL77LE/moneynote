/**
 * 数据访问层（Repository）。
 * 只负责跟 SQLite 打交道，不关心 HTTP。这样将来换数据库只改这一层。
 */
import { db } from './db.js';

const nowIso = () => new Date().toISOString();

/**
 * 元 -> 分。Math.round 处理 25.1 * 100 = 2509.999... 这种浮点误差。
 *
 * 导出是给 routes.js 做校验用的：入库的最小单位是"分"，
 * 校验时如果想判断"这个金额四舍五入后是不是至少 1 分"，
 * 就必须用**同一个**换算函数。各写一份迟早会不一致。
 */
export const toCents = (yuan) => Math.round(Number(yuan) * 100);

/** 分 -> 元。统一包一层 Number()，防止 SQLite 返回 BigInt 时炸掉。 */
const toYuan = (cents) => Math.round(Number(cents)) / 100;

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

/** 按日期区间查列表，新的在前。 */
export function listRecords({ from, to, limit = 500, offset = 0 }) {
  return db
    .prepare(
      `SELECT * FROM records
        WHERE date >= ? AND date <= ?
        ORDER BY date DESC, id DESC
        LIMIT ? OFFSET ?`,
    )
    .all(from, to, limit, offset)
    .map(rowToRecord);
}

export function countRecords({ from, to }) {
  const row = db
    .prepare('SELECT COUNT(*) AS n FROM records WHERE date >= ? AND date <= ?')
    .get(from, to);
  return Number(row.n);
}

/**
 * 全表总条数，不带日期条件。
 *
 * 和 `countRecords` 的区别：那个是"某个月有多少条"，这个是"库里有东西吗"。
 * 后者只用来判断**要不要补种子数据**，所以必须是没有条件的总数 ——
 * 拿单月条数去判断的话，跨月之后会误判成"空库"，然后把数据又灌一遍。
 */
export function countAllRecords() {
  const row = db.prepare('SELECT COUNT(*) AS n FROM records').get();
  return Number(row.n);
}

export function getRecord(id) {
  const row = db.prepare('SELECT * FROM records WHERE id = ?').get(id);
  return row ? rowToRecord(row) : null;
}

export function createRecord(input) {
  const ts = nowIso();
  const info = db
    .prepare(
      `INSERT INTO records (type, amount_cents, category, note, date, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.type,
      toCents(input.amount),
      input.category,
      input.note ?? '',
      input.date,
      ts,
      ts,
    );
  // node:sqlite 的 lastInsertRowid 可能是 BigInt，必须转 Number
  return getRecord(Number(info.lastInsertRowid));
}

/** PUT 语义：整体替换。字段由路由层校验后传进来。 */
export function replaceRecord(id, input) {
  const info = db
    .prepare(
      `UPDATE records
          SET type = ?, amount_cents = ?, category = ?, note = ?, date = ?, updated_at = ?
        WHERE id = ?`,
    )
    .run(
      input.type,
      toCents(input.amount),
      input.category,
      input.note ?? '',
      input.date,
      nowIso(),
      id,
    );
  return Number(info.changes) > 0 ? getRecord(id) : null;
}

export function deleteRecord(id) {
  const info = db.prepare('DELETE FROM records WHERE id = ?').run(id);
  return Number(info.changes) > 0;
}

export function deleteAllRecords() {
  db.exec('DELETE FROM records');
  try {
    db.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run('records');
  } catch {
    // sqlite_sequence 只在表里出现过 INSERT 之后才存在，全新库里没有，忽略即可
  }
}

/**
 * 一次性把前端要的三个统计都算出来，避免 App 发三次请求。
 */
export function getStats({ from, to }) {
  const totals = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'expense' THEN amount_cents END), 0) AS expense_cents,
         COALESCE(SUM(CASE WHEN type = 'income'  THEN amount_cents END), 0) AS income_cents,
         COUNT(*) AS n
       FROM records
       WHERE date >= ? AND date <= ?`,
    )
    .get(from, to);

  const byCategory = db
    .prepare(
      `SELECT category, SUM(amount_cents) AS cents, COUNT(*) AS n
         FROM records
        WHERE type = 'expense' AND date >= ? AND date <= ?
        GROUP BY category
        ORDER BY cents DESC`,
    )
    .all(from, to)
    .map((r) => ({ category: r.category, amount: toYuan(r.cents), count: Number(r.n) }));

  const daily = db
    .prepare(
      `SELECT date, SUM(amount_cents) AS cents
         FROM records
        WHERE type = 'expense' AND date >= ? AND date <= ?
        GROUP BY date
        ORDER BY date ASC`,
    )
    .all(from, to)
    .map((r) => ({ date: r.date, amount: toYuan(r.cents) }));

  const expenseTotal = toYuan(totals.expense_cents);
  const incomeTotal = toYuan(totals.income_cents);

  return {
    expenseTotal,
    incomeTotal,
    balance: Math.round((incomeTotal - expenseTotal) * 100) / 100,
    count: Number(totals.n),
    byCategory,
    daily,
  };
}

/** 批量插入，给 seed 脚本用。事务包裹，几百条也是毫秒级。 */
export function insertMany(list) {
  const ts = nowIso();
  const stmt = db.prepare(
    `INSERT INTO records (type, amount_cents, category, note, date, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  db.exec('BEGIN');
  try {
    for (const item of list) {
      stmt.run(item.type, toCents(item.amount), item.category, item.note ?? '', item.date, ts, ts);
    }
    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
  return list.length;
}
