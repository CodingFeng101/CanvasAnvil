# CanvasAnvil 未来计划书

> 2026-11-13 整理，2026-11-15 定稿，经用户逐条筛选后的版本。本文档交给实现者（Opus）按条目执行。
> 只包含用户确认要做的 8 项。其余想法已被用户否决，不要自行加回（见第 11 节）。
> 结构规则见 [architecture.md](../architecture.md)。

---

## 0. 给实现者的说明

### 0.1 怎么用这份文档

- 共 8 个条目，按第 9 节的顺序做。一次只做一个，做完能独立使用再做下一个。
- 标了 **【待核实】** 的地方是写文档时没有读到底的代码，动手前先读对应文件确认，不要按文档的假设直接写。
- 文档里的类型定义和文件位置是建议。读完现有代码后发现有更贴合的放法，可以调整，但功能范围不要扩大。

### 0.2 必须遵守的约定

1. 只在 `main` 分支开发，不建功能分支。
2. **不要悄悄替换现有做法。** 条目 1 到 4 是新增；条目 5、6、8 会改动现有的存储或加载方式，改动范围用户已同意，以各条目写明的为限。实现中发现还必须改掉别的现有方法，先问用户。
3. 先把端到端流程跑通，不要先做评测或验收集。
4. `skill/` 下的技能目录会被整个拷贝到别的项目使用，不能 import 仓库里的代码。条目 1 到 6、8 只改网站；只有条目 7 涉及 `skill/`，改完后每个技能目录仍然要能单独拷走使用。
5. 存储键名和库名不能改（architecture.md "Storage keys are load-bearing"）。新增存储用新库名；迁移用"复制后保留旧数据"。
6. `server/` 不 import `client/`；`server/` 内用相对路径。
7. **可编辑 PPT 导出不要动。** `client/workspaces/ppt/vision/`、`scripts/slide-agent/`、`server/routes/editable-export.ts` 都不在本次范围内。
8. 室内设计器只有压缩后的模板，没有源码，不要改模板本体；对设计器的调用只经过 `client/workspaces/cad/designer/designer-bridge.ts`。
9. 界面文字中英文都要有，沿用各画布现有的翻译方式。回复用户用简体中文。

### 0.3 这 8 项的关系

```
5 图表存储搬家             （独立；条目 6 的图表部分以它为前提）
6 作品库（地基）           （每个画布能存多件作品）
1 素材库（地基）           （四个画布共用的素材）
   ├─ 2 户型生成提案 PPT   （户型把平面图和面积表存进素材库，PPT 取用）
   └─ 3 图表放进 PPT       （图表存进素材库，PPT 取用；第二档做成可编辑形状）
4 PPT 讲稿                 （独立）
7 插件分发                 （独立，只动 skill/ 和 README）
8 draw.io 本地加载         （独立）
```

作品库和素材库是两件事，不要合并：**作品**是某个画布里一件可以继续编辑的东西（一套 PPT、一套户型）；**素材**是可以被任何画布拿去用的一张图或一段文字。

---

## 1. 素材库

### 为什么做

现在四个画布各有各的存储，互相看不见。用户在一个画布做出来的东西，要截图、下载、再上传才能用到另一个画布。素材库是一个四个画布共用的地方：哪里都能存进去，哪里都能取出来。

### 用户看到的

- 应用顶部有一个「素材库」入口，打开是一个面板：缩略图网格，可按来源画布筛选，可改名、删除、下载，也可以直接上传自己的图（logo、产品图）。
- 每个画布有「存入素材库」：
  - 室内设计：存当前平面图；存面积表（文字素材）。
  - 图表：存当前图表。
  - 自由画布：存选中的图片。
  - PPT：存当前页。
- 每个画布有「从素材库选」：
  - PPT：选来的图片成为当前页的素材（就是现有的页面素材机制）；文字素材成为参考资料。
  - 自由画布：选来的图片放到白板上，可以继续圈画修改。
  - 图表：选来的图片作为对话的附件（参考图）。
  - 室内设计：选来的图片作为上传的户型图（走现有的识别入口）。

### 怎么做

**数据**，新建 `client/shared/library/`：

```ts
// types.ts
import type { WorkspaceId } from "@/app/workspaces";

export type LibraryItemKind = "image" | "text" | "diagram";

export interface LibraryItem {
  id: string;
  name: string;                 // "平面布置图"
  kind: LibraryItemKind;
  /** image / diagram：用于显示和当作图片使用的 PNG 或 SVG data URL */
  dataUrl?: string;
  /** text：正文（例如面积表的 Markdown） */
  text?: string;
  /** diagram：draw.io XML，供条目 3 的"可编辑放入"使用 */
  xml?: string;
  /** 来自哪个画布；用户直接上传的为 "upload" */
  from: WorkspaceId | "upload";
  /** 同一批存入的素材共用一个 groupId（例如一次"生成提案"存入的平面图和面积表） */
  groupId?: string;
  createdAt: number;
}
```

