# 双侧悬浮栏与视图归属

## 颜色分组与复制（PRD 1.66，2026-11-25）

- Command 点击（非 Mac 为 Ctrl）依点击顺序多选，普通点击清空批选并激活页面。右键选中成员对整批设置颜色；右键未选中成员只作用于它。颜色为红/橙/黄/绿/蓝/紫/粉，左边界 3px 描线，另有独立的多选高亮；可从分组移出。颜色不折叠、不强制相邻。
- 每个标签栏（中央、左、右）的同色为一个组。首次加入按选择顺序追加；再次加入相同颜色保留编号，移出后再加入排到末尾。拖动和交换不改变组内加入顺序。Option+Shift+Z/X 将活动标签的上一/下一成员显示到当前页面，首尾循环；零/单成员无动作。单页与把标签拖到正文相同，调用 `showTab`（暂存分屏成员也沿用拖放的整组恢复）。分屏调用当前栏的 `replacePane`，目标在另一栏时交换两栏，否则只替换当前栏并把旧页放回目标原标签位置。左右侧栏调用 `selectRightTab`，保持标签顺序。连续按键以新显示成员为起点，保留原命令 id 以兼容已保存绑定，菜单标题改为“显示分组内上/下一个标签页”。保持所有网页 DOM 宿主顺序不变。
- 0.1.95 的验收漏掉了单页，`swapTabs` 在此状态只重排标签导致正文不切换。回归必须直接断言正文/可见网页，而非只查顺序或内部状态；原生访客按键覆盖 `before-input-event` 转发，并核对实例、草稿、滚动、历史与请求次数。
- 中央 `Tab.id` 是可选独立身份（旧标签以 path 为身份），`activeTabId`/`splitTabId` 与暂存分屏 id 指定同路径的具体标签。文件路径继续是 DocumentSession、保存、重命名、命令和 API 的真实路径。复制不复制文件：新标签独立身份、紧邻原标签，网页创建新访客并打开当前 URL；原访客不能重载。同一笔记共用现有文档与撤销会话。复制默认未分组，用户可明确加入颜色。
- 持久化颜色、加入序号与具体活动身份；旧工作区兼容，恢复时过滤无效颜色、序号和重复身份。批选不持久化，关闭和远端恢复后去除失效选择。

## Android / touch (0.1.17)

`useIsMobile` and the matching responsive CSS now also select a coarse primary
pointer, covering Android tablets regardless of viewport width. There is still
one `mobileDrawer` and one App touch lifecycle, shared by both SidebarDock hosts.
Edge-in opens, drawer-out closes; vertical scrolling/multitouch/cancel/selection
and horizontally scrolling content cancel or bypass the gesture. No per-platform
drawer store, duplicate listener or backend notification is added. Detailed
thresholds, storage and device acceptance entry points are in android-runtime.md.

## 用户需求与视觉基准

- 2026-11-19 用户确认中央主页的打开和新建能力也应在侧栏主页提供。内容和标签跟随入口：中央用顶部横排标签，左右侧栏用各自竖排标签。文件列表、标签、大纲等固定面板沿用所在侧栏。已存在的中央与侧栏内容可并存。

- 删除原生日记创建动作、命令及入口；已有 Daily 文件继续作为普通笔记，不删除用户内容。
- 左竖栏顶部为文件、搜索；右竖栏顶部为反向链接、出链、标签、大纲四个固定入口。
- 中央、左栏和右栏的 + 只创建 Homepage 标签，不创建文件。左右下方是独立笔记、
  已注册插件视图。中键、Delete、
  标题关闭按钮和右键菜单关闭标签，方向键选择标签。2026-11-23 用户指出侧栏笔记页的顶部栏多余：
  笔记/文件与网页标签不再显示 `.sidebar-tab-header`，直接显示编辑器，由竖排标签负责标题和关闭；
  图谱、书签和插件视图仍保留该栏的标题与关闭按钮。
