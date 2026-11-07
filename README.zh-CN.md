<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>面向图表绘制、室内设计、PPT 演示与图片创作的 AI 多画布平台。</strong>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v2.2.0-blue" />
  <img alt="license" src="https://img.shields.io/badge/license-MIT-green" />
  <img alt="React" src="https://img.shields.io/badge/React-18.3-61dafb?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178c6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6.3-646cff?logo=vite&logoColor=white" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-4-orange" />
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-brightgreen" />
</p>

<p align="center">
  <a href="#创作画布">创作画布</a> |
  <a href="#ppt-演示画布">PPT 展示</a> |
  <a href="#视频教程">视频教程</a> |
  <a href="#skills">Skills</a> |
  <a href="#快速开始">快速开始</a> |
  <a href="README.md">English</a>
</p>

## 🗓️ 最近更新

### 2026-11-06

**✨ 新增**

- **PPT 演示画布支持导出可编辑 PPTX**
  - 导出菜单新增「导出可编辑 PPTX」，和「导出 PDF」「导出图片版 PPT」并列。
  - 以前导出的 PPT 每页都是一整张图片，现在每页会拆回可以直接修改的图层，自下而上依次是：
    - **干净底图**：去掉文字、卡片、图标后的纯背景，渐变、波浪、建筑等背景元素保留在这一层；
    - **原生形状**：卡片底框、分隔线、圆点、圆环、色条、箭头等都是 PowerPoint 自带的形状，可以直接改颜色、大小、圆角；
    - **图标和插图**：由生图模型按原图重新绘制，背景透明，可以单独移动、缩放、替换；
    - **可编辑文字**：标题、正文、列表都在文本框里，保留原来的位置、字号、颜色和粗细。
  - 同一套风格的多页可以共用一张底图；多页重复出现的图标和卡片只绘制一次，整套 PPT 风格统一。

- **导出设置框**
  - **选择页面**：列出整套幻灯片的页码和标题，可以全选、全不选或逐页勾选，只导出需要的页。
  - **返工次数**：每页最多返工 3–10 次，默认 3 次。每页做完都会和原图对比检查（整体相似度、局部差异区域、文字位置和字号、抠图残留的绿边），不过关就自动修改再查；通过检查的页面提前结束，不会白白多跑。
  - 填写超出范围的次数时，会自动调整到最近的允许值。

- **导出运行窗口**
  - 点击开始后，导出按钮下方弹出固定高度的运行窗口，像 agent 运行一样实时滚动显示整个过程。
  - 按顺序列出 7 个步骤：识别文字 → 规划底图 → 生成干净底图 → 分析页面元素 → 生成图标与插图 → 逐页重建 → 合成 PPTX。每一步显示等待、进行中、完成或失败的状态和用时。
  - 每一步下面有带时间的明细，例如「第 1 页识别出 12 段文字」「底图 g1：第 1、2 页共用」「第 2 页：第 1 轮检查未通过（相似度 78.5，6 处问题），继续修改」。
  - 「逐页重建」按页分组，多页同时进行时各页的进度互不混在一起。
  - 正在进行的步骤和页面自动展开，完成后自动收起；手动展开或收起过的，保持你的选择。内容超出窗口高度时可以向下滚动，有新内容时自动滚到最新，往上翻看时不会被打断。
  - **中间产物可以点开看**：生成的干净底图、图标素材表、切出来的每个图标和插图、每页每一轮的成品图，以及标出问题区域的检查对比图，都以缩略图显示，点击直接放大查看。

- **`ppt-skill` 新增 `editable_pptx` 导出模式**
  - Claude Code、Codex 等编程助手也能把整套幻灯片导出为可编辑 PPTX，和应用里的导出走同一套流程、同样的检查标准。
  - 新增脚本 `scripts/export-editable-pptx.mjs`（`npm run export:editable-pptx`），读取和图片版 PPT 相同的幻灯片清单，可以设置每页返工次数和中间文件目录；JPG、WebP 等格式的幻灯片会自动转换。
  - 运行时在终端逐步打印进度和每张中间图的路径；完成后，输出文件旁边的 `<文件名>.editable-run/` 目录保留底图、素材表、每轮成品和检查图。
  - 生图模型和其他导出模式一样，读 skill 里的 `config/image-provider.json`，配置方式保持一致。
  - `SKILL.md` 和 `references/export-modes.md` 补充了这个模式的适用场景、完整步骤、设置和依赖，助手会在开始前提醒用户导出耗时较长。

