-- Cloudflare D1 schema。和 backend/src/db.js 里的 SQLite 表结构保持一致。
-- 金额仍然存整数「分」，日期仍然存 YYYY-MM-DD 字符串。

CREATE TABLE IF NOT EXISTS records (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  type         TEXT    NOT NULL CHECK (type IN ('expense', 'income')),
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  category     TEXT    NOT NULL,
  note         TEXT    NOT NULL DEFAULT '',
  date         TEXT    NOT NULL,
  created_at   TEXT    NOT NULL,
  updated_at   TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_records_date      ON records (date);
CREATE INDEX IF NOT EXISTS idx_records_type_date ON records (type, date);
