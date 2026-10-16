# MoneyNote 后端 API

Express 5 + Node 内置 SQLite。**没有任何原生依赖**，`npm install` 只需要 5 秒，在 Windows 上永远不会因为编译失败卡住。

## 三步跑起来

```bash
cd backend
npm install
npm run seed     # 生成 60 多条演示数据（会清空旧数据）
npm run dev      # 启动，改代码自动重启
```

启动后浏览器打开 <http://localhost:3000> 能看到接口清单。

## 为什么这么选

| 决策 | 原因 |
|---|---|
| `node:sqlite` 而不是 `better-sqlite3` | 后者是原生模块，Windows 上装它要先装几个 G 的 Visual Studio Build Tools。Node 22.13+ 内置了 SQLite，零编译。 |
| 金额存整数「分」 | `0.1 + 0.2 !== 0.3`。浮点存钱，累加多了会变成 `12.299999999999999`。数据库存分，只在 API 出入口换算。 |
| 日期存 `'YYYY-MM-DD'` 字符串 | 彻底避开「本地时区 vs UTC 差一天」这类经典 bug。字符串比较就是日期比较。 |
| 统计一次请求返回三样 | 前端不用为了总额、分类、趋势发三次请求。少两次往返。 |

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 健康检查，部署平台的探活探针打这个 |
| GET | `/api/records?month=YYYY-MM` | 按月列记录，也支持 `from` / `to` / `limit` / `offset` |
| POST | `/api/records` | 新建，成功返回 201 |
| GET | `/api/records/:id` | 查单条 |
| PUT | `/api/records/:id` | 整体更新（不是部分更新） |
| DELETE | `/api/records/:id` | 删除，成功返回 204 |
| GET | `/api/stats?month=YYYY-MM` | 一次返回总额 / 分类占比 / 每日趋势 |

### 请求体

```json
{
  "type": "expense",
  "amount": 25.5,
  "category": "餐饮",
  "note": "午饭",
  "date": "2026-10-15"
}
```

`type` 只能是 `expense` 或 `income`；`amount` 是大于 0 的数字（单位：元）；`date` 是 `YYYY-MM-DD`。

### 错误格式

所有错误长这样，HTTP 状态码是对应的 400 / 404 / 500：

```json
{ "error": { "code": "BAD_AMOUNT", "message": "amount 必须是大于 0 的数字" } }
```

## 测试

```bash
npm run smoke
```

会自己拉起一个临时服务（独立端口 + 临时数据库），打 61 条断言，跑完自动清理。**不会动你 `data/` 里的真实数据。** 全部通过退出码 0。

覆盖了：月份边界（闰年 2 月是 29 天）、8 种参数非法输入、404 路径、重复删除、`0.1 + 0.2` 的金额精度、排序、聚合。

## 环境变量

全都有默认值，本地开发一个都不用配。见 `.env.example`。

| 变量 | 默认 | 说明 |
|---|---|---|
| `PORT` | `3000` | 监听端口 |
| `DB_PATH` | `./data/moneynote.db` | 数据库文件；填 `:memory:` 就是内存库 |
| `CORS_ORIGIN` | 不限制 | 上线后建议设成白名单，逗号分隔 |

## 数据存在哪

`backend/data/moneynote.db`，是个单文件。删掉它 + `npm run seed` 就等于重置全库。

> ⚠️ **部署到免费平台时注意**：Render / Railway 免费档的文件系统是临时的，
> 每次重新部署数据都会没。演示够用（重新 seed 一下就行），但别把真实数据放上去。

## 目录

```
backend/
├── src/
│   ├── db.js       打开数据库、建表建索引
│   ├── repo.js     所有 SQL 都在这里，不碰 HTTP
│   ├── routes.js   参数校验 + 路由，不碰 SQL
│   ├── server.js   中间件、错误出口、启动
│   └── seed.js     演示数据生成
└── scripts/
    └── smoke.js    冒烟测试
```

分层是为了好回答问题："要换成 MySQL 你改哪？" —— 只改 `repo.js`。
