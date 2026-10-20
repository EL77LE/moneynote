#!/usr/bin/env node
/**
 * 把 backend/src/seed_data.js 的演示数据生成成 D1 能执行的 SQL。
 *
 * 为什么复用 backend 的生成逻辑？
 *   录屏用的 Node 后端和线上 Cloudflare D1 必须是同一批数据，
 *   否则本地录屏好看，线上一打开却是另一套数字，排查很痛苦。
 *
 * 输出：worker/seed.generated.sql（已 gitignore，部署脚本用完会保留/覆盖）
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildRecords } from '../backend/src/seed_data.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'worker', 'seed.generated.sql');

const records = buildRecords();
const ts = new Date().toISOString();

function sqlString(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function cents(value) {
  return Math.round(Number(value) * 100);
}

const lines = [
  '-- 由 scripts/cloudflare-seed.mjs 自动生成，请勿手改。',
  'DELETE FROM records;',
];

for (const record of records) {
  lines.push(
    'INSERT INTO records (type, amount_cents, category, note, date, created_at, updated_at) VALUES (' +
      [
        sqlString(record.type),
        cents(record.amount),
        sqlString(record.category),
        sqlString(record.note ?? ''),
        sqlString(record.date),
        sqlString(ts),
        sqlString(ts),
      ].join(', ') +
      ');',
  );
}

writeFileSync(OUT, `${lines.join('\n')}\n`, 'utf8');
console.log(`已生成 ${records.length} 条演示数据：${OUT}`);
