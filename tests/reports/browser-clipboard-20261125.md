# 网页与地址栏剪贴板 — 2026-11-25

- 用户范围：地址栏和网页正文输入不能粘贴；排查 Vim；核实此前部署；提交已有未提交源码，并修复测试反复询问钥匙串密码。
- 旧安装：本机 `/Applications/Shale.app` 确认为 0.1.90，GitHub v0.1.90 七资产已发布；上次应用快捷键转发确实已进入安装包，但其验收未覆盖网页原生剪贴板。
- 旧包复现：Vim 关闭/开启均出现网页 input、textarea、contenteditable 的快捷键粘贴和文本复制失败；菜单粘贴成功。地址栏 CDP 复制/粘贴成功，而 native sendInputEvent 粘贴为空；不能据 CDP 成功推断原生按键可用。首次网页失败来自已安装 0.1.90；后续地址栏原生按键对照使用仅加入钥匙串隔离、未加入剪贴板修复的本地 0.1.90 包，避免再次启动旧安装的真实钥匙串迁移。测试只使用临时 Vault/profile 和本地 HTTP 夹具，剪贴板格式保存在进程内并恢复。
- 根因：原生菜单去掉 role/accelerator 后，排除编辑键的应用转发没有恢复访客的 Chromium 编辑动作。Vim 不拥有网页/地址栏的按键。修复由访客直接执行编辑，宿主在自定义命令未命中后执行有限原生编辑动作；共享文档历史与 Vim Control 键保留。
- 钥匙串：开始误用尚无隔离修复的已安装旧包，临时 profile 触发迁移；后续只使用包含 `--use-mock-keychain` 跳过逻辑的签名新包。迁移已有一致密钥时不重写 ACL。没有要求用户为测试输入密码。

验证：core/server/web/desktop 类型、642 单元、21 Chromium 浏览器通过。Mac 0.1.91 固定证书实包剪贴板通过（Vim 开关、地址栏 CDP/native sendInputEvent、网页 input/textarea/contenteditable 的粘贴/全选/复制/剪切/撤销、菜单、Markdown Insert 与共享撤销、Vim Control+V、自定义绑定优先与 IPC allowlist）。命令行 osascript/CGEvent 被现有权限阻止，改用已授权的桌面操作通道：对隔离实包地址栏与网页 input 实际执行 Command+V，AX 显示预期值，原生 harness 同时读回确认。未新增系统权限，也未把 sendInputEvent 等同于实体硬件按键。

最终交付：

- 运行源码 `89f14074c51efdaa472fc2753abcc3b1860acf5a` 已提交并推送 origin/main；包含此前遗留的钥匙串隔离/ACL 与公式测试改动。验收后补提交测试焦点/复制哨兵和交付记录。
- GitHub 正式 Release `v0.1.91`（ID 457990481，latest，非预发布）七资产与本地产物名称/字节数一致：Mac arm64 DMG/ZIP/blockmap/latest-mac；Windows x64 NSIS/blockmap/latest。Android 保持 0.1.90。
- Windows OMEN 隔离导出精确源码构建，FileVersion 0.1.91 / ProductVersion 0.1.91.0；Session 1 顺序运行 clipboard、native-shortcuts、完整 WebViewer 三项全部 exit0。未替换 Windows 日用安装。原主检出已有 AGENTS.md 改动保留。
- Mac 最终发布包 clipboard 专项再次通过；完整 WebViewer/用户脚本（含真实自动更新调度、扩权审阅）和原生快捷键均通过。首次访客焦点断言因窗口不在前台失败，显式获取测试前台后完整通过；未修改应用焦点逻辑。
- `/Applications/Shale.app` 已正常退出旧版后替换为 0.1.91；固定 Local Development Code Signing、`io.github.alexbeatsz.shale`、certificate leaf/deep/strict 通过。桌面操作通道重新打开后恢复原笔记标签与 ChatGPT 会话，`http://127.0.0.1:53158/healthz` 返回 ok。新隔离包和这次日用启动没有密码提示。
- 清理旧本地构建和升级备份、一次性 UI harness；OMEN 保留当前版本三资产后删除隔离源码/archive/一次性计划任务，临时测试 Vault/profile 均由 harness 清除。