**⚡ 改进**

- 导出期间可以把运行窗口收起成导出按钮旁的计时小标签（显示已用时间），继续编辑其他页面，点一下标签就能重新展开。
- 导出完成后窗口自动关闭，文件自动下载；导出失败时窗口保留，显示失败在哪一步和原因。
- 刷新页面、关掉再打开页面或服务重启后，正在进行的导出会自动接上，之前的步骤明细和中间产物都还在，完成后照常下载。
- 背景识别更准：分析页面元素时会拿干净底图对照，背景里的渐变、波浪、建筑不会被误当成元素重复绘制。
- 底图比例和原图不一致时会自动重画，不会拉伸变形。
- 图标素材表画出来的数量不对时会作废重画，不会把错位的图标切进 PPT。
- 已有一个导出在运行时再点导出，会提示「已有一个导出任务在运行，请等它结束」，不会互相干扰。

**📌 说明**

- 可编辑导出需要逐页生成和检查，比较慢，通常需要 10 分钟以上；同一时间只运行一个导出任务。
- 图标和插图是按原图重新绘制的，设计一致，但不会和原图逐像素相同。
- 需要安装 slide-alchemy skill、Python 和 Microsoft PowerPoint（用于导出预览做检查），并配置一个对话模型和一个生图模型，详见 `skill/ppt-skill/references/export-modes.md`。

### 2026-11-05

**🐛 修复**

- **图表画布刷新后「矫正」步骤消失**：图表画布会自动矫正模型给出的布局，并在对话里以「思考 → 绘制 → 矫正」三步显示。以前矫正结果只存在内存里，刷新页面后第三步就没了。
  - 现在每张图的矫正结果都会和对话一起保存在本地，刷新后矫正步骤和矫正前后的布局体检分都还在；
  - 最新一张图还保存了矫正前后两个版本，刷新后仍能一键切回模型原图或矫正版。
- **刷新时正在进行的矫正卡住**：刷新时如果矫正还没完成，恢复后会显示为已完成，不会一直停在「进行中」。

<p align="center">
  <strong>⭐ 如果 CanvasAnvil 对你有帮助，欢迎给仓库点个 Star，也可以 Fork 一份继续扩展你自己的画布工作流。</strong>
</p>

> CanvasAnvil 把图表、室内设计、PPT 制作和自由的图片创作整合在一个工作区里，界面支持中英文。

## 🔷 图表绘制画布

将结构化提示快速转成清晰图表，适合学术框架、系统架构、实施路线和课程导图，并在同一画布中持续迭代布局、节点关系与说明文案。

### 成品实例

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/01.png" alt="图表示例：学术研究框架图" width="100%" /><br/><strong>学术研究框架图</strong></td>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/02.png" alt="图表示例：智能问答系统架构图" width="100%" /><br/><strong>智能问答系统架构图</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/03.png" alt="图表示例：项目实施路线图" width="100%" /><br/><strong>项目实施路线图</strong></td>
    <td width="50%" align="center"><img src="public/examples/readme-previews/diagram/04.png" alt="图表示例：课程设计思维导图" width="100%" /><br/><strong>课程设计思维导图</strong></td>
  </tr>
</table>

## 🏠 室内设计画布

把规划板、2D 布局、材质方案、渲染编排和材料清单输出串成一条完整的室内设计交付链路。

### 成品实例

