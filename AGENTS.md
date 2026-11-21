# AGENTS.md — WebObsidian

项目规则与结构以 [CLAUDE.md](CLAUDE.md) 为准;设计见 [PRD.md](PRD.md),进度见 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。本文件只记录继续工作需要的当前事实和跨模块经验。

## Goal
个人使用的 WebObsidian 原生桌面/Android 应用(fork 自 xnohat/webobsidian,远程 `AlexbeatsZ/webobsidian`)。
- 中央与两侧主页提供同样的打开和新建动作，打开内容时在各自标签栏原位替换当前 Homepage。中央使用顶部标签，两侧使用各自竖排标签，侧栏专有固定面板继续归侧栏。桌面端须保留网页浏览、用户脚本文件/URL 导入及自动检查更新。修改宿主或工作区时运行桌面网页浏览回归。删除或停用任一能力需要用户明确同意。设计见 `docs/design/workspace-sidebars.md` 和 `docs/design/web-viewer.md`。

## Repository Records
- 用户于 2026-11-15 明确要求本项目的 `AGENTS.md`、`docs/design/`、`docs/log/` 及验收记录一起提交并推送 GitHub。个人 fork 的日志不因 fork 身份而排除；临时文件与密钥继续留在忽略范围。

## Current State
- 2026-11-21 Shale 0.1.79 已发布（桌面 7 个资产、Android 2 个非调试 APK）。Mac 的 STEM 片段文件已更新，`mk` 插入 `\(\)`，`dm` 插入三行 `\[ … \]`。隔离 macOS 实包已用同一片段和格式化配置验证输入、保存及混合公式。应用只识别井号系列标题。Mac 日用安装仍为 0.1.76，其余设备的交互和配置同步待实测。设计 `docs/design/native-math.md`、`docs/design/native-writing.md`。
- 2026-11-21 Shale 0.1.78 桌面与 Android 已发布。LaTeX 公式源码括号按正确配对的嵌套深度循环六色，错误标红并加波浪下划线。macOS 实包已验收，Windows 和 Android 安装包已验证构建与身份。
- 2026-11-21 已发布空括号对一次删除修复，桌面 v0.1.77（macOS arm64、Windows x64）和 Android android-v0.1.77（手机及旧平板签名 APK）。macOS 隔离实包验证两种删除键、外侧光标、单括号选区和单步撤销。该交付未安排设备原位安装。
- 2026-11-21 main 新增「设置 › 界面 › 打字时忽略触控板点击」（默认关闭，100–3000 ms，默认 1000 ms）。源码与回归已通过，随 0.1.78 发行包提供。
- 2026-11-19 桌面 v0.1.76 已发布（macOS arm64、Windows x64 共 7 个资产）。空白网页地址栏在侧栏滑入时仍自动聚焦，窗口模式和原生全屏的工作区横向位移均为 0。Mac 的 `/Applications/Shale.app` 已原位升级，签名与本地服务通过，保留原右栏浏览器选中状态。Windows 安装器构建及版本检查通过。
- 2026-11-19 小米平板 6 Pro 的正式包 `io.github.alexbeatsz.webobsidian` 原位升级 0.1.72→0.1.73。Android 17 实机深色主题上下白边消失，状态栏及手势栏保留，本地服务就绪。旧锁 PID 已被其他 UID 复用，旧锁和退出 Syncthing 后遗留的空 `.stfolder` 已改名留档。STEM 已连 ROG，首轮 19 项冲突（5 JS、14 SVG）两版已存，远端 19 项与 Mac 当前文件一致，仍等待选择版本。
- 2026-11-19 桌面 0.1.75 修复 Homepage 打开内容时遗留空标签的问题。本机 `/Applications/Shale.app` 已原位升级，签名、启动和本地服务通过。隔离实包回归覆盖原位替换、浏览器脚本自动更新和布局重启恢复；Windows x64 安装器构建和版本检查通过，实机界面待验收。
- 2026-11-19 已发布桌面 v0.1.74（7 个资产，标签源码 6bf3d1a）。本机 `/Applications/Shale.app` 已原位升级。实际工作区验证中央主页打开顶部浏览器标签，既有右侧网页标签保留；本地服务和签名通过。隔离实包回归覆盖左右侧栏入口、侧栏文件/图谱、布局重启恢复和脚本更新。Windows x64 安装器构建和版本检查通过，实机界面待验收。
- 2026-11-19 已将本机 `/Applications/Shale.app` 从 0.1.72 原位升级到 0.1.73，并正常启动。实际 STEM 工作区首页已确认有「打开网页浏览器」，本地服务健康，签名校验通过。
- 2026-11-19 已发布桌面 v0.1.73（7 个资产，标签源码 42121ed）。恢复 WebViewer、侧边竖排多标签、用户脚本导入和自动更新。601 单元、8 项侧栏/命令面板回归和 macOS 实际包专项通过，覆盖布局持久化、正常退出、重启恢复及脚本权限审阅。Windows x64 安装包已验证构建和版本，实机界面待验收。设计 `docs/design/web-viewer.md`、`docs/design/browser-userscripts.md`。
- 2026-11-15 已发布桌面 v0.1.71（7资产）与 android-v0.1.71（2原证书非调试APK/code71），标签源码 b2095a6，main 另含后续交付记录。PPT/PPTX 静态查看复用 PDF 分页/搜索/缩放、右侧大纲与等比例缩略图，同用 `pdf:toggle-dark` 并保留旧快捷键和按文件状态。600单元、24相关浏览器、三端类型、Mac/Windows实际Electron33包与生产入口通过。Android构建/lint/包身份通过，真机课件与触摸待验收。设计 `docs/design/presentation-viewer.md`，验收 `tests/reports/presentation-viewer-20261115.md`。
- 2026-11-16 品牌改名：安装后显示名为 **Shale**（Pixel 2026 白底图标），appId `com.xnohat.webobsidian`、Android 包名、数据目录与签名不变。0.1.72 已原位装到 Mac（新 `/Applications/Shale.app`，旧 WebObsidian.app 已移入废纸篓）、OMEN（保持未运行）、ROG（正常关闭后升级并重新启动）、K70（code72，user0，首次安装时间不变）。按用户要求未发 Release、未做界面/同步验收。平板离线，最后记录为0.1.66。
- 0.1.70 的统一图片属性/图号引用/菜单、按背景适配滤镜、PDF和连续文档Ctrl+滚轮、默认关闭MD字号滚轮已交付。实际STEM Theme/Hider已清理，14张Wiki SVG按用户要求永久改色，exTable已补来源透传。设计 `docs/design/embed-properties.md`。
- JavaScript图表在opaque-origin iframe运行，应用DOM/Node/原生桥/应用API保持隔离，内置只读组件与OpenAI控件已接通。CPU/内存耗尽仍可能影响渲染进程，iframe没有运算配额。设计 `docs/design/native-javascript.md`。
- 原生同步地址为 `http://100.106.169.46:18744/webobsidian-sync/v1/`。ROG WebObsidianNativeSync按11月14日任务使用该IP监听，server.json/connection.json已更新且沿用workspaceId；Mac/OMEN已实同步。K70 sync.jsonc已改写并回读，实际同步待应用恢复响应。ROG桌面端无活动Vault。
- 日常 Android 仅用非调试 release/tabletRelease。按实机包名和证书原位更新，旧 `.debug` 安装使用 tabletRelease。两变体 debuggable/JNI/BuildConfig.DEBUG 均为 false，WebView 调试关闭。Android 使用 1024MiB 堆且跳过全文 JSON 缓存。原密钥在 OMEN。
- 项目入口/设计/日志已合并OMEN的198条十月与25条十一月记录、MCP验收回执和ROG初始部署记录并推送GitHub。历史实现、版本与验收归 `docs/log/` 和 `tests/reports/`，连续文档当前设计见 `docs/design/virtual-documents.md`。
- Mac 数据目录为 `~/Library/Application Support/@webobsidian/desktop`，服务日志为 `logs/server.log`。历史安装包从 GitHub Release 取回。历史 Release、永久密钥、SDK/依赖缓存与用户数据各在原归属位置。

