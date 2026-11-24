# AGENTS.md — Shale

项目规则与结构以 [CLAUDE.md](CLAUDE.md) 为准;设计见 [PRD.md](PRD.md),进度见 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。本文件只记录继续工作需要的当前事实和跨模块经验。

## Goal
个人使用的 Shale 原生桌面/Android 应用(fork 自 xnohat/webobsidian,远程 `AlexbeatsZ/Shale`)。
- 中央与两侧主页提供同样的打开和新建动作，打开内容时在各自标签栏原位替换当前 Homepage。中央使用顶部标签，两侧使用各自竖排标签，侧栏专有固定面板继续归侧栏。桌面端须保留网页浏览、用户脚本文件/URL 导入及自动检查更新。修改宿主或工作区时运行桌面网页浏览回归。删除或停用任一能力需要用户明确同意。设计见 `docs/design/workspace-sidebars.md` 和 `docs/design/web-viewer.md`。

## Repository Records
- 用户于 2026-11-15 明确要求本项目的 `AGENTS.md`、`docs/design/`、`docs/log/` 及验收记录一起提交并推送 GitHub。个人 fork 的日志不因 fork 身份而排除；临时文件与密钥继续留在忽略范围。

## Current State
- 2026-11-24 PRD 1.59：恢复 Insert/禁用时原生细光标与主题文字选区，保留 Normal/Visual 块光标和颜色自定义。桌面 v0.1.89（7 资产/latest）及 Android android-v0.1.89（生产 APK/预发布）已发布；Mac/OMEN/ROG/K70/小米平板6Pro 全部原位安装 0.1.89。641 单元、8 Vim 浏览器、Mac 颜色与完整 WebViewer、Windows 完整 Vim/输入法实包通过。报告 `tests/reports/native-selection-restoration-20261124.md`。
- 2026-11-23 完成 Shale 完整身份迁移（PRD 1.57）：仓库 `AlexbeatsZ/Shale`；Mac 主检出 `/Users/meta/Developer/Shale`，OMEN 主检出 `C:\Users\Meta\source\repos\Shale`，旧主目录已不存在。
- 身份迁移首发桌面/Android 0.1.87、同步服务 0.3.0 已公开发布（当前应用 0.1.89，同步服务仍 0.3.0）。原生 identifier/applicationId=`io.github.alexbeatsz.shale`；profile=`<appData>/Shale`，Vault 配置=`.shale/`，同步=`/shale-sync/v1/`。Windows 沿用安装 GUID；Mac 固定证书与钥匙串迁移助手，certificate leaf/deep/strict 通过。
- 日用安装截至 2026-11-24：Mac/OMEN/K70 0.1.89 启动及 healthz ok；ROG 0.1.89 已启动并保留未选 Vault，ShaleNativeSync 0.3.0 未更改。小米平板6Pro 0.1.89/code89 安装与启动确认、服务端口监听存在，但 healthz 连接超时，尚未通过本轮服务健康验收。迁移后笔记/配置/身份保留，旧 Android 包 disabled-user 保留；完整 Android 同步/界面验收仍按用户此前要求延后。
- 640 单元、7 迁移、33 相关浏览器（MCP 10 复验）、插件旧 ABI 夹具、13 同步服务+2 解压包+17 客户端、三端类型/生产构建、Mac WebViewer/MCP 实包与 Windows/Android 构建通过。现有云端 MCP 只读复验遇网关429，未宣称外部连接验收完成。报告 `tests/reports/identity-migration-20261123.md`。
- OMEN 有 5 个迁移前配置差异的冲突（appearance/bookmarks/hotkeys/Hider.css/Theme.css），两版已保留待审阅；没有覆盖用户配置。恢复状态见 `~/.agents/shale--identity-migration/AGENTS.md`。迁移设计 `docs/design/identity-migration.md`。
- 2026-11-23 桌面 0.1.88（PRD 1.58）：侧栏笔记无顶部栏；网页焦点下已绑定快捷键经主进程 `before-input-event` 交回宿主；应用内拖动时 webview 不接收指针事件，笔记可拖到网页正文替换。
- 既有 Vim/输入法、跨平台快捷键、完整 WebViewer/用户脚本、原生文件同步与冲突审阅、PPT/PDF 与连续文档功能均保留。历次版本/验收见 `docs/log/` 和 `tests/reports/`。
- ROG 同步端口 18744，workspaceId=`76fcca29-885b-4dd1-832e-cfac4f07cc09`；同一数据根/凭据/回执必须保留。旧地址仅作为过渡导入兼容入口。
- 日常 Android 仅用非调试 release/tabletRelease。两变体 debuggable/JNI/BuildConfig.DEBUG 均为 false，WebView 调试关闭；Android 1024MiB 堆，跳过全文 JSON 缓存。原签名密钥在 OMEN，更换 applicationId 后需要迁移私有数据与权限，不可当原位 APK 更新。