<table>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/01.png" alt="装修平面布置图" width="100%" /><br/><strong>装修平面布置图</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/02.png" alt="地面铺装图" width="100%" /><br/><strong>地面铺装图</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/03.png" alt="顶棚平面图" width="100%" /><br/><strong>顶棚平面图</strong></td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/04.png" alt="墙体定位图" width="100%" /><br/><strong>墙体定位图</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/05.png" alt="机电综合图" width="100%" /><br/><strong>机电综合图</strong></td>
    <td width="33.33%" align="center"><img src="public/examples/cad/06.png" alt="立面索引图和室内立面图" width="100%" /><br/><strong>立面索引图 + 室内立面图</strong></td>
  </tr>
  <tr>
    <td width="33.33%" align="center"><img src="public/examples/cad/07.png" alt="节点详图" width="100%" /><br/><strong>节点详图</strong></td>
    <td width="33.33%" align="center"></td>
    <td width="33.33%" align="center"></td>
  </tr>
</table>

## 📑 PPT 演示画布

通过“先大纲、后视觉”的方式生成完整演示文稿，并导出 PDF 或图片版 PPT。模板决定整套的风格与配色，每一页的版式按内容单独设计。

### 成品实例

<table>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt1.png" alt="AI 时代的高效内容创作整套预览" width="100%" />
      <strong>AI 时代的高效内容创作</strong>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt2.png" alt="智能协作驱动未来增长整套预览" width="100%" />
      <strong>智能协作驱动未来增长</strong>
    </td>
  </tr>
  <tr>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt3.png" alt="AI 驱动业务创新整套预览" width="100%" />
      <strong>AI 驱动业务创新</strong>
    </td>
    <td width="50%" align="center" valign="top">
      <img src="public/examples/readme-previews/ppt/ppt4.png" alt="绿色低碳转型与智慧园区建设整套预览" width="100%" />
      <strong>绿色低碳转型与智慧园区建设</strong>
    </td>
  </tr>
</table>

## 🖌️ 自由画布

一块用来做图的白板：用一句话描述画面，图片就生成到画布上；在图上圈出要改的地方、旁边写上要求，点一下魔棒，修改后的新版本会出现在原图旁边。每个版本都会保留，版本条里能看到每一版改了什么、什么时候改的。

### 成品实例

<table>
  <tr>
    <td width="50%" align="center"><img src="public/examples/canvas/01.svg" alt="自由画布：一句话生成图片" width="100%" /><br/><strong>一句话生成图片</strong></td>
    <td width="50%" align="center"><img src="public/examples/canvas/02.svg" alt="自由画布：在图上圈画标注" width="100%" /><br/><strong>在图上圈画标注</strong></td>
  </tr>
  <tr>
    <td width="50%" align="center"><img src="public/examples/canvas/03.svg" alt="自由画布：按标注生成新版" width="100%" /><br/><strong>按标注生成新版</strong></td>
    <td width="50%" align="center"><img src="public/examples/canvas/04.svg" alt="自由画布：版本对比" width="100%" /><br/><strong>版本对比</strong></td>
  </tr>
</table>

## 🎨 创作画布

| 画布 | 核心能力 | 常见输出 |
| --- | --- | --- |
| `图表绘制` | 结构化图表生成与局部编辑 | 流程图、架构图、逻辑图 |
| `室内设计` | 室内方案规划、图纸协同与交付打包 | 概念板、二维图纸、渲染任务单、材料清单 |
| `PPT 演示` | 结构化演示文稿生成与导出 | 演示文稿、汇报幻灯片、提案稿 |
| `自由画布` | 白板上的文生图与按标注改图 | 海报、插画、同一张图的修改版本 |

## 🌐 在线使用

当前在线访问地址：

