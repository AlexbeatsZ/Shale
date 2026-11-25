# 公式 tag、行号与含公式标题 — 2026-11-25

用户确认只清理粘贴进 Shale 的内容，复制出去保持原样。

- 格式化的“去除公式 tag”与“粘贴时去除公式 tag”独立控制且默认开启；支持美元/TeX 定界符、星号和嵌套参数，保留代码、YAML、TeX 注释、label/notag/nonumber。粘贴目标为代码/HTML/文档属性时保留原文。
- 设置 › 编辑器 › 文档视图新增关闭/绝对/相对行号，相对模式主光标行为0；阅读与嵌入视图隐藏，更新不重建编辑器。
- 原因确认：selectedMarkdownLines 原先排除任何包含公式的整行，误伤 `Wigner 的 $2k+1$ 规则`。只排除独立/多行公式后，正文转 H1–H7、调整和取消标题均可用。
- 类型/生产构建通过；独立 git tree 快照 647 单元通过。23 个既有剪贴板/键盘/Vim 浏览器回归通过，新增4项（含独立关闭和代码粘贴）最终通过。旧图片冒泡断言与现有共享附件处理不符，已修正；无权改变现有图片插入语义。
- 浏览器初次用 universal Chrome 初始化超时，强制现有 Chrome arm64 后恢复；相对行号测试一度错误假设插入处光标自动向后关联，校正为显式移动；配置加载用例补齐内联片段来源标志。最终用例均通过，没有扩大应用快捷键绑定或修改系统设置。
- 工作区另有同步功能并发修改；仅本次文件进入提交，生产/回归使用隔离源码与依赖，未包含其他任务的 server/sync/App 改动。

正式包验收：

- Mac arm64 0.1.92，固定 `Local Development Code Signing` / `io.github.alexbeatsz.shale`，`codesign -d -r-` 含 certificate leaf，deep/strict通过。
- Mac 编辑器专项通过：Option+2/0 含公式正文转换、原样复制、TeX/美元 tag 粘贴及手动格式化、单步撤销、两种行号实际设置保存/重开和标题行布局。默认侧栏是浮动覆盖层，关闭测试侧栏等待过渡完成后确认0行实际可见；没有修改工作区或侧栏布局。
- Mac 完整 WebViewer/用户脚本回归和 Vim关闭/开启的网页/地址栏/Markdown剪贴板专项通过。
- OMEN Windows x64 隔离 NSIS 构建通过，FileVersion0.1.92/ProductVersion0.1.92.0；Session1 运行 writing-tools、完整 webviewer、clipboard 三项均exit0，既有OMEN工作区AGENTS.md修改保留。
- 两端隔离测试均使用临时Vault/profile和 `--use-mock-keychain`，剪贴板内容保存在进程内并恢复，没有编辑真实笔记或请求钥匙串密码。

交付：

- 运行源码 `82e971a59f9ee9ee7dcfbcd5212c06173897c077` 已提交并推送 `origin/fix/sync-liveness`（共享检出当时的当前分支）。其他同步任务的未提交源码未进入本次构建。
- GitHub Release `v0.1.92` / ID458095640 已正式发布/latest，非预发布。7资产名称/字节数与本地产物一致，标签指向上述已验收源码：Mac arm64 DMG/ZIP/blockmap/latest-mac，Windows x64 NSIS/blockmap/latest。
- Windows直接上传因其现有gh认证401失败，改为传回Mac用现有认证上传；未更换或暴露凭据。
- Mac当前产物保留在项目 `desktop/release/0.1.92`；OMEN保留同版本3个Windows资产。删除两端临时源码/依赖/归档、旧0.1.91生成产物与一次性Windows验收任务，保留临时验收日志。
- 本轮未替换日用安装；Mac仍0.1.91，Windows/Android沿用先前安装。Android未新发APK。用户AGENTS规范要求升级系统/用户级软件前确认，因此安装不包含在已发布/已验收结论中。
