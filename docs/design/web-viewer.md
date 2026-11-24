# 桌面网页浏览器

2026-11-01 的原生化重构一并移除了桌面 WebViewer 和用户脚本。2026-11-19 用户要求恢复并将它们列为持续维护的桌面功能。

## 键盘与拖放（2026-11-23）

- 用户反馈：选中网页后部分快捷键失效。原因是获得焦点的访客在自己的进程接收按键，宿主 `App` 的捕获 `keydown` 收不到。宿主在访客 dom-ready 和每次获得焦点时，把 `CommandManager.guestHotkeys()` 的签名发给主进程（`webContents.ipc` 的 `webviewer:hotkeys`）。主进程在访客 `before-input-event` 用与宿主同一份 `eventHotkey`/`hotkeySignature` 匹配，命中后 `preventDefault` 并把按键发回宿主，由同一个 `dispatchHotkey` 执行。只转发带 Ctrl/Command/Alt 的组合或 F 功能键；主修饰键加 C/V/X/A/Z、Shift+Z（Windows 另有 Y）、编辑器专属命令和普通字符仍归网页，输入法组合中的按键不转发。网页不能拦截或伪造该转发。
- 用户反馈：笔记拖到网页正文不触发替换。原因是访客吞掉宿主的 HTML5 拖放事件，只有工具栏能命中 `.editor-area` 的放置逻辑。`Workspace` 在应用内 `dragstart` 时给 body 加 `is-app-dragging`，拖动期间 `webview` 设为 `pointer-events: none`，`dragend`/`drop` 时移除。外部文件拖入网页不受影响。
- 原生回归 `tests/desktop-webviewer.mjs` 用访客 `sendInputEvent` 发送主快捷键打开命令面板，并把笔记标签拖到中央网页正文完成替换。

## 行为

- 首页、侧栏空标签和命令面板提供「打开网页浏览器」。命令 ID 为 `webviewer:open`。中央主页打开网页时，网页原位接替顶部的 Homepage 标签。左右侧栏主页打开网页时，网页原位接替该侧的竖排 Homepage 标签。命令面板按操作前的活动区域打开。
- 网页地址支持 HTTP(S)，无协议地址补 HTTPS。内容区从前进、后退、刷新和地址栏开始。网页请求的 HTTP(S) 新窗口在来源区域创建标签。标签切换保留访客，关闭标签后销毁访客。布局保存地址和标题，重新加载应用后恢复当前地址。
- 空白浏览器标签激活时自动聚焦地址栏，聚焦不得滚动工作区。侧栏开始滑入时地址栏可能仍在视口外，使用 `focus({ preventScroll: true })` 避免正文和顶部标签栏被横向拖动。
- 设置中的「内置浏览器脚本」管理文件和 `.user.js` URL 导入、匹配、授权与更新。见 [用户脚本设计](browser-userscripts.md)。
- Android 保持原生笔记功能，笔记里的外部链接继续由操作系统处理。浏览器版应用及深链的产品边界见 [原生应用边界](native-only.md)。

## 隔离与所有权

主进程 `configureWebViewer` 持有网页访客的附加规则、独立 Chromium 会话、地址限制和弹窗路由。访客强制沙箱、上下文隔离、Web 安全和关闭 Node 集成。网页和脚本网络均经该会话，Shale 本地运行时端口经会话拦截。随包的专用 guest preload 只负责用户脚本，与应用主 frame 的 preload 各自打包。用户脚本 IPC 检查已登记的访客主 frame、文档 token 与已批准权限。

工作区在中央 `tabs` 保存 `webviewer://<uuid>` 身份及 `webUrl`，侧栏沿用 `rightTabs` 的 `webviewer` 类型和 `state.url`。两边都由同一个 WebViewer 组件挂载访客，网页导航使用各访客自己的历史。Windows、macOS 和 Linux 桌面可恢复两种位置的标签，Android 跳过浏览器标签。

Electron 的访客挂载会令主 WebContents 发出 `did-start-loading` 和子 frame 的 `did-start-navigation`。桌面关闭协调器只在主 frame 跨文档导航时清除保存握手的就绪标记。退出保存期间网页回调暂停写入标签布局，关闭取消时从访客同步当前位置。

## 重构验收

保留三处主页和命令面板入口、Homepage 标签原位替换、文件/URL 导入、定期检查和权限审阅。移除任何一项须先取得用户明确同意。用 `node tests/desktop-webviewer.mjs <打包应用可执行文件>` 测试原生宿主。测试使用本地 HTTP 夹具、隔离 Vault 与真实调度定时器，验证区域归属、原位替换、导航、弹窗、导入、执行、自动更新及扩权候选。