- `store.ts`：`createWorkspaceStore("CanvasAnvilLibraryDB")`（`client/shared/storage/indexed-db-store.ts`）。
  - 键 `"index"` 存不含大字段的条目列表（id、name、kind、from、groupId、createdAt）。
  - 每个条目的完整内容单独一个键 `item:<id>`，这样打开面板不需要把所有图片读进内存。
  - 提供 `listItems()`、`getItem(id)`、`addItem(item)`、`renameItem(id, name)`、`removeItem(id)`。
  - 列表缩略图：`addItem` 时生成一张小图（最长边约 320px）存在索引里，面板只读索引。
- 纯逻辑（生成 id、缩略图尺寸计算、索引增删）放可测的模块，按 architecture.md 的惯例加 `tests/library-*.test.ts`。

**界面**，新建 `client/shared/library/`下的组件（`shared/` 内文件名用 kebab-case）：

- `library-panel.tsx`：管理面板（网格、筛选、改名、删除、下载、上传）。用现有的 `client/shared/ui/` 组件（dialog、scroll-area 等）。
- `library-picker.tsx`：选择器，供各画布调用。参数：允许的 `kind`、是否多选；返回选中的完整条目。
- `save-to-library.ts`：`saveToLibrary(item)`，成功后用现有的 toast（sonner）提示"已存入素材库"。

**顶部入口**：**【待核实】** 读 `client/app/App.tsx` 看顶栏结构，把「素材库」按钮放在画布标签旁边或设置按钮旁边。

**各画布接入**（每个画布加两个按钮，逻辑很薄）：

| 画布 | 存入 | 取出 |
|---|---|---|
| 室内设计 | `DesignerBridge.shot2d()` → image；`roomAreas()` 拼成表 → text | 图片 → 走现有上传户型图的入口 **【待核实】** `CadWorkspace.tsx` / `HouseDesignerFrame.tsx` 的 `onUpload` |
| 图表 | 当前 XML + 导出的 PNG/SVG → diagram **【待核实】** 图表画布现有导出函数在 `diagram/state/diagram-context.tsx`、`chat/save-dialog.tsx` | 图片 → 加到对话输入框的附件（`chat/ChatInput.tsx`） |
| 自由画布 | 选中的图片元素 → image（图片数据从 Excalidraw 的 files 里取） | 图片 → `insertGeneratedImage`（`canvas/canvas/insert-image.ts`） |
| PPT | 当前页当前版本的图片 → image | 图片 → 当前页素材（`hooks/use-slide-materials.ts`，类型 `SlideMaterialImage`）；文字 → 参考资料（`ReferenceFile`） |

### 验收

- 在任一画布存入的素材，在其他三个画布都能选到并用上。
- 刷新页面后素材还在。
- 存入 50 张图后打开面板不卡（只读索引和缩略图）。

### 风险

- IndexedDB 不可用时（隐私模式等）现有的 store 会降级为不持久化；素材库入口此时应提示"当前浏览器无法保存素材"，不要静默失败。
- 不要把素材内容镜像进 localStorage。
- 重名：自由画布里 Excalidraw 自带一个也叫「素材库」的按钮（它的图形库）。两个入口同名会让用户分不清。**先问用户**怎么处理：隐藏 Excalidraw 自带的那个，或者给其中一个改名。

---

## 2. 户型一键生成客户提案 PPT

### 为什么做

现在做完户型，要自己截图、抄面积，再去 PPT 画布重新描述一遍。用户是先把户型做好，再做 PPT，所以这是一次性的单向动作，不需要之后的同步。

### 用户看到的

室内设计画布有按钮「生成客户提案」。点击后：

1. 平面图和面积表自动存入素材库（同一个 groupId）。
2. 跳到 PPT 画布，对话输入框里已经带好这次的素材和一份写好的提案大纲。
3. 进入现有的大纲审阅界面，用户确认或修改后再出图。
4. 生成的 PPT 里，平面方案页放的是真实的平面图，面积数字来自面积表。

### 怎么做

**导出（室内设计侧）**，新建 `client/workspaces/cad/lib/proposal-export.ts`：

- 平面图：`bridge.shot2d()`。
- 面积表：`bridge.roomAreas()` → Markdown 表（房间、面积），末尾加总面积。
- 方案要点：从方案对象里取用户的已定事项和风格描述，拼成一段文字。**【待核实】** 方案对象的字段，读 `cad/lib/design/cad-plan.ts`（`unwrapCadPlan`）、`cad/chat/ChatPanel.tsx`、`resources/prompts/cad/plan.md`。2026-11-13 刚修过"用户实际选的内容"的显示，那里就是要取的数据。
- 检查结果摘要（可选）：`runChecks()` 的问题数、`elecAudit()` 的结论，一两句话。
- 全部通过 `saveToLibrary` 存入，共用一个 `groupId`。
- 没有户型时按钮置灰。

**跳转**：**【待核实】** `client/app/App.tsx` 如何保存和切换当前画布。加一个很小的"带参数切换画布"的能力：切到 PPT，并传入 `{ libraryGroupId, preset: "interior-proposal" }`。实现方式可以是一个一次性的 sessionStorage 键或应用级状态，PPT 画布挂载后读取并清除。