## Active Work
- PRD 1.60 / 0.1.90：默认新建文件夹明确选择，修复设置重开旧值；实包验证、全平台发布与全部可达设备更新进行中。
- 小米平板6Pro 0.1.89 服务 healthz 连接超时，后续可在设备前台确认；本轮安装与启动已完成，未修改网络/代理。Mac 本轮完整输入法往返受前台保护阻止，颜色专项及 Windows 完整输入法通过。
- Android真机PPT/图表显示与触摸待后续验收。K70返回键/剪贴板/导出交互尚未验收，11月13日用户要求停止进一步设备检查，相关记录见 `tests/reports/host-lifecycle-20261113.md`。
- MCP说明笔记已交付源码与本机安装，最近记录中用户尚未在设置 › MCP选择笔记，真实MCP客户端遵守情况待验收。
- 待做格式化全文的MCP工具，格式化器位于渲染器 `web/src/lib/writing/format.ts`，需接通且结果走审阅。

## Build / Run / Test
- 桌面Release提供Mac arm64 DMG/ZIP/blockmap/latest-mac和Windows x64 NSIS/blockmap/latest，Android独立预发布提供新 applicationId 的非调试生产 APK（旧证书兼容变体按需要另发）。Mac仅Apple Silicon arm64；Linux历史预构建为v0.1.43。
- `gh release` 显式传 `--repo AlexbeatsZ/Shale`（本机默认上游），`--target`使用完整源码SHA。API创建tag不会触发推送式CI。
- PPT/PPTX 与 PDF 共用阅读回归为 `node tests/desktop-presentations.mjs <原生可执行文件>`，使用一次性 Vault/profile。相关浏览器为 presentation、pdf-identity、pdf-toolbar、pdf-virtual-zoom。
- 依赖与构建:`npm ci && npm run build`。
- 桌面网页浏览与用户脚本回归：`node tests/desktop-webviewer.mjs <打包应用可执行文件>`。使用隔离 Vault/profile 与本地 HTTP 夹具，自动更新验证需等一次调度。
- JS图表回归运行`node tests/desktop-javascript-widgets.mjs <打包应用可执行文件>`，使用临时Vault/profile；图表验收完成后直接退出临时进程。专项浏览器为javascript-widgets、async-processor-transition、host、source-syntax、render-script-lifetime五个规格。构建core与浏览器运行串行。
- Mac 本机包(只打当前架构,不发布):
  `cd desktop && node scripts/build.mjs && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never`
  产物在 `desktop/release/<版本>/mac-arm64/Shale.app`(gitignored)。
- Mac 发布包仅arm64:`npx electron-builder --mac --arm64 --publish never` 后 `gh release upload v<版本> ...dmg ...zip ...blockmap latest-mac.yml`。不要添加Intel/x64或universal产物；旧构建可清理，原签名密钥/SDK/用户数据/验收记录/历史Release保留。
- 安装:退出应用后替换 `/Applications/Shale.app`,`codesign --verify --deep --strict` 通过后启动;用服务端口的 `/healthz` 验证(端口用 `lsof -iTCP -sTCP:LISTEN | grep -i shale` 查)。
- Windows 安装在 Session1 进行(一次性 Interactive 计划任务):先 `CloseMainWindow` 正常关闭，再 `Shale-<ver>-win-x64-setup.exe /S`。Android 从 OMEN `git archive` 隔离目录构建时需把 Mac 已解压的 `android/.runtime`(nodejs-mobile)放入，并临时复制 `Shale/android/.signing`,构建后删除。