- 只读参照实际 STEM `.shale/snippets/Hider.css` 的有效规则：浮在正文之上，
  左面板默认 280px。hover 自动隐藏代码处于注释状态，不采用。2026-11-22 用户要求删除侧栏阴影
  和右栏 opacity=.95 半透明，两侧现为不透明、只有内侧 1px 边线。页面、面板和列表的滚动条
  全局隐藏（仍可滚动），不要再给单个区域加回可见滚动条。
  两侧位于 32px 工作区标题栏下方，不覆盖原生窗口按钮；展开/收起不改变正文列宽。
- 采用用户提供的 Shale 参考：16–18px 单色细线图标、中性底色、紧凑菜单行、
  8px 菜单圆角、右侧勾选标记、胶囊形启动动作、带图标和分组的设置导航。
  主色和字体仍来自现有主题变量，不加载外部图标包或重新实现一套主题。
- 删除右竖栏底部的命令、插件快捷入口、同步和主题工具组；设置放到左侧仓库底栏。
  底栏用双向小箭头和仓库名打开当前仓库勾选/切换菜单，移除钻石。切换菜单打开现有
  Vault 设置，不再造一套文件夹选择器。顶部标签使用 8px 上圆角、选中标签与正文连接的
  下角、非选中 hover、选中及 hover 可见的关闭按钮，保留 32px 标题行和原生拖拽安全区。

## 一份状态与生命周期

| 职责 | 唯一归属 | 复用方式 |
| --- | --- | --- |
| 两侧壳体、宽度和拖拽清理 | SidebarDock | side 参数决定方向；宽度设备本地保存 |
| 固定面板选择、动态条目和激活 id | 既有 store + uistate | 保留 rightTabs wire 名称，side 区分位置，leftActiveId/rightActiveId 分别激活 |
| 正文、历史、冲突及落盘 | DocumentRegistry/DocumentSession | 两侧直接使用 Editor path；不复制 content |
| 选区、光标、视图模式 | 各 Editor/MarkdownView 实例 | 同文件中央/左右共享会话，保持独立编辑视图 |
| 自定义视图的创建与清理 | WorkspaceLeaf + viewRegistry + Component | SidebarTabPanels 调用既有 mountView；Modal 和左右侧栏共享加载路径 |
| 全局编辑焦点 | activeEditor | 排除 hidden/aria-hidden，覆盖命令、模板、保存 |
| 标题、块、公式定位 | fragmentNavigation | 可指定 EditorView，避免同路径多实例跳错 |
| 图标路径 | lib/icons.ts | React Icon 与 Shale DOM getIcon 共用目录 |
| 右键、视图、搜索排序菜单行 | ContextMenu.MenuList | 共用图标列、标签列、勾选与键盘操作 |
| 空工作区与三处 Homepage | WorkspaceLauncher | 共用新建笔记、打开文件、网页和图谱动作，调用已有命令/选择器并带目标区域 |
| 左右动态栏的键盘、关闭和菜单 | SidebarTabRail | side 参数只影响位置，复用同一 store 保存/替换/关闭流程 |

rightTabs 只保存 `{id,type,state,title,icon,side?}`，不保存正文、DOM、事件或 guest id。
旧数据缺少 side 时仍归右侧；空标签迁移为 Homepage 标题/图标。中央 Homepage 使用
`home://<uuid>` 作为既有 tabs 的非文件身份，不进入最近文件，
不加载 DocumentSession。点击已有标签或显式新建标签时保留其他 Homepage。
中央和两侧 Homepage 打开笔记、文件、图谱或网页时，内容原位接替当前空标签。
中央目标已打开时激活现有标签并收起发起操作的空标签，沿用中央标签的路径去重。
网页弹窗新建来源区域的标签。中央和侧栏用相同的文件选择器及内容宿主，复用现有 Markdown、
分页文档、媒体和文件夹视图。
本体尚无数据库产品或创建动作，截图中的“新建数据库”未实现，不提供无效按钮。
同路径可以有多个稳定 id。恢复时校验形状并在桌面恢复网页视图，保留未知插件
视图 state，等待实际注册后重试。旧 leftPanel=tags/bookmarks 迁移到右侧；左侧回退文件。
关闭、替换和远端布局移除笔记前共用 saveLeavingSidebarTab；保存失败或保存期间又发生
修改时保留原标签。每个异步替换/关闭有代次，过期结果不能覆盖较新的选择。

