# 03 · 把 App 跑起来

目标：模拟器里看到首页、60 多条流水、能记一笔、统计页有图。

**预计耗时：1～2 小时**（大部分时间在等 Gradle 第一次下载依赖）。

---

## 1. 平台目录：已经生成好了，你不用做这一步

`app/lib/` 里是**你写的 Dart 代码**，但一个能跑的 Flutter 工程还需要 `android/` 和 `ios/` 两个平台目录（Gradle 配置、Xcode 工程、图标、启动页……）。这两坨加起来几千行，**必须用 `flutter create` 生成**，手写是自虐。

**这一步我已经替你做完了。** `app/` 现在长这样：

```
app/
├── android/          ← 已生成
├── ios/              ← 已生成
├── lib/              ← 你的代码
├── test/             ← 你的测试
├── pubspec.yaml      ← 你的依赖声明
└── analysis_options.yaml
```

你直接从下面的**第 2 步**开始就行。

> 曾经有个坑值得记一笔：在项目的早期版本里，这两个目录是**不存在**的。
> 后果特别阴险 —— 你按文档去装 Android Studio、配 SDK、下载几个 G 的组件，
> 折腾几小时，最后 `flutter build apk` 才报"找不到 Android 工程"。
> 报错出现在**你付出了大量时间之后**，而不是开始之前。
> 现在目录已经在了，这条坑自动消失。

---

## 2. 拉依赖 + 静态检查

```bash
cd C:\Users\chenj\eclipse-workspace\demo0\app

flutter pub get      # 装 http / shared_preferences
flutter analyze      # 静态检查
flutter test         # 跑单元测试
```

**`flutter analyze` 这一步很重要。** 它抓的是**编译器才能发现的错**：
方法名拼错、类型对不上、少 import 一个符号 —— 这些光看代码是看不出来的。

**我已经在装了 Flutter 3.47.7 的机器上把这三条命令都跑过了，结果如下**，
所以你跑出来应该是同一个结果：

- `flutter pub get` → `Got dependencies!`
- `flutter analyze` → **`No issues found!`**
- `flutter test` → **`All tests passed!`**（47 个测试）

> **嫌上面三条命令麻烦？** 项目根目录有个 `run-tests.bat`，双击它就行 ——
> 它会把后端接口测试和上面这三步一次跑完，最后打印一行结论。
> 详见 [10 测试指南](10-测试指南.md)。

### 看到 info 级别的提示是正常的

`flutter analyze` 也会把**风格建议**打出来，比如：

```
info • Prefer const with constant constructors • lib/widgets/xxx.dart:42:11
```

这些是 `flutter_lints` 的标准规则，不影响编译和运行。**只要不是 `error` 或 `warning` 就可以继续。**

（顺便说一句：这份代码目前是**连 info 都没有**的，一条都不出。
所以你如果看到了 info，多半是自己刚改出来的，不用慌。）

真正需要停下来处理的是这三类：

| 级别 | 例子 | 要不要管 |
|---|---|---|
| `error` | `The method 'xxx' isn't defined` | **必须管**，编译都过不了 |
| `warning` | `The value of the field '_x' isn't used` | **建议管**，是潜在 bug |
| `info` | `Prefer const with constant constructors` | 可以不管 |

我在这份代码里已经清掉了几处会变成 warning 的问题（未使用的 import、空的 catch 块）。如果你自己改代码后出现了 warning，把完整输出贴给 AI，见 [04](04-用AI写代码.md)。

---

## 4. 两个平台配置文件：也已经改好了

**这一步要是漏了，App 会显示「连不上服务器」——而且是在你打包成正式版之后才暴露。**

**同样，我已经替你改完了。** 这一节留在这里，是为了让你**知道它们被改过、改成了什么、为什么**——面试很可能会问，而且你以后改代码时不小心删掉，得能认出来。

### 4.1 Android

文件：`app/android/app/src/main/AndroidManifest.xml`。现在是这样的：

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- ↓ 这行必须手动加，Flutter 模板不会给 -->
    <uses-permission android:name="android.permission.INTERNET"/>

    <application
        android:label="MoneyNote"
        android:name="${applicationName}"
        android:icon="@mipmap/ic_launcher"
        android:usesCleartextTraffic="true">
```

**为什么是这两行？**

- **INTERNET 权限**：Flutter 模板只在 `debug/` 和 `profile/` 的 manifest 里放了这条权限（那两份只在调试/性能分析时生效）。所以**调试时一切正常，一打 release 包就没了网络权限**，App 直接连不上后端。这是整个项目里最坑的一个——调试期完全发现不了，只有在你去应用商店发包、或者给面试官装 APK 的时候才会炸。
- **usesCleartextTraffic**：Android 9（API 28）起默认禁止明文 HTTP。我们的后端是 `http://`，不加这行会被系统直接掐断。

> 上线到应用商店时，正确做法是后端上 HTTPS，然后把 `usesCleartextTraffic` 去掉。
> 面谈被问到要这么答。

### 4.2 iOS

文件：`app/ios/Runner/Info.plist`，在最外层 `<dict>` 里：

```xml
    <key>NSLocalNetworkUsageDescription</key>
    <string>需要访问本地网络上的后端服务来加载记账数据</string>
    <key>NSAppTransportSecurity</key>
    <dict>
        <key>NSAllowsLocalNetworking</key>
        <true/>
    </dict>
```