## Active Work
- Android真机PPT/图表显示与触摸待后续验收。K70返回键/剪贴板/导出交互尚未验收，11月13日用户要求停止进一步设备检查，相关记录见 `tests/reports/host-lifecycle-20261113.md`。
- 小米平板 6 Pro 的 STEM 仍有 19 项文件版本冲突，等待用户选择。原同步配置及冲突两版已保留。
- MCP说明笔记已交付源码与本机安装，最近记录中用户尚未在设置 › MCP选择笔记，真实MCP客户端遵守情况待验收。
- 待做格式化全文的MCP工具，格式化器位于渲染器 `web/src/lib/writing/format.ts`，需接通且结果走审阅。

## Build / Run / Test
- 桌面Release提供Mac arm64 DMG/ZIP/blockmap/latest-mac和Windows x64 NSIS/blockmap/latest，Android独立预发布提供手机/平板两非调试APK。Mac仅Apple Silicon arm64；Linux历史预构建为v0.1.43。
- `gh release` 显式传 `--repo AlexbeatsZ/webobsidian`（本机默认上游），`--target`使用完整源码SHA。API创建tag不会触发推送式CI。
- PPT/PPTX 与 PDF 共用阅读回归为 `node tests/desktop-presentations.mjs <原生可执行文件>`，使用一次性 Vault/profile。相关浏览器为 presentation、pdf-identity、pdf-toolbar、pdf-virtual-zoom。
- 依赖与构建:`npm ci && npm run build`。
- 桌面网页浏览与用户脚本回归：`node tests/desktop-webviewer.mjs <打包应用可执行文件>`。使用隔离 Vault/profile 与本地 HTTP 夹具，自动更新验证需等一次调度。
- JS图表回归运行`node tests/desktop-javascript-widgets.mjs <打包应用可执行文件>`，使用临时Vault/profile；图表验收完成后直接退出临时进程。专项浏览器为javascript-widgets、async-processor-transition、host、source-syntax、render-script-lifetime五个规格。构建core与浏览器运行串行。
- Mac 本机包(只打当前架构,不发布):
  `cd desktop && node scripts/build.mjs && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never`
  产物在 `desktop/release/<版本>/mac-arm64/Shale.app`(gitignored)。
