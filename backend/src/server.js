/**
 * 入口文件：装配中间件、挂载路由、启动 HTTP 服务。
 */
import { networkInterfaces } from 'node:os';
import cors from 'cors';
import express from 'express';
import { DB_PATH } from './db.js';
import { countAllRecords, insertMany } from './repo.js';
import { router } from './routes.js';
import { buildRecords } from './seed_data.js';

const app = express();

// 访问日志：每个请求打一行。
//
// **为什么值得专门加**：真机调试时，界面上有数字**并不等于**这次操作
// 真的走到了服务器 —— 也可能是本地缓存里的旧数据。光看界面分辨不出来。
//
// 有了这行日志，你可以一边点手机一边盯着这个终端：
// 每点一下多出一行，才算"前后端真的联通了"。
// 这是 docs/13-只有安卓怎么测.md 第 5 节的核心手法，
// 也是面试时回答"你怎么确认前后端联通了"的实证。
//
// 状态码放在方括号里，和下面错误中间件的 '[500]' 保持同一个风格，
// scripts/smoke.js 会检查日志里有没有出现 '[500]'。
//
// 挂在最前面，这样连根路径探活（Render 之类平台会来 ping）也能被记到。
app.use((req, res, next) => {
  const startedAt = process.hrtime.bigint();
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - startedAt) / 1e6;
    const time = new Date().toLocaleTimeString('zh-CN', { hour12: false });
    console.log(`[${res.statusCode}] ${req.method} ${req.originalUrl} (${ms.toFixed(1)}ms) ${time}`);
  });
  next();
});

// 开发期允许所有来源。上线后建议换成 CORS_ORIGIN 白名单。
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((s) => s.trim()) } : {}));

app.use(express.json({ limit: '256kb' }));

// 部署到 Render / Railway 这类平台时，它们会来 ping 根路径探活
app.get('/', (req, res) => {
  res.json({
    name: 'MoneyNote API',
    version: '1.0.0',
    docs: {
      'GET    /api/health': '健康检查',
      'GET    /api/records?month=YYYY-MM': '按月列出记录（也支持 from/to）',
      'POST   /api/records': '新建记录',
      'GET    /api/records/:id': '查单条',
      'PUT    /api/records/:id': '整体更新',
      'DELETE /api/records/:id': '删除',
      'GET    /api/stats?month=YYYY-MM': '统计：总额 / 分类占比 / 每日趋势',
    },
  });
});

app.use('/api', router);

// 404：必须放在所有路由之后、错误中间件之前
app.use((req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `没有这个接口：${req.method} ${req.originalUrl}` },
  });
});

// 统一错误出口。Express 5 会自动把 async 里抛出的错误转发到这里。
app.use((err, req, res, _next) => {
  const status = err.status ?? 500;
  const code = err.code ?? 'INTERNAL_ERROR';

  if (status >= 500) {
    console.error('[500]', req.method, req.originalUrl, err);
  }

  res.status(status).json({
    error: {
      code,
      // 500 不把内部堆栈泄露给客户端
      message: status >= 500 ? '服务器内部错误' : err.message,
    },
  });
});

const PORT = Number(process.env.PORT ?? 3000);

/**
 * 空库就自动补一批演示数据。
 *
 * **为什么需要这个**：部署到 Render 免费档之后，磁盘是临时的 ——
 * 每次重新部署、甚至每次休眠后重启，`data/moneynote.db` 都会被重置。
 * 结果是：面试官点开 App，**看到的是一个空账本**，
 * 还以为你的项目是坏的。
 *
 * 补上这个之后，服务每次醒来发现库里没数据就自己灌一份，
 * App 永远是有内容的。演示场景这就够了。
 *
 * **两点必须说清楚**：
 *
 * 1. 只在**空库**时动手（`countAllRecords() === 0`）。
 *    绝不能用 `npm run seed` 那套逻辑 —— 它会先 `deleteAllRecords()`，
 *    等于每次重启都把用户记的账清空一次。这是"自动补数据"和"自动清库"
 *    的分界线，也是这个函数唯一需要小心的地方。
 *
 * 2. 必须由 `AUTO_SEED=1` 显式打开，**默认关**。
 *    因为 `scripts/smoke.js` 有一批断言是拿空库跑的
 *    （"空库 total 应该是 0"之类）。要是默认就自动灌数据，那批断言全炸。
 *    默认关，让本地开发、自动化测试、线上部署三种场景互不干扰。
 */
function seedIfEmpty() {
  if (countAllRecords() > 0) return 0;
  return insertMany(buildRecords());
}

/** 找出局域网 IPv4，方便真机连本机后端调试 */
function lanAddresses() {
  const out = [];
  for (const list of Object.values(networkInterfaces())) {
    for (const net of list ?? []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address);
    }
  }
  return out;
}

// 监听 0.0.0.0 而不是 127.0.0.1：否则同一 WiFi 下的真机连不上
app.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('  MoneyNote API 已启动');
  console.log(`  数据库文件   ${DB_PATH}`);

  if (process.env.AUTO_SEED === '1') {
    const before = countAllRecords();
    const added = seedIfEmpty();
    console.log(
      added > 0
        ? `  演示数据     空库，已自动写入 ${added} 条`
        : `  演示数据     已有 ${before} 条，未改动`,
    );
  }

  console.log(`  本机访问     http://localhost:${PORT}`);
  console.log(`  安卓模拟器   http://10.0.2.2:${PORT}`);
  for (const ip of lanAddresses()) {
    console.log(`  局域网真机   http://${ip}:${PORT}`);
  }
  console.log('');
});