左右笔记和插件视图首次选中才挂载；随后隐藏时保留实例，避免丢光标/滚动。
App 保留左侧 Sidebar 外壳，只用 open 控制可见固定面板和动态内容；不再收起就卸载宿主。
标签关闭才卸载。WorkspaceLeaf 串行化挂载、用代次取消过期结果；不重复调用 onOpen，
相同状态的 setState 不重复执行。React StrictMode cleanup 后可以安全重新挂载。
手动保存指向活动编辑器的路径；MarkdownView.save 指向自身 file，后台保存保留原含义。

## 中央分屏编辑（2026-11-01）

- 两个中央 Markdown 栏必须复用完整宿主链 `WorkspacePane → EditorPane → Editor → MarkdownView`，均显式传 `path` 和 `navigationId: main | split`；不是两个不同宿主各自调用 MarkdownView。删除副栏独有路径标题行、`.split-head` 和直接挂 Editor 的分支。两栏共用 `.pane` 布局与不占正文流的 overlay 关闭按钮；inset 分隔不扣除单栏正文宽度。Canvas 保持原中央能力，不代表支持双 Canvas。
- 不再强制分栏 `reading`。主栏即使显式传 path，仍使用既有持久化 workspace viewMode；仅侧栏及显式 path 的非 main 栏使用实例内 live/source/reading。选区、折叠与滚动继续归各 MarkdownView，不增加共享视图状态。
- 同文件复用同一 DocumentSession 的正文、历史、分析和 autosave；不同文件继续各自会话。Workspace Markdown/activeLeaf 通过注册 context.navigationId 定位 main/split/sidebar，删除 readOnly、同路径及 DOM 位置猜测。activeEditor 原 activate handler 同时处理 focusin/pointerdown，空白阅读页点击也能激活正确栏；保留 nearest-editor 过滤及对称清理，不强制 focus、不二次改 selection、不另建保存或键盘管线。
- `openToSide` 替换前和 `closeSplit` 关闭前统一等待 DocumentRegistry.saveLeaving。保存失败或保存期间再输入时保留分栏／草稿并报告错误；现有 splitGeneration 防止过期异步操作关闭或覆盖新分栏。远端布局应用也先保存原分栏，导航在打开失败后不继续定位到旧视图。
- 不新增输入时全文分析、索引构建或工作区序列化，不宣称性能提升。最终27项相关单元、25项浏览器通过；同笔记12组主题/模式/空白与富文本对照最大差0 CSS px，实际glyph字体一致。实际安装040资源零route覆盖复验通过。覆盖真实编辑落盘、独立模式/选区、共享Undo/Redo、关闭/替换屏障、507恢复及空白阅读页命令定位；报告 `tests/reports/split-editing-20261101.md`。
- 边界：Canvas 嵌入 Editor 尚未显式传 navigationId，默认 split 身份是待单独回归的静态风险；不因此恢复猜测分支。本轮不声称 Canvas、物理IME、其他平台或用户当前窗口验收。

## 平等分屏与分屏标签组（2026-11-01）

用户要求：两栏地位平等，不是一主一附；进入分屏时新侧打开 Homepage 而不是复制当前页；可以把标签拖进分栏。内部仍保留 `activePath`(main)/`splitPath`(split) 两个槽位和 navigationId，平等体现在行为上：