**导入（PPT 侧）**，新建 `client/workspaces/ppt/lib/proposal-import.ts`：

- 读出该 `groupId` 的素材：图片转成页面素材，文字转成参考资料。
- 准备一份提案大纲骨架，新增 `resources/prompts/ppt/proposal-outline.md`，页面顺序建议：
  1. 封面
  2. 需求回顾
  3. 平面方案（放平面图）
  4. 各功能区说明（按房间分 1 到 3 页，引用面积表）
  5. 风格与材质
  6. 水电与设备要点
  7. 下一步与时间安排
- 走现有的"大纲"创建路径（`ppt/lib/creation-intent.ts` 的 `"outline"` 类型，状态机在 `ppt/canvas/lib/creation-machine.ts`）。大纲由模型根据骨架和参考资料填写具体内容，然后照常进入 `views/OutlineReview.tsx`。
- 平面图挂到"平面方案"页：用现有的 `{{image:名称}}` 标记（`ppt/canvas/lib/material-tokens.ts`）。
- 模板：沿用 `recommendCategoryId` 的现有逻辑给一个默认推荐，用户可在风格库里换。

### 验收

一句装修需求 → 户型做好 → 点「生成客户提案」→ 大纲审阅 → 生成。全程没有手动截图、复制或上传；成品里有真实平面图和正确的面积数字。

### 风险

- 生图模型可能把平面图重画走样。素材页的指令要明确"原样放置这张图，不要重绘其内容"。**【待核实】** `resources/prompts/ppt/slides-generate.md` 对素材图的现有措辞，不够明确就补一句。
- 多层户型（`BuildingPlan`）：`shot2d` 只出当前楼层。第一版每层各存一张，标题带楼层名。**【待核实】** 桥接层切换楼层的方式；做不到就第一版只导出当前楼层并在界面上说明。

---

## 3. 图表放进 PPT

### 为什么做

技术方案、汇报类 PPT 里最常见的就是架构图和流程图。现在只能导出图片再上传。

### 用户看到的

- 图表画布有按钮「放进 PPT」：图表存入素材库并跳到 PPT 画布。
- PPT 画布里从素材库选一张图表素材时，有两个选项：
  - **作为图片**：整张图放到页面上。
  - **作为可编辑形状**：每个框、每条线是独立的形状，导出 PPTX 后在 PowerPoint 里能改字、改色、挪位置。

### 怎么做

**第一档：作为图片（先做）**

- 图表素材（`kind: "diagram"`）带 `dataUrl`，在 PPT 侧和普通图片素材一样处理。条目 1 做完后这一档基本自动具备，只需要加「放进 PPT」按钮和跳转（复用条目 2 的跳转方式）。

**第二档：作为可编辑形状**

新建 `client/workspaces/ppt/lib/diagram-to-elements.ts`（纯函数，可测）：

1. 读图：用 `readDiagramModel(xml)`（`client/workspaces/diagram/lib/tidy-layout.ts`，返回形状和连线列表）。这是跨画布引用，按 architecture.md 的规则，被两个画布使用的东西要放到 `client/shared/`。**先问用户**是否同意把读图函数移到 `client/shared/`，或者在 PPT 侧只通过一个很薄的共享入口调用；不要自己搬动 `tidy-layout.ts`。
2. 坐标映射：取所有形状的包围盒，等比缩放并居中到页面的内容区（参考尺寸 `PPT_REFERENCE_SLIDE_WIDTH` × `PPT_REFERENCE_SLIDE_HEIGHT` = 1600 × 900，四周留边）。
3. 形状映射：draw.io 样式 → `SHAPE_NAMES`（`ppt/lib/shapes.ts`）。至少覆盖：矩形、圆角矩形、椭圆、菱形、圆柱（数据库）、平行四边形。映射不了的用矩形。
4. 样式：填充色、边框色、字体颜色、字号从 draw.io 的 style 字符串读（`styleValue` 工具函数已有）。
5. 输出 `PptElement[]`（`PptShapeElement` + `PptTextElement`，定义在 `ppt/lib/ppt-service.ts`）。
6. 连线：**【待核实】** `PptElement` 现有类型里有没有线条或箭头。有就用；没有的话先问用户是否新增一种线条元素，不要自己扩展类型。第一版只支持直线和单折线，带箭头。
7. 容器（泳道、分组框）：作为底层的矩形 + 标题文字。

**放到页面上**：**【待核实】** PPT 页面现在是"背景图 + 文本块 + 元素"的渲染层（`SlideRenderLayer`，`ppt/canvas/types.ts`），元素的显示和编辑在 `client/features/ppt-editor/`。确认新增的形状元素能被现有渲染层显示、被现有的 PPTX 导出（`pptxgenjs`）写成原生形状。如果现有页面必须先有 AI 生成的背景图，就提供"新建一页空白页放图表"的路径。

### 验收

