# 11 · 把项目传到 GitHub（项目链接）

招聘原文写的是「**可发项目链接**和应用功能录屏」。

对程序员来说，「项目链接」就是 **GitHub 仓库地址**。
没有仓库，你邮件里就没东西可点——这一封的份量会差很多。

这篇是从零开始的：**假设你没装过 Git、没注册过 GitHub。**

---

## 0. 两个最容易白忙一场的坑，先说在前面

**坑一：仓库设成了 Private。**
HR 点开是 404。他不会来问你，他只会认为这个链接是坏的。
**必须 Public**（第 4 步教你确认）。

**坑二：把 `node_modules` 传上去了。**
那玩意儿几十万个文件、几百 MB，`git push` 能卡到你怀疑人生。
本项目根目录已经写好了 `.gitignore`，正常情况下不会出问题——
但第 3.1 步我还是要你看一眼，因为**这一步能救你半小时**。

---

## 1. 装 Git

下载：<https://git-scm.com/download/win>

双击，**一路点 Next** 就行，所有默认值都是对的。装完**重开一个终端**。

验证：

```bash
git --version
```

看到 `git version 2.x.x` 就成。

### 1.1 配置身份（**这里有个隐私细节**）

Git 要求每次提交都记下"谁提交的"。所以先配上：

```bash
git config --global user.name "张三"
git config --global user.email "你的GitHub邮箱"
```

**但是**——如果你直接用真实邮箱，那么每次提交都会把你的**私人邮箱**
永久写进公开仓库的历史里，谁都能爬。

正确做法是用 GitHub 提供的匿名邮箱：

1. 打开 GitHub → 右上角头像 → **Settings**
2. 左边栏 → **Emails**
3. 勾上 **Keep my email addresses private**
4. 同一页往下看，会显示一个 `12345678+你的用户名@users.noreply.github.com`

**就用这个地址**：

```bash
git config --global user.name "张三"
git config --global user.email "12345678+zhangsan@users.noreply.github.com"
```

> 面试官不会因为你用 noreply 邮箱就觉得你不专业。
> 反而——**知道有这个东西，说明你真提交过代码。**

---

## 2. 在 GitHub 上建一个空仓库

1. 登录 <https://github.com>，右上角 `+` → **New repository**
2. **Repository name**：`moneynote`
3. **Description**：`Flutter 跨平台记账 App（Android + iOS）· Node.js 后端`（可选，但建议填）
4. 选 **Public**
5. ⚠️ **下面三个勾全部不要勾**：

   | 选项 | 为什么不能勾 |
   |---|---|
   | Add a README file | 勾了远端就有一个提交，你本地 push 会被拒（第 6 步有救法，但别给自己找事） |
   | Add .gitignore | 同上，而且本项目**已经有** `.gitignore` 了 |
   | Choose a license | 同上 |

6. 点 **Create repository**

建完页面会跳到一个写着 `Quick setup` 的说明页，**先别管它**，回终端。

> 页面地址长这样：`https://github.com/zhangsan/moneynote`
> **这个就是你要填进邮件的「项目链接」。**

---

## 3. 本地提交，推上去

在项目根目录（`C:\Users\chenj\eclipse-workspace\demo0`）打开终端：

```bash
cd C:\Users\chenj\eclipse-workspace\demo0

git init
git add .
```

### 3.1 ⚠️ 先停一下，看这一眼

```bash
git status
```

它会列出"准备提交"的文件。**必须确认这三个不在里面**：

| 不该出现的 | 为什么 |
|---|---|
| `backend/node_modules/` | 几百 MB、几十万个文件。传上去要几十分钟 |
| `backend/data/moneynote.db` | 这是**你自己本机**的数据，别人 clone 下来会直接看到你的记账记录 |
| `app/build/` | 编译产物，每次都不一样，没有版本控制的意义 |

**看到了就停下来**，先确认根目录的 `.gitignore` 存在，然后：

```bash
git rm -r --cached .
git add .
git status          # 再看一次
```

`--cached` 只从"待提交列表"里移除，**不会删你硬盘上的文件**。

没看到问题就继续：

```bash
git commit -m "feat: 双端记账 App 与配套后端 API"
```

### 3.2 关联远端并推送

把下面那行地址换成**你自己仓库的地址**（第 2 步那个页面上的）：

```bash
git branch -M main
git remote add origin https://github.com/zhangsan/moneynote.git
git push -u origin main
```

**第一次 push 会弹出一个浏览器窗口**让你登录 GitHub 并授权。
点 **Authorize** 就行。这是 Git Credential Manager 在干活，
授权一次以后就不用再登了。

