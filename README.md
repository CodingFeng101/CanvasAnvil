<div align="center">
  <h1>Unified AI Workspace</h1>
  <p>一个把对话、可视化工作台与可交付产物整合在一起的 AI 创作工作区</p>
  <p>An AI creation studio that unifies chat, visual workspaces, and deliverables</p>
  <p>
    <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
    <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" />
    <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" />
  </p>
  <p>
    <a href="#highlights">亮点</a> ·
    <a href="#quickstart">快速开始</a> ·
    <a href="#workspaces">工作台</a> ·
    <a href="#configuration">配置</a> ·
    <a href="#contributing">贡献</a>
  </p>
  <p>如果这个项目对你有帮助，欢迎点个 Star</p>
</div>

---

<a id="highlights"></a>
## 亮点 / Highlights

- 三个工作台同屏协作：Flow / CAD / PPT，一套交互范式贯穿到底
- 原子级交互：只改不满意的部分，保留满意的部分（对话里直接编辑、复制、重生成）
- 交付导向：从需求到产物的链路清晰（图、SVG、装修图、BOM、PPT 草稿）
- 中英双语 UI，一键切换

---

<a id="workspaces"></a>
## 工作台 / Workspaces

| Workspace | 你能做什么 | 产出 |
|---|---|---|
| Flow | 通过对话生成/迭代流程图（draw.io XML）并渲染预览 | draw.io XML |
| CAD | 需求 → 方案（plan）→ 2D SVG → 装修图 / 物料清单（BOM） | SVG / renders / BOM |
| PPT | 生成/编辑 PPT 结构与页面草稿，支持对指定页定向编辑 | slide JSON / images |

---

<a id="quickstart"></a>
## 快速开始 / Quickstart

### 运行环境 / Prerequisites

- Node.js（建议使用 LTS）

### 安装依赖 / Install

```bash
npm install
```

### 启动开发服务器 / Start Dev Server

```bash
npm run dev
```

### 构建 / Build

```bash
npm run build
```

---

<a id="configuration"></a>
## 配置 / Configuration

项目的模型配置在浏览器侧保存（localStorage），建议通过界面右上角的设置入口进行配置：

- API Key
- Base URL
- Chat Model / Image Model

说明：

- API Key 会保存在本地浏览器中，请不要在不可信环境中使用个人密钥

---

## 脚本 / Scripts

- `npm run dev`：启动开发服务器（Vite）
- `npm run build`：TypeScript 构建 + Vite 打包
- `npm run check`：TypeScript 类型检查
- `npm run lint`：ESLint 检查

---

## 项目结构 / Project Layout

关键目录（高频入口）：

- `src/App.tsx`：三工作台整体布局与状态管理
- `src/components/ChatPanel.tsx`：对话面板（历史、重生成、附件、工作台联动）
- `src/components/workspaces/*Workspace.tsx`：各工作台 UI 与交互
- `agent/*`：各类 Agent Prompt 资源

---

<a id="contributing"></a>
## 贡献 / Contributing

欢迎提交 Issue 和 PR：

- Bug 报告：请附上复现步骤、截图/录屏、以及控制台报错（如有）
- 新功能：先开 Issue 描述使用场景和预期交互，再提交 PR 会更高效
- 代码质量：提交前建议运行 `npm run check` 与 `npm run lint`

---

## Language / 语言

- UI supports Chinese/English toggle
- UI 支持中英文切换
