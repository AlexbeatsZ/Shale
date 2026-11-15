# CSS 迁移检查与 Wiki 原图改色

2026-11-15，WebObsidian 0.1.69 源码基线，macOS STEM 配置。

## Hider 清理

实际文件为 `/Users/meta/Documents/Obsidian/STEM/.obsidian/snippets/Hider.css`，已从 231 行缩减为 13 行。
`.obsidian/appearance.json` 的 Hider 启用状态沿用现状。编辑使用同目录临时文件原子替换。

删除的内容包括旧 Obsidian 左右侧栏定位、旧标签栏悬停隐藏、旧 PDF 侧栏、旧侧栏按钮定位与隐藏、
旧 Windows 标题栏按钮隐藏，以及相关已注释试验规则。项目源码未创建这些旧 DOM 结构。
原生侧栏使用 `.sidebar-dock`、`.dock-left/.dock-right` 与 store 开关，标签栏使用原生组件，
PDF 目录和缩略图使用共享右侧栏，无需上述旧布局修补。

删除 `.pdf-toolbar` 的旧 `opacity:0`、位移和悬停显示规则。这个类名仍被当前 PDF 阅读器使用，
原生 `pdfToolbarOpen` 状态与 `.is-overlay` 样式已经控制显示与悬浮。旧规则会独立隐藏已打开的工具栏。

## Hider 保留的实际依赖

| 规则 | 当前消费者 | 清理后的状态 |
| --- | --- | --- |
| `.menu { opacity:0.80 }` | `web/src/lib/obsidian/ui.ts` 的 `Menu` 创建 `menu plugin-menu` | 保留当前插件/兼容菜单透明度 |
| `body:not(.native-scrollbars) ::-webkit-scrollbar { width:0;height:0 }` | 全部 WebKit/Chromium 滚动容器，应用默认滚动条规则在 `obsidian.css` | 保留当前隐藏滚动条外观 |

这两项后续可迁为原生外观设置。当前没有替代开关，移除会改变可见 UI。
React `ContextMenu` 使用 `.context-menu`，并不依赖 `.menu` 透明度规则。

## Theme 清理

实际文件为 `/Users/meta/Documents/Obsidian/STEM/.obsidian/snippets/Theme.css`，已从 508 行缩减为 174 行，最终为 4142 字节。

已清理浅色主题裸 `img` 的整体反色、基于文件名字符串的 `dark/Wiki` 选择器、Callout 图片固定亮度、
旧 `#center/#full/#xN` 尺寸和对齐规则，以及图片说明伪元素。图片效果由嵌入实例属性和原生图注承接。
H1–H6 伪元素、折叠强制显示、嵌入标题/边框/滚动限制、旧 Mermaid DOM 适配、公式和表格宽度修补
随原生渲染迁移完成清理。

保留内容及其依赖如下。

| 保留内容 | 当前用途 |
| --- | --- |
| `--font-text-custom`、`--font-code-custom` 及正文/标题/代码字体规则 | 沿用用户 MathJax/Noto Serif SC 正文字体和 Cascadia Code 等宽字体 |
| `foreignObject div` 字体规则 | 沿用图表内 HTML 文字的字体和字号 |
| Callout 类型的 `--callout-color`、`--callout-icon` | `web/src/lib/calloutStyles.ts` 通过 `.callout[data-callout]` 探针读取用户颜色与图标，原生容器采用 `md-callout` |
| Callout 布局与深浅色背景、边框规则 | 保留兼容 HTML/插件 Callout 的用户外观 |
| 深浅色背景级别、纯文字色、强调色、加粗及代码背景 | 保留用户主题配色与代码可读性 |
| Callout 内代码背景规则 | 保留兼容 Callout 内嵌代码的背景级别 |

Callout 颜色和图标还可迁为原生配置项。自定义字体、主题颜色、插件兼容布局目前由用户 CSS 提供。

## Wiki SVG 原图改色

用户明确选择直接改写这批 SVG 的颜色。已处理
`/Users/meta/Documents/Obsidian/STEM/08附件/SVG-Wiki/` 下的 14 个唯一源文件，
总字节数由 13566 变为 15170。279 个 SVG 元素的几何、变换、尺寸、文本、引用和透明属性通过 XML 对照，
默认黑色填充改由根节点 `fill="#fff"` 显式继承。

旧规则已从源码基线 `web/src/styles/obsidian.css` 与原 Theme 副本核对，
暗色使用 `invert(100%) hue-rotate(180deg)`，浅色与打印取消滤镜。
这次永久色值以暗色既有效果为目标，浅色显示与打印也使用改色后的源图配色。