**为什么是这两段？**

- iOS 14 起，App 访问局域网设备要弹窗征求用户同意，`NSLocalNetworkUsageDescription` 就是那个弹窗里的说明文字。**不写，系统会静默拒绝**，你会以为是网络问题。
- ATS 默认禁止明文 HTTP。这里用 `NSAllowsLocalNetworking` 而不是 `NSAllowsArbitraryLoads`——**只放开局域网，不是全放开**。

**为什么不能图省事写 `NSAllowsArbitraryLoads`（全局放开）？** 两个原因，第二个尤其反直觉：

1. 提交 App Store 会被打回，这是最常被引用的理由。
2. **就算你不打算上架，写了也白写**——Apple 的规则是：当 `NSAllowsLocalNetworking` 存在时，iOS 10+ 会**忽略** `NSAllowsArbitraryLoads`。而且 Apple 自己的文档说明里明确写了：**iOS 17 起默认不再放行裸 IP 地址**，要放行得在 `NSExceptionDomains` 里逐个列出 IP 或 CIDR 段。

   > 顺带说一句：这就是为什么**真机连局域网 IP（`http://192.168.1.7:3000`）在 iOS 17+ 上可能不通**，
   > 而 CI 模拟器连 `localhost` 一定通（`localhost` 属于 `NSAllowsLocalNetworking` 明确覆盖的范围）。
   > **所以演示 iOS 优先用 [05 的 CI 录屏方案](05-录屏与打包.md)**，别拿真机去连局域网 IP 折腾。
   > 反正你手上也只有安卓——这条正好顺路。

> 如果你连的是部署好的 HTTPS 后端（`https://xxx.onrender.com`），
> **iOS 端这两段完全不用加**，因为 HTTPS 本来就在 ATS 白名单里。
> 这也是我推荐 iOS 端走公网 HTTPS 的原因之一。

---

## 5. 跑起来

先确认后端还开着（[02](02-跑通后端.md) 那个终端），然后：

```bash
cd app
flutter devices     # 看看有哪些设备
flutter run
```

有多个设备时指定一个：

```bash
flutter run -d emulator-5554
```

第一次编译要 3～10 分钟（Gradle 在下载依赖），之后改代码热重载就是秒级。

### 看到什么算成功

1. 首页顶部卡片显示「2026年10月结余 ¥4,568.32」这类数字
2. 下面是按日期分组的流水，每行有分类图标和金额
3. 点右下角「记一笔」→ 填金额 → 选分类 → 保存 → 回到首页能看到新记录
4. 点底部「统计」→ 有分类占比条和每日趋势柱
5. 顶部左右箭头能切月份，切到 9 月还有数据

### 热重载

App 跑着的时候，改完 `lib/` 里的代码，在终端按：

- `r` — 热重载（秒级，保留当前页面）
- `R` — 热重启（重置到首页）
- `q` — 退出

---

## 6. 真机跑（推荐，录屏更好看）

模拟器卡、或者你要录屏，就上真机。

1. 手机：设置 → 关于手机 → 连点「版本号」7 次 → 开发者选项打开 → USB 调试打开
2. USB 连电脑，手机上弹出「允许 USB 调试吗」→ 允许
3. `flutter devices` 应该能看到你的手机
4. 找到后端日志里的局域网 IP（比如 `192.168.1.7`），然后：

```bash
flutter run --dart-define=API_BASE_URL=http://192.168.1.7:3000
```

**手机和电脑必须在同一个 WiFi。** 连不上优先检查这条，其次检查 Windows 防火墙是不是拦了 3000 端口。

---

## 常见问题

| 报错 | 原因 | 怎么办 |
|---|---|---|
| `Project with path ':app' could not be found` | `--project-name` 跟 pubspec 的 `name` 不一致 | 删掉 `app/android`，回第 1 步重来，确保是 `money_note` |
| `Unsupported class file major version` | Java 24 冲突 | 回 [01 的第 4 步](01-环境搭建.md) |
| 界面显示「连不上 http://10.0.2.2:3000」 | 后端没开，或地址不对 | 确认后端终端还活着；模拟器要用 `10.0.2.2`，真机要用局域网 IP |
| 真机连不上 | 不同 WiFi / 防火墙 | 手机浏览器打开 `http://电脑IP:3000/api/health` 试试，打不开就是网络问题，不是 App 问题 |
| 中文显示成方块/乱码 | 后端返回没按 UTF-8 解 | 本项目已用 `utf8.decode(res.bodyBytes)` 处理，不该出现。若出现请查 [09](09-排错速查.md) |
| `Gradle task assembleDebug failed` | 各种原因 | 先跑 `cd app/android && gradlew --stop` 再重试；还不行把完整错误贴给 AI |
| 改完代码界面没变 | 只改了 State 内部状态 | 按 `R` 热重启 |
| analyze 报 `withOpacity is deprecated` | 别的代码用了旧 API | 换成 `withAlpha(0~255)` |

---

## 下一步

App 跑起来了 → 先别急着往下。**去读 [04 用 AI 写代码](04-用AI写代码.md)**，再花一周改代码。
