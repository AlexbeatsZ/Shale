# 中心同步与断线恢复验收

Shale 应用 0.1.100 运行源码 8f1c016，独立服务 0.4.0 运行源码 d2b5ca2。服务包固定 file-sync-core 0.2.0（8d093f4）。本次库内容、token 和操作均由隔离夹具创建。

## 源码与协议

- server、web、desktop 类型检查通过。全量 114 个测试文件、672 项通过。5 项 Chromium 同步界面用例通过，状态栏覆盖首次、入队滞后、待收、待发、恢复、冲突及完整完成。
- 采用相同规划轨迹验证无祖先首连歧义、删除、重复操作、冲突和编辑闸门；旧服务可回到 v1 全清单。持久分页测试使用首轮断线、重启和增量续跑；分块上传和 Range 下载测试在首次分块应答和下载流中注入失败。按路径恢复不影响无关文件。
- 在本机 Node 上，构建 4,000 个待收路径索引并查询 20,000 个候选路径用时 9 ms，命中 4,000 个。未在手机测量。
- 独立服务 14 项通过，包含网关、CLI 和备份。ZIP 与 tar.gz 分别解包至仓库之外，无需安装依赖，通过启动、读写、重启和回执重放两项测试。独立包客户端验证 29 项通过；磁盘分页夹具使用仓库指定的 30 秒单项时限。

## macOS 正式包

- Apple Silicon 应用固定标识 io.github.alexbeatsz.shale，固定证书 Local Development Code Signing。codesign 指定要求含 certificate leaf，deep/strict 签名验证通过。
- 使用实包内 Electron 的 Node 入口启动两个独立客户端与 ZIP 解包的 0.4.0 服务。11,468,800 字节测试附件上传并在另一端逐字节比对，另一端修改的 Markdown 回到首端，再由删除产生可观察的 tombstone，两个客户端均到版本 3，待收/待发为零。
- 用真正的生产渲染包验证状态栏可见文字。注入首次、待入队、待收、待发和完整状态，分别显示等待首次同步、待继续同步、待接收、待发送、已同步。完整生产启动、编辑保存、模板、MCP、阅读模式、附件保护和合并表格回归通过。
- 两组 macOS Electron 后台回归通过，覆盖 WebViewer、用户脚本更新、页面与草稿生命周期。未执行前台真实输入法和系统焦点操作。
- 用户要求暂停的 OMEN 用户 Vault 没有执行恢复或冲突裁决。真机 Android 实际库收敛与安装后健康不在此次验收范围。

## Windows 与 Android 正式包

- Windows x64 安装器 ProductVersion 为 0.1.100。生产包启动回归通过，覆盖本地库、编辑保存、模板、附件和主页；两项实包服务同步回归通过。后台 WebViewer 生命周期检查通过，保留了访客页面、草稿和滚动位置。
- Windows 额外 WebViewer 冒烟未通过：后台拖放时等候 `.pane-drop-indicator` 可见，5 秒后超时。现有结果无法区分测试环境与实际窗口行为，本轮没有前台拖放验收。Windows 构建未作 Authenticode 签名。
- Android arm64-v8a 构建与 release lint 通过；包名 io.github.alexbeatsz.shale，版本 0.1.100 / 100，不可调试。apksigner 验证成功，签名证书指纹与 0.1.99 相同。未安装到设备，未验收真机同步。

## 发行核对

- GitHub 已发布桌面正式版 [v0.1.100](https://github.com/AlexbeatsZ/Shale/releases/tag/v0.1.100)（latest，七个附件），另发 [Android 预发布](https://github.com/AlexbeatsZ/Shale/releases/tag/android-v0.1.100)（一个 APK）。两个远程标签同指 8f1c0166a869b2b96933e872bf6a47b91e6964fd。
- 八个线上附件均为 uploaded，摘要与出包文件逐项相符。线上 latest-mac.yml 与 latest.yml 均报 0.1.100，分别指向本版 arm64 ZIP 和 x64 安装器；两份清单的文件大小与 SHA-512 均与实物一致。