采用 CSS hue-rotate 的 RGB 矩阵计算后改写 `fill` 和 `stroke`。

| 原始颜色 | 改色后颜色 |
| --- | --- |
| `#000` 和隐式黑色填充 | `#fff` |
| `#999` | `#666` |
| `#ccc` | `#333` |
| `#080` | `rgb(60.52,196.52,60.52)` |
| `#0a0` | `rgb(11.9,181.9,11.9)` |

每个文件带一次性 `webobsidian-wiki-palette-v1` XML 注释标记，重复检查的待改文件数为 0。
实际文件通过同目录临时文件原子替换，临时备份与详细清单位于
`/tmp/.agents/webobsidian-wiki-palette-20261115/`。

### 逐张渲染结果

Chromium 按 400px 宽度分别渲染旧源图加旧 CSS 滤镜、改色后的 SVG。
透明底和 `#1e1e1e` 暗底各检查一轮，并目视检查全部 14 张总览，晶格线、字母和绿色角度标记完整。
表中差值为暗底下全图 RGB 每通道的平均绝对差，量程为 0–255。

| 文件 | 检查尺寸 | RGB 平均差 |
| --- | --- | --- |
| `Wiki Cubic body centered.svg` | 400×470 | 0.148 |
| `Wiki Cubic face centered.svg` | 400×464 | 0.113 |
| `Wiki Cubic.svg` | 400×463 | 0.122 |
| `Wiki Hexagonal.svg` | 400×458 | 0.093 |
| `Wiki Monoclinic  base centered.svg` | 400×460 | 0.108 |
| `Wiki Monoclinic.svg` | 400×460 | 0.108 |
| `Wiki Orthorhombic base centered.svg` | 400×522 | 0.102 |
| `Wiki Orthorhombic body centered.svg` | 400×522 | 0.102 |
| `Wiki Orthorhombic face centered.svg` | 400×522 | 0.104 |
| `Wiki Orthorhombic.svg` | 400×522 | 0.102 |
| `Wiki Rhombohedral.svg` | 400×420 | 0.153 |
| `Wiki Tetragonal body centered.svg` | 400×579 | 0.088 |
| `Wiki Tetragonal.svg` | 400×571 | 0.089 |
| `Wiki Triclinic.svg` | 400×406 | 0.151 |

直接改写 paint 后，字体边缘会采用白色/绿色字形自身的抗锯齿，和黑色字形先渲染再整体过滤存在像素差。
暗底局部单通道最大差值为 57，平均差值见上表。透明底截图也出现字形边缘 alpha 差异。
源 SVG 的透明属性、空白区域和矢量内容经结构检查保留。

## 验证范围

完成源码与选择器消费者检查、Hider/Theme 最终内容回读，以及 14 张源 SVG 的结构/幂等检查和逐张渲染。
真实已安装应用的计算样式与像素对照由主任务统一验收。
本报告记录 macOS 这份 Vault 文件的调整，原生同步到其他设备的结果尚待主任务确认。

## exTable 单元格来源依赖

真实晶格图位于 `[exTable|addClass(ab-custom-td-nowrap)]` 的个人合并表格内。
配置脚本 `STEM/.obsidian/webobsidian/blocks/merged-table.js` 现仅增加两处来源透传，
每个 anchor 保存原 `TableCell` 为 `sourceRange`，调用
`block.renderMarkdown(anchor.source, cell, block.supportsSourceRanges ? anchor.sourceRange : undefined)`。
原有合并算法、单元格文本、样式和笔记内容保留。
0.1.70 宿主声明 `supportsSourceRanges`；旧客户端接收 `undefined` 并沿用原默认渲染上下文，
Vault 配置先同步到 0.1.69 时也能继续渲染。

应用宿主校验该范围属于当前块且文本完全一致，随后复用完整笔记模型和偏移，
使生成单元格继承表格 `\\|` 语义、连续图片图号和实例属性。
块宿主在捕获阶段处理图片右键，写回拥有来源的父编辑器事务，支持撤销和只读限制。
重复文本的单元格各用其明确范围确定实例。

仓库 `tests/fixtures/personal-merged-table.js` 同步上述参数。
原文件临时备份为 `/tmp/.agents/webobsidian-release-0.1.70/merged-table.before-source-range.js`，
交付清理阶段已删除。其他设备仍需收到这一 Vault 配置更新后才能获得生成表格的来源语义。
