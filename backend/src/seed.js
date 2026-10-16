/**
 * 演示数据生成脚本：  npm run seed
 *
 * ⚠️ **会先清空 records 表再写入**，别在有真实数据的库上跑。
 *    只是想让空库有点数据、又不想清空已有的，用 `seedIfEmpty()`
 *    （在 repo.js 里），或者部署时设 `AUTO_SEED=1`（见 server.js）。
 *
 * 生成逻辑在 seed_data.js —— 那边是纯函数，没有副作用。
 * 这个文件只负责"执行"：清库、写入、打印结果。
 */
import { db } from './db.js';
import { deleteAllRecords, insertMany } from './repo.js';
import { buildRecords } from './seed_data.js';

deleteAllRecords();
const list = buildRecords();
const n = insertMany(list);
const expenses = list.filter((r) => r.type === 'expense').length;
const income = list.length - expenses;

console.log(`已写入 ${n} 条演示数据（支出 ${expenses} 条 / 收入 ${income} 条）`);
console.log(`数据库：${db.location?.() ?? '(见启动日志)'}`);