- Mac 发布包仅arm64:`npx electron-builder --mac --arm64 --publish never` 后 `gh release upload v<版本> ...dmg ...zip ...blockmap latest-mac.yml`。不要添加Intel/x64或universal产物；旧构建可清理，原签名密钥/SDK/用户数据/验收记录/历史Release保留。
- 安装:退出应用后替换 `/Applications/Shale.app`,`codesign --verify --deep --strict` 通过后启动;用服务端口的 `/healthz` 验证(端口用 `lsof -iTCP -sTCP:LISTEN | grep -i shale` 查)。
- Windows 安装在 Session1 进行(一次性 Interactive 计划任务):先 `CloseMainWindow` 正常关闭，再 `Shale-<ver>-win-x64-setup.exe /S`。Android 从 OMEN `git archive` 隔离目录构建时需把 Mac 已解压的 `android/.runtime`(nodejs-mobile)放入，并临时复制 `meta-obsidian/android/.signing`,构建后删除。

## Durable Lessons
- 仅副作用导入的上游 Worker 包装可能被 package sideEffects 树摇删除，须使用真实打包入口。Electron33 Worker 请求不继承页面 User-Agent 标记，课件本地 blob 内联也受 connect-src 限制，原生包必须覆盖实际 Worker 与图片页。
- 代码块不声明root时会命中浏览器的同名应用根节点；隔离来源请求运行时会带Origin:null。复用localAccess，仅为固定只读runtime资产放行，API/WS继续拒绝，原生验收必须覆盖生产CSP；生成的native Markdown还需paint containment避免固定定位类覆盖应用。
- 章节高度不能按宽泛`[role=status]`判未就绪（公式也有该角色）；只用整章`data-virtual-loading`。缓存会话重挂载时还要等CodeMirror `onReady`，否则空宿主会把长章缓存成81px，引起滚动跳动。加载标记移除后重测，原生验收必须做章节开头反向滚动。
- CodeMirror自己的measure会在wheel/touch后改外层scrollTop；聚合章节用requestMeasure+单个合并微任务识别这类布局位移。导航锁期间不得把程序滚动再累进锚点或用不一致高度表换窗；PDF分页补偿也要协调，详见虚拟文档设计。
- 本机universal Chrome可能被选为Rosetta x86_64，导致开发测试初始化极慢；2026-11-06通过`/tmp/.agents`包装脚本`exec /usr/bin/arch -arm64 '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' "$@"`并将`RENDER_TEST_BROWSER`设为脚本恢复正常，无需改系统或安装浏览器。
- 虚拟阅读导航必须在真实长章节中检查正文位于可视区域；仅检查 DOM 挂载会漏掉前序章节异步长高导致的空白跳转。构建 core 后再跑单元/浏览器测试，不能与 core dist 写入并行。
- 本机走 Clash 代理(127.0.0.1:7897):`@electron/get` 需要 `ELECTRON_GET_USE_PROXY=1` + `GLOBAL_AGENT_HTTPS_PROXY`;Node 原生 `fetch`(`bundle-tunnel.mjs`)不读代理变量,超时后可先用 curl 把 tunnel zip 和 licenses 放进 `desktop/.gen/tunnel-downloads/`(脚本会校验 SHA-256)。
- Node 26 下 `extract-zip` 在解压 tunnel zip 时 Promise 永不 resolve,进程以 13(unsettled top-level await)退出,且只解出部分文件。处理:用系统 `unzip` 解到 `desktop/.gen/tunnel/<arch>/`,`chmod 755 tunnel-client`,拷贝 licenses 为 `THIRD-PARTY-LICENSES.txt`,写 `version.txt`(内容为 TUNNEL_VERSION),之后 build/before-pack 会直接跳过。CI 用 Node 20 不受影响。
- OMEN Windows 构建：常规仓库 `C:\Users\Meta\Project\Workspaces\meta-obsidian` 常有未提交改动，只 `git fetch`,用 `git archive <commit>` 导出到 `%TEMP%\.agents\webobsidian-build-<ver>` 隔离构建(`npm ci`→`npm run build`→`desktop: node scripts/build.mjs`→`electron-builder --win nsis --x64 --publish never`)。OMEN 上 `npm ci` 的 Electron 下载会无限挂起：设 `ELECTRON_SKIP_BINARY_DOWNLOAD=1`,electron-builder 会用 `%LOCALAPPDATA%\electron\Cache` 里已有的 zip;tunnel 下载会超时：把常规仓库 `desktop/.gen/tunnel-downloads/tunnel-client-v0.0.19-windows-amd64*` 复制进隔离目录同一路径。PowerShell 5.1 脚本不要用 `$ErrorActionPreference='Stop'`(git 的 stderr 进度会被当成错误),改看 `$LASTEXITCODE`。
- 浏览器回归直接用 `RENDER_TEST_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'`；已有核心 dist 时设 `RENDER_TEST_SKIP_CORE_BUILD=1`。2026-11-06 本轮 160 个相关浏览器/集成、546 个单元全部通过，旧的 16 个已知失败已经修复；不再视为允许忽略的基线失败。全单元用 `npx vitest run --testTimeout=30000`，Git 子进程测试需这个超时。临时撤下代码后必须先 `npm run build:core`，不能沿用旧 dist。
- 发版时上传大文件常遇 GitHub HTTP 500/502,`gh release create` 带文件失败会删掉整个草稿。做法:先 `--draft` 建空 Release,逐个 `gh release upload --clobber` 并重试,用 API 按 release id 核对大小(草稿按 tag 查不到),再 `gh release edit --draft=false --latest`。主检出有其他任务改动时，用 `git worktree add --detach /tmp/.agents/webobsidian-release-<ver> <sha>` 隔离构建，复制主检出当前平台所需的 `desktop/.gen/tunnel/arm64` 跳过 tunnel 下载（Mac只保留arm64）。
- 渲染 harness(`/__render-test`):slot 0 实时预览、slot 1 阅读；`reset` 后光标在 0，测首行嵌入控件前先移到文末。快捷键测试直接发 `Control`/`Alt`，按用户要求不换成 Command；Shift+Z 应发大写 `Z`。脚注跳转是异步任务，用 `expect.poll` 等待位置完成。
- 测试源码里用 JS `String.replace` 插入 `$$…$$` 时替换参数必须用函数(`() => '…'`),字符串里的 `$$` 会被当成一个 `$`,公式变成行内数学，看起来像编号丢失。
- zsh 默认 noclobber,`>` 覆盖已有日志会失败导致命令未执行;构建链放进 `bash -c` 或用 `>|`。

