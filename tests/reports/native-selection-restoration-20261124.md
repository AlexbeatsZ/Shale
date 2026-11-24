# 原生光标与文字选区恢复 — 2026-11-24

## 交付行为

基线为加入 Vim 前的 0.1.84 / 8651466。Vim 接入时无条件启用的
`drawSelection()` 隐藏了原生细光标和文字范围，且背景矩形在不透明 Callout 后面绘制。
本轮移除此扩展，复用 `editorSelection` 的浏览器主选区和已有次选区装饰。
普通编辑及 Vim Insert 恢复原生细光标；Vim Normal/Visual 保留引擎块光标。
光标默认跟随正文色，文字选区沿用主题 `--text-selection`，包含嵌套语法与 Callout 文本。
文件树活动行/多选行继续使用原有主题变量，未更改其颜色规则。
浅色/深色光标自定义与恢复默认仍可用；颜色更新不重建 Vim、改变历史或重新获取输入法租约。

运行源码：`b5144189ee1d4f7ce36cb97377b4d3f786bf757f`。
从该提交的 `git archive` 隔离构建，主检出中其他未提交改动未打入本轮安装包。
桌面与 Android 统一 0.1.89，Android versionCode 89。

## 验证

- core/server/web/desktop 类型检查、生产构建通过。
- 112 文件 / 641 单元测试通过。
- 8 项 Vim 浏览器回归通过：双主题细光标、实际文字选区及主题颜色、Callout、启停、历史与输入法请求。
- Mac 0.1.89 实包原生细光标、Visual 实际文字/主题颜色、颜色设置持久化与恢复默认、无额外矩形层及关闭 Vim 恢复通过。
  本轮完整 Mac 输入法往返因另一个应用持有前台而被助手的前台保护拒绝，未宣称通过；颜色专项使用隔离 profile 关闭输入法自动切换完成。
- Windows OMEN 0.1.89 完整 Vim 实包回归通过：原生光标与文字选区、颜色设置/保存/恢复、模式、中英文恢复、记住英文、快速往返、撤销/重做、`:w` 和禁用恢复。
  验证 English 4090409 / Chinese 8040804，并恢复初始中文输入法状态。FileVersion 0.1.89，ProductVersion 0.1.89.0。
- Mac 完整 WebViewer 实包回归通过：主页/侧栏、网页焦点快捷键、笔记拖放替换、访客隔离、导航、用户脚本导入/自动更新/权限、布局持久化及正常退出。
- Mac 固定 `Local Development Code Signing` 证书、identifier `io.github.alexbeatsz.shale`、`certificate leaf` 与 deep/strict 校验通过。
- Android `:app:assembleRelease` / `:app:lintRelease` 通过；APK 为原生产证书签名的非调试 arm64 包，applicationId `io.github.alexbeatsz.shale`。

## 发布

- 桌面 `v0.1.89`：Release 457115900，正式发布且为 latest。Mac arm64 DMG/ZIP/blockmap/latest-mac 与 Windows x64 NSIS/blockmap/latest 共七资产。
- Android `android-v0.1.89`：Release 457121955，预发布，一个生产签名 APK。
- 两个 Release 都指向上述完整源码提交，资产名称、大小及发布状态已核对。

## 全部可达设备部署

用户在本会话明确授权构建更新并部署全部可达设备。桌面正常退出后原位安装；两台 Android 均使用 `adb install -r --user current`，保留原身份和数据。

| 设备 | 安装前 | 安装后 | 实际检查 |
| --- | --- | --- | --- |
| Mac | 0.1.88 | 0.1.89 | `/Applications/Shale.app` 签名通过，启动及 healthz ok；深色/Vim 开启保留，双主题光标覆盖清空以跟随主题 |
| OMEN | 0.1.87 | 0.1.89 | 原位安装、启动及 healthz ok；原 Vim 关闭状态保留，双主题光标恢复默认 |
| ROG Ally | 0.1.87 | 0.1.89 | 安装版本及进程启动确认；保留原先未选择 Vault 的状态，因此没有 Vault 服务健康接口；同步服务 0.3.0 未更动 |
| Redmi K70 | 0.1.87 | 0.1.89 / 89 | 安装成功、版本、启动与 healthz ok；原设置无颜色覆盖，继续默认 |
| 小米平板 6 Pro | 0.1.87 | 0.1.89 / 89 | 安装成功、版本与 Activity 启动确认，应用进程及服务端口监听存在；healthz 连接超时，服务健康和完整界面尚未验收；原设置无颜色覆盖 |

平板无线 ADB 曾不响应，仅重连该设备传输后继续读取；未修改代理、网络或系统输入法配置。
Android 完整触摸/界面/同步验收仍沿用此前延期边界。本轮没有以安装或端口监听代替完整行为验收。

## 本地保留与证据

主检出只保留 0.1.89 发行产物；本轮导出的临时源码、旧本地构建及安装备份清理，历史 GitHub Release、签名密钥和用户数据保留。
Mac 证据目录 `/tmp/.agents/shale-native-selection`，OMEN 对应 `%LOCALAPPDATA%/Temp/.agents/shale-native-selection`，ROG 对应目录只留部署记录。
其中构建/测试日志、发布资产清单和各设备部署结果供后续排查；一次性计划任务在交付后移除。