- 第一档：图表以图片形式出现在 PPT 页面上，清晰不糊。
- 第二档：一张 10 到 15 个节点的架构图放进 PPT，导出的 PPTX 在 PowerPoint 里每个框可单独选中、改字。连线位置基本对得上。

### 风险

- 复杂连线（多次拐弯、绕行）第一版还原不了。遇到时该连线画成起点到终点的直线，或者整张图退回第一档并提示用户。
- 云厂商图标（AWS、Azure 等）是图片型形状，映射不了。这类节点单独作为小图片元素放置，或退回第一档。

---

## 4. PPT 讲稿

### 为什么做

讲稿的数据已经有了，但用户用不上。2026-11-15 核对代码的结果：

| 环节 | 现状 |
|---|---|
| 生成 | 已有。大纲提示词要求每页输出 `note`，`ppt-service.ts` 的 `normalizeSpeakerNote` 做了整理 |
| 大纲审阅时编辑 | 已有。`views/OutlineReview.tsx` 有"演讲者备注（note）"输入框 |
| 保存 | 已有。`canvas/lib/persisted-state.ts` 原样保存 `note` |
| 生成后的页面视图里查看、修改 | **没有** |
| 放映时显示 | **没有** |
| 导出 PPTX 写入备注 | **没有**。现有的 `slide.addNotes` 只用来记媒体元素的地址 |
| 导出 PDF 附带 | **没有** |

所以这一项主要是补后四行，不需要从头做生成。

### 用户看到的

- 大纲审阅界面：现有的备注栏改名为"讲稿"，内容是两到四句口语化的话。
- 生成后的页面视图：每页下方可展开查看和修改讲稿。
- 放映模式：有"演讲者视图"开关，打开后显示当前页、下一页缩略图、当前页讲稿、计时。
- 导出 PPTX：讲稿写进每页的备注。
- 导出 PDF：可选"附带讲稿"，每页下方或单独一页附讲稿。

### 怎么做

1. **生成**：已经在产出。只调整提示词里对 `note` 的要求（`resources/prompts/ppt/outline.md`、`outline-edit.md`，以及 `ppt/lib/slide-prompts.ts` 第 58 行附近的"speaker note paragraph"）：口语、第一人称、不重复页面上的文字、每页 2 到 4 句。解析和整理的现有代码不用动。
2. **美化模式**（上传 PDF 重新设计）：没有大纲阶段。**【待核实】** 这条路径上页面内容的来源；第一版可以不生成讲稿，只留手动填写入口。
3. **编辑**：`views/OutlineReview.tsx` 已有输入框，只改标题文字。`views/DeckView.tsx` 新增讲稿的查看和编辑。保存不用改。
4. **对话修改**：用户在对话里说"第 3 页讲稿写得正式一点"时能改到讲稿。**【待核实】** 现有的单页修改路由（`SlideEditRoutingItem`，`ppt-service.ts` 第 256 行附近），在其中增加"改讲稿"这一类。
5. **放映**：`hooks/use-slideshow.ts` 加演讲者视图。第一版在同一个窗口内分栏显示即可；双屏（另开一个窗口给观众）作为第二步。
6. **导出**：`hooks/use-deck-export.ts`。PPTX 用 pptxgenjs 的 `slide.addNotes(text)`。PDF 附讲稿用现有的 PDF 生成方式追加文字。
7. **单独重新生成讲稿**：每页讲稿旁一个"重写"按钮，只调文本模型，不重新出图。

### 验收

- 新建一份 8 页的演示文稿，每页都有讲稿；改一页讲稿后刷新仍在。
- 导出的 PPTX 在 PowerPoint 的备注栏能看到讲稿。
- 放映时能看到当前页讲稿。

### 风险

- 导出 PPTX 时，现有代码已经用 `addNotes` 往备注里写媒体元素的地址（`ppt-service.ts` 第 1271 行附近）。讲稿要和它拼在同一段备注里，讲稿在前，不要互相覆盖。
- 旧作品里的 `note` 是按"一段连贯的话"生成的，比新要求长。不用迁移，原样显示即可。

---

## 5. 图表存储搬家

### 为什么做

图表画布的对话记录、XML 快照都存在 localStorage（`client/workspaces/diagram/storage.ts` 的 `STORAGE_KEYS`）。localStorage 总容量大约 5 MB，图多了、对话长了会写不进去，表现为保存失败或历史丢失。其他三个画布都已经用 IndexedDB。

### 用户看到的

没有界面变化。旧数据都还在；之后不会再因为容量存不进去。

### 怎么做

1. 在 `diagram/storage.ts` 里新增 `export const diagramStore = createWorkspaceStore("CanvasAnvilDiagramWorkspaceDB")`。**现有的 `STORAGE_KEYS` 常量一个都不要改、不要删。**
2. 搬哪些：体积大的三项：`messages`、`xmlSnapshots`、`diagramXml`。其余（会话 id、配额计数、访问码、设置）很小，留在 localStorage 不动。
3. 迁移（应用启动或图表画布首次挂载时执行一次）：
   - 新库里对应键为空，且 localStorage 旧键有值 → 把旧值写入新库。
   - **旧键保留不删**（用户可能回退版本）。
   - 写一个标记键表示迁移完成，避免重复执行。
