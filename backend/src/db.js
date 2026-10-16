/**
 * 数据库层。
 *
 * 为什么用 `node:sqlite` 而不是 `better-sqlite3` / `sqlite3`？
 *   后两者是"原生模块"，npm install 时要现场编译，Windows 上必须先装
 *   Visual Studio Build Tools（好几个 G），是零基础最容易卡死的一步。
 *   Node.js 22.5+ 内置了 SQLite，零依赖、零编译，装完 Node 就能用。
 *
 * 金额为什么存"分"（整数）而不是"元"（小数）？
 *   0.1 + 0.2 !== 0.3。用浮点数存钱，累加多了会出现 12.299999999999999。
 *   所以数据库统一存整数分，只在 API 出入口做一次换算。
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

function resolveDbPath() {
  const custom = process.env.DB_PATH;
  // 内存库：测试用，进程退出即消失
  if (custom === ':memory:') return ':memory:';
  if (custom) return resolve(custom);

  const dir = resolve(here, '..', 'data');
  mkdirSync(dir, { recursive: true });
  return resolve(dir, 'moneynote.db');
}

export const DB_PATH = resolveDbPath();
export const db = new DatabaseSync(DB_PATH);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    type         TEXT    NOT NULL CHECK (type IN ('expense', 'income')),
    amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
    category     TEXT    NOT NULL,
    note         TEXT    NOT NULL DEFAULT '',
    date         TEXT    NOT NULL,              -- 'YYYY-MM-DD'，纯字符串，跟时区彻底解耦
    created_at   TEXT    NOT NULL,              -- ISO 8601
    updated_at   TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_records_date      ON records (date);
  CREATE INDEX IF NOT EXISTS idx_records_type_date ON records (type, date);
`);

export function closeDb() {
  db.close();
}