- 🔗 CanvasAnvil：[https://canvasanvil.codingfgd.asia](https://canvasanvil.codingfgd.asia)

## 🎬 视频教程

每个画布一段 B 站完整演示。在应用里，首页顶部的「教程」按钮可以直接播放。

<table>
  <tr>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV1wyxs66EEd"><img src="public/tutorials/diagram.jpg" alt="一句话画出整张架构图，改图只动你说的地方" width="100%" /></a><br/><strong>🔷 图表绘制</strong> · <a href="https://www.bilibili.com/video/BV1wyxs66EEd">一句话画出整张架构图，改图只动你说的地方</a></td>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV1ryxs6zEtN"><img src="public/tutorials/cad.jpg" alt="一句需求出整套装修图纸，还能 3D 漫游" width="100%" /></a><br/><strong>🏠 室内设计</strong> · <a href="https://www.bilibili.com/video/BV1ryxs6zEtN">一句需求出整套装修图纸，还能 3D 漫游</a></td>
  </tr>
  <tr>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV1oGxs6hEf6"><img src="public/tutorials/ppt.jpg" alt="一句话生成 8 页 PPT，200 多套模板随便挑" width="100%" /></a><br/><strong>📑 PPT 演示</strong> · <a href="https://www.bilibili.com/video/BV1oGxs6hEf6">一句话生成 8 页 PPT，200 多套模板随便挑</a></td>
    <td width="50%" align="center"><a href="https://www.bilibili.com/video/BV17Gxs6aETm"><img src="public/tutorials/canvas.jpg" alt="圈哪里改哪里，AI 改图不动其他地方" width="100%" /></a><br/><strong>🖌️ 自由画布</strong> · <a href="https://www.bilibili.com/video/BV17Gxs6aETm">圈哪里改哪里，AI 改图不动其他地方</a></td>
  </tr>
</table>

## 🧰 Skills

CanvasAnvil 为每个画布都提供了专用本地 skill，用来保证工作流稳定、输出一致，而不是把所有任务都塞进同一条通用提示链。

- `diagram-skill` · 图表生成与打包
  输出整洁的图表资源，并默认跳过独立 HTML 预览。
- `cad-skill` · 室内设计交付流程
  导出图纸打包结果与 CSV 材料清单，便于后续交付。
- `ppt-skill` · 完整演示稿生产
  强制先确认大纲，再生成整套演示稿，并导出可编辑 PPT、PDF 或图片版 PPT。

所有 skill 默认使用宿主文本模型。只有生图能力需要单独配置图片生成供应商。
可编辑 PPTX 导出例外：它通过 slide-alchemy agent 流程逐页重建，还需要单独配置一个对话模型，并依赖 slide-alchemy skill、Python 和 PowerPoint（见 `skill/ppt-skill/references/export-modes.md`）。

## 🚀 快速开始

1. 安装依赖

```bash
npm install
```

2. 启动本地开发

```bash
npm run dev
```

默认访问地址：`http://127.0.0.1:8001`

CanvasAnvil 以单服务部署，详细配置见 [deploy/README.zh-CN.md](deploy/README.zh-CN.md)。

3. 运行类型检查

```bash
npm run check
```

4. 构建生产版本

```bash
npm run build
```

## 🧪 常用命令

- `npm run dev`：在 `8001` 端口启动应用
- `npm run check`：执行 TypeScript 检查
- `npm run lint`：运行 ESLint
- `npm test`：运行测试
- `npm run build`：构建生产版本

## 📝 开发说明

- 所有模型调用都走 OpenAI 的 HTTP 协议。想换厂商，只要在设置里把 Base URL 指向它的 OpenAI 兼容端点即可，没有厂商列表可选。
- AI 配置读取本地应用设置；文本通道和生图通道分别配置。
- 本地开发依赖 API 服务提供 `/api/chat` 和 `/api/ppt-ai`。
- 修改 `vite.config.ts` 中的本地 API 路由后，需要重启开发服务。
- `server/**` 使用相对路径导入：`vite.config.ts` 会 import 开发中间件（这样 `npm run dev` 一条命令就带 API），而 Vite 用纯 Node 加载自己的配置文件，不认 `@/` 别名。
- 设置 `PROMPT_LOG_DIR` 可把拼装好的提示词写入磁盘；默认关闭，因为日志里含有用户内容。

## 📚 文档

- 架构说明：[docs/architecture.md](docs/architecture.md)
- 交接文档：[docs/HANDOFF.md](docs/HANDOFF.md)
- 部署说明：[deploy/README.md](deploy/README.md)

## ⚖️ 许可证

CanvasAnvil 采用 MIT 协议发布。
完整协议内容请查看 [LICENSE](LICENSE)。

## 💌 联系方式

- `3524962421@qq.com`

## ⭐ Star 历史

[![Star History Chart](https://api.star-history.com/svg?repos=CodingFeng101/CanvasAnvil&type=Date)](https://star-history.com/#CodingFeng101/CanvasAnvil&Date)
