# 合并标签组布局（0.1.104 / PRD 1.76）

## 范围与根因

用户撤回“同一个标签加入多个颜色分组”的需求，保留现有单颜色分组、成员加入顺序、快捷键和工作区格式。本轮只修复分屏合并标签组导致的后续标签及新建「+」排位问题。

`.tab-split-group` 原为 `min-width:0`，可以压得比两个内部标签、分屏图标、间距与内边距之和更窄；子标签仍有64px最小宽度，越过组的边界。320px复现中组右边界122px，成员实际右边界199px。后续单位按过小的组边界排位，标签条外的「+」因此可能遮住尚未容纳完的内容。

修复仅将组最小宽度设为 `min-content`，继续允许正常压缩，整体溢出交给已有 `.tab-scroll`。活动/暂存、左右/上下分屏使用同一个样式规则；无需新增测量、监听器或状态。发行源码 `0dd3447d5e0ef10bf850be868640df37b0282086`，版本0.1.104。

## 验证

- 新增布局回归在修复前稳定失败：199px成员超出122px组边界。
- 修复后Mac标签与分屏浏览器54/54通过。新增用例覆盖320/480/800/1480px、左右/上下分屏、活动/暂存组，直接检查成员包围盒、滚动区和「+」的边界，并实际点击「+」验证新Homepage和暂存分屏。
- Windows现有Edge运行标签浏览器8/8通过，Mac实体Control/Vim专属用例跳过1项；首次测试器默认headless shell缺失，没有下载或安装新浏览器，改用既有Edge后通过。
- web类型、core/web/server生产构建与桌面bundle检查通过；最终Windows包资源的真实server/renderer生产启动检查通过。
- Mac最终包WebViewer与生命周期两组通过（默认隐藏后台）：原入口、三处主页、脚本导入/自动更新/权限审阅、标签拖动、组内循环、网页实例/草稿/滚动/history与加载次数保留。后台结果不代表物理键盘、原生焦点或全屏验收。
- Windows最终包在ROG交互桌面（Session1）完整WebViewer及生命周期两组通过：网页快捷键/原生焦点、正文拖放、三处主页与标签归属、用户脚本文件/URL导入/定时更新/权限、工作区重启恢复、原访客实例/草稿/滚动/history/加载计数及循环切页均通过。SSH隐藏窗口模式首次点击中央「+」未生成Homepage，清理目录EBUSY又掩盖了断言；改为交互桌面复验后通过。只在隔离测试副本给临时目录删除加重试及失败日志，正式源码与产品未绕过点击逻辑。
- Mac固定证书 `Local Development Code Signing`，identifier `io.github.alexbeatsz.shale`，`codesign -d -r-`包含 `certificate leaf`，deep/strict通过。
- Android release assemble/lint通过，arm64、非调试，发行签名与0.1.103一致。首次2GiB Gradle打包出现OutOfMemoryError，本次命令设置4GiB和2个worker后通过，没有修改全局或项目默认JVM配置；临时签名副本由finally清理。

## 发布与部署

`v0.1.104`（Release ID460113103）正式发布/latest，含Mac arm64 DMG/ZIP/blockmap/latest-mac及Windows x64 NSIS/blockmap/latest共7资产；`android-v0.1.104`（ID460114353）预发布，含135,824,868字节生产APK。GitHub API核对发布状态、完整源码目标和8资产名称/大小/uploaded状态通过，未做无异常文件的额外哈希审计。

- Mac：0.1.103→0.1.104，固定签名、healthz、Vault选择及工作区关键字段保持通过。正常退出后替换并启动，验证后清理本轮旧app回滚副本。
- OMEN/ROG：Session1静默原位安装器退出0，0.1.103.0→0.1.104.0，Vault选择保持。安装前两台应用未运行，安装后继续停止；OMEN真实同步恢复继续按原要求暂停。
- K70/平板：`adb install -r --user current` 更新0.1.103→0.1.104/code104，首装时间分别保持2026-11-23 23:30:54、2026-11-23 23:32:04；本轮不扩展Android前台触摸/真实同步验收。

证据目录Mac `/tmp/.agents/shale-tab-layout-20261126/`，两台Windows同名Temp/.agents目录只保留脚本、日志与回执；隔离源码、临时签名副本、源码压缩包和远端临时安装包清理结果见对应cleanup回执。另一个任务的0.1.103构建由其负责清理。
