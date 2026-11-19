# 实施方案：图表存储搬家、draw.io 兜底、安装说明、作品库

> 2026-11-18。对应 [roadmap-2026-11.md](roadmap-2026-11.md) 的顺序 1–4：条目 5、条目 8 第一步、条目 7.1、条目 6。
> 分支 `feat/roadmap-storage-works`，每个条目一个提交，最后一个 PR 合并到 main。
> 本文是读完代码后的具体做法；roadmap 里的【待核实】在这里给出了结论。

---

## 一、条目 5：图表存储搬家

### 现状（已核实）

- 对话记录、XML 快照、当前图三项**不走** `STORAGE_KEYS`，而是 `diagram/chat/ChatPanel.tsx` 第 42–45 行自己又定义了一遍同名字符串，直接调 `localStorage`。
- 读写位置共 4 处：
  1. `ChatPanel.tsx` 挂载时同步读取对话记录和快照（第 787 行起）。
  2. draw.io 就绪后同步读取当前图（第 818 行起），500ms 后才允许保存当前图（`canSaveDiagram`）。
  3. 保存：对话记录在回复结束后保存，当前图在变化时保存，快照用 `saveXmlSnapshots()` 保存，关闭页面前（`beforeunload`）全部再存一遍。清空对话时删除这三项（第 1503 行）。
  4. `diagram/state/diagram-context.tsx` 第 220 行：用户手动导出 .drawio 时写一次当前图。它从 `ChatPanel` 导入键名，两个文件互相引用。

### 做法

1. `diagram/storage.ts` 新增：
   - `diagramStore = createWorkspaceStore("CanvasAnvilDiagramWorkspaceDB")`
   - 库内键名 `DIAGRAM_DB_KEYS = { messages, xmlSnapshots, diagramXml }`
   - `STORAGE_KEYS` 原样保留，一个都不改。
2. 新增通用的一次性迁移函数 `client/shared/storage/legacy-migration.ts`（已写好，还没接入）：新库里对应键为空、旧值存在就复制过去；旧键不删；写一个标记键，迁移只执行一次。条目 6 的四个画布也用它。
3. 新增 `diagram/hooks/use-diagram-persistence.ts`，把上面 4 处读写集中到一起：
   - 挂载时先执行迁移，再从新库**一次性**读出三项，存在一个 Promise 里。
   - 对话记录和快照：读完后再填进去。用 `restored` 状态替代现在的 `hasRestoredRef`，读完之前**所有保存都跳过**。这是防止空状态覆盖刚迁移数据的关键。
   - 当前图：draw.io 就绪后从同一个 Promise 取值，取到并显示后才允许保存。用这个时机替代现在固定等 500ms 的做法。
   - 如果读完时用户已经发了消息（对话记录不为空），不再用旧记录覆盖。
4. 键名常量移到 `storage.ts`，`diagram-context.tsx` 改为从那里导入，去掉它和 `ChatPanel` 的互相引用。
5. 关闭页面前的保存：IndexedDB 是异步的，关页面时不保证写完。做法：
   - 照常发起写入，同时在 `pagehide` 和标签页切到后台（`visibilitychange`）时也存一次，后者是可靠的时机。
   - **生成过程中定时保存**（2026-11-18 用户确认）：回复生成期间每 3 秒存一次对话记录，上一次还没写完就跳过这一轮。这样生成到一半时刷新，最多丢失最后几秒的内容。
6. 会话 id、配额计数、访问码、设置、布局纠正记录、深度思考开关都很小，留在 localStorage 不动。
7. IndexedDB 不可用时，store 本身就退化为不保存，画布照常使用，不报错。

### 测试

- `tests/storage-legacy-migration.test.ts`：用内存版 store 测试迁移。覆盖：旧值复制过去且旧键还在；新库已有值时不覆盖；只执行一次；读旧值抛错时跳过。
- 手动：先用当前版本存一个会话，切到新代码后刷新，检查对话、图、历史版本都在；**迁移后立刻再刷新一次**也都在；然后连续生成大图，确认没有配额报错。

---

## 二、条目 8 第一步：draw.io 兜底和错误提示

### 现状（已核实）

- 网站：`DiagramWorkspace.tsx` 第 13–18 行固定用 `VITE_DRAWIO_BASE_URL` 或 `https://embed.diagrams.net`，没有超时、没有备用地址、没有提示。
- 技能：`native/diagram-entry.tsx` 8 秒没加载完就换成 `https://jgraph.github.io/drawio/src/main/webapp/index.html`。

### 做法