4. 读写切换：把所有读写这三项的地方改成走新库。**【待核实】** 用搜索找出 `STORAGE_KEYS.messages`、`xmlSnapshots`、`diagramXml` 的全部引用（主要在 `diagram/chat/ChatPanel.tsx`、`diagram/state/diagram-context.tsx`）。
5. 同步变异步：localStorage 是同步的，IndexedDB 是异步的。现有代码如果在组件初始化时同步读取初始值，需要改成"先空状态，读到后再填入"，并在读取完成前不要触发保存（否则空状态会覆盖刚迁移的数据）。这是本条目最容易出错的地方。
6. 迁移完成后，新的写入只写新库，不再写旧键。

### 验收

- 用旧版本存几个会话，升级后会话、图、历史都在。
- 连续生成 20 张较大的图，不出现存储配额错误。
- 隐私模式下（IndexedDB 不可用）画布仍可使用，只是不持久化，不报错。

### 风险

- 第 5 步的空状态覆盖问题，必须有测试或手动验证覆盖"首次迁移后立即刷新"的情况。
- `skill/diagram-skill` 有自己的运行时，不受影响，不要改。

---

## 6. 作品库

### 为什么做

现在每个画布在一个浏览器里只能存一件作品，点"新建"就把上一件覆盖掉。2026-11-15 核对的现状：

| 画布 | 现在存在哪 | 能存几件 |
|---|---|---|
| PPT | `pptStore`，键写死为 `PPT_STATE_KEY = "primary"`（`ppt/storage.ts`）；新建时 `pptStore.clear(PPT_STATE_KEY)` | 1 |
| 自由画布 | `canvasStore`，键写死为 `CANVAS_SCENE_KEY = "scene"`（`canvas/storage.ts`） | 1 |
| 室内设计 | localStorage 的 `CanvasAnvil-cad-state-v2` 和 `chat_history_v2_cad`（`cad/CadWorkspace.tsx`），加 `cadStore` 里的渲染图 | 1（带历史版本） |
| 图表 | localStorage 里的一个会话（`diagram/storage.ts` 的 `STORAGE_KEYS`） | 1 |

用户做第二套 PPT，第一套就没了。素材库和跨画布的几项（条目 1、2、3）都默认用户手里同时有好几件东西，所以这是地基。

### 用户看到的

- 每个画布有「我的作品」入口，打开是一个列表：缩略图、名称、最后修改时间。可以新建、打开、改名、复制、删除。
- 点「新建」不再覆盖当前作品，而是另开一件；原来那件留在列表里。
- 作品名默认取自内容（PPT 取标题页标题，其余取第一句用户输入），可以改。
- 每件作品的对话记录跟着作品走：切换作品，对话也切换。
- 升级后，用户原来那一件作品自动出现在列表里，什么都不丢。

### 怎么做

**共用部分**，新建 `client/shared/works/`：

```ts
// types.ts
export interface WorkMeta {
  id: string;
  name: string;
  /** 列表用的小图，最长边约 320px；没有就显示占位 */
  thumb?: string;
  createdAt: number;
  updatedAt: number;
}
```

- `works-store.ts`：接收一个 `WorkspaceStore`（各画布自己的库），在里面管理：
  - 键 `"works:index"`：`WorkMeta[]`。
  - 键 `"works:current"`：当前打开的作品 id。
  - 键 `"work:<id>"`：这件作品的完整状态，内容就是该画布现在存在单一键里的那个对象，结构不变。
  - 提供 `listWorks()`、`currentWorkId()`、`openWork(id)`、`createWork(name?)`、`saveWork(id, state, meta?)`、`renameWork`、`duplicateWork`、`removeWork`。
- `works-panel.tsx`：列表面板，四个画布共用。
- 纯逻辑（索引增删、默认命名、排序）放可测模块，加 `tests/works-*.test.ts`。

**迁移（每个画布首次挂载时执行一次）**：

- `"works:index"` 不存在，且旧的单一键有值 → 新建一件作品，把旧值复制到 `"work:<id>"`，写入索引，设为当前作品。
- **旧键保留不删、键名不改**（约定 5；用户可能回退版本）。迁移后新的读写只走 `"work:<id>"`。
- 和条目 5 一样要防"空状态覆盖"：读取完成前不要触发保存。

**各画布接入**：

