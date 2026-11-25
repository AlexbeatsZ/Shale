# 网页生命周期、连续文档与 Vim 撤销验收

日期：2026-11-25。目标：PRD 1.63、桌面 0.1.93。

用户澄清“访达”指 Shale 内右键的系统文件管理器入口，未要求从 macOS 直接导入 PDF。

## 修复

- Electron 网页宿主不随标签次序重排 DOM，保留现有访客；标签/分屏视觉位置独立排列。
- 连续文档首页不落盘，目录链接与文件管理器解析真实源路径，逐段编码保留中文、空格、#、百分号和括号。
- PDF 链接预览使用有界只读资源与取消生命周期，不能进入 Markdown 可写会话；标题显示真实路径，滚动关闭浮层。
- PDF 默认启用深色背景适配，浅色/打印沿用源色；按源路径保存开启和关闭，独立阅读、连续文档、缩略图、预览共用。工具栏和 PDF 页面右键可切换。
- Vim 插入时停顿至少500ms、独立移动光标或失焦开始新撤销组；cw 的删除及紧随输入、原生片段与点号重复保留。

## 验证

- 0.1.92 原正式包运行新增生命周期脚本：第一次交换后原 webContents ID 消失，旧包失败。
- core/server/web/desktop 类型检查、完整生产构建和114文件654单元通过。
- 51 个浏览器用例通过：Vim、导航/脚注/链接预览、PDF 身份/工具栏/缩放、连续文档。
- Mac 网页生命周期正式包通过：快速交换、停留排序、拖入分屏、交换两栏、暂存/恢复；三个页面各请求一次，访客 ID/随机实例/输入/滚动/history.state 保持。
- 原生连续文档夹具沿用现有配置文件名限制：# 属于既有禁止字符，故真实夹具使用中文、空格、百分号和括号。浏览器隔离链接测试另外覆盖编码 #。未改变来源名限制。
- Windows 最终正式包五组均通过：webviewer-lifecycle、完整 webviewer、presentations、virtual-documents、clipboard。FileVersion 0.1.93 / ProductVersion 0.1.93.0。
- Mac 最终正式包 lifecycle、presentations、virtual-documents、完整 WebViewer 与 clipboard 全部通过；包含原生全屏布局、用户脚本文件/URL 导入及自动更新、布局恢复和 Vim 开/关的剪贴板。
- Mac 固定证书 Local Development Code Signing、identifier io.github.alexbeatsz.shale，certificate leaf/deep/strict 通过。深色连续 PDF 截图人工检查为深底浅字。
- PDF 目录原生验收实际调用系统文件定位（中文/百分号/括号路径）并验证关闭反色写入 UI 状态，Markdown/PDF 源字节不受影响。
- 原生框架曾拒绝生成目录的注册表版本；修复局部会话菜单元数据，浏览器夹具加入 initializeNativeMenus 后通过。仅做视图 guard 修复不足以覆盖这一层。
- 原生夹具修正平台主快捷键、访达返回后焦点及所点 PDF 的页面定位；网页布局采样改用有界时钟，避免后台 requestAnimationFrame 永远不回调。

## 发布与安装

正式包运行源码：79c8cd88b66c6e1a55692b4296a86c954da3c6ed（包含此前 d1eb86e 同步修复）；Release v0.1.93 / ID458228505。七资产已正式发布/latest，名称/大小、标签源码与最新 Release 均核对通过。日用安装未更改，Mac 仍0.1.91；Android 本轮不发包。

证据：Mac `/tmp/.agents/shale-viewers/`。全部原生测试使用隔离 Vault/profile 和 `--use-mock-keychain`。

Mac 最终证据：`/tmp/.agents/shale-viewers/mac-virtual-success.log`、`native-virtual-final/`、`mac-presentations-final.log`、`mac-lifecycle-final.log`、`mac-webviewer-bounded.log`、`mac-clipboard-final.log`、`browser-release.log`、`units-release.log`、`release-verification.json`。Windows 五组 receipt 位于 OMEN `%LOCALAPPDATA%/Temp/.agents/shale-viewers-0.1.93-results`；原始 UTF-8 原生 JSON 已复制到 Mac `windows-native/native-result.json`，PowerShell 日志显示编码不代表实际路径乱码。
