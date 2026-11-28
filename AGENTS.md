# AGENTS.md — Shale

项目规则与结构以 [CLAUDE.md](CLAUDE.md) 为准;设计见 [PRD.md](PRD.md),进度见 [IMPLEMENTATION_PLAN.md](IMPLEMENTATION_PLAN.md)。本文件只记录继续工作需要的当前事实和跨模块经验。

## Goal
个人使用的 Shale 原生桌面/Android 应用(fork 自 xnohat/webobsidian,远程 `AlexbeatsZ/Shale`)。
- 中央与两侧主页提供同样的打开和新建动作，打开内容时在各自标签栏原位替换当前 Homepage。中央使用顶部标签，两侧使用各自竖排标签，侧栏专有固定面板继续归侧栏。桌面端须保留网页浏览、用户脚本文件/URL 导入及自动检查更新。修改宿主或工作区时运行桌面网页浏览回归。删除或停用任一能力需要用户明确同意。设计见 `docs/design/workspace-sidebars.md` 和 `docs/design/web-viewer.md`。

## Repository Records
- 用户于 2026-11-26 明确要求：配置/数据格式变更时不保留旧格式兼容读取，直接迁移现有文件；确需兼容必须先询问用户（首例：PRD1.70 删除 `.virtual-document.json` 的 version/id）。
- 用户于 2026-11-25 明确授权「部署,之后更新不需要我授权」：后续 Shale 构建、发布及已有设备原位更新无需再次确认；保留现有数据和工作区，其他程序与代理配置的权限边界不变。
- 用户于 2026-11-15 明确要求本项目的 `AGENTS.md`、`docs/design/`、`docs/log/` 及验收记录一起提交并推送 GitHub。个人 fork 的日志不因 fork 身份而排除；临时文件与密钥继续留在忽略范围。