- 新增 `diagram/lib/drawio-source.ts`（纯函数，可测）：给出按顺序尝试的地址列表。配了 `VITE_DRAWIO_BASE_URL` 时只用它；没配时依次用默认地址和镜像。
- `DiagramWorkspace.tsx`：
  - 记住当前用的是第几个地址，`DrawIoEmbed` 以地址作为 key。
  - 8 秒内没有触发 `onLoad`，就换下一个地址（和技能一样的时长）。
  - 所有地址都失败时，在画布上叠一层提示："编辑器加载失败" / "Editor failed to load"，附说明（检查网络或配置 `VITE_DRAWIO_BASE_URL`）和"重试"按钮。重试从第一个地址重新开始。
  - 切换主题导致编辑器重新挂载时，计时也重新开始。
- 文案中英文都写进图表画布现有的 `diagram/lib/translations.ts`。
- 布局逻辑不动，不需要重跑评测。

### 测试

- 给地址列表函数写单元测试。
- 手动：在浏览器里屏蔽 `embed.diagrams.net`，确认 8 秒后换到镜像并加载成功；两个地址都屏蔽时出现错误提示，点重试能重新加载。

---

## 三、条目 7.1：安装说明和市场名

- `.agents/plugins/marketplace.json`：`"name": "canvasanvil-local"` 改为 `"canvasanvil"`。插件名 `canvasanvil-canvas` 不变。
- README 中英文两处（`README.md` 第 170 行、`README.zh-CN.md` 第 172 行）改成：
  ```
  codex plugin marketplace add CodingFeng101/CanvasAnvil --ref main
  codex plugin add canvasanvil-canvas@canvasanvil
  ```
  并补充：
  - 不需要先克隆仓库。
  - 以前用 `canvasanvil-local` 装过的，要先重新添加一次市场。
  - 也可以把 `skill/<名称>` 文件夹直接拷到项目里使用。
- PPT 进插件（7.2）和 Claude Code 安装方式（7.3）不在今天的范围内，README 先不提。

---

## 四、条目 6：作品库

### 现状（已核实，roadmap 的【待核实】在这里给出结论）

每个画布的数据分两类：存在 IndexedDB 里的大数据，和存在 localStorage 里的小数据。

| 画布 | IndexedDB（每件作品要分开） | localStorage（每件作品要分开） | 全局，不按作品分 |
|---|---|---|---|
| PPT | `pptStore` 的 `primary` | `CanvasAnvil-ppt-state-v1`（演示稿的镜像，对话面板会读它）、`chat_history_v2_ppt`、`CanvasAnvil-history-ppt-v1`、`CanvasAnvil-ppt-return-stage-v1` | 模板库 `template-library`、正在进行的可编辑导出任务 |
| 自由画布 | `canvasStore` 的 `scene`、`chat-images` | 对话记录 `chat_history_v2_canvas`【动手时再核实键名】 | 生图选项 |
| 室内设计 | `cadStore` 的 `cad-design-record`（设计器方案、历史、撤销）、`chat-image:*` | `CanvasAnvil-cad-state-v2`、`chat_history_v2_cad`、`CanvasAnvil-history-cad-v1` | — |
| 图表 | 条目 5 之后：`diagramStore` 的三项 | 会话 id | 配额、设置、深度思考 |

另外两点：
- `CAD_RENDERS_KEY`、`CAD_ANALYSIS_IMAGES_KEY` 在代码里**已经没人用了**，不用管。
- `CadDesignSession` 的构造函数本来就接受一个 `store` 参数，可以直接传入按作品区分的 store。

### 核心做法：切换作品就是"换一套键 + 重新挂载画布"

1. **按作品区分的 store**：新增 `scopeStore(store, "work:<id>:")`，它返回的 store 读写时自动给键加前缀。画布代码里把 `pptStore.read(PPT_STATE_KEY)` 换成 `workStore.read(PPT_STATE_KEY)`，实际存的键就是 `work:<id>:primary`。画布原有的读写逻辑和数据结构都不变，只是换了一个 store。
   - roadmap 原来设想每件作品一个键 `work:<id>`。每个画布本来就不止一个键，所以改成加前缀，这在 roadmap"可以调整放法"的范围内。
2. **重新挂载**：每个画布外面套一个 `WorksHost`。它负责：
   - 首次进入时执行迁移；
   - 读出当前作品 id；
   - 通过 context 把 `workId` 和 `workStore` 交给画布；
   - 用 `key={workId}` 渲染画布。

   切换作品时，先让当前画布把数据存完（复用各画布已有的保存时机，加上一次主动保存），再换 id，画布整个重新挂载，从新作品的键读数据。这样各画布里现有的"挂载时读、变化时存"的代码基本不用改。现在 App 切换画布时也是这样卸载、重新挂载的。
