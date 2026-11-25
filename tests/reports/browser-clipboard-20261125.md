# 网页与地址栏剪贴板 — 2026-11-25

- 用户范围：地址栏和网页正文输入不能粘贴；排查 Vim；核实此前部署；提交已有未提交源码，并修复测试反复询问钥匙串密码。
- 旧安装：本机 `/Applications/Shale.app` 确认为 0.1.90，GitHub v0.1.90 七资产已发布；上次应用快捷键转发确实已进入安装包，但其验收未覆盖网页原生剪贴板。
- 旧包复现：Vim 关闭/开启均出现网页 input、textarea、contenteditable 的快捷键粘贴和文本复制失败；菜单粘贴成功。地址栏 CDP 复制/粘贴成功，不能据此推断系统按键可用。测试只使用临时 Vault/profile 和本地 HTTP 夹具，剪贴板格式保存在进程内并恢复。
- 根因：原生菜单去掉 role/accelerator 后，排除编辑键的应用转发没有恢复访客的 Chromium 编辑动作。Vim 不拥有网页/地址栏的按键。修复由访客直接执行编辑，宿主在自定义命令未命中后执行有限原生编辑动作；共享文档历史与 Vim Control 键保留。
- 钥匙串：开始误用尚无隔离修复的已安装旧包，临时 profile 触发迁移；后续只使用包含 `--use-mock-keychain` 跳过逻辑的签名新包。迁移已有一致密钥时不重写 ACL。没有要求用户为测试输入密码。

验证：core/server/web/desktop 类型、642 单元、21 Chromium 浏览器通过。Mac 0.1.91 固定证书实包剪贴板通过（Vim 开关、地址栏 CDP/native sendInputEvent、网页 input/textarea/contenteditable 的粘贴/全选/复制/剪切/撤销、菜单、Markdown Insert 与共享撤销、Vim Control+V、自定义绑定优先与 IPC allowlist）。系统 osascript/CGEvent 按键因本机未授予权限未完成，不能等同于 native sendInputEvent。

发布与部署仍在进行，后续补记最终结果。