- `openToSide` 把副栏页面放进 `tabs`(紧跟当前主栏标签)。副栏原本是 Homepage 时，被打开的文件原位替换该 Homepage 标签，避免残留新标签页。旧 uistate 中不在 `tabs` 的 `splitPath` 仍可显示(组内临时合成标签)。
- 标签栏把 `activePath` 与 `splitPath` 两个标签合成 `.tab-split-group`(方向图标 + 两个同构 `.tab`)，副栏标签不在组外重复出现。组内点击只 `activateNavigation` 并聚焦编辑器。这取代了旧约定"主标签栏点击显式指定 main"。键盘左右按 `tabs` 顺序，通过 `data-tab-path` 定位焦点。
- 分屏组是一个整体标签(用户 2026-11-01 纠正：不能把组外标签塞进聚焦栏)。标签栏点击统一走 `showTab(path)`：分屏可见时点组外标签 C → `closeSplit`(保存屏障)后记录 `parkedSplit = { main, side, direction }`，再在主栏单独打开 C；点暂存组成员 → 清空 `parkedSplit`、主栏打开 main、`openToSide(side, direction)`，聚焦所点成员。`openFile(path, _, 'main')` 遇到暂存组成员也转给 showTab，所以快速切换器等入口同样恢复整组。不变式：`parkedSplit` 只在 `splitPath === null` 时存在；`openToSide` 建立新分屏时丢弃旧暂存组(只支持一个分屏组)。`parkedSplit` 进入 PERSIST_KEYS，路径重命名/删除时随 remap 更新或解散。关闭暂存组成员 → 解散组；关闭当前标签后若下一个活动标签是暂存组成员则恢复整组。暂存组在标签栏以 `.is-parked`(细边框、无活动底色)渲染在 main 成员的位置。`workspace:next-tab` 等命令仍在聚焦栏内切换页面，不经过 showTab。
- 中央新建标签页(+、`new-tab`)调用 `showTab(home://…)`：分屏时与点组外标签相同，暂存分屏组并单独显示新 Homepage，不替换组内任一栏(用户 2026-11-01 指出旧逻辑未改)。只有 `splitWithHomepage` 传 `openHomepage('split')` 在分屏内打开 Homepage。
- `closePane(view)` 是关闭一栏的唯一入口：关闭副栏 = `closeSplit` 后移除其标签；关闭主栏 = 保存屏障后把副栏页面提升为 `activePath`，并把副栏 DOM 上的 `data-mode` 写入 workspace `viewMode`，保持存活页面的模式。同文件双栏关闭任一栏只退出分屏，不删标签。`closeTab`、正文 overlay ×、`workspace:close`、`WorkspaceLeaf.detach` 都走这条路径。`closeSplit` 只表示"取消分屏"，两页都保留为标签。
- 标签右键"向右/向下分屏"、命令 `split`/`split-down` 调 `splitWithHomepage`：保留该页在主栏，新侧 `openHomepage('split')` 并聚焦。文件树/书签/链接的"在右侧打开"仍打开指定文件。
- 拖拽：标签 `draggable`，数据类型 `TAB_DRAG_TYPE`，dragover 期间路径放在 `lib/tabDrag.ts`(dragover 读不到数据)。`.editor-area` 用 capture 阶段的 dragover/drop 并 stopPropagation，防止 CodeMirror 把标签当文本插入。分屏时落点为指针下的栏，交给 `replacePane(view, path)`：打开后在 `tabs` 中交换被拖标签与被替换页，使 [A,B],C 拖 C 到 B 得到 [A,C],B(用户 2026-11-01 指出旧行为让 C 原地不动、反直觉)；拖的是另一组员时交换两栏；副栏不接受 Graph/文件夹。分屏组中可见成员的标签也是落点(`.is-drop-target` 高亮)，行为相同。未分屏时右半/下半区域建立 right/down 分屏，其余替换主栏。指示层 `.pane-drop-indicator` 相对 `.workspace` 绝对定位，`.editor-area` 不加定位以免影响子元素。

## 标签排序与交换（2026-11-22）

用户要求：标签可以排序（把最后一个移到第一个，其他顺延），也可以交换（最后一个与第一个对调），停留排序时分屏组作为整体参与，快速交换始终只对单个页面；两种操作都是拖动，必须明确区分，触控也要能用。采用用户提出的方案：