## Current State
- 2026-11-27 PRD1.80 同步协议 v2（源码）：文件夹是同步条目（file-sync-core 0.4.0 / 同步服务 0.6.0），仅大小写改名按改名处理，单项失败不停整库，>2 万项自动分批，打开时和手动同步时完整扫描（不做定时扫描，回到前台不触发）。部署顺序：先 ROG 服务，再 Mac，然后平板/K70；v1 客户端遇到仅大小写改名的清单会整体拒绝，所以在用设备要一起升级。
- 2026-11-27 PRD1.79 / Android 0.1.108（12dba07，`android-v0.1.108` 预发布）：平板与 Mac 差距大的根因是远端删除/改名后留下空文件夹，同步报错只在悬停提示且移动布局隐藏状态栏。引擎现清理变空的父目录、只推迟写入中的单个文件，错误带路径并常驻显示。平板验收通过（4 待收项落盘、端到端新建/删除文件夹约 20 秒）；平板/K70 历史残留空目录已手工清理。K70 已装 0.1.108 但服务锁屏未响应。桌面 0.1.108 尚未构建发布，Mac/OMEN/ROG 仍为 0.1.107。
- 2026-11-27 PRD1.78 / 0.1.107 已发布并原位更新 Mac、OMEN、ROG、K70、平板。中央两栏使用同一 Pane 和共享文档会话，编辑模式、工具栏按标签身份。格式化与批量标签跟随聚焦真实来源。普通与连续文档共用编辑审阅、分页和大纲，三处标签共用文件动作、排序与相邻关闭。恢复分屏使用独立网格轨道，Mac 与 ROG 正式包验证网页首帧尺寸及访客保留。Android 验收至安装和启动，详见当月日志。
- 2026-11-27 桌面 0.1.106（分支 `codex/active-webviewer`）已发布并原位更新 Mac/OMEN/ROG。与 Dayweave 0.5.21 配合，Mac 安装版通过隔离采集回读并保留实际 Vault 与工作区，Windows 正式包 UIA 读取与安装回读通过。Windows 解锁后的完整记录待自然使用验收。
- 2026-11-27 PRD1.77 / 0.1.105（运行源码161cb96）已发布：中央 Markdown 标签保留滚动、光标、选区与折叠，暂存分屏两栏同时恢复。683 单元、Mac 60/Windows 10 浏览器、两端正式包启动与 WebViewer/生命周期通过；旧版实包复现网页先全宽。Mac/OMEN/ROG/平板已更新，K70 尾网在线但 ADB 不可达。见 `tests/reports/tab-restore-20261127.md`。
- 2026-11-26 服务器数据生命周期：独立服务0.5.1/core0.3.4已发布并部署ROG，有限历史/GC与独立压缩DR、升级代码回滚均启用；真实恢复revision653/13302项通过。客户端0.1.103已发布，Mac/OMEN/ROG/K70已确认；平板安装Success后离线，回读未完成。682单元/14服务/2解包通过；原Windows拖放与Mac packaged-startup基线失败保留。见 `tests/reports/server-data-lifecycle-20261126.md`。
- 2026-11-26 PRD1.76 / 0.1.104（运行源码0dd3447）已发布/latest并更新五设备：修复分屏标签组压缩后成员越界和「+」排位错误；Mac54/Windows8浏览器、Mac后台及Windows Session1完整WebViewer/生命周期通过。Mac健康及工作区保留，Windows保持原停止状态，Android首装时间保留。用户已撤回多分组需求，保留每标签单颜色组。见 `tests/reports/tab-layout-20261126.md`。
- 2026-11-26 PRD1.74 / 0.1.102（运行源码0f26235）：query 支持完整 `[!question]` 等 callout 标记（含引号与标签组合），QmdEngine 用原索引候选按完整原文核验，再排序/限额；标记搜索与高亮不做模糊/前缀/拼音替换。680 单元、58 浏览器及 Mac/Windows 正式包生产资源回归通过。v0.1.102/latest 七资产与 android-v0.1.102 已发布，五设备原位更新；Mac 实库返回42篇且摘要均含完整标记。Windows 保持原停止状态、Android 首装时间保留，OMEN 真实同步恢复仍暂停。见 `tests/reports/query-callouts-20261126.md`。
- 2026-11-26 PRD1.73 / 客户端 0.1.101（e712fa3）：先验证本机缓存，再有限并发下载，独立就绪组先应用，沿用同组原子恢复、脏文档闸门与冲突副本。已发布 v0.1.101 / android-v0.1.101 并部署 Mac、OMEN、ROG、K70、平板。K70 两份 Mac 新格式样本已经正常同步落盘，附件目录改名约 1 分钟追平到只剩 4 个下载中的 PPTX；这 4 项最终落盘与全库哈希比对待补验。真实 OMEN 同步恢复仍按原边界暂停。见 [部署报告](tests/reports/central-sync-deployment-20261126.md)。
- 2026-11-26 PRD1.72 / 应用 0.1.100（8f1c016）与独立同步服务 0.4.0（d2b5ca2）已正式发布并部署至 Mac、OMEN、ROG、K70 和小米平板 6 Pro。Mac 真实库正常同步（28 连续文档、0 配置错误），OMEN 备份后等价迁移 73 个文件并用隔离库验收双向同步，真实同步现场保持暂停。ROG 客户端保持未选 Vault，独立服务生产快照（13,302 项）、增量、Range 和旧回执通过。K70 原生服务与真实库可打开，12,662/12,666 待接收项已就绪，两份已下载生产样本仍待应用到真实路径；平板仅启动验证。见 [部署报告](tests/reports/central-sync-deployment-20261126.md) 与 [正式包报告](tests/reports/central-sync-20261126.md)。
- 2026-11-26 PRD1.71（源码，未构建）：删除全部旧格式兼容与一次性迁移代码（插件时代导入、`migration`/`imported`/`replacementSyntax` 字段、Linter 旧替换语法、Templater 别名、第三方命令 ID、旧图片 `|300`/`#dark`、旧 UI 状态、身份迁移与钥匙串助手）。STEM 41 篇笔记 344 处图片已改写并逐图核对等价，hotkeys/writing 配置已删旧字段。保留插件运行时、Obsidian 核心命令 ID、GM 旧式 API、搜索语法与同步协议。报告 `tests/reports/legacy-removal-20261126.md`。
- 2026-11-26 PRD1.70（源码，未构建）：删除虚拟文档 version/分组id 兼容与运行时重复 id，阅读状态以分组标题为键。Mac Vault 28 个已是新格式；OMEN Vault 25 个旧格式（未同步），安装含此改动的版本前须先迁移/同步。
- 2026-11-25 PRD1.69 / 0.1.99：连续文档来源增加 PPT/PPTX（复用分页章节），默认启用总写 MD/PDF/PPT 三个自动分组；STEM 11 个课件主线/补充资料匹配 pdf|pptx?。v0.1.99 latest 与 android-v0.1.99 预发布已发布（源码7092f80）；Mac/OMEN/ROG 原位更新，Mac/OMEN 健康通过。OMEN 的 STEM Vault 尚未同步到迁移后的配置（25 个旧格式，兼容有效）。
- 2026-11-25 PRD1.68 / 0.1.98：虚拟文档分组改为 `pattern`（正则自动发现，运行时自然排序）或 `files`（手动）二选一，标题即分组身份，旧 version/id 兼容读取。STEM Vault 27 个配置已迁移（课件主线/补充资料/MD 自动、教材手动），Vault 提交fc68ea1。v0.1.98 latest七资产与 android-v0.1.98 预发布已发布（源码f6a2ca1）；Mac/OMEN/ROG 原位更新，Mac/OMEN 健康通过。报告 `tests/reports/virtual-document-streams-20261125.md`。
- 2026-11-25 PRD1.67 / 桌面与Android0.1.97已交付（运行源码efc0ccc）：Mac个人Vault实体Control+Shift+Z/X切换同组前/后页面，Windows明确空绑定，原Option左右窗格聚焦保留。分组动作默认未绑定，workspace作用域覆盖Vim各模式；668单元、Mac19/Windows7浏览器、Mac两组后台与Windows五组原生通过。五设备原位更新；Mac/OMEN健康及工作区通过，ROG未选库保留，Android两端服务健康仍待验收。报告 `tests/reports/tab-group-control-20261125.md`。
- 2026-11-25 PRD1.66 / 桌面与Android0.1.96已发布（运行源码d9db5fb），并原位更新五设备。修复0.1.95单页分组键只改标签顺序：现在同组目标直接显示到当前页，分屏替换聚焦栏，侧栏选中目标，首尾循环；668单元、Mac52/Windows6浏览器、Mac两组后台与Windows五组原生通过。Mac/OMEN healthz通过，ROG未选库保留；K70/平板安装与当前进程端点已确认，但本轮服务未就绪，不能宣称Android服务验收完成。报告 `tests/reports/tab-group-foreground-20261125.md`。
- 2026-11-25 PRD1.65 / 桌面与Android0.1.95已发布并原位更新全部五台设备（运行源码12c2e08）。新增中央/两侧颜色分组、Command/Ctrl多选、按加入顺序的Option/Alt+Shift+Z/X循环单页交换、复制标签与独立身份恢复，网页实例/草稿/滚动/history保持。666单元、Mac50+Windows4浏览器、Mac两组后台实包及Windows五组完整原生回归通过。Mac固定证书/identifier/certificate leaf/deep/strict通过；Mac/OMEN/K70 healthz通过，ROG未选Vault保留，平板启动但healthz仍超时。报告 `tests/reports/tab-groups-20261125.md`。
- 2026-11-25 Claude 分支1c0d17a/23dd1ae与0.1.93已合入并推送main（运行源码0dd7e6d），PRD1.64；桌面/Android0.1.94发布，桌面latest七资产、Android生产APK预发布。Mac/OMEN/ROG/K70/平板已原位安装0.1.94；Mac/OMEN/K70启动及healthz通过，ROG保留未选Vault；平板启动和端点存在但healthz超时。658单元、31浏览器、两端五组原生回归通过。报告 `tests/reports/mainline-deployment-20261125.md`。
- 2026-11-25 PRD 1.63 / 桌面 0.1.93 已正式发布/latest（7 资产，运行源码79c8cd8）：网页排序/交换/分屏保留访客；连续文档目录定位真实源文件、PDF 只读预览与可读路径；PDF 默认深色反色并记忆显式关闭；Vim 在停顿/移光标/失焦后分组。654 单元、51 浏览器及 Mac/Windows 五组原生回归通过；Mac 固定证书/identifier/certificate leaf/deep/strict 通过。日用安装未改（Mac 仍0.1.91），Android 未发新包。报告 tests/reports/viewer-lifecycle-20261125.md。
- 2026-11-25 同步活性修复(分支 `fix/sync-liveness`，源码d1eb86e已随桌面0.1.93及Android0.1.94发布，日用0.1.94已更新)：平板停在 recovery 的根因是渲染器 WebSocket 无重连 + 零窗口时维护闸门拒绝 + 每轮先重放入站日志即中止；现已重连/心跳/`unattended` 闸门/冲突按路径隔离。平板已装0.1.94，但服务健康/实际同步恢复尚未通过验收。见 `docs/design/file-sync.md` Liveness 节。
- 2026-11-25 PRD 1.62 / 桌面 0.1.92：默认格式化/粘贴去除公式 tag（复制原样）、编辑器设置绝对/相对行号、含行内公式正文标题转换。647 单元、27 相关浏览器及 Mac/Windows 正式包专项/完整 WebViewer/剪贴板通过；v0.1.92 已正式发布（7资产，运行源码82e971a）；日用安装未改。设计 `docs/design/editor-line-numbers.md`；报告 `tests/reports/writing-editor-options-20261125.md`。
- 2026-11-25 PRD 1.61：桌面 v0.1.91（7 资产/latest，运行源码 89f1407）已发布，本机 Mac 已原位升级、签名/启动/healthz/真实工作区恢复通过，未再触发钥匙串密码。642 单元、21 浏览器、Mac/Windows 剪贴板/完整 WebViewer/原生快捷键实包通过，桌面操作通道实际 Command+V 在地址栏与网页输入框通过。Vim 不是旧故障直接原因。Windows 日用与 Android 仍 0.1.90。隔离测试必须用 `--use-mock-keychain` 且包内含跳过真实迁移的逻辑；已有一致密钥不重写 ACL。报告 `tests/reports/browser-clipboard-20261125.md`。
- 2026-11-24 PRD 1.60：默认新建文件夹新增已有目录选择，修复保存后重开显示旧值。桌面 v0.1.90（7 资产/latest）及 Android android-v0.1.90（生产 APK/预发布）已发布并原位安装到全部五台可达设备；类型、641 单元、2 浏览器与 Mac/Windows 最终实包选择/保存/创建/回读通过。报告 `tests/reports/default-new-folder-20261124.md`。
- 2026-11-24 PRD 1.59：恢复 Insert/禁用时原生细光标与主题文字选区，保留 Normal/Visual 块光标和颜色自定义。桌面 v0.1.89（7 资产/latest）及 Android android-v0.1.89（生产 APK/预发布）已发布；Mac/OMEN/ROG/K70/小米平板6Pro 全部原位安装 0.1.89。641 单元、8 Vim 浏览器、Mac 颜色与完整 WebViewer、Windows 完整 Vim/输入法实包通过。报告 `tests/reports/native-selection-restoration-20261124.md`。
- 2026-11-23 完成 Shale 完整身份迁移（PRD 1.57）：仓库 `AlexbeatsZ/Shale`；Mac 主检出 `/Users/meta/Developer/Shale`，OMEN 主检出 `C:\Users\Meta\source\repos\Shale`，旧主目录已不存在。
- 身份迁移首发桌面/Android 0.1.87、同步服务 0.3.0 已公开发布（当前应用 0.1.90，同步服务仍 0.3.0）。原生 identifier/applicationId=`io.github.alexbeatsz.shale`；profile=`<appData>/Shale`，Vault 配置=`.shale/`，同步=`/shale-sync/v1/`。Windows 沿用安装 GUID；Mac 固定证书与钥匙串迁移助手，certificate leaf/deep/strict 通过。
- 日用安装截至 2026-11-24：Mac/OMEN/K70 0.1.90 启动及 healthz ok；ROG 0.1.90 已启动并保留未选 Vault，ShaleNativeSync 0.3.0 未更改。小米平板6Pro 0.1.90/code90 安装与启动确认、服务端点已写出，但 healthz 连接超时，尚未通过本轮服务健康验收。迁移后笔记/配置/身份保留，旧 Android 包 disabled-user 保留；完整 Android 同步/界面验收仍按用户此前要求延后。
- 640 单元、7 迁移、33 相关浏览器（MCP 10 复验）、插件旧 ABI 夹具、13 同步服务+2 解压包+17 客户端、三端类型/生产构建、Mac WebViewer/MCP 实包与 Windows/Android 构建通过。现有云端 MCP 只读复验遇网关429，未宣称外部连接验收完成。报告 `tests/reports/identity-migration-20261123.md`。
- OMEN 有 5 个迁移前配置差异的冲突（appearance/bookmarks/hotkeys/Hider.css/Theme.css），两版已保留待审阅；没有覆盖用户配置。恢复状态见 `~/.agents/shale--identity-migration/AGENTS.md`。迁移设计 `docs/design/identity-migration.md`。
- 2026-11-23 桌面 0.1.88（PRD 1.58）：侧栏笔记无顶部栏；网页焦点下已绑定快捷键经主进程 `before-input-event` 交回宿主；应用内拖动时 webview 不接收指针事件，笔记可拖到网页正文替换。
- 既有 Vim/输入法、跨平台快捷键、完整 WebViewer/用户脚本、原生文件同步与冲突审阅、PPT/PDF 与连续文档功能均保留。历次版本/验收见 `docs/log/` 和 `tests/reports/`。
- ROG 同步端口 18744，workspaceId=`76fcca29-885b-4dd1-832e-cfac4f07cc09`；同一数据根/凭据/回执必须保留。旧地址仅作为过渡导入兼容入口。
- 日常 Android 仅用非调试 release/tabletRelease。两变体 debuggable/JNI/BuildConfig.DEBUG 均为 false，WebView 调试关闭；Android 1024MiB 堆，跳过全文 JSON 缓存。原签名密钥在 OMEN，更换 applicationId 后需要迁移私有数据与权限，不可当原位 APK 更新。

