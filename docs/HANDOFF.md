# 交接文档

> 版本 v2.2.0 · 2026-10-26。详细架构见 [architecture.md](architecture.md)，完整变更见 [CHANGELOG.md](../CHANGELOG.md)。

## 一句话

CanvasAnvil 是一个 AI 多画布创作平台：Vite + React 前端、一个很小的 Node API，四个画布共用一套外壳、UI 组件和模型调用。

| 画布 | 代码目录 | 说明 |
| --- | --- | --- |
| 图表绘制 | `client/workspaces/diagram` | draw.io 图表，走流式 `/api/chat` |
| 室内设计 | `client/workspaces/cad` | 分析图、2D 图纸（svgedit）、效果图、物料清单 |
| PPT 演示 | `client/workspaces/ppt` | 先大纲后生图，导出 PDF / 图片版 PPT |
| 自由画布 | `client/workspaces/canvas` | Excalidraw 白板，文生图 + 圈画标注改图 + 版本条 |

## 跑起来

```bash
npm install
npm run dev      # http://127.0.0.1:8001，API 和前端同一个进程
npm run check    # TypeScript
npm run lint     # ESLint，目前 0 错误
npm test         # 458 个测试，全部通过
npm run build    # 生产构建
```

模型配置在页面右上角「设置」里填：文本模型和生图模型各一组 Base URL / Key / Model，任何 OpenAI 兼容接口都行。部署见 [deploy/README.zh-CN.md](../deploy/README.zh-CN.md)。

## 去哪里改

- **加画布**：`client/app/workspaces.ts` 加一项，门户在 `client/pages/portal/` 补卡片和详情页。
- **加接口**：`server/routes/` 加文件，再在 `server/http/routes.ts` 登记一行。
- **改提示词**：`resources/prompts/<画布>/*.md`（服务端运行时读取）；PPT 生图提示词在 `client/workspaces/ppt/lib/ppt-service.ts`。
- **改文案**：全站和 CAD / PPT / 自由画布在 `client/shared/i18n/messages.ts`，图表画布单独在 `client/workspaces/diagram/lib/translations.ts`。中英文必须成对写，不要在组件里写死中文。
- **模型调用**：浏览器侧统一走 `client/ai/client.ts` → `/api/ppt-ai`；图表画布走 `/api/chat`。

## 必须遵守的约定

1. **存储键名不能改。** localStorage / IndexedDB 的键名（含 `next-ai-draw-io-` 前缀的那批）承载着用户已保存的数据，改名等于清空。
2. **`server/` 不能引用 `client/`**，且只用相对路径导入（不能用 `@/`），两边共享的只放 `contracts/`。
3. **画布内部分三层**：`lib/` 纯函数（测试只测这层）、`hooks/` 一个功能一个、`views/` 只写 JSX。
4. **动效用 `client/shared/motion` 里的现成参数**，不要自己写时长和曲线；全局已遵守系统「减少动态效果」设置。
5. **门户在矮屏幕（高度 ≤820px）用 `short:` 断点收紧布局**，改门户时两种高度都要看一下。

## 本版本主要变化

- 「流程画布」全面更名为「图表绘制 / Diagram」（目录、id、提示词、`diagram-skill`），旧数据自动兼容。
- 新增自由画布；四个交互区都有空状态和示例；顶栏可一键切中英文；首页有了主按钮。
- 门户在各种窗口尺寸、中英文下都不再挤压或被截断。
- PPT 生图只参考模板的风格色调、不参考版式；自由画布改图准确度大幅提升。
- 清理：模板图 285 MB → 34 MB，svgedit 18 MB → 4 MB，示例图 42 MB → 12 MB，删除无用代码、依赖和接口。

## 待办与已知问题

| 优先级 | 事项 | 位置 / 说明 |
| --- | --- | --- |
| 高 | **访问码没有输入入口**。服务端仍会按 `ACCESS_CODE_LIST` 校验 `/api/chat`，但图表画布的设置弹窗已删，用户无处填写。部署时若开了访问码，需要在顶部设置里补一个输入框 | `server/routes/chat.ts`、`client/workspaces/diagram/lib/ai-config.ts` |
| 中 | 「导出可编辑 PPTX」已隐藏，代码完整保留，改回 `true` 即恢复 | `client/workspaces/ppt/canvas/views/DeckView.tsx` 顶部 `SHOW_EDITABLE_EXPORT` |
| 中 | 自由画布改图是整张重画，没有遮罩（mask），标注以外的地方可能有细微变化 | `client/workspaces/canvas/canvas/annotated-edit.ts` |
| 中 | PPT 模板作为主参考图发给改图接口，若模型仍常照抄模板版式，可改为只发文字风格描述 | `ppt-service.ts` 的 `generatePageImage` |
| 低 | 自由画布生成中无法中途停止；选中图片后按回车是生成新图而不是编辑 | `client/workspaces/canvas/chat/ChatPanel.tsx` |
| 低 | OCR 里判断中文的正则范围写宽了（会把韩文、emoji 当中文），只影响可编辑导出 | `client/workspaces/ppt/vision/read-boxes.ts` 的 `CJK_PATTERN` |
| 低 | lint 还有 274 条警告，主要是 `any` 类型，不影响运行 | `npm run lint` |
| 低 | 修复前发出的自由画布标注消息，刷新后只能显示占位文字（新消息不受影响） | — |