## Durable Lessons
- Electron33 的 role 菜单在 accelerator 为 null/undefined 时仍补默认键，须显式空字符串；Mac role 原生 selector 还可能先于 click 执行，同目录动作必须移除 role 再转发。reload 须复用 saveWorkspaceBeforeExit 保存布局与文档，仅保存文档会被 beforeunload 的布局脏状态阻止。
- 仅副作用导入的上游 Worker 包装可能被 package sideEffects 树摇删除，须使用真实打包入口。Electron33 Worker 请求不继承页面 User-Agent 标记，课件本地 blob 内联也受 connect-src 限制，原生包必须覆盖实际 Worker 与图片页。
- 代码块不声明root时会命中浏览器的同名应用根节点；隔离来源请求运行时会带Origin:null。复用localAccess，仅为固定只读runtime资产放行，API/WS继续拒绝，原生验收必须覆盖生产CSP；生成的native Markdown还需paint containment避免固定定位类覆盖应用。
- 章节高度不能按宽泛`[role=status]`判未就绪（公式也有该角色）；只用整章`data-virtual-loading`。缓存会话重挂载时还要等CodeMirror `onReady`，否则空宿主会把长章缓存成81px，引起滚动跳动。加载标记移除后重测，原生验收必须做章节开头反向滚动。
- CodeMirror自己的measure会在wheel/touch后改外层scrollTop；聚合章节用requestMeasure+单个合并微任务识别这类布局位移。导航锁期间不得把程序滚动再累进锚点或用不一致高度表换窗；PDF分页补偿也要协调，详见虚拟文档设计。
- 本机universal Chrome可能被选为Rosetta x86_64，导致开发测试初始化极慢；2026-11-06通过`/tmp/.agents`包装脚本`exec /usr/bin/arch -arm64 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' "$@"`并将`RENDER_TEST_BROWSER`设为脚本恢复正常，无需改系统或安装浏览器。
- 虚拟阅读导航必须在真实长章节中检查正文位于可视区域；仅检查 DOM 挂载会漏掉前序章节异步长高导致的空白跳转。构建 core 后再跑单元/浏览器测试，不能与 core dist 写入并行。
- 本机走 Clash 代理(127.0.0.1:7897):`@electron/get` 需要 `ELECTRON_GET_USE_PROXY=1` + `GLOBAL_AGENT_HTTPS_PROXY`;Node 原生 `fetch`(`bundle-tunnel.mjs`)不读代理变量,超时后可先用 curl 把 tunnel zip 和 licenses 放进 `desktop/.gen/tunnel-downloads/`(脚本会校验 SHA-256)。
- Node 26 下 `extract-zip` 在解压 tunnel zip 时 Promise 永不 resolve,进程以 13(unsettled top-level await)退出,且只解出部分文件。处理:用系统 `unzip` 解到 `desktop/.gen/tunnel/<arch>/`,`chmod 755 tunnel-client`,拷贝 licenses 为 `THIRD-PARTY-LICENSES.txt`,写 `version.txt`(内容为 TUNNEL_VERSION),之后 build/before-pack 会直接跳过。CI 用 Node 20 不受影响。
- OMEN Windows 构建：常规仓库 `C:\Users\Meta\source\repos\Shale` 常有未提交改动，只 `git fetch`,用 `git archive <commit>` 导出到 `%TEMP%\.agents\shale-build-<ver>` 隔离构建(`npm ci`→`npm run build`→`desktop: node scripts/build.mjs`→`electron-builder --win nsis --x64 --publish never`)。OMEN 上 `npm ci` 的 Electron 下载会无限挂起：设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`,electron-builder 会用 `%LOCALAPPDATA%\electron\Cache` 里已有的 zip;tunnel 下载会超时：把常规仓库 `desktop/.gen/tunnel-downloads/tunnel-client-v0.0.19-windows-amd64*` 复制进隔离目录同一路径。PowerShell 5.1 脚本不要用 `$ErrorActionPreference='Stop'`(git 的 stderr 进度会被当成错误),改看 `$LASTEXITCODE`。
- 浏览器回归直接用 `RENDER_TEST_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`；已有核心 dist 时设 `RENDER_TEST_SKIP_CORE_BUILD=1`。2026-11-06 本轮 160 个相关浏览器/集成、546 个单元全部通过，旧的 16 个已知失败已经修复；不再视为允许忽略的基线失败。全单元用 `npx vitest run --testTimeout=30000`，Git 子进程测试需这个超时。临时撤下代码后必须先 `npm run build:core`，不能沿用旧 dist。
- 发版时上传大文件常遇 GitHub HTTP 500/502,`gh release create` 带文件失败会删掉整个草稿。做法:先 `--draft` 建空 Release,逐个 `gh release upload --clobber` 并重试,用 API 按 release id 核对大小(草稿按 tag 查不到),再 `gh release edit --draft=false --latest`。主检出有其他任务改动时，用 `git worktree add --detach /tmp/.agents/shale-release-<ver> <sha>` 隔离构建，复制主检出当前平台所需的 `desktop/.gen/tunnel/arm64` 跳过 tunnel 下载（Mac只保留arm64）。
- 渲染 harness(`/__render-test`):slot 0 实时预览、slot 1 阅读；`reset` 后光标在 0，测首行嵌入控件前先移到文末。快捷键测试按目标语义发真实按键：Mac 主快捷键用 `Meta`（Command）、实体 Control 用 `Control`，Windows 主快捷键用 `Control`；Shift+Z 应发大写 `Z`。脚注跳转是异步任务，用 `expect.poll` 等待位置完成。
- 测试源码里用 JS `String.replace` 插入 `$$…$$` 时替换参数必须用函数(`() => '…'`),字符串里的 `$$` 会被当成一个 `$`,公式变成行内数学，看起来像编号丢失。
- zsh 默认 noclobber,`>` 覆盖已有日志会失败导致命令未执行;构建链放进 `bash -c` 或用 `>|`。

- Electron 实包的键盘/焦点回归需串行运行。2026-11-22 同时启动两个隔离实包时，另一窗口抢焦点导致侧栏地址栏 toBeFocused 断言失败；同一最终包独立完整重跑通过，无需修改应用焦点逻辑。

- 跑浏览器套件期间不要改源码：Vite HMR 带 `?t=` 的导入可能与测试里动态导入的无版本模块各生成一份 store/StateField，造成错误的状态身份或空分栏。若发生，废弃该轮并重启 Vite 后从干净服务复验。

- Android 构建前先 `node android/scripts/prepare.mjs` 刷新 `.gen`，否则 APK 用旧前端；仅手机包时 `./gradlew :app:assembleRelease -x requireTabletKey`。

- Windows 0.1.87 沿用既有 NSIS GUID 但使用新 appId；部署时须将既有安装目录迁移为 `%LOCALAPPDATA%\Programs\Shale`，更新卸载/快捷方式引用后再安装。profile 显式为 `%APPDATA%\Shale`，不再由 npm 包名推导。

- OMEN 上 `npm ci` 直连 npm 会因 TLS 中断失败，且失败时已清空 node_modules；设 `HTTPS_PROXY/HTTP_PROXY=http://127.0.0.1:7897` 与 `ELECTRON_SKIP_BINARY_DOWNLOAD=1` 后 17s 完成。Playwright 版本要求的 headless shell 未安装时，用已有的 `%LOCALAPPDATA%\ms-playwright\chromium-1208\chrome-win64\chrome.exe` 作 `RENDER_TEST_BROWSER`，不必下载。
- `<webview>` 访客在自己的进程接收键盘和拖放，宿主 DOM 监听收不到：快捷键要在主进程 `before-input-event` 转发，应用内拖放要在拖动期间给 webview `pointer-events:none`。
- HTML5 拖放中途改动指针下的 DOM（如插入空位）时，放置容器必须同时取消 `dragenter` 和 `dragover`，否则 Chrome 不再触发 drop；Chrome 的 dragleave 常无 relatedTarget，用坐标判断离开。Playwright 的拖放模拟会把 dragover 滞后一步，测试"停留"要在目标上分几次小幅移动。

