# PRD — Shale

> Product Requirements Document
> Phiên bản: 1.69 · Cập nhật: 2026-11-25 · Trạng thái: Draft
> Changelog 1.69 (连续文档 PPT 来源) 用户要求课件文件夹中的 `.ppt` / `.pptx` 进入连续阅读。来源类型扩展为 Markdown/PDF/PPT，PPT 章节复用现有 PDF/PPT 共用分页会话、文件标题、大纲（幻灯片标题）、缩略图、缩放与反色，不另建阅读器。默认启用写入 MD/PDF/PPT 三个自动分组，空分组隐藏、新文件到来后自动出现；课件模板主线/补充资料匹配 `pdf|pptx?`，按命名自然排序与 PDF 交错。链接预览同时支持 PDF 与 PPT。
> Changelog 1.68 (虚拟文档自动分组) 保留 `.virtual-document.json`，配置简化为 `title` + `streams`；每个分组用 `pattern`（正则筛选文件夹内相对路径，运行时按现有自然排序计算，不保存结果）或 `files`（显式列表）二选一，可混用，分组以标题为身份。旧 `version`/分组 `id` 只兼容读取。课件文件夹迁移为主线/补充资料/MD 自动分组，教材保持手动列表；PPT 不属于连续文档来源。聚合改名只改写手动列表，自动成员改名后不匹配任何分组时拒绝。见 docs/design/virtual-documents.md。
> Changelog 1.67 (分组快捷键使用实体Control) 用户将分组前后切换改为Mac实体Control+Shift+Z/X，Windows暂不绑定。两动作默认不再占用Option/Alt，个人Vault的同一份hotkeys.jsonc明确保存Mac PhysicalCtrl与Windows空绑定；原Option+Shift+Z/X聚焦左右窗格保留。分组切换是工作区动作，在Vim Normal/Visual/Insert均可执行，Vim自己的编辑组合仍归Vim。验收使用包含原聚焦绑定的实际配置形状，检查Mac实体Control生效、Command/Option不误触发分组、Windows未绑定。
> Changelog 1.66 (分组页面进入前台) 修正 1.65 只交换标签位置的遗漏：Option+Shift+Z/X 必须把同组上/下一个成员直接显示在当前页面，连续按键以刚显示的成员继续，按加入顺序首尾循环。单页复用拖到正文的 showTab；分屏复用 replacePane，只替换当前聚焦栏，目标在另一栏时交换两栏；侧栏直接选中目标。保持网页访客与页面状态，不重新加载。验收必须包含单页正文、左右分屏与侧栏的可见内容，以及网页访客接收真实组合键的转发，不能只检查标签顺序或 store。
> Changelog 1.65 (标签颜色分组与复制) Command（其他平台 Ctrl）点击按选择顺序多选标签，右键加入红、橙、黄、绿、蓝、紫、粉色分组，左边界显示颜色描线；单标签可直接加入/移出。每个标签栏的同色组按加入顺序固定编号，拖动与交换不改编号；Option+Shift+Z/X（其他平台 Alt+Shift+Z/X）与组内前/后一个成员交换，首尾循环，复用手动单页交换并保留网页访客实例。右键复制标签在原标签旁打开独立标签，同一笔记共享正文/撤销会话，不创建文件副本。标签身份与颜色/序号随工作区保存，选择仅本次会话有效。验证优先后台自动化，真实系统按键与输入法验收单独记录。
> Changelog 1.64 (Android 触摸编辑) 合并 Claude 分支的长按菜单选区、异步粘贴与软键盘滚动修复；长按前未获焦时保持键盘关闭，已获焦时恢复焦点；菜单动作允许焦点/装饰事务但拒绝正文或点击前选区变化，保留固定链接的系统定位。沿用 Shale 原生身份、公式粘贴清理与共享历史，发布 0.1.94 并按用户持续授权原位更新。
> Changelog 1.63 (网页生命周期与文档阅读) 网页标签排序、交换及分屏移动保留访客实例与页面状态；连续文档目录链接的预览、系统文件定位使用真实源文件路径，正确处理中文、空格及保留字符。PDF 默认启用深色背景反色，按真实文件路径记忆开启与关闭，单独阅读、连续文档和缩略图共用。检查并修复 Vim 撤销跨独立编辑段过度合并的问题，保留共享文档历史。
> Changelog 1.62 (公式 tag、行号与含公式标题) 格式化和粘贴分别提供默认开启的去除公式 `\tag{…}` / `\tag*{…}` 规则，仅处理已闭合公式，保护代码、注释和文档属性；复制出去保持原样。编辑器设置提供关闭、绝对行号（从 1 开始）和相对行号（主光标行 0，上下为距离），即时生效，阅读与嵌入视图不显示。标题命令与 Option+数字允许含行内公式的正文转换为 H1–H7，继续保护独立/多行公式源码，保留共享撤销与现有绑定。
> Changelog 1.61 (网页与地址栏剪贴板) 修复原生菜单去默认快捷键后网页复制/粘贴失效，以及 macOS 系统按键与测试注入路径不同造成的漏验。网页内的标准编辑组合由所属访客执行；地址栏、普通输入和 Markdown 保留原生剪贴板事件，应用自定义绑定优先，Vim 普通模式的 Control 键仍归 Vim。隔离实包测试必须使用模拟钥匙串并跳过真实钥匙串迁移；已迁移且密钥一致时不重写 ACL。设计见 docs/design/web-viewer.md、vim-input-method.md。
> Changelog 1.60 (默认新建文件夹选择) 设置 › 文件与链接 › 默认位置提供明确的已有文件夹选择，保留根目录/当前文件夹/指定文件夹和自填相对路径；保存后重开设置必须显示已保存值。普通新建笔记、主页与命令入口沿用既有位置规则，显式指定目录优先，不移动已有文件。桌面/Android 0.1.90，按会话授权发布并更新全部可达设备。设计见 docs/design/file-placement.md。
> Changelog 1.59 (恢复原生光标与选区) 移除 Vim 接入时无条件启用的 drawSelection：普通编辑与 Vim 插入模式恢复浏览器原生细光标及文字选区；Vim 普通/可视模式保留引擎块光标，但文字选区沿用原主题 --text-selection。颜色自定义和输入法/共享历史保留，关闭 Vim 恢复原生行为。按用户授权恢复各可达设备默认光标颜色，统一构建部署桌面与 Android 0.1.89。设计见 docs/design/vim-input-method.md。
> Changelog 1.58 (侧栏笔记与网页交互) 侧栏笔记不再显示多余的图标/标题/关闭顶部栏，标题与关闭由竖排标签负责（中键、Delete、右键菜单）；图谱、书签和插件视图保留该栏。网页获得焦点时，已绑定的 Shale 组合键（带 Ctrl/Command/Alt 或 F 功能键）交回应用执行；复制/粘贴/剪切/全选/撤销/重做、编辑器专属命令和普通字符仍留给网页。笔记标签拖到网页正文区域与拖到网页工具栏一样触发替换/分屏。设计见 docs/design/web-viewer.md、workspace-sidebars.md、hotkeys.md。
> Changelog 1.57 (Shale 完整身份迁移) 仓库、内部包/桥接/MCP、桌面与 Android 应用标识、应用数据和 Vault 根目录统一为 Shale；Vault 配置改为 `.shale/`，同步入口改为 `/shale-sync/v1/`。启动前迁移旧配置与本机路径，保留笔记、认证、用户脚本、布局和同步身份；出现路径冲突时保留两边并停止迁移。原第三方插件模块/ID、来源与许可不伪造改名。设计见 docs/design/identity-migration.md。
> Changelog 1.56 (Vim 光标颜色) Vim 默认光标沿用普通编辑器的正文灰黑色（深色主题自动转浅），替换插件固定的低对比度配色；设置 › 编辑器 › Vim 可分别调整浅色/深色主题的光标颜色并恢复默认，即时生效且不重置 Vim 模式、选区或输入法状态。插入模式细光标与普通/可视模式块光标共用颜色，块光标保留文字可读性。设计见 docs/design/vim-input-method.md。
> Changelog 1.55 (原生 Vim 与内置输入法联动) 原生 Markdown 编辑器可开启 Vim；进入普通/可视模式使用指定英文输入源，返回插入模式恢复离开插入模式前的输入法。助手随桌面包构建，无需全局安装；仅当前聚焦编辑器可切换，离开编辑器恢复输入法。保持共享文档历史、片段和保存语义。Android 提供 Vim，系统输入法自动切换仅桌面 macOS/Windows。设计见 docs/design/vim-input-method.md。
> Changelog 1.54 (原生菜单快捷键归设置管理) 桌面菜单不注册 Electron/macOS 默认快捷键；重新加载、强制重新加载、开发者工具、窗口缩放/全屏/最小化/隐藏/退出等动作进入同一命令目录和快捷键设置，默认未分配。已有用户快捷键与跨平台主修饰键保留；撤销仍为 Ctrl/Command+Z，重做为独立动作。应用可释放的隐藏/最小化/退出组合不再触发自动 Control 回退；仅系统接管的切应用/Spotlight/同应用窗口切换保留回退。按用户要求从 STEM 的移动文件移除多余 Ctrl+Shift+M，Mac 设置入口覆盖为实体 Control+反引号。设计见 docs/design/hotkeys.md。
> Changelog 1.53 (同文件跨平台快捷键) 快捷键统一存放 `.shale/hotkeys.jsonc` 并沿用原生文件同步；通用 Ctrl/Mod 在 macOS 优先解析为 Command，`PhysicalCtrl` 明确表示实体 Control。Windows/Linux/Android 继续使用 Ctrl。允许同一文件按命令设置 Windows 与 Mac 覆盖，设置页并排编辑两端、多组绑定、禁用与继承；已存在的统一文件优先，旧本机与 Shale 配置只在首次迁移读取。修复编辑器、剪贴板与原生命令的 Command 默认值；系统保留组合才回退 Control。设计见 docs/design/hotkeys.md。
> Changelog 1.52 (用户脚本更新与卸载) 修复 Electron 33 下 GitHub 更新地址重定向失败；所有脚本、资产和 GM 请求逐跳检查 URL 与权限。卸载脚本直接删除源码、缓存、授权和 GM 数据，不再询问是否保留；加载旧存储时清理已卸载脚本的残留值与身份索引，保留仍安装脚本的数据。标签快速交换只作用于两个单独页面，分屏组内未被拖到的页面保持原位；拖动分屏组的留白/图标不能与单页交换，停留插入仍可整体移动分屏组。设计见 docs/design/browser-userscripts.md、workspace-sidebars.md。
> Changelog 1.51 (标签排序/交换、分屏分隔线与侧栏吸附) 拖动标签时快速松手与目标交换位置（紫框），在目标上停留约 0.45 秒后目标及其后的标签让出空位并显示被拖标签的虚影，松手插到目标之前；拖到末尾空白处移到最后。分屏组作为一个整体参与排序和交换；普通标签快速放到可见分屏组的组员上仍放入该栏。触控屏长按约 0.35 秒提起标签后拖动，长按不动松手打开标签菜单，提起前移动仍滚动标签栏。两栏之间显示 1px 分隔线：拖动调整比例（设备本地保存），双击/双击触摸交换两页。侧栏拖动宽度时可吸附到左右分屏的分隔线，吸附后随分隔线移动。页面与面板滚动条隐藏，侧栏去掉阴影和半透明。设计见 docs/design/workspace-sidebars.md。
> Changelog 1.50 (公式补全与标题语法) STEM 的 `mk` / `dm` 展开为 `\(…\)` / `\[…\]`，空公式内可立即使用数学补全。美元定界符继续解析，格式化默认保留两种写法。标题只识别 `#` 系列，正文中的 `---` 仍可用作分隔线，文首 YAML 继续识别。
> Changelog 1.49 (LaTeX 括号按深度着色) 公式源码中，正确配对的括号按嵌套深度依次使用金、紫、蓝、绿、橙、青，第七层从金色重新开始。未闭合、多余或类型不匹配的括号标红并显示波浪下划线。沿用原有括号着色开关。设计见 docs/design/native-writing.md。
> Changelog 1.48 (打字时忽略触控板点击) 设置 › 界面可开启“打字时忽略触控板点击”，并设置 100–3000 ms 的忽略时长（默认关闭、1000 ms）。键盘输入后的这段时间内，应用窗口忽略触控板/鼠标的按下与点击，避免手掌误触移动光标或切换焦点。带修饰键的点击、触摸屏、笔和滚动不受影响。设计见 docs/design/typing-pointer-guard.md。
> Changelog 1.47 (主页标签原位替换) 从 Homepage 打开网页、文件、笔记或图谱时，目标接替当前 Homepage 的标签位置。切换现有标签保留空页，显式新建标签和网页弹窗仍可新增标签。
> Changelog 1.46 (主页视图归属) 中央与两侧主页共用启动动作。网页、文件、笔记和图谱在发起的区域打开，标签沿用各区域的布局。固定的侧栏面板仍属于侧栏。
> Changelog 1.45 (桌面内置网页浏览器与用户脚本) 恢复桌面网页浏览入口、侧栏标签、用户脚本文件/URL 导入和定期更新。新增权限或扩展站点匹配的更新须经审阅。后续重构须保留这些能力。
> Changelog 1.44 (PowerPoint 阅读) 原生工作区支持 `.ppt` 与 `.pptx` 静态幻灯片查看，复用 PDF 的分页、工具栏、搜索、右侧大纲与缩略图布局。PDF 与 PPT 共用深色背景适配命令，保留原命令 ID 与快捷键配置，按文件保存显示状态。使用本地打包的开源解析器，文件通过原 Vault 身份范围读取。设计见 docs/design/presentation-viewer.md。
> Changelog 1.43 (嵌入属性、图片编号与阅读缩放) 图片属性采用 `![[file.png|别名#width=320#dark]]`，无参开关与英文键值参数共用原生模型，保留 dark、移除 Wiki 特判。图片默认小字图注“图aa-bb 别名或文件名”，普通图片引用显示最近前置显式实例图号，空别名显示原名。图片右键“添加属性”提供勾选/参数与用户 CSS 自定义属性。按当前背景实时过滤图片/PDF，原生 PDF 与连续文档 PDF 支持 Ctrl+滚轮缩放，Markdown 字号滚轮开关默认关闭。修复异步图片粘贴位置并清理已迁移的 Hider/图片旧规则，保留当前 UI 与用户仍依赖的效果。现有 Wiki SVG 按用户后续要求直接永久应用旧 Wiki 颜色变换，保留笔记引用原文。设计见 docs/design/embed-properties.md。
> Changelog 1.42 (隔离 JavaScript 图表与官方控件) `js-widget` / `javascript-widget` 复用 JavaScript 高亮，编辑和源码展开保留代码块背景。笔记脚本仅在独立 opaque-origin iframe 内执行，禁止访问应用 DOM、Vault 写入、原生桥与网络请求。保留绘图、DOM 交互、生命周期及只读内置组件桥。接入 OpenAI Apps SDK UI 的滑块、按钮、开关、分段选择与配套深浅色图表主题。设计见 docs/design/native-javascript.md。
> Changelog 1.41 (三端宿主整理与故障恢复) 统一平台身份、宿主能力与导出入口，复用服务端插件请求；服务自行分配端口并在冷建索引期间报告未就绪，正常退出等待文件更新、同步与缓存持久化。修复 Android 选库恢复、同版本资源刷新、UTF-8 路径、返回键与原生导出，桌面启动期关窗、无响应页面关闭及 Tunnel 退出。验证三端构建，按原身份部署 Redmi K70。设计见 docs/design/host-lifecycle.md。
> Changelog 1.40 (日常构建关闭调试): 日常部署只使用不可调试的正式构建，关闭 Android debuggable、JNI 和 WebView 调试。平板保留原 `.debug` 应用 ID 与原证书以原位升级，不把历史包名/签名误当成构建类型；独立 tabletRelease 使用 release 配置并禁用调试。桌面不以 inspect/remote-debugging 参数启动。
> Changelog 1.39 (设备部署与构建保留): 将当前连续文档功能原位部署到所有可连接的个人设备，保留各端包名、签名、Vault 与配置。后续 macOS 只提供 Apple Silicon arm64 包，不再构建 Intel/x64 或 universal；本地只保留各平台最新交付物，清理旧安装包、解包应用与临时构建副本，保留密钥、用户数据和历史 Release。
> Changelog 1.38 (连续文档导航与标题): 大纲跳到章节开头后反向滚动，按实际滚动位移保持阅读位置，不受前章异步挂载和高度修正影响。首页复用普通文件标题、H1 与正文排版；章节交界复用可编辑文件标题，重命名同步更新描述文件的来源路径。大纲包含“目录”首页入口，并支持按文件与标题层级折叠。缩略图支持目录与各来源导航，复用当前章节的 Markdown/PDF 预览；公式等无法直接绘制的块留空白，不画彩色占位框。
> Changelog 1.37 (跨平台快捷键与测试修复): macOS 的 Ctrl 快捷键使用 Control，Alt 使用 Option。编辑器中的撤销/重做、搜索、全文首尾与剪贴板操作须按此映射可用，测试保留真实 Control/Alt 输入。修复脚注导航、嵌入编辑与大小写改名的已知回归，隔离测试不触碰真实 Vault。
> Changelog 1.36 (章节嵌入编号): 标题、范围、Callout 等整段嵌入里的公式也是宿主笔记的显式实例，按嵌入位置依次占用宿主编号，`\notag`/`{{}}` 不占号；嵌入内容加载后向宿主报告其中公式，宿主重新编号；嵌入编辑时保持宿主编号。更深一层嵌套的章节嵌入仍用其所在笔记编号。见 docs/design/native-equations.md。
> Changelog 1.35 (公式实例编号): 原始公式与每个 `![[^eq-ID]]` 嵌入都是所在笔记中的独立显示实例，按位置共用一个编号计数；隐式引用 `[[^eq-ID]]` 不占编号，取当前笔记中引用位置之前最近的显式实例编号，没有则回退原始公式编号(跨笔记显示“笔记名 (1-1)”)，`|` 别名优先。嵌入右上角控件组合并铅笔、复制显式/隐式引用(复制原始对象 ID)、打开链接和 `</>`。见 docs/design/native-equations.md、content-references.md。
> Changelog 1.34 (嵌入控件): 笔记嵌入去掉“编辑嵌入/完成”文字按钮，改为悬停左上角铅笔进入内容编辑，焦点离开或 Esc 自动退出；右上角“打开链接”旁增加 `</>` 编辑 `![[…]]` 源码。见 docs/design/content-references.md。
> Changelog 1.33: 虚拟文档移除额外顶部栏，右下角状态栏选择 MD/PDF/配置；MD 章节在连续页面中独立编辑、保存与撤销，JSON 配置有语法高亮及保存校验。文件、文件夹和文档右键可在系统文件管理器中定位。
> Changelog 1.32 (虚拟文档): 保留真实章节文件，以文件夹隐藏配置声明连续阅读分组；自动首页索引、统一大纲、按需加载 Markdown/PDF，编辑回到真实源文件。见 docs/design/virtual-documents.md。
> Changelog 1.31 (源码展开灰色、TeX 定界符): 学 Shale,实时预览中光标展开的可渲染语法字符统一用 `^id` 同款灰色
> (`--text-faint`),内容保持正文色;Callout 标题展开源码时去掉类型色、粗体、竖线与折叠箭头。公式模型识别 AI 输出常用的
> `\( … \)`(行内)和 `\[ … \]`(展示)并照常渲染(单行 `\[…\]` 需含 TeX 特征以免误判转义方括号);默认开启的格式化规则
> 把它们转为 `$…$`/`$$…$$`。见 docs/design/source-reveal.md、native-math.md。
> Changelog 1.30 (MCP 说明笔记): 用户希望把 Vault 里的笔记语法和规范固定交给 AI。设置 › MCP 可从仓库选择最多 20 篇
> Markdown 笔记作为说明笔记,列表存在 `.shale/mcp.jsonc`。MCP 连接时服务器说明列出它们的链接与路径;
> 每次 `shale_get_context` 附上它们当前保存的全文(`standing_instructions`,单篇 32K、合计 64K 字符,超出标记截断);
> 说明与提议修改工具要求 AI 写入、修改时遵守。
> Changelog 1.29 (自定义 Callout): 用户要求新增 callout 只需给出名称、颜色和图标,不需要改源码重新构建。原生 Callout 改为按
> Shale 约定读取 `.callout[data-callout="x"]` 上的 `--callout-color`(RGB 三元组或任意 CSS 颜色)和 `--callout-icon`
> (Lucide 名称或内联 SVG),应用 CSS、Vault 主题和 CSS 片段按正常层叠顺序生效,改动即时重绘;未声明时回落到内置表。
> 内置新增 `definition`、`premise`、`conclusion`。
> Changelog 1.28 (MCP 内容引用): 用户希望 AI 写作时能知道并引用公式等内容的 `^id`。MCP 新增 `shale_find_targets`,
> 按 ID、标签、带编号公式的 TeX 或路径查询全库类型身份,也可检查某个 ID 是否已被占用;提议修改时校验新引入的类型 ID
> (同笔记重复、挂不到结构、已被其他笔记使用则拒绝),新增的 `[[^id]]` 找不到目标时返回 warnings。鼓励 AI 为新公式起
> 语义明确的 ID(如 `^eq-mass-energy`),不强制随机 ID;已有公式优先引用或嵌入,而不是复制。
> Changelog 1.27 (块角落引用按钮): 用户要求在公式、表格等块的右上角直接复制引用。公式、表格、代码块(含 Mermaid、
> HTML 预览)、Callout 和 HTML 块在悬停时显示 剪贴板(复制显式引用 `![[^id]]`)/ link(复制隐式引用 `[[^id]]`)/
> `</>` 按钮,与命令面板"复制稳定内容引用"共用同一实现。内容身份新增 `table-`、`html-`:ID 放在块后空一行的独立行。
> Changelog 1.26 (UX 原则): 用户要求操作发生在对象所在位置、选择与操作解耦、不重复索取已知信息。标签面板去掉独立的
> 批量修改(铅笔)入口;多选(工具栏开关、Ctrl/Shift 点选)后顶部出现共享选择操作栏(合并/删除),合并为核心操作
> `merge`,对话框只选目标名;重命名在行内编辑。文件树多选同样显示该操作栏。MCP 侧栏改为 上下文(添加按钮在其标题旁)
> → 候选修改 → 连接(状态在标题,连接成功收起、失败展开修复入口);待审阅徽标打开侧栏列表,不再弹出第二个列表。
> 原则见 docs/design/ux-principles.md。
> Changelog 1.25 (Git 备份迁到同步服务器): 用户决定 Git 备份只由常开的同步中心服务器(ROG)负责,客户端 Git
> 在服务端备份上线后移除。sync-server 新增可选 `backup` 配置与 `--backup-once`/`--backup-dry-run`:按清单版本快照
> 生成提交(Git 自己判断快照中的 ignore/LFS 规则,LFS 复用同步 blob,core.autocrlf=true 与现有历史一致),接续远程
> 历史、非强制推送,连接配置永不提交。
> Changelog 1.24 (连接令牌不进 Git): 用户决定访问令牌只需忽略、不加密。Git 备份不再提交
> `.shale/sync.jsonc` 与 `git.jsonc`(两者可含令牌),写入仓库 `.git/info/exclude` 并把旧版本
> 提交的副本移出索引(本地文件保留),冲突分支同样跳过;文件同步仍在用户设备间复制它们。新克隆需在设置中填写一次连接。
> Changelog 1.23 (附件上传不覆盖): 上传/粘贴/拖入的附件绝不替换已有文件,同名时按 Shale 规则依次使用
> `name 1.ext`、`name 2.ext`…;剪贴板位图(Chromium 统一命名 `image.png`)改名为 `Pasted image YYYYMMDDHHmmss.png`,
> 复制来的文件保留原名;multipart 文件名按 UTF-8 解析,中文名不再乱码。
> Changelog 1.22 (拖入分屏组时交换位置): [A,B],C 时把 C 拖到 B 的栏(或组内 B 的标签)上得到 [A,C],B——
> 分屏组留在原位,被替换的页面回到 C 原来的位置;把组内一页拖到另一页上则交换两栏。
> Changelog 1.21 (分屏时新建标签页): 标签栏 + 与"新建标签页"命令在分屏时不再把 Homepage 放进分屏组的某一栏,
> 而是像点击组外标签一样单独显示新 Homepage,分屏组暂存为一个整体标签。只有"向右/向下分屏"在新侧打开 Homepage;
> 侧栏聚焦时新建标签页仍在侧栏打开。
> Changelog 1.20 (选择器排序回到上游插件逻辑): 用户反馈快速切换器排序不如原 fuzzy-chinese 插件——`rlx`
> 会把隔字跳跃命中的英文长文件名排在"热力学…"前面(旧算法字面匹配恒高于拼音匹配)。所有名称选择器
> (文件/命令/标题/文件夹/补全)改用 lazyloong/obsidian-fuzzy-chinese 的逐字 DP 匹配(字符、声母、zh/ch/sh、
> 全拼、末音节前缀,允许跳字)与评分(覆盖率² + 靠前 + 段数少 + 连续段长)。正文搜索不变。
> Changelog 1.19 (分屏组是一个整体标签): 修正 1.18 的组外标签行为。分屏组 [A,B] 相当于浏览器里的一个标签:
> 点击组外标签 C 时单独显示 C,[A,B] 作为暂存组(`parkedSplit`,随工作区持久化)留在标签栏;再点 A 或 B 恢复整组分屏
> 并聚焦所点成员。从其他入口在主栏打开暂存组成员同样恢复整组。关闭暂存组的成员会解散该组,另一页保留为普通标签。
> Changelog 1.18 (平等分屏与分屏标签组): 两个分屏栏地位平等。副栏页面也是 `tabs` 中的标签,
> 与主栏标签在标签栏合并为浏览器式分屏组;点击组内标签聚焦对应栏(组外标签行为见 1.19);
> 关闭任一栏的标签后另一栏铺满并保留其模式。标签"向右/向下分屏"及分屏命令保留当前页并在新侧打开
> Homepage(不再复制当前页),新侧 Homepage 打开文件时被替换。标签可拖到某一栏替换其内容,
> 未分屏时拖到编辑区右/下半边直接建立分屏。组内右键提供切换方向、取消分屏(两页都保留为标签)。
> Changelog 1.17 (精简与搜索性能): 删除 Canvas 白板(FR-12 退役;现有 .canvas 文件保留,
> 作为普通文本文件打开,附件清理仍识别其中的引用)与繁体字拼音词典(设置项 `search.chinese.traditional`
> 删除,索引版本升级后自动重建)。快速切换器拼音匹配改为编译式状态机 + 字母集合预筛,
> 继续输入时只在上一次结果中筛选,输入框使用延迟排序不被阻塞;匹配结果与原算法逐项一致。
> Changelog 1.16 (PRD 与现状对齐): 按 1.15 原生应用边界和 2026-10-23 个人本地运行时决定,
> 改写 §1/§2/§4–§8 及 FR-3/4/5/6/8/9/10/13:删除已退役的登录、公开分享、深链 URL、
> Agent REST API/API Key、Docker 部署和插件在线安装描述,改为本地访问控制、原生文件同步 +
> Git 备份、MCP 原生笔记操作、Android 应用;新增 FR-14/15/16 概述 fork 已交付的原生写作、
> 原生工作流和阅读辅助能力。FR 编号保持不变以免旧引用失效。仅文档修改,代码行为不变。
> Changelog 1.15 (native applications only): the owner retires the browser product,
> Web deployment/URL routing, embedded webpage browser and userscript manager.
> Maintain desktop and Android only. Retain their shared internal renderer/local
> runtime, independent sync and MCP. No future browser fallback or Web adaptation.
> [Native application boundary](docs/design/native-only.md) supersedes historical
> browser/share/deployment requirements throughout this document.
> Changelog 1.14 (native workflows): desktop browser userscripts with reviewed
> import/update/storage/GM support; per-Vault JSONC context menus; preview and
> revalidated unused-attachment trash; native tag hierarchy, source-preserving
> batches and Tag Pages. Reuse existing command/menu/catalog/session/update
> owners and suppress only migrated legacy modules. See [native workflows](docs/design/native-features.md).
> Types and isolated bundles only; runtime acceptance and new packaging remain deferred.
> Changelog 1.13 (native writing): integrate LaTeX Suite snippets/formula helpers
> and Linter formatting with shared source analysis, session history and MathJax.
> One LaTeX replacement language serves both; legacy Linter replacements migrate
> once. Preserve user snippet files and rule ordering; Conceal defaults off;
> matrix shortcuts remain excluded. Native Vim and desktop input-method switching are defined in docs/design/vim-input-method.md. Manual save
> formats; background autosave only persists. See [native writing](docs/design/native-writing.md).
> Types and isolated bundles are static evidence; runtime acceptance is deferred.
> Changelog 1.12 (native Chinese search): one VaultCatalog, one scoped path index,
> and one MiniSearch instance for original/phonetic fields; native file/command/
> folder/heading/template pickers and link/tag completion replace Fuzzy Chinese
> Pinyin loading. Full-text panel opts into pinyin; literal agent/unlinked-mention
> calls retain their semantics. See [Chinese search](docs/design/chinese-search.md).
> Runtime and performance acceptance remain deferred; no new desktop package.
> Changelog 1.11 (compact workspace; Windows portable delivery): Windows packaging
> now defaults to x64 portable only, without a setup installer. Remove the visible desktop File/Edit menu;
> share one 32px row between tabs, sidebar toggles and native window controls.
> Remove the redundant note/format headers; move file actions to tab context menus
> and Markdown modes to a bottom-right icon menu. Collapse the ribbon with the left
> sidebar. See [workspace chrome](docs/design/desktop-window.md) for platform scope
> and the static-only acceptance boundary.
> Changelog 1.10 (editing performance): index-driven backlinks; dependency-aware
> decorations; cached plugin metadata and incremental links; reusable target and
> reverse-link indexes; shared syntax/Lezer fragments; sparse raw-source mappings;
> unified file update queues and per-file stat patches. Public file formats,
> source preservation and plugin resolution rules remain unchanged. Static-only
> checks and user acceptance: [performance design](docs/design/performance.md).
> Changelog 1.9 (plugin host): commands, settings/persistence, vault/metadata,
> workspace/editor/CM6 extensions, Markdown processors and lifecycle cleanup;
> optional trusted desktop Node/Web Viewer host. Scope and final static-only
> verification boundary: [plugin compatibility](docs/design/plugin-compatibility.md).
> Changelog 1.8 (rendering unification): source-preserving document sessions;
> one instance-scoped client engine for Live/Reading/splits/tables/embeds/Canvas;
> inclusive br source boundaries; local YAML/JSON/table patches; full-document
> readonly print and capability-scoped share enhancement with SSR fallback.
> Acceptance and v1 limits: [rendering design](docs/design/rendering-unification.md).
> Changelog 1.7 (fork direction): rebuild an Shale-like application for personal
> customization beyond plugin limitations. Use obsidian-typings as an API reference;
> prioritize editable core behavior and selective, verified compatibility. See §1.4.
> Changelog 1.6 (FR-13 — compact desktop title bar): Windows/Linux use a single top row
> containing File / Edit / View / Window / Help and native window controls, without an app
> icon or app-name label. Keep native menu actions and accelerators, a draggable empty area,
> and light/dark styling. macOS keeps its system menu bar. Browser UI is unchanged.
> Changelog 1.5 (FR-13 — Desktop app Electron đa nền tảng, theo yêu cầu người dùng): bổ sung **FR-13** —
> đóng gói Shale thành **app cài đặt** macOS/Windows/Linux (arm64/x64/ia32). Workspace mới `desktop/`
> là **Electron shell** spawn đúng server Express hiện có như tiến trình con (qua `ELECTRON_RUN_AS_NODE`,
> bind `127.0.0.1` + cổng ngẫu nhiên) và load SPA trong `BrowserWindow`. Server được esbuild bundle thành
> **1 file `.mjs`** (không native module runtime nên cross-arch chỉ là đổi Electron binary). Lần đầu **chọn
> vault**, dữ liệu vào `userData`, **auto-login** bằng mật khẩu ngẫu nhiên/máy (không bắt đổi pass). Đóng gói
> bằng **electron-builder** (dmg/zip · Windows x64 portable · AppImage/deb); CI mới `release.yml` build matrix
> macOS/Windows/Ubuntu khi push tag `v*` và publish **GitHub Release**. Không đổi server/web code.
> Changelog 1.4 (FR-2 — Audio/Video embed: phát được như Shale, theo yêu cầu người dùng): embed
> `![[clip.mp4]]` / `![[song.mp3]]` giờ render **trình phát HTML5 thật** (`<video controls>` / `<audio
> controls>`) ở **cả** Live Preview, Reading view và trang public share — trước đây chỉ hiện link xanh.
> Mở thẳng file media từ file tree cũng hiện player (như ảnh). Hỗ trợ video: `mp4/webm/ogv/mov/mkv`,
> audio: `mp3/wav/m4a/3gp/flac/ogg/oga/opus` (khớp bộ extension của Shale). Size param `![[clip.mp4|W]]`
> đặt chiều rộng video. **Quan trọng:** route serve binary (`GET /api/files/content`, raw share) nay
> **stream + hỗ trợ HTTP Range** (206 Partial Content) nên thanh tua/seek video hoạt động và Safari phát
> được — thay vì đọc cả file vào RAM. MIME map + bộ extension gom về `server/services/mime.ts` &
> `web/lib/media.ts`. Không thêm API mới.
> Changelog 1.3 (FR-1 — File explorer header toolbar parity Shale, theo yêu cầu người dùng): header sidebar
> **Files** bổ sung đủ nút như Shale: **New note**, **New canvas**, **New folder**, **Change sort order**
> (dropdown 6 kiểu: File name A→Z/Z→A, Modified time new↔old, Created time new↔old), **Auto reveal current
> file** (toggle: tự mở folder cha + cuộn tới file đang xem), **Collapse all / Expand all**. Sort theo thời gian
> nhanh nhờ **stat cache trong RAM** ở server (`listTree` fill 1 lần, watcher invalidate file đổi → 0 syscall
> ở steady-state); `TreeNode` thêm `ctime`. Không thêm API mới (tree cũ nay kèm `mtime`/`ctime`). Canvas (FR-12):
> fix Android Chrome double-tap edit không lưu được text (commit qua doc-level pointerdown + double-tap detect).
> Changelog 1.2 (FR-2 — Ảnh: resize + zoom, theo yêu cầu người dùng): ảnh nhúng trong note giờ **kéo để
> resize** (2 thanh handle trái/phải hiện khi hover trong Live Preview) — ghi lại kích thước vào source dưới
> dạng size param Shale: `![[img|W]]` cho wikilink embed, `![alt|W](url)` cho ảnh markdown chuẩn (giữ tỉ lệ,
> height auto). Size param `|300` / `|300x200` nay áp dụng **cả** ảnh markdown `![](…)` (trước chỉ `![[…]]`),
> ở cả Live lẫn Reading. **Click ảnh → lightbox toàn màn hình** (cả 2 mode): cuộn chuột/pinch để zoom (theo
> con trỏ/tâm 2 ngón), kéo/1-ngón để pan, double-click reset, Esc hoặc click nền để đóng. Không thêm API mới.
> Changelog 1.1 (FR-1 — Trash UI + chế độ xoá, theo yêu cầu người dùng): bổ sung **giao diện Trash** để xem,
> **khôi phục (Restore)** và **xoá vĩnh viễn** từng file đã xoá, cùng nút **Empty trash**. Mở Trash từ nút 🗑
> trên header sidebar Files hoặc command palette ("Open trash"). Thêm setting `vault.deleteMode`
> (`trash` = chuyển vào `.trash` khôi phục được [mặc định] · `permanent` = xoá vĩnh viễn ngay) trong
> Settings → Vault & Files. API mới: `GET /api/files/trash`, `POST /api/files/trash/restore`,
> `DELETE /api/files/trash/item`, `DELETE /api/files/trash`. Restore tự né trùng tên (suffix `.restored-<ts>`)
> và dọn thư mục rỗng trong `.trash`; mọi thao tác trash đều guard path traversal (chỉ tác động trong `.trash`).
> Changelog 1.0 (FR-12 — Canvas, theo yêu cầu người dùng): clone tính năng **Canvas** của Shale. Khung vẽ
> vô hạn (pan/zoom) chứa các node (text markdown, file embed/link tới note hoặc ảnh, link URL, group) và các
> edge nối cạnh node có mũi tên + nhãn. Đọc/ghi đúng định dạng mở **JSON Canvas** (`.canvas`, tương thích
> Shale). Tạo/di chuyển/resize/đổi màu/xóa node, nối edge bằng kéo từ chấm cạnh, multi-select + marquee,
> double-click nền tạo text node, double-click text node để sửa. Autosave debounce như editor (qua store
> `content`/`save`). Tạo canvas mới: context menu file tree + command palette. Không thêm API mới (dùng
> `/api/files/content`).
> Changelog 0.9 (FR-1 — Copy/Cut/Paste trong context menu file tree theo yêu cầu người dùng): menu chuột phải
> file/folder bổ sung **Copy**, **Cut**, **Paste** (clipboard session-local, không persist/broadcast). Cut dùng
> `rename` (move) cho cả file lẫn folder; Copy dùng endpoint mới **POST `/api/files/copy`** copy đệ quy file/folder
> (qua `fs.cp` recursive, reindex các `.md` mới). Paste vào folder đích (folder được click hoặc thư mục cha của file):
> tự đặt tên không trùng (`… copy`/`… copy N`), chặn dán folder vào chính nó/thư mục con, dán Cut vào đúng chỗ cũ là
> no-op; row bị Cut làm mờ chờ dán; mục **Paste** chỉ hiện khi clipboard có dữ liệu. Right-click vùng trống
> file tree cũng ra context menu của app (New note / New folder / Paste vào vault root) thay vì menu native trình duyệt.
> Changelog 0.8 (FR-2/FR-4 — menu ⋯ parity Shale theo yêu cầu người dùng): menu **More options (⋯)**
> dựng lại theo cấu trúc Shale Desktop và bổ sung: **Backlinks in document** + **Open linked view**
> (Backlinks/Outgoing links/Outline → mở right panel); **Open in new window** (mở deep-link `/note/<path>`
> ở tab mới); **Add file property** (chèn property rỗng vào frontmatter YAML); **Find…** trong note
> (`@codemirror/search`, ⌘F/⌘⇧F/⌘G); **Export to PDF…** (Reading view + `window.print()` qua CSS
> `@media print`); **Reveal file in navigation** (mở folder tổ tiên + scroll/flash row trong file tree);
> **Open version history** (FR-4): `git log`/`git show` cho từng file qua `/api/git/log|/show`, modal liệt
> kê commit + preview + Restore version. Bỏ "Reveal in Finder"/"Open in default app" (desktop-only).
> Changelog 0.7 (FR-10 UX theo phản hồi): menu "Copy public link" → "Share…" mở **Share dialog**
> per-note (tạo link, copy URL, toggle bật/tắt, đặt/đổi password, xoá link) ở cả context menu file
> tree lẫn menu ⋯ của pane; note đang share public có **icon globe** (màu accent) cạnh tên trong
> file tree; danh sách share cache trong store (đồng bộ giữa dialog, Settings → Sharing và badge).
> Changelog 0.6 (FR-9 deploy hardening cho open-source self-host): tham số deploy chuyển hết sang `.env`
> (`VAULT_HOST_PATH`/`HTTP_BIND`/`HTTP_PORT`/`SHALE_WATCH`) nên `docker-compose.yml` không bị clobber
> khi redeploy; file watcher tự fallback polling khi đụng inotify limit; healthcheck `start_period=90s`.
> Changelog 0.5: Graph (FR-2) thêm tìm node theo keywords — ô search nổi trên Graph view, gõ keywords
> hiện danh sách note/tag khả dĩ (match label/path, tag luôn xếp trước, sau đó prefix > label > path + degree), click
> (hoặc Enter = kết quả đầu) bay camera (fly animation pan+zoom mượt) tới node và highlight node đó
> (node sáng màu accent, phần không liên kết mờ đi) tới khi di chuột; Esc đóng danh sách.
> Changelog 0.4: thêm FR-11 (Mobile / responsive UI cho smartphone màn hình cảm ứng) — sidebar trái/phải
> thành drawer overlay trượt (hamburger + edge-swipe + backdrop), workspace full-width, mobile editing
> toolbar trên bàn phím (bold/italic/heading/list/checkbox/link/…), touch target ≥44px, safe-area insets.
> Tham chiếu UX Shale Mobile app. Cập nhật NFR khả dụng.
> Changelog 0.3: mở rộng FR-2 theo phản hồi người dùng — (a) menu "More options" (⋯) trên header mỗi pane
> (Split right/Split down, Copy screenshot cho Graph, Bookmark, Copy public link, Make a copy, Rename/Move/
> Copy path/Delete, Close tab/Close others) giống Shale; (b) Right sidebar đại tu thành tab strip icon
> (Backlinks · Outgoing links · Tags · Outline) với Linked mentions + **Unlinked mentions** và **Outgoing
> links** (resolved/unresolved) — trước đó chỉ có 2 panel cố định.
> Changelog 0.2: thêm FR-10 (deep-link URL `/note/...` + public share link readonly + trang quản lý share tập trung), API `/api/shares` + `/public/shares`, data model `data/shares.json`.

