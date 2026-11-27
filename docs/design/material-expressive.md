# Material 3 Expressive 实验前端

## 范围与依据

2026-11-26 用户要求建立分支，完全按照 Google 设计规范尝试新前端。分支 `codex/material-3-expressive` 的共享渲染器用于桌面与 Android；试验独立预发布，日用安装保持现状。业务状态、文档身份、同步与宿主桥沿用原实现，不复制另一套应用。

官方规范是依据，社区实现仅作为经过核对的组件移植来源。Material 规范允许产品选择主题颜色和适合内容的排版，不表示每个组件都必须使用花朵或持续运动。

| 项目 | 来源与采用方式 |
| --- | --- |
| 色彩角色 | Google Material Color Utilities `SchemeTonalSpot`，seed `#456B55`，标准对比度 0，自动生成深浅两套角色；`web/scripts/generate-material-theme.mjs` 可重现 |
| 排版 | Material 3 type scale；Roboto variable 本地打包，中文沿用本地 Noto Sans SC；文档阅读字体与字号保持用户设置 |
| 图标 | Google Material Symbols Rounded 的官方 SVG，应用 UI 使用本地路径；笔记内插件/Lucide 图标契约不变 |
| 形状 | 4/8/12/16/20/28/32px 与 full 形状；强调动作使用胶囊，surface 使用大圆角，列表选中使用 secondary container |
| 状态 | primary/on-primary、container/on-container 成对；hover 8%、focus/press 10% 状态层，明显的键盘焦点；禁用与普通态区分 |
| 加载 | `@kyralabs/m3e-elements` 的 Loading Indicator，源于 AndroidX/Compose 几何形变；使用真实忙碌状态，不在空闲主页循环播放；减少动态效果时固定形状 |
| 自适应 | 窄屏保留既有侧栏抽屉，48px 触控目标；侧栏内主页与中央主页提供相同动作；桌面保留所有分屏/标签拖动 |

参考来源：

- https://m3.material.io/styles/color/roles
- https://m3.material.io/styles/typography/type-scale-tokens
- https://m3.material.io/styles/shape/overview
- https://m3.material.io/styles/motion/overview
- https://m3.material.io/components/navigation-rail/overview
- https://m3.material.io/components/buttons/overview
- https://m3.material.io/components/loading-indicator/overview
- https://github.com/material-foundation/material-color-utilities
- https://github.com/google/material-design-icons
- https://github.com/kyra-labs/m3exp-web

## 界面组织

中央 Homepage 采用产品名、简明任务提示、填充式新建动作、tonal 打开动作和两个次级目的地。所有内容来自真实工作区；不编造最近文件或同步状态。侧栏以同一组件的紧凑布局显示相同动作。

顶部标签沿用原有 DOM 和拖动身份，仅改视觉密度与选中状态。两侧浮动面板沿用当前开关/抽屉语义，竖排按钮使用选中容器与文字标签。文件树与文档正文保持各自滚动。

设置采用导航列表、圆角分组与 Material switch；搜索/命令面板使用 surface container high。原生系统标题栏仍服从桌面宿主，设置对话框使用一致的可聚焦关闭按钮。

## 实现边界

- `material-tokens.css` 为生成文件，不能手改；公共控件与布局在 `material-expressive.css`。旧样式继续承担编辑器/阅读器的内容排版，M3 覆盖层通过语义角色映射已有 CSS 变量。
- 只导入社区库的 Loading Indicator 入口与对应 CSS，避免引入 React Aria/Motion 和整套组件全局 reset。
- 字体、图标和加载代码随包交付，运行不依赖 CDN。
- 窄屏、深浅色与减少动态效果需真实浏览器验证；桌面网页浏览/脚本导入与自动更新必须使用最终 Mac 包回归。
- 不把这一实验宣称为 Google 官方实现或完整合规认证。未逐一验收的次级对话框与插件自定义 UI 应明确记录。

## 预览与维护

- `npm run preview:material`：启动已构建的 Mac arm64 实包，使用临时 profile、示例 Vault 和模拟钥匙串；关闭后清理全部预览数据。
- `npm --workspace web run generate:material`：用锁定的 Google MCU 0.3.0 重建色板。0.4.0 在本机 Node 26 的原生 ESM 路径解析中缺少扩展名，不能直接运行此生成器；不能因此手调颜色。
- 新增字体与组件的第三方许可证随 `web/public/licenses/material-expressive.txt` 打包，图标来源与原许可证保留在 `web/src/assets/icons/material-symbols/`。
