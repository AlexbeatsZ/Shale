# 默认新建文件夹与设置回读 — 2026-11-24

## 用户行为与修复

设置 → 文件与链接 → 默认位置 → 新建文件的默认位置，可选择仓库根目录、当前文件所在文件夹或指定文件夹。
指定位置新增“选择已有文件夹”下拉入口，也可继续输入仓库相对路径；新路径在创建时沿用原流程建立。
点击“保存默认位置”后提供反馈，重开设置与切换分类显示保存值。
普通新建笔记、主页/命令和裸文件名创建沿用原默认规则；显式路径及文件夹操作优先。
已有文件不移动，本轮没有替用户选择默认目标目录。

实包发现旧缺陷：0.1.89 指定目录已经持久化且实际新建成功，关闭重开设置却显示根目录。
原因是父 Settings 缓存未更新，子表单只在挂载时从旧 props 初始化。
0.1.90 保存后刷新缓存并在持久化 props 更新时同步草稿，覆盖这个显示问题。
设计见 `docs/design/file-placement.md`。

## 源码与验证

运行源码 `a14e0e270095af15bf834efb757c539935c81415`，从 `git archive` 隔离构建；
主检出中其他未提交的钥匙串/测试修改未进入安装包。

- core/server/web/desktop 类型、生产构建通过。
- 112 文件 / 641 单元测试通过。
- 两项真实后端浏览器回归通过：已有目录选择、自填新目录、保存后关闭重开及分类往返、实际新建、同名避让、显式目录、当前目录/主页/裸链接、附件位置与相对路径校验。
- `tests/desktop-file-defaults.mjs` 在最终 Mac arm64 和 Windows x64 0.1.90 包均通过：选择 `Inbox/Nested`、保存、实际创建 `Inbox/Nested/Untitled.md`、重开设置回读。
  均使用一次性 Vault/profile，不修改日用笔记；Mac 临时 profile 预设钥匙串迁移标记。
- Mac 固定 `Local Development Code Signing` / identifier `io.github.alexbeatsz.shale` / `certificate leaf` 与 deep/strict 签名校验通过。
- Android `:app:assembleRelease` / `:app:lintRelease` 成功，生产签名 APK 校验通过；非调试 arm64，applicationId `io.github.alexbeatsz.shale`，versionCode 90。
- 0.1.89 的光标/选区恢复继续包含在本轮源码，专项验证与已有边界见 `native-selection-restoration-20261124.md`。

## 发布与全部可达设备

桌面 `v0.1.90`（Release 457155387）正式发布/latest，Mac arm64 DMG/ZIP/blockmap/latest-mac 与 Windows x64 NSIS/blockmap/latest 七资产。
Android `android-v0.1.90`（Release 457155462）预发布，一个生产 APK。
两个 Release 均绑定上述完整源码提交，资产名称/大小/上传与发布状态已核对。

| 设备 | 更新 | 验证 |
| --- | --- | --- |
| Mac | 0.1.89 → 0.1.90 | 固定签名、原位更新、启动与 healthz ok；深色/Vim 开启/默认光标色保留 |
| OMEN | 0.1.89 → 0.1.90 | 原位安装、启动与 healthz ok；原 Vim 关闭/默认光标色保留 |
| ROG Ally | 0.1.89 → 0.1.90 | 安装版本、进程启动确认；保持原未选 Vault 状态，同步服务 0.3.0 保留 |
| Redmi K70 | 0.1.89 → 0.1.90/code90 | `adb install -r --user current` 成功、版本与启动、healthz ok |
| 小米平板6Pro | 0.1.89 → 0.1.90/code90 | 同上安装命令成功、版本/Activity 启动确认；服务端点已写出，但 healthz 连接仍超时，尚未验收服务及完整界面 |

本轮未修改代理/网络/系统输入法配置，也没有修改真实默认新建文件夹选择。
完整 Android 触摸/界面/同步检查继续沿用先前延期边界，安装成功没有替代完整行为验收。

## 构建保留

Mac/OMEN 主检出仅保留当前 0.1.90 发行产物（desktop/release/0.1.90、android/release/0.1.90）。
已删除本轮导出源码、archive、临时旧应用备份和一次性构建/测试/部署任务；ROG 临时安装器已删除。
生产签名密钥、用户数据与历史 GitHub Release 保留。
Mac 证据 `/tmp/.agents/shale-default-folder`；OMEN/ROG 证据 `%LOCALAPPDATA%/Temp/.agents/shale-default-folder`。