- **快速松手 = 交换**：拖到另一个页面标签上立即显示单页紫色框选（`.is-drop-swap`），松手只交换源页面与目标页面。分屏另一页保持原位；绝不交换单页与整个分屏组。
- **停留 = 排序**：在同一目标上停留 `TAB_INSERT_DWELL_MS`(450ms) 后，目标及其后的标签让出空位 `.tab-drop-gap`，空位里显示被拖标签的虚影（宽度取被拖单位），松手插到目标之前。空位出现后目标右移，指针落在空位或目标上都保持插入状态，换到别的单位才重新计时。拖动期间末尾出现 48px 的 `.tab-drop-end`，停在那里插到最后。
- **分屏组**：组 `div` 是拖动单位 `data-tab-unit`，组员本身也 `draggable`，这样 HTML5 `dragstart` 的 target 就是组员（dragstart 的 target 是可拖元素本身而不是指针下的子元素），`tabDrag.path` 记录该组员供拖到正文栏使用；拖组的留白/图标时 `path` 为 null，只能停留排序，不能快速交换。普通标签快速放到可见组的组员上仍是 1.22 的"放入该栏"（`replacePane`，副栏拒收图谱/文件夹时不进行交换）；停留则插到组前。组员拖到同组另一组员上仍交换两栏。组员拖到组外标签时只交换所拖页面与该标签；暂存分屏先恢复后复用相同交换。`store.swapTabs` 统一路由单页交换，复用 `replacePane` 的保存屏障；`arrangeTabUnits` 拒绝涉及整组的交换，不允许回退成整组对调。
- **排列逻辑**唯一实现在 `lib/tabDrag.ts` 的 `arrangeTabUnits`（纯函数、有单元测试），由 store `arrangeTabs` 调用。单位划分与渲染一致：分屏组（可见或暂存）位于 main 页在 `tabs` 中的位置，主页不在 `tabs` 时位于末尾；移动时组的两页连在一起、main 在前。停留排序只改顺序，不打开页面。
- **鼠标**走 HTML5 DnD，与拖到正文栏共用 `TAB_DRAG_TYPE`/`tabDrag`。标签条必须同时取消 `dragenter` 和 `dragover`：否则空位插到指针下时 Chrome 只发 dragenter 而不再接受 dragover，松手不触发 drop。dragleave 用坐标判断是否离开标签条（Chrome 的 dragleave 常无 relatedTarget）。拖动开始时的 React 重渲染放到 rAF，避免 Chrome 中止拖动。
- **触控**（`pointerType !== 'mouse'`）：按住 `TAB_TOUCH_LIFT_MS`(350ms) 提起（`.is-lifted`、短振动），之后移动才是拖动，之前移动超过 8px 视为滚动标签条并放弃。提起后用非 passive `touchmove` 阻止滚动，`elementFromPoint` 做同样的命中判断。提起后不动松手才打开标签菜单（原生长按 contextmenu 在手势期间被拦下，松手时补发），拖动/菜单后吞掉随后的 click。移动端标签不设 `draggable`，桌面触摸屏的原生 dragstart 在触控手势中也被取消。触控暂不支持拖到正文栏（仍可用右键菜单分屏）。

## 分屏分隔线与侧栏吸附（2026-11-22）

- 两栏之间渲染 `.pane-divider`（1px 可见线、左右各 4px 透明抓取区、z-index 高于正文背景；旧的 inset box-shadow 会被子元素背景盖住，看不见边界）。DOM 位置在 main 之后、网页栏之前，`order:1`，副栏 `order:2`。
- 拖动调整比例：`lib/splitLayout.ts` 把比例（0.15–0.85）写成 `.editor-area` 的 `--split-main/--split-side`，只作用于 `.editor-area.is-split` 的两个 `[data-view-id]` 子元素（未分屏时不能用小于 1 的 flex-grow，否则主栏只占一半）。比例设备本地 `localStorage wo-split-ratio`，不进工作区持久化。键盘方向键调比例，Enter 交换。
- 双击/双触交换两页：自己在 pointerup 上识别 350ms 内两次轻点（`touch-action:none` 下移动端不保证 dblclick），调用既有 `replacePane('main', splitPath)`，标签顺序同步对调。
- 侧栏吸附：拖动 `SidebarDock` 内缘时，若左右分屏存在且内缘距分隔线 ≤14px，宽度取让内缘落在分隔线上的值（可超过自由拖动的 900px 上限）。吸附状态存 `wo-sidebar-width-snap` / `wo-right-sidebar-width-snap`。吸附时监听 `wo-split-layout` 事件（分屏打开/关闭/换向、拖分隔线时由 Workspace 发出）和窗口 resize，跟随分隔线；没有左右分屏时保持最后宽度，再次分屏时重新贴上。键盘调宽或拖离分隔线解除吸附。用途：侧栏盖住一侧页面，作为该侧的快速切换页面。

