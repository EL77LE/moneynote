# MoneyNote · Android + iOS 双端原生记账 App

一个可以直接投递的移动端 demo：**Android 用 Kotlin + Jetpack Compose，iOS 用 SwiftUI**，两套独立原生代码，共用同一个 Node.js + SQLite 后端。

| 目录 | 内容 |
|---|---|
| `native/android/` | Kotlin + Jetpack Compose 原生 Android |
| `native/ios/` | SwiftUI 原生 iOS（XcodeGen 生成工程） |
| `backend/` | Node.js 24 + Express 5 + SQLite |
| `.github/workflows/native-*.yml` | 云端编译 + 模拟器自动演示 + 45 秒录屏 |

> 仓库里的 `app/` 是早期 Flutter 跨平台版，保留作可运行备份，**不是本次投递主项目**，邮件里不要写成 Flutter。

---

## 最快路径：双击一次

根目录的 **`一键交付.bat`** 会自动：

1. 建公开 GitHub 仓库并推代码
2. 触发 iOS 原生 + Android 原生两条云端流水线
3. 在模拟器里自动走「首页 → 记一笔 → 保存 → 统计 → 切月份」
4. 下载两段 45 秒录屏和 Android APK

产出在 `dist\`：

```
dist\demo-ios.mp4        iOS 原生功能录屏
dist\demo-android.mp4    Android 原生功能录屏
dist\...                 Android APK / 截图
```

第一次运行前，先按 **[docs/15-双端原生一键交付.md](docs/15-双端原生一键交付.md)** 换一个 GitHub token。旧 token 如果曾经出现在聊天/截图里，先去 GitHub 撤销。

---

## 云端后端（电脑关机也能用）

1. 打开 [Render Blueprint](https://render.com/deploy?repo=https://github.com/你的用户名/moneynote)，登录后点 **Apply**。
2. 等 `/api/health` 返回 `{"ok":true}`。
3. 把 Render 地址设到本机环境变量，再运行一次 `一键交付.bat`：

```bat
set API_BASE_URL=https://你的服务.onrender.com
一键交付.bat
```

这样 Android 正常版 APK 会编译成连公网后端，装到手机上后**这台电脑关机也不影响使用**。iOS 真机安装需要 Apple 签名；本次交付的 iOS 证据是模拟器录屏。

仓库自带 `.github/workflows/keep-alive.yml`，每 5 分钟 ping 一次 `/api/health`，电脑关机也能保持 Render 免费实例不休眠。Render 域名不是 `moneynote-api.onrender.com` 时，在 GitHub 仓库 Variables 里设置 `BACKEND_URL`。

> 免费实例 + 保活是「实际可用」，不是 SLA。要严格 always-on，把 `render.yaml` 的 `plan: free` 改成 `plan: starter`（付费，约 $7/月），付费实例不会休眠。
> SQLite 在免费实例上是临时磁盘，重启会清空，后端启动时会用 `AUTO_SEED=1` 自动补演示数据。

---

## 本地验证

```bat
:: 后端 77 条接口断言
cd backend
npm install
npm run smoke

:: 工作流引用 + 原生目录静态检查
cd ..
node scripts/check-workflows.mjs
```

原生工程本地编译需要 Android SDK 或 macOS/Xcode；没有也能靠 GitHub Actions 出结果。

---

## 技术说明（面试可讲）

- **金额存整数「分」**：数据库层存 `amount_cents`，只在 API 出入口换算，避免浮点误差。
- **日期存 `YYYY-MM-DD` 字符串**：字符串比较即日期比较，避开时区差一天。
- **双端是两套代码**：`native/android` 是 Kotlin/Compose，`native/ios` 是 SwiftUI；共用 REST API，不是 Flutter 套壳。
- **演示模式是构建/启动参数**：Android 用 `-PdemoMode=true`，iOS 用启动参数 `--demo`，正常安装包不会自动操作。
- **CI 即交付**：GitHub Actions 起后端、编译、装模拟器、录屏、上传 artifact，本机不装 Android SDK/Xcode。

---

## 发邮件

模板、附件命名、发送前检查清单都在 **[docs/07-发邮件给HR.md](docs/07-发邮件给HR.md)**。收件人：`ltx@techlz.com`。

需要填的只有：姓名、简历 PDF、手机/微信/邮箱、项目链接、两段录屏。