---

## 1. 概述

**Shale**(本 fork:AlexbeatsZ/shale,源自 xnohat/shale v0.1.1)是一个面向个人使用的
类 Shale 原生应用,支持 Windows/macOS/Linux 桌面端和 Android。应用直接读写本地 Vault 目录中的
Markdown、附件和 Canvas 文件。上游的自托管网页版、登录、公开分享和 Docker 部署已全部退役,
边界见 [原生应用边界](docs/design/native-only.md) 和 [个人本地运行时](docs/design/personal-local-runtime.md)。

### 1.1 目标
- 提供与 Shale 桌面版相当的编辑/阅读体验(编辑器、实时预览、双链、图谱、反向链接)。
- Vault 是本地真实目录,保留现有 Markdown、附件、Canvas 和 `.shale/` 数据;
  配置、主题和插件的兼容程度按 §1.4 单独评估。
- 原生文件同步(独立 `sync-server/`)负责多设备实时同步,Git(含 LFS)作为定期备份和冲突历史。
- 运行时只监听本机回环地址,不需要账号或密码;配置使用 JSON/JSONC 文件,不引入数据库引擎。
- 通过 MCP 让 AI 读取 Vault 上下文、搜索,并以"提议 → 本地审阅 → 接受"的方式修改笔记。
- 内置中文(拼音)搜索、LaTeX/公式写作、格式化(Linter)等原生能力,替代对应社区插件。
- 支持加载用户实际使用的 Shale 社区插件(已安装的 `.shale/plugins/*`)。