3. **localStorage 那部分怎么按作品分开**：这里有两种做法，需要你选（见第五节第 1 个问题）。
   - **A. 切换时交换（推荐）**：localStorage 里的键名和读写代码都不变，它们始终存放"当前作品"的数据。切换作品时：
     1. 把这些键的当前值复制进 IndexedDB 的 `work:<旧id>:ls:<键名>`；
     2. 把目标作品的值写回这些 localStorage 键；
     3. 重新挂载画布。

     好处是对话面板、PPT 镜像这些同步读取的代码一行不改，不会出现同步变异步带来的空状态覆盖问题。代价是 localStorage 里仍然放着当前作品的对话记录。现有代码对对话记录做了压缩和大小上限，容量没有问题。
   - **B. 全部搬进 IndexedDB**：roadmap 对室内设计写的就是这种做法。要把 CAD 和 PPT 的对话记录、方案、PPT 镜像这些同步读取都改成异步，涉及 `CadWorkspace`、两个对话面板和 `PptCanvas`。改动面大很多，空状态覆盖的风险点也多。
4. **保存按钮和清空按钮**（2026-11-18 用户确认的做法）：
   - 每个画布里正在编辑的内容，一开始是**草稿**。草稿照样自动存在浏览器里，刷新不会丢，但它**不出现在「我的作品」里**。每个画布最多一份草稿。
   - 每个画布加一个「保存」按钮。第一次点时弹出命名框，默认名称取自内容（PPT 用标题页标题，其他画布用第一句用户输入）。确认后这份草稿就成为一件作品，出现在「我的作品」里。
   - ~~已经保存过的作品，之后的修改照常自动保存。~~ **2026-11-18 预览后用户改为：点了「保存」才更新「我的作品」。** 画布始终写一份"工作副本"（`work:<id>:`，刷新不丢）；保存时把工作副本复制成"已保存版本"（`saved:<id>:`）。保存后再修改，保存按钮出现小圆点表示有未保存的修改；离开时问 保存 / 不保存 / 取消，「不保存」把已保存版本复制回工作副本。是否有修改：用户操作之后的写入才与已保存版本比较（加载时的写入不算）；自由画布只比较元素 id + version，忽略滚动和选中。图表编辑器里手动改的内容只在导出时才交出，所以保存或离开前会先导出一次。
   - 保存按钮放在每个画布对话输入框的工具行里，和旁边按钮一样只显示图标，悬停才有文字；删除按钮在最左边。
   - 现有的清空按钮（PPT、室内设计、图表的对话框里）：
     - 当前是**没保存的草稿** → 和现在一样直接删掉，回到空白。会先确认一次。
     - 当前是**已保存的作品** → 作品留在「我的作品」里，画布换成一份新的空白草稿。
   - 从没保存的草稿切换到别的作品时，先弹出提示："当前内容还没保存"，三个选项：保存 / 不保存 / 取消。
   - 自由画布现在没有清空按钮，只加「保存」。
   - 迁移：升级前用户已有的那一件作品，直接作为**已保存的作品**放进列表，不当草稿处理，保证不丢。
5. **迁移**：每个画布第一次进入时，如果还没有作品索引，就新建一件作品，把现有的单一键（IndexedDB 键和 localStorage 键）**复制**到这件作品下，设为当前作品。旧键保留不删。用的就是上面那个通用迁移函数。

### 共用部分 `client/shared/works/`

- `types.ts`：`WorkMeta { id, name, thumb?, createdAt, updatedAt }`。
- `works-index.ts`（纯函数，测试覆盖）：增删改索引、复制、按修改时间排序、生成默认名称（"未命名作品 3"）、根据内容截取名称（最长约 24 字）。
- `works-store.ts`：在各画布自己的库里管理 `works:index` 和 `works:current`，提供 `listWorks / currentWorkId / createWork / openWork / saveMeta / renameWork / duplicateWork / removeWork`。复制作品时，把 `work:<id>:` 开头的键全部复制一份。现有 store 只能按单个键读，所以每件作品的键清单要另外记在索引里。
- `scope-store.ts`：上面说的加前缀的 store。
- `works-host.tsx`：负责挂载、迁移、切换、重新挂载，并提供 context `useWork()`，内容是 `{ workId, workStore, setBusy, reportMeta }`：
  - `setBusy`：画布在生成时报告"忙"，作品面板据此禁止切换并说明原因。
  - `reportMeta`：画布报告名称候选和缩略图。