## Active Work
- 0.1.100 的 Mac/OMEN 旧 math、虚拟文档与图片格式迁移已执行。K70 两份生产配置已进入待接收队列，真实路径仍为旧格式；平板未做实库前台检查。新版严格拒绝旧 math `migration` 字段，其他旧数据的适用边界见正式包与部署报告。
- 2026-11-26 同步 P0 源码：冲突选择和待收日志同检查点保存，按依赖组和脏文档路径拦截，缺同路径基线的首连差异留审阅。验收环境使用隔离库，设备既有冲突继续保留。设计和用例见 `docs/design/file-sync.md`、当月日志。
- 【暂停，用户 2026-11-26 要求仅记录设备故障】OMEN 同步检查点总 revision 445，部分已选配置的基线版本 469 导致重启拒载；两份 CSS 冲突保留，无 incoming/outbox。0.1.100 已发布检查点加载修复并更新 OMEN 应用，真实库现场恢复仍未执行。见 2026-11 日志。
- Android0.1.99：K70/平板 Mac adb 不可达，APK 已发布（`android/release/0.1.99`），设备在线后 `adb install -r --user current` 并核对首次安装时间。
- `tests/browser/presentation.spec.ts` “dark command”用例自 PRD1.63 PDF 默认反色起过期（改动前即失败），需按默认开启重写断言。
- `tests/desktop-image-properties.mjs` 已失效：读身份迁移前 `.shale/shale/blocks/` 与已改名真实笔记，需改用当前路径/素材。
- Android0.1.97：K70/平板已原位安装code97且首次安装时间保留，当前进程与starting端点匹配；K70healthz503、平板超时，服务健康仍未通过（0.1.96亦未就绪）。真实长按/软键盘/完整同步仍延期，后续在设备前台确认。Mac既有完整输入法往返仍未完成；本轮Control回归为后台DOM/访客输入，不代表物理IME。
- Android真机PPT/图表显示与触摸待后续验收。K70返回键/剪贴板/导出交互尚未验收，11月13日用户要求停止进一步设备检查，相关记录见 `tests/reports/host-lifecycle-20261113.md`。
- MCP说明笔记已交付源码与本机安装，最近记录中用户尚未在设置 › MCP选择笔记，真实MCP客户端遵守情况待验收。
- 待做格式化全文的MCP工具，格式化器位于渲染器 `web/src/lib/writing/format.ts`，需接通且结果走审阅。