| 画布 | 要改的地方 |
|---|---|
| PPT | `canvas/PptCanvas.tsx` 第 299 行的读、第 475 行的存、第 2143 行和 `PptWorkspace.tsx` 第 245 行的清除：把 `PPT_STATE_KEY` 换成当前作品的键；"清除"改成"新建一件"。对话记录 **【待核实】** 存在哪（`PPT_WORKSPACE_STORAGE_KEY`），要一起按作品分开 |
| 自由画布 | `canvas/canvas/CanvasBoard.tsx` 第 65 行的读、第 158 行的存。注意 `canvas/skill/storage.ts` 里另有一个同名常量，那是技能运行时用的，不要动 |
| 室内设计 | 状态在 localStorage。做法：把 `CanvasAnvil-cad-state-v2` 和 `chat_history_v2_cad` 的内容作为一件作品搬进 `cadStore` 的 `"work:<id>"`；`CAD_RENDERS_KEY`、`CAD_ANALYSIS_IMAGES_KEY` 两个键 **【待核实】** 是否也要按作品分开。设计器本体的状态通过 `designer-bridge.ts` 的 `readPlan` / `replacePlan` 存取，不要碰模板 |
| 图表 | 必须在条目 5 之后做。条目 5 把 `messages`、`xmlSnapshots`、`diagramXml` 搬进了 `diagramStore`，这里再把这三项合成一件作品的状态，按 `"work:<id>"` 存 |

**缩略图**：PPT 用第一页的图；自由画布和图表用现有的导出函数出一张小图；室内设计用 `bridge.shot2d()`。保存作品时顺带更新，失败不影响保存。

**不做**：不改首页（用户否决了首页改版）；不做云端同步、不做账号；不做跨画布的总作品列表，每个画布管自己的。

### 验收

- 每个画布连续做三件作品，三件都在列表里，能来回切换，内容和对话都对得上。
- 用旧版本存一件作品，升级后它在列表里，可以打开继续编辑。
- 删除一件作品不影响其他作品。
- 隐私模式下画布仍可使用，只是不持久化，不报错。

### 风险

- 体积：PPT 一件作品包含每页图片的多个版本，存十几件可能触到浏览器配额。保存失败时要明确提示"存储空间不足，请删除不用的作品"，不要静默丢数据。
- 切换作品时有生成任务在跑：第一版在生成进行中禁止切换，并说明原因。
- 室内设计从 localStorage 搬到 IndexedDB，同步变异步，和条目 5 第 5 步是同一类问题，按同样的方式处理。

---

## 7. 插件分发

### 为什么做

在 Codex、Claude Code 这类编程助手里直接用，是竞品里增长最快的入口：Cowart 只是一个 Codex 插件，5 个月 6k 星；house-plan-designer 只是一个 skill，1 个月 615 星；next-ai-draw-io 评论最多的 issue 是它的 MCP 服务。CanvasAnvil 在这条路上内容最全（四种东西，三个带实时编辑器），但安装说明把门槛写高了，PPT 不在插件里，Claude Code 装不了。

### 现状（2026-11-15 实测）

- 在隔离目录里用 Codex 0.142.3 执行下面两条命令，**安装成功**，不需要手动克隆仓库：
  ```
  codex plugin marketplace add CodingFeng101/CanvasAnvil --ref main
  codex plugin add canvasanvil-canvas@canvasanvil-local
  ```
- 装好的插件 46 MB，含 MCP 服务和三个 skill：`cad-skill`、`canvas-skill`、`diagram-skill`。**没有 `ppt-skill`。**
- Codex 在后台拉了整个仓库，707 MB。
- README（中英文各一处，`README.zh-CN.md` 第 172 行、`README.md` 第 170 行）写的是"从仓库根目录执行 `codex plugin marketplace add .`"，让人以为必须先克隆。
- 市场名是 `canvasanvil-local`（`.agents/plugins/marketplace.json`），已经不符合实际。
- 只验证到"安装成功"，没有在 Codex 里实际调用 skill 打开画布。

### 用户看到的

- README 里一条命令从 GitHub 地址安装，Codex 和 Claude Code 各一段。
- 装完四个 skill 都在：PPT、户型、自由画布、图表。
- PPT 和另外三个不同：它不弹出编辑器，而是让助手按流程出大纲、生成页面、导出文件。README 要写明这一点，不要让用户以为会弹界面。

### 怎么做

**7.1 安装说明和市场名**

- 把两份 README 的安装段落改成 GitHub 地址的命令，保留"也可以直接拷贝 `skill/<名称>` 文件夹使用"这一句。
- 市场名去掉 `local`（例如 `canvasanvil`）。改名后已经装过的用户需要重新添加一次市场，README 里写一句说明。

**7.2 PPT 进插件**

- 插件里的 skill 是副本，放在 `skill/canvas-skill/skills/`，由 `scripts/sync-canvas-skill.mjs`、`sync-cad-skill.mjs` 同步。**【待核实】** 读这两个脚本，看 `cad-skill`、`diagram-skill` 是怎么被复制进去的，`ppt-skill` 照同样的方式加进去，不要另造一套。
- `skill/ppt-skill` 33 MB（含模板库）。放进去后插件约 80 MB。
- `ppt-skill` 有自己的 `package.json` 和 Python 依赖（`editable/requirements.txt`，可编辑导出用）。**【待核实】** 它在插件缓存目录里运行时，相对路径和依赖安装是否仍然成立；Cowart 的 README 明确要求"不要在插件缓存里手动装依赖"，看 Codex 对此有没有限制。
- 更新 `skill/canvas-skill/.codex-plugin/plugin.json` 的描述，把 PPT 写进去。
- 独立的 `skill/ppt-skill` 目录保留不动，仍然可以单独拷走使用（约定 4）。

