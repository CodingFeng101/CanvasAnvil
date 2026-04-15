<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>面向 Flow、CAD 与 PPT 的多画布 AI 创作平台。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja-JP.md">日本語</a> ·
  <a href="README.ko-KR.md">한국어</a> ·
  <a href="README.fr-FR.md">Français</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v1.0.1-2563eb?style=for-the-badge" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-Flow%20%7C%20CAD%20%7C%20PPT-0f766e?style=for-the-badge" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-7c3aed?style=for-the-badge" />
</p>

> CanvasAnvil 将流程图生成、CAD 工作流和 PPT 制作整合在同一个工作空间中。

## ✨ 产品概览

| 画布 | 聚焦能力 | 常见产出 |
| --- | --- | --- |
| `Flow` | 基于 draw.io XML 的生成与局部编辑 | 流程图、系统图、逻辑图 |
| `CAD` | 面向室内设计的工作流规划与分析 | 分析板、2D 平面图、渲染任务、BOM |
| `PPT` | 结构化幻灯片生成与图片优先迭代 | 演示文稿、页面视觉稿、多格式导出 |

## 🚀 本次更新

- PPT 现在改为图片优先工作流
- 在交互区里的微调和重新渲染，会直接重新生成页面图片，不再在创建阶段提前处理可编辑文字层
- 导出拆分为 `PDF`、`图片版 PPT`、`可编辑 PPTX`
- 文字识别、去字底图和文字回填只会在导出 `可编辑 PPTX` 时触发
- 上传模板和隐藏预设模板的偏好现在通过 IndexedDB 在本地持久化保存

## 🖼️ 画布预览

<table>
  <tr><td width="680" align="center"><strong>Flow 画布</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Flow 画布" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>CAD 画布</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="CAD 画布" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>PPT 画布</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="PPT 画布" width="680" /></td></tr>
</table>

## 🌐 在线体验

- [打开 CanvasAnvil](https://canvasanvil.codingfgd.asia)

## 🎬 视频教程

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [抖音](https://v.douyin.com/JwlwhmE6R40/)

## 🧩 能力概览

- `Flow`：基于 draw.io XML 的流程图生成与局部编辑
- `CAD`：室内工作流规划、分析板、2D 平面图、渲染任务与 BOM
- `PPT`：结构化幻灯片生成、图片优先迭代、模板持久化与多格式导出

## ⚡ 快速开始

1. 安装依赖

```bash
npm install
```

2. 启动本地开发

```bash
npm run dev
```

默认地址：`http://localhost:5173`

3. 运行类型检查

```bash
npm run check
```

4. 构建生产版本

```bash
npm run build
```

## 🛠️ 常用命令

- `npm run dev`：启动 Vite 开发服务器
- `npm run dev:full`：同时启动 Web 和 API 开发服务
- `npm run dev:web`：启动前端开发服务
- `npm run dev:api`：启动 API 开发服务
- `npm run check`：运行 TypeScript 检查
- `npm run lint`：运行 ESLint
- `npm run build`：生产构建
- `npm run preview`：预览构建结果
- `npm start`：启动 API 服务

## 🧪 开发说明

- AI 配置从本地应用设置中读取，也可以接入自定义模型服务
- PPT 本地开发依赖本地 `/api/ppt-ai` 代理路由
- 如果修改了 `vite.config.ts` 中的本地 API 路由映射，需要重启开发服务器

## 🗂️ 项目结构

```text
.
├── agent/                      # Agent Prompt 与子 Agent 规范
├── public/                     # 静态资源
├── src/
│   └── workspaces/
│       ├── flow/               # Flow 画布
│       ├── cad/                # CAD 画布
│       └── ppt/                # PPT 画布
├── api/                        # 本地 API 路由入口
└── README.md
```

## 🔗 来源与集成

- Flow 画布：集成并扩展自 [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT 画布：集成并扩展自 [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD 画布：项目自研，包含 agent 工作流、2D SVG 编辑、渲染编排和 BOM 链路

## 📚 文档

- 部署说明：[deploy/README.md](deploy/README.md)

## 📮 联系方式

可扫描下方微信二维码联系作者。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