## Build / Run / Test
- 桌面Release提供Mac arm64 DMG/ZIP/blockmap/latest-mac和Windows x64 NSIS/blockmap/latest，Android独立预发布提供新 applicationId 的非调试生产 APK（旧证书兼容变体按需要另发）。Mac仅Apple Silicon arm64；Linux历史预构建为v0.1.43。
- `gh release` 显式传 `--repo AlexbeatsZ/Shale`（本机默认上游），`--target`使用完整源码SHA。API创建tag不会触发推送式CI。
- PPT/PPTX 与 PDF 共用阅读回归为 `node tests/desktop-presentations.mjs <原生可执行文件>`，使用一次性 Vault/profile。相关浏览器为 presentation、pdf-identity、pdf-toolbar、pdf-virtual-zoom。
- 依赖与构建:`npm ci && npm run build`。
- 桌面网页浏览与用户脚本回归：`node tests/desktop-webviewer.mjs <原生可执行文件绝对路径>`。Mac的WebViewer与lifecycle两组专项默认隐藏窗口后台运行，`SHALE_TEST_BACKGROUND=0`才执行需要原生焦点/全屏的前台路径；Windows默认完整前台，其他平台可设1后台。使用隔离 Vault/profile 与本地 HTTP 夹具，自动更新验证需等一次调度。
- JS图表回归运行`node tests/desktop-javascript-widgets.mjs <打包应用可执行文件>`，使用临时Vault/profile；图表验收完成后直接退出临时进程。专项浏览器为javascript-widgets、async-processor-transition、host、source-syntax、render-script-lifetime五个规格。构建core与浏览器运行串行。
- Mac 本机包(只打当前架构,不发布):
  `cd desktop && node scripts/build.mjs && CSC_IDENTITY_AUTO_DISCOVERY=false npx electron-builder --mac dir --arm64 --publish never`
  产物在 `desktop/release/<版本>/mac-arm64/Shale.app`(gitignored)。
