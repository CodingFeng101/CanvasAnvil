# CanvasAnvil

Language: [中文](#zh) | [English](#en)

---

<a id="zh"></a>
## 中文

CanvasAnvil 是一个多工作台 AI 创作平台，用一句需求就能完成从方案到可交付物的生成与迭代。

### 能力总览（用户视角）

- `Flow`：流程图生成与局部编辑（draw.io XML）
- `CAD`：室内装修方案、2D 平面图、装修图与物料清单（BOM）
- `PPT`：演示文稿草稿生成与迭代编辑

### 典型使用路径

1. 输入需求
2. AI 生成初稿
3. 局部修改与迭代
4. 导出结果（图纸 / 清单 / 演示稿）

### 快速开始

1. 安装依赖
```bash
npm install
```
2. 启动开发环境
```bash
npm run dev
```
默认地址：`http://localhost:5173`

3. 类型检查
```bash
npm run check
```
4. 生产构建
```bash
npm run build
```

### 项目来源与说明

- Flow 工作台：基于 [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) 集成与增强
- PPT 工作台：基于 [banana-slides](https://github.com/Anionex/banana-slides.git) 集成与增强
- CAD 工作台：本项目自研（架构、Agent 工作流、2D SVG 编辑链路、BOM/装修图链路）

核心优化：

- 三工作台统一交互范式（聊天、代码块、一键应用到画布）
- 更稳定的 Agent 路由与重试机制
- CAD 专项能力（局部 patch / 全量 replace / BOM / 7 槽装修图）
- 跨工作台状态管理、版本管理和导出链路

### 核心能力（开发视角）

- Flow：对话生成流程图，支持 patch/replace，一键应用代码块，支持历史恢复
- CAD：`cad_plan` 方案生成、2D SVG 局部修改、装修图并发出图、BOM 导出
- PPT：结构化内容生成、页级增量编辑、图文流式生成与迭代

### 技术栈

- 前端：React 18 + TypeScript + Vite
- UI：Tailwind CSS + Radix UI + Lucide
- 图形引擎：Flow 使用 draw.io/diagrams.net；CAD 使用 SVG-Edit
- 模型接入：可配置多模型（Chat / Image）

### 常用脚本

- `npm run dev`：开发服务器
- `npm start`：生产启动（静态站点 + API）
- `npm run build`：生产构建
- `npm run check`：TypeScript 检查
- `npm run lint`：ESLint 检查

### 目录结构（关键部分）

```text
.
├─ agent/                      # CAD/Flow/PPT 的提示词与子智能体定义
├─ public/                     # 静态资源（含 SVG-Edit 等）
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # 流程图工作台
│     ├─ cad/                  # CAD 工作台（自研核心）
│     └─ ppt/                  # PPT 工作台
├─ api/                        # API 相关逻辑
└─ README.md
```

### 文档导航

- 部署说明：[`deploy/README.md`](deploy/README.md)

---

<a id="en"></a>
## English

CanvasAnvil is a multi-workspace AI creation platform that turns a single requirement into deliverables you can iterate on.

### Capability Overview (User View)

- `Flow`: flowchart generation and partial edits (draw.io XML)
- `CAD`: interior design plans, 2D floor plans, render tasks, and BOM
- `PPT`: presentation draft generation and iterative editing

### Typical Workflow

1. Enter your requirement
2. Generate a first draft with AI
3. Apply partial edits and iterate
4. Export outputs (diagrams / lists / slides)

### Quick Start

1. Install dependencies
```bash
npm install
```
2. Start development
```bash
npm run dev
```
Default URL: `http://localhost:5173`

3. Type check
```bash
npm run check
```
4. Production build
```bash
npm run build
```

### Origins and Integrations

- Flow workspace: integrated and enhanced from [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT workspace: integrated and enhanced from [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD workspace: implemented in-house (architecture, agent workflow, 2D SVG editing pipeline, BOM/render pipeline)

Key improvements:

- Unified UX across workspaces (chat, code blocks, one-click apply to canvas)
- More stable agent routing and retry mechanisms
- CAD-specific capabilities (patch / replace / BOM / 7-slot render workflow)
- Cross-workspace state/version/export pipelines

### Core Capabilities (Developer View)

- Flow: chat-driven flowchart generation, patch/replace, one-click apply, snapshot restore
- CAD: `cad_plan` output, 2D SVG partial updates, concurrent render jobs, BOM export
- PPT: structured content generation, page-level incremental edits, streaming iteration

### Tech Stack

- Frontend: React 18 + TypeScript + Vite
- UI: Tailwind CSS + Radix UI + Lucide
- Diagram engines: draw.io/diagrams.net for Flow, SVG-Edit for CAD
- Model integration: configurable multi-model access (chat / image)

### Useful Scripts

- `npm run dev`: start development server
- `npm start`: production start (static site + API)
- `npm run build`: production build
- `npm run check`: TypeScript check
- `npm run lint`: ESLint

### Project Structure (Key Paths)

```text
.
├─ agent/                      # Prompts and sub-agent specs for CAD/Flow/PPT
├─ public/                     # Static assets (including SVG-Edit)
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # Flow workspace
│     ├─ cad/                  # CAD workspace (in-house core)
│     └─ ppt/                  # PPT workspace
├─ api/                        # API logic
└─ README.md
```

### Docs

- Deployment guide: [`deploy/README.md`](deploy/README.md)
