# 分组快捷键改用实体Control — 2026-11-25

PRD1.67，桌面/Android0.1.97。

实际Mac Vault的Option+Shift+Z/X已自定义为editor:focus-left/right，优先于0.1.95/0.1.96的新增默认键，隔离空配置测试漏掉了这一点。用户明确要求改为Control，Windows暂不设置。

已通过运行中应用 `/api/settings/hotkeys` 的revision校验写入：Mac两个分组命令为PhysicalCtrl+Shift+Z/X，Windows为[]。原Option窗格绑定保留；同一文件经正常同步/配置广播生效，没有改平台全局键盘配置。真实文件解析按平台核对，Mac两组Control键只属于分组，Windows分组无绑定。

源码移除分组命令默认Option键，新Vault不自动分配；现有已保存的用户绑定继续由同步文件拥有。分组命令声明workspace作用域，Vim普通/可视模式也可执行，编辑器专属及Vim其他组合仍归原拥有者。

## 验证

- 115文件、668单元通过；web/desktop类型、server/web生产构建通过。
- 19浏览器通过：8分组、10既有Vim、1跨平台配置。检查实际Vim Normal/Visual/Insert中的Control切换、Command不误触发、Windows为空、原Option保留，以及单页/分屏/侧栏真实正文。
- 原生生命周期夹具Mac使用PhysicalCtrl并同时保留原Option聚焦；Windows仅在隔离自动化Vault临时绑定Alt检查自定义绑定管线，生产Windows仍未分配。Mac0.1.97固定签名/certificate leaf/deep/strict、后台lifecycle与完整WebViewer通过；Control宿主及真实访客before-input-event转发均显示目标页面且不重载。OMEN日用配置经API回读确认两个Windows分组绑定为空。两端正式包、发布及五设备原位更新已完成，Android服务健康仍待验收。

- Windows最终包7分组浏览器通过（Mac专属Vim实体Control用例按要求跳过1项），五组完整原生lifecycle/WebViewer/presentations/virtual-documents/clipboard全部通过。
- Android生产assembleRelease/lintRelease、原V2证书、arm64非调试与16KB对齐通过；K70/平板已用-r --user current原位更新0.1.97/code97，首次安装时间保留。K70新进程17339/starting41621健康503，平板29166/starting33327健康超时，服务健康及实际触摸/同步仍未验收。K70 mDNS名称变化时用当前已认证在线transport继续，未重启ADB或改变配对。
- Mac日用0.1.97启动、healthz60429、Vault/标签/两侧/分屏保留；重启后API再次回读，Mac实体Control与Windows空覆盖保留。

## 发布与交付

- 运行源码efc0ccc719e8b03787e6aeaa06631bc5d5b99e47；v0.1.97 Release458436083公开/latest七资产，android-v0.1.97 Release458441799公开预发布一生产APK，标签源码与每项名称/大小/uploaded状态核对通过。
- Mac0.1.96→0.1.97，health60429；OMEN0.1.96→0.1.97，NSIS退出0/health58594/Vault与标签保留；ROG0.1.97启动并保留未选Vault。K70/平板安装与健康边界见上，不用安装成功替代服务验收。
- 本机仅保留desktop/release/0.1.97与android/release/0.1.97，旧0.1.96构建已清理；隔离Windows源码/runtime/签名副本及一次性计划任务已删除，原签名与历史Release保留。证据在Mac `/tmp/.agents/shale-tab-control-0.1.97/` 与OMEN Temp/.agents/shale-tabs-0.1.97-results。