- Mac 发布包仅arm64:`npx electron-builder --mac --arm64 --publish never` 后 `gh release upload v<版本> ...dmg ...zip ...blockmap latest-mac.yml`。不要添加Intel/x64或universal产物；旧构建可清理，原签名密钥/SDK/用户数据/验收记录/历史Release保留。
- 安装:退出应用后替换 `/Applications/Shale.app`,`codesign --verify --deep --strict` 通过后启动;用服务端口的 `/healthz` 验证(端口用 `lsof -iTCP -sTCP:LISTEN | grep -i shale` 查)。
- Windows 安装在 Session1 进行(一次性 Interactive 计划任务):先 `CloseMainWindow` 正常关闭，再 `Shale-<ver>-win-x64-setup.exe /S`。Android 从 OMEN `git archive` 隔离目录构建时需把 Mac 已解压的 `android/.runtime`(nodejs-mobile)放入，并临时复制 `Shale/android/.signing`,构建后删除。

## Durable Lessons
- 任何界面元素不得在某种布局里永久 `display:none`（用户 2026-11-27：要永久隐藏就不如不加入）；同步/后台错误必须有常驻可见文字并带出文件路径，不能只放 hover `title`（触屏没有悬停）。
- 同步/后台任务不能依赖渲染器 WebSocket 存活：Android WebView 和睡眠桌面会静默断开。任何“需要窗口确认”的闸门必须有零窗口策略，客户端套接字必须重连并在重连后重读错过的事件；一个文件的冲突或闸门拒绝不得中止整轮同步(查平板状态：`adb forward tcp:<端口> tcp:<端口>` 后 `GET /api/file-sync`，端口从 `/proc/net/tcp` 的 127.0.0.1 LISTEN 找)。
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
- 发版先检查远程标签及同名 Release。草稿与正式 Release 可同时同名，`gh release upload --clobber` 按标签可能覆盖正式资产。先创建空草稿，按 Release ID 校验草稿状态、标签和目标提交，通过 `uploads.github.com/.../releases/<id>/assets` 上传。大文件遇到 500/502 时按同一 ID 重试，核对资产名称、大小和 `uploaded` 状态后按 ID 发布。主检出有其他任务改动时，用隔离源码构建，复用相应平台 tunnel 缓存（Mac 只保留 arm64）。
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
- Android 触摸编辑（长按选区、菜单焦点、软键盘滚动）→ `docs/design/android-runtime.md`。
- 绝对/相对编辑器行号 → `docs/design/editor-line-numbers.md`；含公式标题 → `docs/design/heading-level-commands.md`。
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

- 服务器数据生命周期：`docs/design/server-data-lifecycle.md`；正式数据、历史、DR 与升级回滚独立，普通升级不复制数据。新服务器版本的部署结果以当月日志为准。