**7.3 Claude Code 安装方式**

- Claude Code 的插件格式和 Codex 不同。**【待核实】** 按 Claude Code 当前的官方文档确认：市场清单和插件清单的文件位置（预期是仓库根的 `.claude-plugin/marketplace.json` 和插件目录里的 `.claude-plugin/plugin.json`）、skill 目录和 MCP 配置的约定、安装命令（预期是 `/plugin marketplace add CodingFeng101/CanvasAnvil` 加 `/plugin install <插件名>@<市场名>`）。以文档为准，不要按这里的预期直接写。
- 两个宿主共用同一份 skill 和 MCP 代码，只各加一份清单文件，不要复制出第二套 skill。
- 编辑器的呈现方式沿用既定规则：宿主支持内嵌小组件就内嵌，不支持就在浏览器里打开本地地址的画布，两边读写同一个文件并做版本检查。**【待核实】** Claude Code 是否支持内嵌；不支持就走浏览器那条路，`skill/canvas-skill/mcp/` 里应当已有这条分支。
- 装好后在 Claude Code 里实际走一遍：打开画布、说一句话改图、手动改一下再让助手读到。

**7.4 首次下载体积（可选，先问用户）**

- 707 MB 的首次下载偏大。要减小只能把插件单独放一个小仓库，由主仓库的同步脚本推送过去。这会改变"一个仓库管所有"的现有做法，**必须先问用户**，用户没同意就不做。

### 验收

- 一台没有克隆过仓库的机器上，按 README 的命令在 Codex 里装好，四个 skill 都能调用；三个画布能打开编辑器，PPT 能走完"大纲 → 出图 → 导出"。
- 同样的事在 Claude Code 里做一遍。
- 把 `skill/` 下任意一个技能目录单独拷到别的项目，仍然能用。

### 风险

- 同步脚本漏改会造成 `skill/ppt-skill` 和插件里的副本不一致。副本只能由脚本生成，不要手改。
- 市场改名会让老用户的插件停止更新，直到他们重新添加。

---

## 8. draw.io 本地加载

### 为什么做

图表画布的编辑器默认从外网加载：`client/workspaces/diagram/DiagramWorkspace.tsx` 第 13 到 18 行，没有设置 `VITE_DRAWIO_BASE_URL` 时用 `https://embed.diagrams.net`。那个地址慢或打不开时，画布就是一片空白，而且没有任何提示。2026-11-15 本地预览时等了 8 秒画布仍是空白（可能是当时的网络环境，没有换环境复测）。竞品 next-ai-draw-io 提供了不依赖外网的用法。

技能那边已经有兜底：`client/workspaces/native/diagram-entry.tsx` 在首次加载失败后会换到 `https://jgraph.github.io/drawio/...` 这个镜像。网站这边没有。

### 用户看到的

- 图表画布打开就有编辑器，不依赖外网。
- 万一编辑器加载不出来，画布上显示"编辑器加载失败"和一个重试按钮，而不是空白。

### 怎么做

分两步，第一步小、先做；第二步要先问用户。

**第一步：兜底和提示（不改变默认来源）**

- 给网站的图表画布加上和技能一样的兜底：默认地址在限定时间内没有加载成功，就换到镜像地址。直接参照 `native/diagram-entry.tsx` 的写法。
- 两个地址都失败时显示错误和重试按钮。

**第二步：本地加载（先问用户选哪种）**

- 现有的 `VITE_DRAWIO_BASE_URL` 已经支持指向任意地址，所以缺的只是"draw.io 的文件从哪来"。两种做法，各有代价：
  - **A. 部署时带一个 draw.io 容器**：在 `deploy/` 的编排里加官方的 draw.io 镜像，`VITE_DRAWIO_BASE_URL` 指过去。仓库体积不变；只对用容器部署的人有效，`npm run dev` 的本地开发仍然走外网。
  - **B. 把 draw.io 的网页文件放进项目，由现有的 Express 服务提供**：任何方式运行都不依赖外网；代价是仓库或构建产物增加几十到上百 MB（条目 7 里首次下载体积已经偏大）。可以不进仓库，改成安装或构建时下载到本地。
- **【待核实】** `skill/diagram-skill/vendor/` 里现在放了什么，是否已经包含可复用的 draw.io 文件；next-ai-draw-io 具体用的是哪种做法（克隆在本机临时目录，也可以直接看它的仓库）。
- 选定后，同一个地址也可以给技能的图表编辑器用，但那属于 `skill/` 的改动，要另外确认。

### 验收

- 第一步：把 `embed.diagrams.net` 屏蔽掉，画布仍然能通过镜像打开；两个地址都屏蔽时看到错误和重试按钮。
- 第二步：断开外网，图表画布能打开、能生成、能导出。

### 风险

