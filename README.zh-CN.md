<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.fr-FR.md">Français</a>
</p>

CanvasAnvil 是一个多画布 AI 创作平台，面向流程图、CAD 工作流和 PPT 生成/编辑。

## 版本

当前版本：`v1.0.1`

`v1.0.1` 是一个以持久化修复为重点的补丁版本。PPT 和 CAD 工作区中的图片现在可以更稳定地跨刷新保留，除非用户显式清空工作区。

`v1.0.0` 是第一个重大可用版本，重点是更好地支持现有 PPT 的编辑，尤其是支持对 NotebookLM 导出的 PPT 做文字编辑和迭代。

## v1.0.1 补丁更新

- 将 PPT 工作区中的重图片状态迁移到 IndexedDB 持久化，修复刷新后图片丢失问题
- 修复 PPT 恢复顺序，避免轻量快照覆盖最新的图片持久化状态
- 将 CAD 渲染图和分析图改为 IndexedDB 持久化，并优化占位态处理，提升刷新后的恢复稳定性

## v1.0.0 重点更新

- 统一 `Flow`、`CAD`、`PPT` 三类画布的交互模式
- 支持对 NotebookLM 导出的 PPT 做文字编辑
- 更适合对已有 PPT 进行修改和迭代，而不只是首轮生成
- PPT 图片上传不再把原始 base64 大文本塞进聊天输入
- PPT 图像生成与编辑统一走本地代理，减少浏览器跨域问题
- 图片参考链路增加数量限制、压缩和失败降级重试
- 修复多处 PPT 工作区与文档乱码问题

## 画布预览

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

## 在线体验

- [打开 CanvasAnvil](https://canvasanvil.codingfgd.asia)

## 教程视频

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [抖音](https://v.douyin.com/JwlwhmE6R40/)

## 能力概览

- `Flow`：基于 draw.io XML 的流程图生成与局部编辑
- `CAD`：室内工作流规划、分析板、2D 平面图、渲染任务与 BOM
- `PPT`：结构化幻灯片生成、页面级编辑、图像辅助迭代与导出

## 快速开始

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

## 常用命令

- `npm run dev`：启动 Vite 开发服务
- `npm run dev:full`：同时启动 Web 和 API 开发服务
- `npm run dev:web`：启动前端开发服务
- `npm run dev:api`：启动 API 开发服务
- `npm run check`：TypeScript 检查
- `npm run lint`：ESLint 检查
- `npm run build`：生产构建
- `npm run preview`：预览构建结果
- `npm start`：启动 API 服务

## 开发说明

- AI 配置从本地应用设置中读取，可接入自定义模型服务
- PPT 本地开发现在依赖本地 `/api/ppt-ai` 代理路由
- 如果修改了 `vite.config.ts` 里的本地 API 路由映射，需要重启开发服务

## 项目结构

```text
.
├─ agent/                      # 智能体 Prompt 与子 Agent 规范
├─ public/                     # 静态资源
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # Flow 画布
│     ├─ cad/                  # CAD 画布
│     └─ ppt/                  # PPT 画布
├─ api/                        # 本地 API 路由入口
└─ README.md
```

## 来源与集成

- Flow 画布：集成并扩展自 [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT 画布：集成并扩展自 [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD 画布：项目自研，包含 agent 工作流、2D SVG 编辑、渲染编排和 BOM 链路

## 文档

- 部署说明：[deploy/README.md](deploy/README.md)

## 联系方式

可扫描下方微信二维码联系作者。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