- 跑浏览器套件期间不要改源码：Vite HMR 带 `?t=` 的导入可能与测试里动态导入的无版本模块各生成一份 store/StateField，造成错误的状态身份或空分栏。若发生，废弃该轮并重启 Vite 后从干净服务复验。

- Android 构建前先 `node android/scripts/prepare.mjs` 刷新 `.gen`，否则 APK 用旧前端；仅手机包时 `./gradlew :app:assembleRelease -x requireTabletKey`。

- 改名 Shale 后 Windows NSIS(同 appId)会沿用旧安装目录 `%LOCALAPPDATA%\Programs\WebObsidian`,其中可执行文件变为 `Shale.exe`,不会出现 `Programs\Shale`。数据目录取自 package `name`(Mac `~/Library/Application Support/@webobsidian/desktop`),改 productName 不影响。

## Docs Index
- 打字时忽略触控板点击 → `docs/design/typing-pointer-guard.md`。
- 桌面网页浏览与用户脚本 → `docs/design/web-viewer.md`、`docs/design/browser-userscripts.md`。
- PowerPoint与共用分页阅读 → `docs/design/presentation-viewer.md`、`document-navigation.md`、`document-media-theme.md`。
- `docs/design/`:模块设计文档。Callout 颜色/图标 → `callout-styles.md`;Callout 布局 → `callout-lists.md`;源码展开语法灰色 → `source-reveal.md`;`\\( \\)`/`\\[ \\]` 公式 → `native-math.md`;内容引用与嵌入控件 → `content-references.md`;公式编号、嵌入实例与引用编号解析 → `native-equations.md`。
- `docs/log/`:按月工作记录。
- 虚拟文档 → `docs/design/virtual-documents.md`；真实资料原生验收 → `tests/desktop-virtual-documents.mjs`。