- draw.io 的版本和 `react-drawio` 的消息协议要对得上。本地放的版本过旧或过新可能导致导出、自动保存失效，换版本后要把生成、手动编辑、导出各走一遍。
- 画布的布局纠正和评测（`tools/eval/diagram`）依赖编辑器的行为。这一项不改布局逻辑，不需要重跑评测；如果换版本后布局结果有变化，停下来告诉用户。

---

## 9. 顺序

| 顺序 | 条目 | 依赖 | 规模 | 说明 |
|---|---|---|---|---|
| 1 | 5 图表存储搬家 | 无 | 小 | 独立，早做早安全；条目 6 的图表部分以它为前提 |
| 2 | 8 draw.io 本地加载（第一步） | 无 | 小 | 兜底和错误提示 |
| 3 | 7 插件分发（7.1 安装说明） | 无 | 很小 | 只改 README 和市场名，立刻降低安装门槛 |
| 4 | 6 作品库 | 5 | 中偏大 | 四个画布逐个接入，先 PPT 和自由画布，再图表，最后室内设计 |
| 5 | 1 素材库 | 无 | 中 | 条目 2、3 的地基 |
| 6 | 2 户型生成提案 PPT | 1 | 中 | 第一条跨画布链路 |
| 7 | 3 图表放进 PPT（第一档） | 1 | 小 | |
| 8 | 4 PPT 讲稿 | 无 | 小偏中 | 生成和保存已有，补显示、放映、导出 |
| 9 | 7 插件分发（7.2 PPT 进插件、7.3 Claude Code） | 无 | 中 | 可以和 4 到 8 穿插 |
| 10 | 3 图表放进 PPT（第二档） | 第一档 | 中偏大 | 有两处需要先问用户 |
| 11 | 8 draw.io 本地加载（第二步） | 第一步 | 小到中 | 先问用户选 A 还是 B |

---

## 10. 动手前要问用户的地方

1. 条目 1：自由画布里 Excalidraw 自带的「素材库」按钮和新的素材库重名，怎么处理。
2. 条目 3 第二档：是否同意把图表的读图函数移到 `client/shared/` 供 PPT 使用。
3. 条目 3 第二档：如果 `PptElement` 没有线条类型，是否新增。
4. 条目 7.4：是否把插件拆到单独的小仓库以减小首次下载。没问到明确同意就不做。
5. 条目 8 第二步：draw.io 本地加载选 A（部署时带容器）还是 B（文件放进项目）。

## 11. 用户已否决，不要做

以下想法在讨论中被用户明确否决或评价为一般，不要自行实现：

- 可编辑 PPT 导出的任何优化。
- 来源标签（标注"用户说的 / AI 估的"）、待确认页、大纲数字溯源。
- 过期提醒（户型改了提示 PPT 更新）。
- 生成后的各类自动核对：PPT 数字核对、整套风格检查、图表漏画检查、自由画布圈外校验。
- 图表：约束随图保存、版本差异说明、记住布局习惯。
- 室内设计：圈画改户型、已选事项面板、三方案挑选、上游更新保护。
- 自由画布：修改配方。
- 平台：项目导出导入、MCP 接入素材库、模型连接测试。
- 可直接打开的示例作品（免密钥体验）。
- 首页改成一个"你想做什么"的输入框。
- 成品分享链接、单文件成品页。

## 12. 待核实清单（汇总）

1. `client/app/App.tsx` 的顶栏结构，以及如何保存和切换当前画布（条目 1、2、3）。
2. 各画布现有的导出和上传入口的确切位置（条目 1 的接入表）。
3. CAD 方案对象里已定事项和风格描述的字段（条目 2）。
4. `resources/prompts/ppt/slides-generate.md` 对素材图的措辞（条目 2）。
5. 多层户型下桥接层如何切换楼层截图（条目 2）。
6. `PptElement` 是否有线条类型；新增形状元素能否被现有渲染层显示并导出为原生形状（条目 3）。
7. 美化模式下页面内容的来源（条目 4）。
8. 现有的单页修改路由如何增加"改讲稿"这一类（条目 4）。
9. 图表画布三项大数据的全部读写位置，以及是否存在同步读取初始值的代码（条目 5）。
10. PPT 对话记录存在哪，`PPT_WORKSPACE_STORAGE_KEY` 的用途（条目 6）。
11. 室内设计的 `CAD_RENDERS_KEY`、`CAD_ANALYSIS_IMAGES_KEY` 是否要按作品分开（条目 6）。
12. `scripts/sync-canvas-skill.mjs`、`sync-cad-skill.mjs` 如何把 skill 复制进插件（条目 7）。
13. `ppt-skill` 在插件缓存目录里运行时路径和依赖是否成立（条目 7）。
14. Claude Code 当前的插件和市场清单格式、安装命令、是否支持内嵌小组件（条目 7）。
15. 装好的插件在 Codex 里实际调用 skill 打开画布是否正常（条目 7，实测只到安装成功）。
16. `skill/diagram-skill/vendor/` 的内容；next-ai-draw-io 不依赖外网的具体做法（条目 8）。
17. 图表画布空白是否能在正常网络下复现（条目 8）。
