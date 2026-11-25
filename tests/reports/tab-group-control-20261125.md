# 分组快捷键改用实体Control — 2026-11-25

PRD1.67，桌面/Android0.1.97。

实际Mac Vault的Option+Shift+Z/X已自定义为editor:focus-left/right，优先于0.1.95/0.1.96的新增默认键，隔离空配置测试漏掉了这一点。用户明确要求改为Control，Windows暂不设置。

已通过运行中应用 `/api/settings/hotkeys` 的revision校验写入：Mac两个分组命令为PhysicalCtrl+Shift+Z/X，Windows为[]。原Option窗格绑定保留；同一文件经正常同步/配置广播生效，没有改平台全局键盘配置。真实文件解析按平台核对，Mac两组Control键只属于分组，Windows分组无绑定。

源码移除分组命令默认Option键，新Vault不自动分配；现有已保存的用户绑定继续由同步文件拥有。分组命令声明workspace作用域，Vim普通/可视模式也可执行，编辑器专属及Vim其他组合仍归原拥有者。

## 验证

- 115文件、668单元通过；web/desktop类型、server/web生产构建通过。
- 19浏览器通过：8分组、10既有Vim、1跨平台配置。检查实际Vim Normal/Visual/Insert中的Control切换、Command不误触发、Windows为空、原Option保留，以及单页/分屏/侧栏真实正文。
- 原生生命周期夹具Mac使用PhysicalCtrl并同时保留原Option聚焦；Windows仅在隔离自动化Vault临时绑定Alt检查自定义绑定管线，生产Windows仍未分配。最终实包验收/发布/部署进行中。
