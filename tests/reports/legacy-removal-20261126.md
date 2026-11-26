# 删除全部旧格式兼容 — 2026-11-26

PRD 1.71。用户先要求删除虚拟文档旧格式（PRD 1.70），随后要求删除所有兼容性质代码；按要求只提交，不构建发布。

## 删除

| 范围 | 删除内容 | 数据处理 |
| --- | --- | --- |
| 中文搜索 | Fuzzy Pinyin/模板/快捷键启动导入；`templateFolder`/`shortcuts`/`migration` 设置字段 | settings.json 旧键由解析丢弃 |
| 快捷键 | 旧 settings.hotkeys、`.shale/hotkeys.json`、search shortcuts、写作快捷键导入；`migration`/`imported` 字段；第三方插件命令 ID 映射 | STEM hotkeys.jsonc 删除两字段；新版拒绝未知字段 |
| 写作 | `migration` 字段、`linter.replacementSyntax` 标记与缺省、`legacyReplacement.ts`、`markdown-core/migration` 入口 | STEM writing.jsonc 删除；Linter 测试夹具一次性转换 |
| 公式 | Local LaTeX Renderer / Extended MathJax 导言区导入、`migration` 字段 | **部署时删除 math.jsonc 的 migration**（0.1.99 仍要求） |
| 标签/自动化/文件夹规则 | Plus data.json 导入、旧自动化导入按钮与接口、规则笔记导入按钮与接口 | 小组件仍用 `parseFolderRuleData` 读笔记 |
| 用户脚本 | webviewer-userscripts 导入、Migration blocked 状态、旧卸载 GM 值清理 | Mac 存储无受阻脚本/孤立值；`migration` 键由加载丢弃 |
| 图片 | 目标片段 `#dark/#center/#full/#x1.5`、别名尾部 `|300`/`|300x200` | STEM 41 篇 344 处改写为正式属性 |
| 模板 | Templater `tp.*` 别名 | STEM 无 `tp.` 使用 |
| 工作区状态 | `pdfDarkPaths`、图谱旧单位重置、旧书签/标签左侧面板 | Mac/OMEN uistate 已为现行格式 |
| 运行时 | `SHALE_PLATFORM` 回退（Android 已显式设置两个变量） | — |
| Android | 旧应用内 `files/Vault` 选择入口 | K70 使用共享存储 STEM，无旧目录；平板离线未查 |
| 身份迁移 | profile/运行时设置/`.obsidian` 迁移、浏览器存储键改名、macOS 钥匙串迁移助手、migrate-user-data、migrate-equations | Mac/OMEN/ROG 无旧 profile 与 `.obsidian` |

## 保留（不属于旧格式兼容）

Obsidian 插件运行时（含原生替代守卫与 Local LaTeX Renderer/Plus 适配）、插件 API 使用的 Obsidian 核心命令 ID 别名、
用户脚本 GM 旧式 API（第三方脚本标准）、`tag:#x` 等搜索语法、Git 备份对凭据文件的去追踪、`.ppt` 格式、pdf.js `legacy` 构建名、CSS 变量别名、同步协议（另一会话负责）。

## 图片迁移核对

用 HEAD 版 markdown-core 生成改写方案（`rewriteImageAttribute`），再用旧解析器解析原文、新解析器解析改写结果：
41 篇、1293 张图片的 target/属性/尺寸/反色/对齐/倍率/图号/图注全部一致，非图片文本零改动；写入时逐文件比对原文未变（0 跳过），
写后用旧解析器复查无剩余旧写法。

## 验证

- server/web/desktop 类型通过；115 文件 672 单元通过（含新增“快捷键文件拒绝 migration/imported”）。
- 13 个相关浏览器文件 123 通过、2 个平台条件跳过（独立端口 5291，避开同一检出另一会话的 5179）。
- 未构建、未原生实包回归、未发布、未更新设备。
