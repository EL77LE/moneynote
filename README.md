# MoneyNote · Android + iOS 双端原生记账 App

一个可以直接投递的移动端 demo：**Android 用 Kotlin + Jetpack Compose，iOS 用 SwiftUI**，两套独立原生代码，共用同一个 REST 后端。

| 目录 | 内容 |
|---|---|
| `native/android/` | Kotlin + Jetpack Compose 原生 Android |
| `native/ios/` | SwiftUI 原生 iOS（XcodeGen 生成工程） |
| `worker/` | 线上后端：Cloudflare Workers + D1 |
| `backend/` | 本地 / CI 后端：Node.js 24 + Express 5 + SQLite |
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
dist\demo-ios.mp4          iOS 原生功能录屏
dist\demo-android.mp4      Android 原生功能录屏
dist\moneynote-native.apk  Android 安装包
dist\cloudflare-url.txt    线上后端地址（部署 Cloudflare 后生成）
```

第一次运行前，先按 **[docs/15-双端原生一键交付.md](docs/15-双端原生一键交付.md)** 换一个 GitHub token。旧 token 如果曾经出现在聊天/截图里，先去 GitHub 撤销。

> 想让 APK 一次就连公网：先做下面的「云端后端」，再回来双击 `一键交付.bat`。

---

## 云端后端（电脑关机也能用）

线上用 **Cloudflare Workers + D1**：没有休眠、没有冷启动 30 秒，免费额度足够这个 demo。

1. 双击 **`一键部署Cloudflare.bat`**。
2. **没有 Cloudflare 账号也能做**：脚本会自动创建 60 分钟临时预览账号，不需要注册、不需要 token。
3. 脚本自动创建 D1 数据库、建表、灌演示数据、部署 Worker，并把地址写进 `dist\cloudflare-url.txt`。
4. 浏览器会弹出领取页；在 60 分钟内登录或注册 Cloudflare，点 **Claim / 领取**。领取后永久保留。
5. 再双击 **`一键交付.bat`**。它会自动读取这个地址，把 Android APK 编译成连公网后端的版本。

部署完可以打开：

```
https://moneynote-api.<你的子域>.workers.dev/api/health
```

看到 `{"ok":true}` 就成功。之后 Android 手机装 `dist\moneynote-native.apk`，**你的电脑关机、手机换网络，仍然能记一笔、看统计**。

> 领取链接也写在 `dist\cloudflare-claim.txt`，不要发到公开群。  
> 国内网络可能拦截 `workers.dev`；换手机网络/VPN 后再测即可，不影响领取和永久部署。  
> D1 是持久化数据库，重启不会清空；部署脚本只在空库时灌演示数据。iOS 真机安装仍需要 Apple 签名，本次交付的 iOS 证据是模拟器录屏。

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
- **线上后端不睡觉**：Cloudflare Workers + D1，按请求计费，免费额度覆盖 demo；不依赖任何一台开着的电脑。
- **演示模式是构建/启动参数**：Android 用 `-PdemoMode=true`，iOS 用启动参数 `--demo`，正常安装包不会自动操作。
- **CI 即交付**：GitHub Actions 起本地后端、编译、装模拟器、录屏、上传 artifact，本机不装 Android SDK/Xcode。

---

## 发邮件

模板、附件命名、发送前检查清单都在 **[docs/07-发邮件给HR.md](docs/07-发邮件给HR.md)**。收件人：`ltx@techlz.com`。

需要填的只有：姓名、简历 PDF、手机/微信/邮箱、项目链接、两段录屏。
