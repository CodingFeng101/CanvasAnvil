# CanvasAnvil / Unified AI Workspace

一个面向生产场景的多工作台 AI 应用，统一了三类能力：
- `Flow`：流程图生成与局部编辑（draw.io XML）
- `CAD`：室内装修方案、2D 平面图、装修图与物料清单
- `PPT`：演示文稿草稿生成与迭代编辑

文档版本：
- 用户版（产品介绍）：[`README.user.md`](README.user.md)
- 开发者版（当前文档）

---

## 项目来源与说明

本项目并非从零开始重复造轮子，而是在优秀开源项目基础上进行了工程级集成与优化：

- Flow 工作台：基于 [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) 集成与增强
- PPT 工作台：基于 [banana-slides](https://github.com/Anionex/banana-slides.git) 集成与增强
- CAD 工作台：本项目自研（架构、Agent 工作流、2D SVG 编辑链路、BOM/装修图链路）

优化方向包括但不限于：
- 三工作台统一交互范式（聊天、代码块、一键应用到画布）
- 更稳定的 Agent 路由与重试机制
- CAD 专项能力（局部 patch / 全量 replace / BOM / 7 槽装修图）
- 跨工作台状态管理、版本管理和导出链路

---

## 核心能力

### 1) Flow 工作台
- 通过对话生成流程图
- 支持局部 patch 与全量 replace
- 支持代码块一键应用到当前画布
- 支持图形历史快照与恢复

### 2) CAD 工作台
- 需求分析 -> `cad_plan` 结构化方案
- 2D SVG 生成与局部修改
- 装修图提示词与并发出图（含失败重试）
- BOM 物料清单展示与导出
- 版本历史聚焦 2D 平面图，不记录 BOM 条目

### 3) PPT 工作台
- 幻灯片结构化内容生成
- 面向页级别的增量编辑
- 图文内容流式生成与迭代

---

## 技术栈

- 前端：[React 18](https://react.dev/) + [TypeScript](https://www.typescriptlang.org/) + [Vite](https://vitejs.dev/)
- UI：[Tailwind CSS](https://tailwindcss.com/) + [Radix UI](https://www.radix-ui.com/) + [Lucide](https://lucide.dev/)
- 图形引擎：Flow 使用 [draw.io / diagrams.net](https://www.diagrams.net/)；CAD 使用 [SVG-Edit](https://github.com/SVG-Edit/svgedit)
- 模型接入：可配置多模型（Chat / Image）

---

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

默认地址：[http://localhost:5173](http://localhost:5173)

### 3. 类型检查

```bash
npm run check
```

### 4. 生产构建

```bash
npm run build
```

---

## 常用脚本

- `npm run dev`：启动开发服务器
- `npm run build`：生产构建
- `npm run check`：TypeScript 类型检查
- `npm run lint`：ESLint 检查

---

## 目录结构（关键部分）

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

你也可以直接浏览这些目录：
- [`agent/`](agent/)
- [`src/workspaces/flow/`](src/workspaces/flow/)
- [`src/workspaces/cad/`](src/workspaces/cad/)
- [`src/workspaces/ppt/`](src/workspaces/ppt/)
- [`public/`](public/)

---

## CAD 工作流（简版）

1. Router 决策子智能体（plan / svg / bom / images）
2. `cad_plan_agent` 产出结构化方案
3. `cad_svg_agent` 产出 `cad_patch`：
   - 局部：`mode=patch` + `edits`
   - 全量：`mode=replace` + `full svg`
4. `cad_bom_agent` 产出物料清单 JSON
5. `cad_images_agent` 产出 7 槽装修图提示词并并发生成

---

## 配置说明

模型与接口配置通过应用设置注入（如 API Key、Base URL、模型名）。
请勿在不受信任环境暴露私有密钥。

---

## 致谢

感谢以下开源项目提供基础能力与灵感：
- [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- [banana-slides](https://github.com/Anionex/banana-slides.git)

本仓库在其基础上进行了面向统一工作流的重构、集成与扩展。