## 活动页面与命令路由（2026-11-01）

- `activeEditor` 同时保留瞬时 navigationId 与实际活动编辑器。中央 main/split 和 sidebar:<id> 宿主在 pointerdown/focus capture 激活显式身份；原编辑器 focusin/pointerdown 继续处理实际编辑目标。弹窗、标题输入、空白阅读页、加载/卸载编辑器不把身份重置成主栏。身份不持久化，也不在普通光标移动时写工作区。
- store 的 `currentViewId/currentPath` 校验页面仍存在且可见。`openFile/navigate/openWikilink` 默认使用这一目标(`openHomepage` 只在侧栏聚焦时进侧栏，中央新建标签页走 showTab，见分屏标签组)；初始 deep-link 和浏览器 URL 恢复显式指定 main；标签栏点击见“平等分屏与分屏标签组”。保存、收藏、移动、命令面板标题搜索、模板/命令上下文与插件 Workspace 使用同一解析。关闭页面后清理其历史并回到有效页面。
- 主栏保留原 history/histIndex 结构；副栏和侧栏按 navigationId 保存相同 NavigationLocation 栈。正文、选区定位、变更映射、恢复和代次取消仍调用 fragmentNavigation/DocumentSession；不同页面的返回/前进不互相消耗历史。重命名沿原路径映射同时更新全部栈。
- 右侧固定属性/引用/大纲/缩略图、底部字数和视图切换读取同一活动页面；缩略图显式传 viewId，避免同路径两个视图时跳到主栏。视图模式仍归各 MarkdownView，通过已有 mode callback 修改，不另存副本。
- 本修复不增加键盘事件管线、全文解析、索引或保存实现；焦点变化只通知实际订阅页面身份的 UI 和插件。

## 性能与简化

- 出链和大纲读取同一 DocumentSession.analysis 的共享 metadata。出链从已有本地
  MetadataCache 解析，传入源文件路径，删掉逐次正文正则和最多 200 个 resolve HTTP。
- 固定面板仅在可见时挂载；未访问的动态标签不创建编辑器/guest。
- 工作区保存监听比较 PERSIST_KEYS 的引用；真正持久化前再序列化。普通输入不再
  对完整 tabs/bookmarks 等结构做两次 JSON.stringify。
- 保留挂载的笔记/插件视图用 memo 避免其他标签的标题更新连带重渲染；指定 path 的
  Editor 不再订阅中央 activePath，侧栏也不订阅中央视图模式。
- 左侧重复 Tags/Bookmarks 宿主删除；标签命令指向右侧唯一 TagsPanel。
- 原生/插件菜单保留各自的调用与配置语义，复用图标目录和公共样式；不增加第二套菜单注册表。
- 删除 RibbonUtilities 的独立 Git 状态 15 秒轮询；原有 StatusBar 同步入口/轮询继续负责此能力。
  没有新增输入时的全文扫描或工作区序列化；未测量性能，不宣称速度改善比例。

## 仓库切换

