# 虚拟文档自动分组 — 2026-11-25

PRD1.68，桌面/Android0.1.98，运行源码 f6a2ca1ba57ced6d02145e505f16811431880d67。

## 设计结论

- `.virtual-document.json` 只保留 `title` 与 `streams`。分组 `title` 必填且唯一，作为运行时身份（原前端只把 `stream.id` 当内存键，不进 DOM/持久化路径）。
- `pattern`（JavaScript 正则，`u` 标志）与 `files` 互斥。`pattern` 对文件夹内相对路径匹配，候选来自现有物理文件树（可见 Markdown/PDF，沿用来源路径规则），使用原 `zh-Hans-CN` numeric collator 自然排序，在每次文件树投影时计算；配置不保存匹配结果。
- `version` 与分组 `id` 只为旧配置兼容读取，新写入不产生。运行时为空的分组不显示；全部为空时报告配置无效并退回普通文件夹。
- 聚合改名只改写手动 `files`；仅属于自动分组的来源不写配置，新名称不匹配任何分组时拒绝。
- 文件夹右键启用写 MD/PDF 两个自动分组。PPT/PPTX 不是连续文档来源。

## 个人 Vault 迁移

`/Users/meta/Documents/Shale/STEM/04资料` 下 27 个配置（迁移前备份 `/tmp/.agents/shale-vdoc-migration/backup`，Vault 仓库提交 fc68ea1）：

- 11 个课件文件夹（初稿误记为 13）：`主线` `^<标题> \d{2} .*\.pdf$`、`补充资料` `^<标题> (?!\d).*\.pdf$`、`MD` `\.md$`。所有原成员都被规则覆盖、无新增，唯一差异是 `无机化学 课件` 3 个 .ppt 与 `人工智能化学计算模拟 课件` 3 个 .pptx（迁移前这两个配置因列入 PPT 已无效，现恢复为有效文档）。
- 16 个教材/讲义（初稿误记为 14）：保持 `files` 顺序，仅移除 `version`/`id`。
- 运行中的 Mac 0.1.98 服务 `/api/files` 返回 27 个有效文档、0 个错误。

## 验证

- 115 文件 672 单元通过（新增 schema 互斥/唯一/正则/旧格式、自动分组运行时计算与增删、全空报错、自动成员改名不写配置及拒绝离组）；server/web 类型与生产构建通过。
- 9 个虚拟文档相关浏览器（virtual-documents、virtual-navigation、pdf-virtual-zoom）通过。
- Mac 0.1.98 实包 `tests/desktop-virtual-documents.mjs`（真实教材副本）通过：教材用手动列表、课件用默认自动分组，新增“向课件文件夹写入 PDF 后目录出现新链接、配置字节不变”。
- Windows（OMEN 隔离 git archive 构建）：9 个虚拟文档浏览器与 `desktop-virtual-documents` 原生（含 automaticStreamDiscovery）通过。Android assembleRelease/lintRelease 成功。
- `tests/desktop-image-properties.mjs` 在本轮之前已失效：仍读身份迁移前的 `.shale/shale/blocks/` 与已改名的真实笔记，未作为本轮验收；其虚拟文档夹具已改为自动分组写法。

## 发布与交付

- v0.1.98（Release 459044322）公开/latest 七资产；android-v0.1.98 公开预发布一个生产 APK；两个 tag 均指向 f6a2ca1，资产名称/大小/uploaded 核对通过。
- Mac 0.1.97→0.1.98：正常退出后替换，固定证书 identifier/certificate leaf、deep strict 通过，healthz 通过，Vault 保留。
- OMEN 0.1.97→0.1.98：NSIS 退出 0，healthz 57661，Vault 与工作区保留；服务返回 25 个有效连续文档、0 错误，迁移后的配置是否已同步到 OMEN 未确认（旧格式也可兼容读取）。
- ROG 0.1.97→0.1.98：启动，保持原本未选 Vault（无 healthz 属预期）。
- K70/小米平板：Mac adb 无设备（mDNS 无服务、平板旧地址连接超时），本轮未安装 0.1.98，APK 已发布待设备在线后 `adb install -r --user current`。
- 本机/OMEN 仅保留 0.1.98 产物；隔离源码、签名副本、计划任务和临时安装包已清理。迁移备份留在 Mac `/tmp/.agents/shale-vdoc-migration/backup`。

## 追加：连续文档 PPT 来源（PRD 1.69，0.1.99）

- 用户要求课件中的 `.ppt/.pptx` 进入连续阅读。来源类型扩展为 Markdown/PDF/PPT（kind `ppt`），PPT 章节复用 `PdfSession`→`PptResource`、`PageSlot`、文件标题、幻灯片标题大纲、缩略图、缩放与反色；分页判断统一为 `kind !== 'markdown'`。链接悬停预览覆盖 PDF 与 PPT。
- 默认启用改为总是写入 MD/PDF/PPT 三个自动分组：之前只写当时有匹配的分组，会让后来放入的 PPT 无法被发现。
- STEM 11 个课件配置的主线/补充资料改为匹配 `\.(?:pdf|pptx?)$`，与 PDF 按命名交错（Vault 自带 git 同步自动提交 3a4ff8a）。0.1.99 服务读取 28 个有效文档、0 错误；无机化学 主线含 4 个 ppt，人工智能化学计算模拟 主线含 3 个 pptx，量子化学 补充资料含 1 个。期间用户正在整理 Vault，数量变化来自新增/改名文件被自动发现。
- 验证：673 单元、14 个相关浏览器中 13 通过（新增 PDF+PPTX+PPT 混合连续阅读用例）。`presentation.spec.ts` 的“dark command”用例在改动前源码上同样失败：PRD1.63 起 PDF 默认反色，该用例仍按一次切换开启断言，属既有过期用例。Mac 0.1.99 实包真实教材原生回归通过，新增“放入 .pptx 后 PPT 分组出现、打包 Worker 绘制幻灯片、大纲显示幻灯片标题、配置不变”（截图核对）。
