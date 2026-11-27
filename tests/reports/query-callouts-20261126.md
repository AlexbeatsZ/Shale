# query callout 标记搜索（0.1.102 / PRD 1.74）

## 根因与范围

内置 query 的前置校验只允许纯字词，`[!question]` 因方括号和感叹号被拒绝，未调用搜索。即使绕过校验，MiniSearch 的分词会丢弃这些标点，普通 question、缺括号/感叹号、拼错/前缀词和其他 callout 类型都会成为候选。

修复沿用现有 query 处理器、search-core、MiniSearch 与源文件读取，不增加索引、缓存或监视器。完整标记（含自定义类型的连字符、下划线、中文）按大小写不敏感的连续原文验证，最多四个候选并行读取。字段范围、标签包含/排除、100,000 UTF-16 正文限制保留；验证在排序和限额之前完成。标记搜索与高亮不使用拼音、模糊或前缀替代。支持 `[!question]`、`"[!question]"` 及与标签组合。其余未实现的 query 操作符继续明确拒绝。

## 源码验证

- 修复前专项单元稳定复现：literal/pinyin 模式及 body 字段错误包含 Plain、Custom、Split 等笔记，4项中3项失败。
- 全量单元 115 文件、680/680 通过；随后收紧高亮分支，4项专项再次通过，确认 `[!ques tion]` 不进入标记高亮。
- query 浏览器 45/45：新增完整标记/引号/自定义类型/无结果，现有标签、路径、100条上限、源编辑、取消、刷新、错误和输出安全均通过。
- 异步处理器浏览器13/13：延迟刷新、保留既有结果、乱序/取消、卸载、失败恢复通过。
- 旧 query 浏览器夹具没有应答设置写入，产生 `/api/settings/` HTTP501；补齐隔离夹具的设置响应后整个规格通过，无应用逻辑绕过。
- core/server/web/desktop 类型通过；共享 renderer 与 server 生产构建通过。Vite 原有大分块与动态/静态导入提示保留。
- 临时日志/浏览器证据：Mac `/tmp/.agents/shale-query-20261126/`。

## 正式包与部署

发行源码 `0f2623520bdea7b27720dfd23059a49459159d84`。Mac arm64 在本机打包，Windows x64 在 ROG 隔离目录构建，Android arm64 在 OMEN 隔离目录构建。两台远端常规检出未改动，临时源码目录和源码压缩包已清理；Android `.signing` 临时副本由构建 finally 清理并再次确认不存在。

- Mac/Windows：从最终包的 Resources 启动真实生产 server 和 renderer，使用隔离 Vault/profile 与现有 Chrome，全部生产启动检查通过。新增实际 query 检查覆盖精确标点、标签包含/排除和实时预览/阅读模式；原文文件不变，renderer 错误0。这是最终包生产资源验收，不扩大为 Windows 原生焦点或真机输入验收。
- Mac：固定证书 `Local Development Code Signing`，identifier `io.github.alexbeatsz.shale`，指定要求含 `certificate leaf`，deep/strict 通过。正常退出日用应用后原位替换并重启，真实库健康、Vault 选择保留。`[!question]` + mode=pinyin 返回42篇，42条摘要全部含完整标记。
- Windows：OMEN/ROG 均通过一次性交互计划任务静默原位安装，安装器退出0；`0.1.101.0 → 0.1.102.0`，原有 Vault 选择保留。两台安装前均未运行，因此保持停止；OMEN 真实同步恢复没有执行。
- Android：release assemble/lint通过，arm64、非调试，APK发行签名与0.1.101一致。使用 `adb install -r --user current` 原位升级K70/平板至0.1.102/code102。K70首次安装时间仍为2026-11-23 23:30:54，平板仍为2026-11-23 23:32:04；本轮不新增前台、触摸和实库query验收。

`v0.1.102`（Release ID460029513）正式发布/latest，含Mac DMG/ZIP/ZIP blockmap/latest-mac与Windows NSIS/blockmap/latest，共7资产。`android-v0.1.102`（ID460029519）预发布，含135,824,404字节的生产APK。API按发行ID核对资产名称/大小、uploaded状态、完整源码目标与发布状态通过。既有历史Release保留，本机只保留0.1.102构建版本。

设备回执、发布大小记录及正式包证据保留在Mac `/tmp/.agents/shale-query-20261126/`；ROG/OMEN临时任务目录同名，仅保留脚本、回执和验收证据。