底栏菜单和设置共用现有 VaultSettings 与 `PUT /api/settings/`。路径仍经过现有 allowedRoots
和目录校验；客户端先保存 DocumentRegistry 的脏文档，再检查同一维护 blocker。所有含
vault.path 的 PUT 复用 withVaultMaintenance/drainFileUpdates，确认所有窗口的 dirty、conflict、
saving、Canvas、pending mutation 和可信原生插件状态，维护期间冻结输入和 HTTP/后台 Git 写入。
该请求本身不计入客户端 pendingMutations 或服务器 activeWrites，避免等自己的响应造成死锁。
普通非路径设置沿原有 updater，不另建切换 endpoint 或维护队列。

server/index 持有同一 watcher 引用：先停止旧监听并 drain，再更新设置、清空文件 stat、
经既有 rebuildFileIndexes/initSearch 更新唯一索引，恢复同一 watcher；失败尝试恢复先前设置、
索引和监听。uistate 在 DATA_DIR/workspaces 归档旧仓库布局，再选取新仓库布局，避免同名
路径套用另一仓库的标签/书签/最近文件。成功沿既有 vault-changed 使旧页面停止写入，发起页
重新加载。其他窗口保留原会话直到自行重新加载。没有改真实配置或实际执行切换。

原生菜单切库现分发 vault-switch，打开同一个 VaultSettings，不再只改启动提示后重启。
启动读取服务端有效 Vault，首次/恢复选择通过既有 initialVault 通路提交；取消不创建
默认目录。可信原生插件仍按维护 blocker 拒绝切换。完整原生行为未验收。

## Document lifecycle follow-up (2026-10-23)

DocumentRegistry owns one autosave debounce per session; central/sidebar exits
share saveLeaving. FileTree, FolderPicker, WorkspaceTabs and plugin Vault share
renamePath/removePath, covering directory descendants and saved session/history.
Markdown views/sidebar hosts retain stable session/tab identities. Canvas drafts
block path changes and defer external refresh. See architecture-optimization.md
for exact rules and deleted branches. Source/diff only; no runtime checks.

## 原生应用范围

桌面 WebViewer 于 2026-11-19 恢复，复用左右侧栏的标签身份、持久化及切换/关闭操作。
网页使用专用访客组件，详见 [桌面网页浏览器](web-viewer.md)。笔记与插件视图继续复用
SidebarDock、WorkspaceLeaf 和 DocumentSession 的生命周期。

## 2026-10-22 修改意见交付边界

本批遵循用户“不要验收”：仅源码阅读、修改和 Git diff 检查。没有执行类型检查、构建、
测试/fixture、浏览器、服务或原生程序，也未新增验收测试。没有打包或改 server/public/release、
真实 Vault、现有 profile。Homepage、左侧生命周期、切仓库及圆角标签均为源码完成、未验收。

## 先前实现的静态证据（不是本批结果）

本轮仅静态类型、回归源码类型和隔离生产/bundle 检查。新增 sidebarTabs.test.ts 与
tests/browser/sidebar.spec.ts 的 2 个纯状态与 4 个浏览器用例是待执行的回归源码，
不代表已运行通过。类型检查包含完整 web/server/desktop；独立生产 web、main/preload、
standalone server bundle 与相对 require/生成代码语法检查均通过。构建有既存依赖
浏览器兼容和大 chunk 提示。实际悬浮几何、
触摸/键盘、输入/保存、恢复、站点登录、新页面和长时间性能仍待用户验收。
不启动浏览器、Electron 或服务器，不改真实 Vault，不覆盖 server/public/release，不打包。

## 2026-10-23 settings and transition follow-up

Only the visible Homepage content heading was removed; launcher actions, central/
left/right + behavior and tab state remain. Both dock sides now use one shared
shell transform/visibility transition. Ribbon and content are children of that
shell; the old sidebar/right-sidebar width transition was removed. SidebarDock
retains content for the closing transition before releasing inactive fixed panels,
so the panel does not disappear while the rail moves. The caller's open flag is
still the sole expansion state; the short retention is presentation lifetime only.
The same shell works for floating desktop and narrow overlay layouts. Existing
retained note/guest views keep their previous close lifecycle. Source/diff review
only; no animation/UI/runtime acceptance or performance measurement.