> **如果命令行直接问你要 password**：GitHub 早就不接受账号密码了。
> 别输密码，去根目录 `git config --global --unset credential.helper` 清一下，
> 再 push 一次，浏览器窗口应该就出来了。
> 还不行就用 Token：GitHub → Settings → Developer settings →
> Personal access tokens → Tokens (classic) → Generate new token，
> 勾上 `repo`，拿它当密码用。

推完刷新一下那个仓库页面，**能看到 22 个 Dart 文件、后端源码、docs 目录**就对了。

---

## 4. 确认 HR 真的能打开

**这一步是这篇文档的重点，别跳过。**

打开仓库 → 右上 **Settings** → 拉到**最下面** Danger Zone →
**Change repository visibility** → **Make public**。

然后：

> **按 `Ctrl + Shift + N` 开一个无痕窗口**（Chrome/Edge），
> 在无痕窗口里打开你的仓库地址。

无痕窗口不带你的登录状态，**最接近 HR 打开时的样子**。

- 能看到文件列表 → ✅ 成了
- 跳到登录页 / 显示 404 → ❌ 仓库还是 Private，回去改

---

## 5. README 决定 HR 停留几秒

HR 打开仓库只看两样：**README 的第一屏**和**有没有截图**。
代码他看不懂，也不会看。

本项目根目录的 `README.md` 已经写好了，你只需要改这几个地方：

- [ ] 把项目名改成你自己的
- [ ] 顶部加一行**你的名字 + 联系方式**
- [x] ~~加 App 截图~~ —— **已经有了**，见下

### 截图不用你操心，已经在了

`docs/images/` 里已经有四张，README 里也早就引用好了：

| 文件 | 内容 |
|---|---|
| `app-home.png` | 明细页 |
| `app-stats.png` | 统计页 |
| `app-edit.png` | 记一笔 |
| `app-loading.png` | 网页版的载入动画 |

这四张是**真实运行截图**，不是效果图 —— 用 headless 浏览器
打开编译好的网页版拍的，数据来自本项目的后端。想重新拍：

```bash
node scripts/shoot.mjs docs/images
```

你第 3 周录屏时要做的，是**换成你自己手机上的截图**。
真机截图比浏览器截图更有说服力（能看见状态栏、能看见是安卓/iOS）。

### ⚠️ 有一个 8.3 MB 的大文件要一起传

`app/assets/fonts/NotoSansSC-Regular.otf` 是 8.3 MB 的中文字体，
**必须提交**（原因见 [12](12-部署到网页端.md) 第 7.2 节：不提交的话，
HR 在国内打开网页版会看到满屏方块）。

GitHub 单文件上限是 100 MB，8.3 MB 完全没问题，正常 `git add .` 就会带上。
只是第一次 `git push` 会因为这个文件慢几十秒，**别以为卡死了**。

---

## 6. 常见报错

| 报错 | 原因 | 怎么办 |
|---|---|---|
| `Author identity unknown` | 没配 `user.name` / `user.email` | 回第 1.1 步 |
| `remote origin already exists` | 之前加过 | `git remote set-url origin <新地址>` |
| `failed to push some refs` / `rejected` | 建仓库时勾了 README | `git pull --rebase origin main` 然后重新 push |
| `Support for password authentication was removed` | 输密码了 | 见 3.2 的说明，用浏览器授权或 Token |
| `src refspec main does not match any` | 还没 commit 就想 push | 确认第 3 步的 `git commit` 成功了 |
| push 卡住 / 超时 | 网络 | 配代理；或先试试 `git push -u origin main` 再来一次（会续传） |
| 传上去几百 MB | `.gitignore` 没生效 | 见 3.1。已经传了：`git rm -r --cached node_modules` → commit → push |
| 中文文件名显示成乱码 | Git 的转义 | `git config --global core.quotepath false` |

---

## 7. 传完这步，你就有了

- ✅ 一个**能直接点开的项目链接**（要填进邮件）
- ✅ 一套公开的代码历史（面试官会看提交记录——**别一次全部提交完**，后面第 2 周改代码时正常提交就行）
- ✅ 一个 GitHub 账号（简历上可以写了）

> **提交信息的写法也有讲究**，别写 `update`、`修改`、`aaa`。
> 写成 `feat: 增加"其他"分类`、`fix: 修正跨年月份计算错误` 这种。
> 面试官翻提交历史的时候，这个是"你有没有工程习惯"的直接证据。
> 详见 [04 用 AI 写代码](04-用AI写代码.md)。

---

## 下一步

链接有了 → [12 部署到网页端](12-部署到网页端.md)，
让 HR **不用下载 App 就能直接点开看**。这在投递里的效果比截图和视频都强。
