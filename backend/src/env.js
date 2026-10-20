/**
 * 读取 backend/.env。
 *
 * 为什么单独一个文件、而且要在 db.js 之前执行？
 *   db.js 在模块顶层就把 DB_PATH 算出来了，所以必须让环境变量**先就位**。
 *   ESM 的 import 是按声明顺序执行的：db.js 第一行 import './env.js'，
 *   就能保证 .env 先于 DB_PATH 的计算被读进来。
 *
 * 为什么不引 dotenv？
 *   项目一直坚持"零原生依赖、少一个包少一份风险"。
 *   Node 22.13+ 自带 process.loadEnvFile()，够用。
 *
 * 注意：process.loadEnvFile() 不会覆盖已经存在的环境变量。
 *   所以 CI / Docker / Render 在命令行里显式传的值优先级更高，
 *   不会被 .env 里的本地配置覆盖（这对 smoke.js 的临时数据库尤其重要）。
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ENV_FILE = join(dirname(fileURLToPath(import.meta.url)), '..', '.env');

if (existsSync(ENV_FILE)) {
  if (typeof process.loadEnvFile === 'function') {
    try {
      process.loadEnvFile(ENV_FILE);
    } catch (e) {
      // .env 写坏了不该让服务起不来，把原因说清楚就行。
      console.warn(`[env] 读取 ${ENV_FILE} 失败（已忽略）：${e.message}`);
    }
  } else {
    console.warn('[env] 当前 Node 不支持 process.loadEnvFile()，.env 没有生效。');
  }
}