- Android 共享存储 `/storage/emulated/0` 拒绝 `link()`（EACCES）。写入 Vault 的代码不要依赖硬链接做原子不覆盖创建，用 `textFile.ts` 的 `createWithoutReplace`。

## Docs Index
- 新建文件与附件默认位置 → `docs/design/file-placement.md`。
- Shale 身份、profile/Vault/跨设备迁移 → `docs/design/identity-migration.md`。
- 原生 Vim 与输入法联动 → `docs/design/vim-input-method.md`。
- 原生同步、自动合并与冲突审阅 → `docs/design/file-sync.md`；MCP 审阅 → `docs/design/native-mcp.md`。
- 打字时忽略触控板点击 → `docs/design/typing-pointer-guard.md`。
- 桌面网页浏览与用户脚本 → `docs/design/web-viewer.md`、`docs/design/browser-userscripts.md`。
- PowerPoint与共用分页阅读 → `docs/design/presentation-viewer.md`、`document-navigation.md`、`document-media-theme.md`。
- `docs/design/`:模块设计文档。Callout 颜色/图标 → `callout-styles.md`;Callout 布局 → `callout-lists.md`;源码展开语法灰色 → `source-reveal.md`;`\\( \\)`/`\\[ \\]` 公式 → `native-math.md`;内容引用与嵌入控件 → `content-references.md`;公式编号、嵌入实例与引用编号解析 → `native-equations.md`。
- `docs/log/`:按月工作记录。
- 虚拟文档 → `docs/design/virtual-documents.md`；真实资料原生验收 → `tests/desktop-virtual-documents.mjs`。