- `works-panel.tsx`：列表面板，用现有的 dialog、scroll-area 组件。功能：缩略图、名称、修改时间、新建、打开、改名、复制、删除（删除前确认）。

### 入口（2026-11-18 用户确认：一个总列表，进去再分类）

- 顶栏右侧，语言和主题按钮左边，加一个「我的作品」按钮。不改首页。
- 打开后是**所有画布的作品总列表**，上方有分类：全部 / 图表 / 室内设计 / PPT / 自由画布，默认选中当前画布。每件作品卡片上标注它属于哪个画布。
  - 这一点调整了 roadmap 里"不做跨画布的总作品列表"那句，以用户这次的决定为准。数据仍然由各画布存在自己的库里，总列表只是把四份索引合在一起显示。
- 打开另一个画布的作品：先把那个画布的 `works:current` 设成这件作品，再切换到那个画布。当前画布正在生成时不允许切换，并说明原因。
- 新建：在"全部"分类下新建，新建的是当前画布的作品；在某个分类下新建，新建的就是那个画布的作品，然后切换过去。
- 面板放在 `client/app/works-dialog.tsx`（应用外壳层），因为它要读四个画布各自的 `storage.ts`，而 `shared/` 不能引用 `workspaces/`。列表和卡片这些通用组件仍然放在 `shared/works/`。
- 文案放在 `shared/i18n` 的应用级词典里，中英文都有。

### 各画布接入

| 画布 | 要改的地方 |
|---|---|
| PPT | `PptCanvas.tsx` 中 `PPT_STATE_KEY` 的读、存、清除共 3 处改用 `workStore`；`PptWorkspace.tsx` 的 `clearWorkspace` 改为新建作品；名称取标题页标题，缩略图取第一页图片（压缩到最长边 320px）；生成过程中报告"忙" |
| 自由画布 | `CanvasBoard.tsx` 中 `scene` 的读、存，以及 `chat/chat-images.ts` 改用 `workStore`。`canvas/skill/storage.ts` 是技能运行时用的，不动。缩略图用 Excalidraw 的导出函数生成 |
| 室内设计 | `new CadDesignSession({ store: workStore })`；`cad/chat/ChatPanel.tsx` 中 `chat-image:` 的读取改用 `workStore`；`clearWorkspace` 改为新建作品；缩略图用 `bridge.shot2d()`，设计器还没加载时不生成；设计器模板不动 |
| 图表 | 条目 5 写的读写模块改用 `workStore`；清空对话改为新建作品；缩略图在已有 PNG 导出时顺带生成，没有就显示占位 |

缩略图生成失败时不影响保存。

### 存储空间

`save` 失败（配额超出）时，用 toast 提示"存储空间不足，请在「我的作品」里删除不用的作品"，不能静默失败。现有各处的 `.catch(console.error)` 改为调用一个共用的提示函数，重复的提示要合并，不能连续弹很多条。

### 测试

- `tests/works-index.test.ts`：索引的增删改、复制、排序、默认命名。
- `tests/works-store.test.ts`：用内存版 store 测试迁移（旧键复制过去且保留）、新建、切换、删除一件不影响其他作品、复制得到独立的副本。
- 手动（每个画布）：
  - 升级后原来那件作品在列表里，打开能继续编辑；
  - 连续做三件作品，来回切换，内容和对话都对得上；
  - 删除一件不影响其他作品；
  - 生成过程中不能切换；
  - 无痕模式下画布能正常使用。

---

## 五、动手前需要你决定的

1. ~~条目 6 中 localStorage 那部分~~：**已定：A（切换时交换）。**
2. ~~「我的作品」入口~~：**已定：一个总列表，进去再按画布分类**（见第四节"入口"）。
3. ~~清空按钮~~：**已定：加「保存」按钮。没保存的点清空就删掉；保存过的点清空，作品保留，画布换成空白草稿**（见第四节第 4 点）。
4. ~~关页面时的保存~~：**已定：生成过程中定时保存。**

## 六、顺序和提交

1. 条目 5 → 提交 → 手动验证迁移
2. 条目 8 第一步 → 提交
3. 条目 7.1 → 提交
4. 条目 6：先做共用部分和测试，然后依次接入 PPT、自由画布、图表、室内设计，每接入一个画布提交一次
5. 运行 `npm run check`、`npm run lint`、`npm test`、`npm run build`，在浏览器里把四个画布各走一遍
6. 推送分支，提 PR