### 1.2 不在范围内
- 浏览器版、自托管网页部署、Docker 镜像、公开分享链接和笔记 URL 深链
  (2026-11-01 退役,不再添加浏览器适配)。
- 账号、密码、会话、API Key 和对外开放的 REST API(2026-10-23 退役)。
- 多用户实时协作编辑(CRDT);Shale Sync/Publish 官方服务。
- 应用内在线下载/安装社区插件;100% 兼容所有依赖 Shale 内部 Electron/Node API 的插件。

### 1.3 目标用户
- 本 fork 的所有者本人:在自己的桌面和 Android 设备上使用同一个 Vault,并按个人工作流定制核心行为。

### 1.4 本 fork 的目标与优先级

本项目的目的是重建一个可以满足用户个性化需求的 Shale。背景是现有 Shale
插件对宿主行为的修改能力有限，因此本 fork 需要允许直接修改编辑器、工作区、文件管理
和界面交互。以上目标指导后续需求取舍；前述自托管能力是已有基础。

- 以实际个性化工作流决定下一步功能，不将全量复刻或全量社区插件兼容作为前置条件。
- 参考 [obsidian-typings](https://github.com/obsidian-typings/obsidian-typings)
  理解未公开 API、对象关系和插件依赖；类型定义与辅助工具不等于完整运行时实现。
- 保留现有 Markdown、附件与 Canvas 数据，分别评估文件格式、配置语义和插件行为的兼容性。
- 现用 Manage / STEM 插件已盘点并作为首批兼容对象；命令、设置、生命周期和 CM6 等入口已接入宿主。
- 可加载不代表完整兼容；原生能力需启用可信桌面模式，最终用户工作流验收见插件兼容文档。

设计依据、源码现状和后续顺序见 [项目定位与参考边界](docs/design/product-direction.md)。

---

## 2. 系统架构

```
┌──────────────────────────────┐   ┌──────────────────────────────┐
│ 桌面壳 Electron (desktop/)   │   │ Android 壳 (android/)        │
│ 窗口/标题栏/菜单/MCP 启动器   │   │ WebView + libnode RuntimeHost│
└──────────────┬───────────────┘   └──────────────┬───────────────┘
               │ 加载共享原生渲染器 (web/:React + CodeMirror 6)
               │ HTTP + WebSocket,仅 127.0.0.1 随机端口
┌──────────────▼───────────────────────────────────▼───────────────┐
│ 本地运行时 (server/:Node + Express + TS,打包为单个 .mjs)          │
│ 本地访问检查 │ Vault 文件 │ 搜索/索引 │ 文件同步 │ Git 备份 │ 插件 │ MCP 操作 │
└──────┬──────────────┬──────────────┬──────────────┬──────────────┘
       │              │              │              │
  应用数据目录      Vault 目录      sync-server     Git 远程仓库
  settings.json    (.md/附件/       (独立发布的     (备份,可选 LFS)
  索引/日志        .canvas/.shale) 同步服务)
```

`packages/markdown-core`(Markdown 源码模型、审阅合并)和 `packages/search-core`(中文/拼音搜索)
由渲染器和运行时共用。

### 2.1 技术栈
| 层 | 选型 | 说明 |
|----|------|------|
| 桌面壳 | Electron + electron-builder | 以 `ELECTRON_RUN_AS_NODE` 启动打包后的本地运行时 |
| Android | 原生 Activity + WebView + Bionic `libnode.so` | 与桌面共用同一份打包运行时和渲染器 |
| 本地运行时 | Node 20+、Express、TypeScript | 只在本机回环地址提供服务 |
| 渲染器 | React + Vite + TypeScript | 原生应用内部界面,不作为网页发布 |
| 编辑器 | CodeMirror 6 | |
| Markdown | 自有 markdown-core 源码模型 + MathJax | 保留原始字节,支持局部修改 |
| 搜索 | QMD(基于 MiniSearch)+ search-core 拼音 | |
| 同步 | 原生 HTTPS 文件同步 + simple-git/git-lfs 备份 | |
| AI 集成 | MCP(本地 HTTP `/mcp` 与 stdio)+ 共享 Zod 操作契约 | 与 CLI 共用同一套操作 |
| 配置 | JSON/JSONC 文件 | 不使用数据库 |

### 2.2 项目目录结构
```
shale/
├── desktop/        # Electron 壳:窗口、标题栏、路径、MCP 启动器、打包脚本
├── android/        # Android 壳:MainActivity、RuntimeHost
├── server/         # 本地运行时
│   └── src/
│       ├── routes/       # files, search, git, file-sync, plugins, settings, tags, menus, operations, mcp…
│       ├── services/     # vault, 索引, 同步, git, 插件, 设置, 标签, 附件清理…
│       ├── operations/   # MCP/CLI 共用的操作契约与分发
│       └── middleware/   # localAccess(本地访问检查)、错误处理
├── web/            # 共享原生渲染器(components, lib, styles)
├── packages/       # markdown-core, search-core
├── sync-server/    # 独立发布的文件同步服务(sync-server-v* 标签)
├── scripts/        # bundle-server 等构建/迁移脚本
├── tests/          # 单元、渲染器(Chromium)与打包后应用测试
└── docs/           # design/(模块设计)、log/(工作日志)、examples/
```

---

## 3. Yêu cầu chức năng (Functional Requirements)

### FR-1 · Vault management
- Mở/đổi Vault qua Vault 启动器(Vault 底栏);运行时只访问 `allowedRoots` 内的目录。
- CRUD file & folder: tạo, đọc, ghi, đổi tên, di chuyển, xoá. Chế độ xoá cấu hình qua
  `vault.deleteMode`: `trash` (→ `.trash`, khôi phục được — mặc định) hoặc `permanent` (xoá hẳn).
- **Trash**: giao diện xem các file đã xoá, **Restore** về vị trí gốc, **xoá vĩnh viễn** từng file, **Empty
  trash**. Trash ẩn khỏi file tree (dotfile) và khỏi watcher; mở qua nút 🗑 header Files hoặc command palette.
- **Copy/Cut/Paste** trên context menu file tree (file & folder): clipboard session-local; Cut = move (`rename`),
  Copy = copy đệ quy (`POST /api/files/copy`, `fs.cp` recursive); Paste vào folder đích, tự né trùng tên, chặn dán
  folder vào chính nó/thư mục con.
- Hỗ trợ attachments (ảnh/pdf/…); thêm/kéo thả vào app. Thư mục đích upload resolve **case-insensitive** với folder
  sẵn có (`vault.resolveDirCaseInsensitive`) — tránh tạo thư mục trùng khác hoa-thường (vd `attachments` cạnh
  `Attachments` có sẵn) trên filesystem phân biệt hoa-thường (Linux). Upload không bao giờ ghi đè file có sẵn:
  trùng tên thì dùng `name 1.ext`, `name 2.ext`… (createOnly); ảnh clipboard `image.png` đổi thành
  `Pasted image YYYYMMDDHHmmss.png`; tên file multipart giải mã UTF-8.
- Watch filesystem (chokidar) để phản ánh thay đổi ngoài (git pull, sửa trực tiếp).
- Tương thích cấu trúc `.shale/` (config, plugins, themes).

### FR-2 · Editor & rendering
- CodeMirror 6: syntax highlight Markdown, keybindings cơ bản.
- 光标在空的 `{}`、`()`、`[]` 正中时，按 Backspace 或 Delete 一次删除整对。括号边界及选区沿用普通删除。
- Live preview / Reading view chuyển đổi.
- Wikilinks `[[note]]`, embeds `![[file]]`, tags `#tag`, callouts, tasks `- [ ]`.
- **Callout 自定义**:新类型只需一条 CSS 规则 `.callout[data-callout="x"] { --callout-color: r, g, b; --callout-icon: lucide-name; }`,
  可写在 Vault 主题/CSS 片段中,无需重新构建(见 docs/design/callout-styles.md)。
- **Ảnh nhúng — resize & zoom**: kéo handle 2 cạnh (trái/phải) trên ảnh trong Live Preview để đổi rộng,
  ghi lại vào source dạng size param Shale `![[img|W]]` / `![alt|W](url)` (giữ tỉ lệ, height auto).
  Size param `|W` / `|WxH` áp dụng cho **cả** `![[…]]` và ảnh markdown `![](…)`, ở Live lẫn Reading.
  Click ảnh → **lightbox toàn màn hình**: wheel/pinch zoom (theo con trỏ/tâm), kéo/1-ngón pan,
  double-click reset, Esc/click nền đóng (xem §22 mobile: pinch-zoom ảnh trong reading).
- **Audio/Video nhúng**: `![[clip.mp4]]` → `<video controls>`, `![[song.mp3]]` → `<audio controls>`
  (Live Preview, Reading). Video: `mp4/webm/ogv/mov/mkv`; audio: `mp3/wav/m4a/3gp/flac/ogg/
  oga/opus`. `![[clip.mp4|W]]` đặt chiều rộng video. Mở thẳng file media từ file tree → hiện player.
  Binary serve qua HTTP Range (206) để seek/Safari hoạt động; MIME + extension: `services/mime.ts` /
  `lib/media.ts`.
- Backlinks panel, outline, tag pane.
- Right sidebar dạng **tab strip icon** (giống Shale): Backlinks · Outgoing links · Tags · Outline.
  - Backlinks: "Linked mentions" (đếm + danh sách) **và** "Unlinked mentions" (note nhắc tên note hiện tại
    bằng plain text mà chưa link — tìm qua QMD search, loại trừ note đã link).
  - Outgoing links: mọi wikilink trong note hiện tại, phân biệt resolved/unresolved, click để mở/tạo.
- Menu **More options (⋯)** trên header mỗi pane (note lẫn Graph view), dựng theo cấu trúc Shale Desktop:
  - Note: Backlinks in document, Split right / Split down, Open in new window, Rename / Move file to / Make a
    copy, Bookmark, Add file property, Export to PDF…, Find…, Copy path, Open version history, Open linked view
    (Backlinks / Outgoing links / Outline), Reveal file in navigation, Close tab / Close other tabs, Delete.
  - Graph view: Copy screenshot (PNG vào clipboard), Close tab.
  - Split pane hỗ trợ 2 hướng: right (cạnh phải) và down (bên dưới); hướng split persist trong uistate.
  - Hai pane split bình đẳng: trang ở pane phụ cũng là một tab trong `tabs`; tab bar gộp hai tab đang hiển thị
    thành nhóm split kiểu trình duyệt. Click tab trong nhóm → focus pane đó (pane focus được làm nổi); click tab
    ngoài nhóm C → hiển thị riêng C; nhóm [A,B] được tạm cất (parkedSplit, persist) và vẫn hiện thành nhóm trên
    tab bar; click A hoặc B → khôi phục cả nhóm split và focus vào mục được click. Đóng tab thành viên của nhóm tạm
    cất → giải tán nhóm, tab còn lại thành tab thường. Đóng tab của một pane khi đang split → pane còn lại chiếm
    toàn bộ, giữ mode của nó.
  - Tab mới (nút + / lệnh new-tab) khi đang split → Homepage mới hiển thị riêng, nhóm [A,B] được tạm cất như khi
    click tab ngoài nhóm (1.21). Chỉ "split right/down" mở Homepage trong split.
  - "Split right/down" trên tab và lệnh split giữ trang hiện tại, mở Homepage ở phía mới (không nhân bản trang);
    Homepage phía mới bị thay thế bởi file được mở từ nó. Chuột phải tab trong nhóm: đổi hướng, bỏ split (giữ cả hai tab).
  - Kéo tab thả vào một pane để mở ở pane đó; khi chưa split, thả vào nửa phải/dưới của vùng soạn thảo để tạo split.
    Khi đang split, thả tab C lên pane B (hoặc lên tab B trong nhóm): [A,B],C → [A,C],B — nhóm giữ nguyên vị trí, B về
    chỗ cũ của C; thả một thành viên lên thành viên kia → đổi chỗ hai pane (1.22).
  - Sắp xếp tab trên tab bar (1.51): thả nhanh lên tab khác → đổi chỗ hai tab (viền tím); dừng trên tab ~0.45s →
    các tab phía sau nhường chỗ, chỗ trống hiện bóng mờ của tab đang kéo, thả → chèn trước tab đó; thả vào khoảng
    trống cuối → chuyển xuống cuối. Nhóm split di chuyển/đổi chỗ như một khối. Cảm ứng: giữ ~0.35s để nhấc tab rồi kéo;
    giữ rồi thả không di chuyển → menu tab; di chuyển trước khi nhấc → cuộn tab bar.
  - Đường phân cách 1px giữa hai pane: kéo để đổi tỉ lệ (lưu cục bộ trên thiết bị), nhấp đúp / chạm đúp để đổi chỗ
    hai trang. Kéo mép sidebar gần đường phân cách (split trái/phải) sẽ hút vào đó và đi theo khi đường phân cách đổi.
  - **Find/Replace trong note**: tích hợp `@codemirror/search` (panel top, ⌘F mở Find, ⌘⇧F Replace, ⌘G next).
  - **Reveal file in navigation**: mở rộng folder tổ tiên + cuộn/nháy sáng row trong file tree.
  - **Add file property**: chèn property rỗng vào frontmatter YAML (tạo block nếu chưa có) → render trong Properties widget.
  - **Export to PDF**: 整篇文档以只读方式在本地 iframe 中渲染后调用系统打印对话框(见 FR-16)。
  - Không có "Reveal in Finder" / "Open in default app"; "Open in new window" theo URL đã bỏ cùng FR-10.
- Graph view (lực đẩy, từ wikilinks).
  - Tìm node trên graph: ô search nổi (góc trên-trái), gõ keywords → danh sách node khả dĩ
    (note/tag/attachment đang hiển thị trên graph); click hoặc Enter → camera bay (pan+zoom mượt)
    tới node, node được highlight kiểu hover (accent + dim phần không liên kết) tới khi di chuột.

### FR-3 · 本地访问控制(取代原登录)
- 2026-10-23 起删除账号、密码、会话、JWT 和 API Key;详见 [个人本地运行时](docs/design/personal-local-runtime.md)。
- 运行时只绑定 `127.0.0.1` 随机端口。`server/src/middleware/localAccess.ts` 是唯一的访问判断:
  要求回环地址的 socket 对端和本地 Host;带 Origin 时必须是本地 HTTP(S) 来源;不信任任何转发头。
  Express 在所有路由和静态资源前执行该检查,WebSocket 升级复用同一判断。
- 渲染器静态资源只提供给带桌面/Android 壳标识的请求,普通浏览器请求返回 404,没有 SPA 兜底路由。
  该标识只用于区分产品形态,不是身份认证。
- 路径越界防护、Vault 维护租约、脏会话协调、基准版本校验和附件预览令牌保持原有实现。

### FR-4 · 原生文件同步与 Git 备份
- 设计见 [原生文件同步与 Git 备份](docs/design/file-sync.md)。
- **文件同步**:原生 HTTPS 传输负责实时同步 Markdown、Canvas 和附件,服务端是独立发布的
  `sync-server/`(`sync-server-v*` 标签,不影响桌面/移动版本号)。每个 Vault 的开关、有序地址列表、
  令牌和间隔保存在 `.shale/sync.jsonc`;每轮从第一个可用地址开始,认证/身份/回滚/冲突
  错误直接停止,不静默切换数据源。公网连接要求校验证书的 HTTPS,HTTP 仅允许私有/回环地址。
- **Git 备份**:Git 只做定期备份和冲突历史,配置在每个 Vault 的 `.shale/git.jsonc`
  (远程、分支、凭据、间隔、LFS 规则);备份会显式包含 `sync.jsonc`,克隆私有 Vault 仓库即可恢复同步配置。
- **单文件历史版本**:`git log`/`git show` 列出触及该文件的提交,可预览并恢复某个版本。
- 冲突:检测并提示用户,不自动合并覆盖数据。

### FR-5 · 配置(JSON/JSONC 文件)
- 应用级设置保存在应用数据目录的 `settings.json`(原子写入,zod 校验),包括 Vault 路径与删除方式、
  文件/附件默认位置、搜索(中文/拼音)、快捷键、原生功能开关、写作设置等。
- 每个 Vault 的原生配置集中在 `.shale/`:`sync.jsonc`、`git.jsonc`、`writing.jsonc`、
  `math.jsonc`、`automation.jsonc`、`menus/`、`blocks/`、`snippets/` 等。
- 不自动迁移或改写正在使用的 Vault;保留原始插件数据和未知配置。

### FR-6 · MCP 与原生笔记操作(取代原 Agent API)
- 设计见 [原生 MCP](docs/design/native-mcp.md)。不恢复账号、API Key 或对外 REST API。
- MCP 通过本地 HTTP `/mcp` 和 stdio(`server/src/mcp.ts`)提供,CLI 转发同一份 JSON;
  三者共用 `server/src/operations/contract.ts` 中的 Zod 契约。
- 七个工具:上下文、已保存文件列表、原生搜索、按范围读取、内容引用目标查询、提议修改、状态查询。
- 提议修改校验新引入的类型内容 ID(全库唯一、挂在对应结构上),AI 可使用语义明确的 ID。
- 每个提议只含一项 Markdown 笔记操作(编辑 / 新建 / 重命名);删除文件/文件夹、文件夹操作和批量操作
  在校验阶段拒绝。提议进入本地审阅收件箱,用户逐项审阅、接受后才写入。
- 桌面端提供 MCP 启动器,方便外部 AI 客户端连接。

### FR-7 · QMD Search engine
- Index toàn bộ `.md`: nội dung, tiêu đề, headings, tags, path, frontmatter.
- Truy vấn: full-text, prefix, fuzzy, fielded (`tag:`, `path:`, `title:`), boolean.
- Cập nhật incremental khi file thay đổi (qua watcher).
- Index lưu/khôi phục trên disk (`data/qmd-index.json`) để khởi động nhanh.
- 中文/拼音:见 FR-15;只内置简体字读音表(繁体词典已于 1.17 删除)。

### FR-8 · Community plugins
- Chỉ dùng plugin đã có trong Vault (không tải/cài trực tuyến). Đọc danh sách plugin từ `.shale/plugins/*` (manifest.json, main.js).
- Plugin loader evaluates trusted CommonJS `main.js` against the host API; this is not a security sandbox. Native Node modules require explicit desktop trust.
- Read and update vault `.shale/community-plugins.json`; keep each plugin's `data.json`; runtime enable/disable cleans registrations.
- Detailed APIs, existing-plugin versions, verification status and unsupported internals: [plugin compatibility](docs/design/plugin-compatibility.md).

### FR-9 · Android 应用(取代原 Docker 部署)
- 设计见 [Android 本地运行时](docs/design/android-runtime.md)。Docker 镜像/Compose 部署已于 2026-11-01 删除。
- Android 独立离线运行:`RuntimeHost` 在应用进程的后台线程中加载 Bionic `libnode.so`,运行与桌面相同的
  打包运行时(`scripts/bundle-server.mjs`);WebView 只连接本机 `127.0.0.1` 随机端口。
- 原生壳负责生命周期、WebView、权限和文件选择;编辑、保存、索引和配置沿用共享实现。
- 用户明确选择 Vault 后才启动 Node;切到后台或页面隐藏时请求保存脏会话,常规 900ms 自动保存不变。
- 内置资源按版本解压到 `files/runtime-<code>`,用户 Vault 和配置不参与解压;日志写入 `files/logs/server.log`。
- 状态栏和手势导航栏跟随应用浅色或深色主题，窗口继续按系统栏、屏幕缺口和软键盘留出可交互区域。

### FR-10 · 深链 URL 与公开分享(已退役)
- 2026-10-23 删除公开分享;2026-11-01 删除笔记 URL(`/note/...`)、地址/历史同步、"复制应用链接"
  和"在浏览器窗口打开"等功能。见 [原生应用边界](docs/design/native-only.md)。
- 笔记内容中的外部超链接交给操作系统打开。

---

### FR-11 · Mobile / responsive UI (smartphone cảm ứng)
Mục tiêu: trải nghiệm **đọc note** và **soạn thảo note** thuận tiện trên điện thoại màn hình cảm ứng,
tham chiếu UX Shale Mobile. Kích hoạt theo breakpoint (`max-width: 768px`) — không phải app riêng,
cùng một codebase React.
本节布局由 Android 应用(FR-9)和窄窗口桌面端使用,不面向手机浏览器。
- **Layout drawer**: ribbon + sidebar trái và right sidebar trở thành **drawer overlay** trượt đè lên
  nội dung (không đẩy layout). Mặc định đóng → editor chiếm trọn màn hình. Mở bằng: nút hamburger (☰)
  trên thanh tab, **vuốt từ mép trái/phải** (edge-swipe), hoặc các nút toggle panel. Có **backdrop** mờ;
  chạm backdrop hoặc chọn note → drawer tự đóng. Drawer trái gồm strip ribbon (chuyển panel Files/Search/
  Graph/Bookmarks/Tags/Settings) + panel nội dung.
- **Trạng thái drawer là cục bộ thiết bị** (không persist, không broadcast qua WebSocket) → mở/đóng drawer
  trên điện thoại không ảnh hưởng trạng thái sidebar của desktop đang đồng bộ chung `uistate`.
- **Touch targets**: hàng cây thư mục, nút công cụ, tab ≥ 44px; tăng padding chạm; bỏ hover-only affordance
  (nút close tab luôn hiện trên mobile).
- **Compact editor chrome (1.11)**: no formatting strip or duplicate note header.
  Source/live/reading modes use a bottom-right icon menu, also reachable on mobile.
  File actions live in the tab context menu. Existing editor shortcuts remain.
- **Viewport & safe-area**: `viewport-fit=cover`; chừa `env(safe-area-inset-*)` cho notch/home-indicator;
  không cho double-tap zoom (app-like) nhưng giữ pinch-zoom ảnh trong reading.

### FR-12 · Canvas 白板(已退役)
- 2026-11-01 删除白板视图、"新建白板"入口和相关命令。
- Vault 中现有的 `.canvas` 文件不删除、不改写:文件同步和 Git 备份照常处理它们,打开时按普通文本(JSON)显示;
  附件清理继续解析其中的文件引用,避免误删仍被旧白板引用的附件。

### FR-13 · 桌面应用(Electron,多平台)

- 首页和命令面板提供「打开网页浏览器」。中央入口打开中央网页与顶部标签，两侧入口打开对应侧的网页与竖排标签。内容区提供 HTTP(S) 地址、前进、后退和刷新。网页访客与本地应用、Vault API 和原生插件隔离。见 [桌面网页浏览器](docs/design/web-viewer.md)。
- 设置提供用户脚本文件与 `.user.js` URL 导入、匹配范围与权限审阅、手动检查和自动检查更新。用户开启全局和逐脚本开关后，桌面按设定间隔检查版本。同权限更新可自动安装，新增权限或扩展匹配范围须经审阅。后续重构须保留本条和网页浏览入口，移除需要用户明确同意。见 [用户脚本设计](docs/design/browser-userscripts.md)。
- 设计见 [桌面窗口](docs/design/desktop-window.md) 和 [桌面运行时打包](docs/design/desktop-runtime.md)。
- **架构**:Electron 主进程以 `ELECTRON_RUN_AS_NODE=1` 启动打包好的本地运行时
  (`resources/server/dist/index.mjs`,esbuild 单文件,不带 `node_modules`),绑定 `127.0.0.1` 随机端口,
  再在 `BrowserWindow` 中加载渲染器。直接打开本地服务,不生成密码、不登录、不写 cookie。
- **窗口外观(1.11)**:Windows/Linux 上,标签页和左右侧栏开关与原生最小化/最大化/关闭按钮共用一行 32px;
  不显示 File/Edit 菜单、应用名称、重复的笔记标题或格式工具栏。F10 打开原生应用菜单,原有快捷键保留。
  功能区竖条随左侧栏一起折叠;Markdown 视图模式切换在右下角。macOS 保留系统标题栏和菜单栏。
  两侧侧栏悬浮在文档之上;"+"打开主页而不新建文件;设置和 Vault 切换位于 Vault 底栏。
- **Vault**:通过 Vault 启动器选择或切换;Vault 内容不随应用打包。
- **打包**:electron-builder。macOS `dmg`+`zip`(仅 Apple Silicon arm64,ad-hoc 签名,未公证);Windows x64 NSIS 安装包;
  Linux `AppImage`+`deb`(x64/arm64)。推送 `v*` 标签时 GitHub Actions 在三个平台构建并发布 Release。
- **外部依赖**:Git 备份需要系统中可用的 `git`;没有 git 时本地编辑和文件同步照常工作。
- **不做**:自动更新、商业代码签名、内置便携版 git、同一实例内多窗口打开多个 Vault。

### FR-14 · 原生写作与数学
- 设计见 [原生写作](docs/design/native-writing.md)、[原生数学](docs/design/native-math.md)、
  [公式编号](docs/design/native-equations.md)。
- **LaTeX 片段与公式辅助**:改编自 obsidian-latex-suite 1.14.0(MIT),保留片段语义、TeX 语法、括号/隐藏算法;
  不包含矩阵快捷键；原生 Vim 与桌面输入法联动见 PRD 1.55。隐藏(Conceal)默认关闭。
- **格式化(Linter)**:改编自 obsidian-linter 1.31.2(MIT),保留全部规则、执行顺序和选项;
  手动保存时格式化,后台自动保存只写盘;拼写词典只在启用纠错时加载。
- **公式**:MathJax 渲染、宏/前导(preamble)、公式编号与引用、行内公式提示。
- **定界符与标题**:公式同时支持 `$…$` / `$$…$$` 和 `\(…\)` / `\[…\]`。标题使用 `#` 系列，`---` 与 `===` 不再把上一行转成标题。
- 原插件实例不再加载,由 `nativePluginPolicy` 屏蔽已迁移的插件,原插件文件保持不变。

### FR-15 · 原生工作流
- 设计见 [原生功能](docs/design/native-features.md) 及其链接的子文档。
- **标签**:层级标签面板、批量重命名/合并、标签页(Tag Page)、按文件夹自动打标签规则。
- **附件清理**:预览未被引用的附件,用户明确勾选并重新校验后移入回收站,可恢复。
- **自定义菜单**:每个 Vault 用 JSONC 声明右键菜单(`.shale/menus/`)。
- **命令与快捷键**:命令面板、可自定义快捷键、用户命令、模板、标题级别命令。
- **块与脚本**:可执行的 JavaScript 代码块(含图表/组件)、查询块、块效果、图表(diagrams)、callout 列表。
- **外观**:CSS 片段、主题、字体;新建文件和附件的默认位置;正文首个标题作为笔记标题。
- **中文搜索**:单一 VaultCatalog + MiniSearch 支持原文和拼音字段;文件/命令/文件夹/标题/模板选择器
  以及链接/标签补全使用原生实现,替代 Fuzzy Chinese Pinyin 插件(见 [中文搜索](docs/design/chinese-search.md))。

### FR-16 · 工作区与阅读辅助
- 设计见 [工作区侧栏](docs/design/workspace-sidebars.md)、[文档导航](docs/design/document-navigation.md)。
- 分屏编辑(左右/上下),命令和导航跟随当前聚焦的页面;左右侧栏支持固定入口和动态标签页。
- PDF 与 PowerPoint (`.ppt` / `.pptx`) 阅读器共用分页、缩放、搜索、右侧大纲/缩略图和反色命令，按文件保存反色状态。PPT 大纲来自幻灯片标题及原有分节，按静态终态展示。Markdown 小地图、链接悬停预览、内容引用与块引用跳转。
- 虚拟文档用文件夹中的 `.virtual-document.json` 声明分组，在文件树和快速切换器中显示为一个文档。
  每个分组用 `pattern` 正则自动匹配并按文件名自然排序（运行时计算），或用 `files` 显式列出顺序；来源可为 Markdown、PDF 与 PPT/PPTX，默认启用 MD/PDF/PPT 自动分组。
  自动生成首页目录与跨来源大纲，连续阅读按邻近窗口加载 Markdown/PDF/PPT，原始文件保持独立，在连续页面中按真实来源独立编辑。
  分组选择与 JSON 高亮配置入口位于右下角状态栏，不增加顶部栏；右键可在系统文件管理器定位。
  首页的文档名、分组名与列表分别沿用文件标题、H1 与正文；章节交界为同一个可编辑文件标题，改名同步手动列表中的来源路径。
  大纲包含“目录”首页入口，文件与有子项的标题可以独立折叠；导航后反向滚动保持视口内容稳定。
  源文件名与别名仍能检索；无效配置退回普通文件夹。见 [虚拟文档](docs/design/virtual-documents.md)。
- 公式、表格、代码块、Callout、HTML 块悬停时右上角显示 剪贴板(复制 `![[^id]]`)和 link(复制 `[[^id]]`)按钮,
  需要时自动创建稳定身份(见 [稳定内容引用](docs/design/content-references.md))。
- 整篇文档只读打印/导出 PDF(通过本地 iframe 打印)。
- 打字时忽略触控板点击（默认关闭）：键盘输入后的设定时长内忽略触控板/鼠标点击，时长可在设置 › 界面调整。见 [打字防误触](docs/design/typing-pointer-guard.md)。

---

## 4. 非功能需求(NFR)
- **安全**:运行时只监听回环地址,所有 HTTP/WebSocket 请求经 `localAccess` 检查;路径越界防护
  (拦截 `..`、`.git` 段和逃出 Vault 的符号链接);插件 `id` 先校验再作为路径段;同步令牌、Git 凭据等
  机密不写入日志和错误信息。社区插件以受信任代码运行,不是安全沙箱;原生 Node 模块需要显式信任。
- **性能**:约 1 万篇笔记的 Vault 搜索 < 100ms;大文件树按需加载;编辑时使用增量索引和按依赖更新的装饰
  (见 [性能](docs/design/performance.md))。
- **可靠性**:设置和笔记原子写入;保留原始字节,只做局部修改;同步和 Git 操作不得丢失数据,
  冲突时停止并提示。
- **平台**:Windows/macOS/Linux 桌面(x64/arm64)与 Android。
- **可用性**:桌面与触屏布局(Android)、深色/浅色主题。

---

## 5. 本地运行时 API 概览
仅供桌面/Android 壳内的渲染器和本机 MCP/CLI 调用,不对外开放。
```
GET    /api/vault-identity
/api/files/*           # 文件树、读写、新建/上传、重命名/移动、复制、删除、回收站
/api/search, /api/backlinks, /api/graph …   # 搜索与链接索引
/api/tags/*            # 标签批量操作
/api/attachments/*     # 未引用附件预览与清理
/api/git/*             # Git 备份状态/操作、单文件历史
/api/file-sync/*       # 原生文件同步状态与配置
/api/plugins/*         # 已安装插件列表、启用/停用、资源
/api/menus/*           # 自定义菜单
/api/settings, /api/writing, /api/native-features, /api/uistate
/api/operations/*      # 原生操作分发(与 MCP 共用契约)
POST   /mcp            # MCP(另有 stdio 入口)
WS     /ws             # 文件变更、索引更新等通知
```

---

## 6. 数据模型
- **应用数据目录**(每台设备):`settings.json`、搜索/文件索引、同步检查点和收发日志、缓存、日志。
  `settings.json` 主要分组:`vault`(路径、`allowedRoots`、`trash`、`deleteMode`、文件/附件默认位置)、
  `search`(中文/拼音、选择器选项)、`hotkeys`、`nativeFeatures`(标签、附件清理等)、`writing`。
- **Vault 内**:Markdown、附件、`.canvas`(JSON Canvas)、`.trash/`、`.shale/`(原有配置与插件)、
  `.shale/`(本 fork 的原生配置,见 FR-5)。

---

## 7. 风险与决策
- **插件兼容**:很多插件依赖 Shale 内部 API → 只保证用户实际使用的子集;缺失接口软失败并记录警告。
  常用插件(LaTeX Suite、Linter、Fuzzy Chinese Pinyin、用户脚本等)优先改为原生实现或明确屏蔽。
- **机密**:同步令牌和 Git 凭据保存在 Vault 配置或本地凭据中,禁止进入日志。
- **大文件**:Git 备份需配置 LFS;实时同步由原生文件传输承担。
- **同步冲突**:优先提示并手动处理,不自动合并覆盖数据。
- **无浏览器回退**:不添加浏览器兼容目标;渲染器测试可用 Chromium 作为引擎,但与原生窗口、Android 设备
  和真实 Vault 的验收分开记录。

---

## 8. 完成标准(Definition of Done)
1. 桌面端和 Android 端都能打开 Vault,浏览文件树。
2. 编辑器能打开/修改/新建/删除笔记,实时预览、双链和反向链接正常。
3. 示例 Vault 中搜索(含拼音)在 100ms 内返回结果。
4. 原生文件同步在两台设备间同步笔记和附件;Git 备份(含 LFS)成功。
5. 外部 AI 客户端通过 MCP 读取上下文、搜索,并经本地审阅完成一次笔记修改。
6. 至少一个用户实际使用的社区插件能加载并启用。
7. 推送 `v*` 标签后,三个桌面平台的安装包成功发布到 GitHub Release。
