# 实施方案：画布互通（引用作品）

> 2026-11-21。对应 [roadmap-2026-11.md](roadmap-2026-11.md) 条目 1。可引用清单、三条通路、"复制带过去 / 只引用已确认户型 / 导出结果存下来"三条规则以路线图为准，这里只写怎么做。
> 界面形态按 2026-11-21 用户认可的草图：对话框"+"菜单里的「引用作品」、选择窗口、引用卡片、各画布落点、源头快捷按钮。暂不做 `@` 搜作品。

## 1. 总体结构

```
client/shared/references/          （画布和 app 都能用，不 import @/app）
  types.ts        WorkReference / ReferenceItem
  bus.ts          openReferencePicker()：画布调用，app 注册实现
  pending.ts      跳转时带过去的引用（同 pending-prompt.ts 的做法）
  to-files.ts     引用项 → File（聊天附件、PPT 素材都吃 File）
  reference-card.tsx  引用卡片（输入框上方、消息里）
  drawio-render.ts    后台看不见的 draw.io：XML → SVG/PNG

client/workspaces/<画布>/references.ts
  每个画布自己的"提取器"：给一个作品的 store，返回它可被引用的内容。
  读的是作品库里那件作品的存档（worksStoreFor(ws).storeFor(id)），不用打开那个画布。

client/app/works/reference-picker.tsx
  选择窗口：按画布筛选 → 作品网格（复用 loadAll 的列表和缩略图）→ 右侧勾选内容 → 引用。
  在 App 里注册给 bus。
```

依赖方向符合约定：`shared/` 和 `workspaces/` 不 import `@/app`；提取器放在各画布里，app 只负责把它们拼进窗口。

## 2. 数据

```ts
type ReferenceItemKind = "image" | "file" | "text";
interface ReferenceItem {
  id: string;
  kind: ReferenceItemKind;
  label: string;            // "彩平图"、"第 3 页"、"报价单"
  group?: string;           // 分组显示：同一张图的版本、"施工图"……
  dataUrl?: string;         // image / file 的内容
  fileName?: string;        // file：报价单.csv、施工图.pdf
  text?: string;            // text：设计需求、面积表（Markdown）、大纲
  defaultOn?: boolean;      // 窗口里默认是否勾选
}
interface WorkReference {
  workspace: "canvas" | "ppt" | "diagram" | "cad";
  workId: string;
  workName: string;
  items: ReferenceItem[];   // 复制来的内容，原作品之后怎么变都不影响
  revision?: number;        // 室内设计：引用时设计的 revision
}
```

引用是复制：`items` 里直接带数据。存进目标作品时随目标作品一起保存。

只在有用处的画布之间引用（2026-11-21 用户决定），表在 `client/shared/references/sources.ts`：PPT ← 图表、自由画布、室内设计；自由画布 ← PPT、图表、室内设计；图表 ← PPT、自由画布；室内设计不引用别人，所以对话框里没有「引用作品」。从不引用同一画布的作品，同一画布里想沿用旧作品，用作品库的复制。

## 3. 各画布提取器

| 画布 | 内容 | 来源 | 备注 |
|---|---|---|---|
| 自由画布 | 白板上每张图片；同一张图的各个版本归一组 | `scene` 的 `elements` + `files`，按 `customData.canvasAnvil.lineageId` 分组 | 直接读 |
| PPT | 大纲（text）、讲稿（text）、每页成品图（当前版本默认勾选，历史版本在组内）、每页素材图、所选模板图 | `primary`：`localSlides`、`imageVersions`、`currentImageVersionId`、`generatedImages`、`slideMaterials`、`selectedTemplateId` | 图片已存成 data URL，直接读 |
| 图表 | 当前图（高清 PNG）、历史版本 | `diagram-xml`、`xml-snapshots` | 用 `drawio-render.ts` 在后台渲染，本地 draw.io 优先 |
| 室内设计 | 设计需求、户型概况、面积表、家具清单、水电统计（text）；平面布置图、彩平图、3D 效果图、原始户型图（image）；报价单 CSV、施工图 PDF、平面 DXF、水电 DXF（file） | 交付包 `reference-bundle`（见第 4 节）+ `cad-design-record` + 对话 | 只认已确认、revision 对得上的交付包 |

## 4. 室内设计的交付包

- 设计器只在室内设计画布里活着，所以交付包在室内设计画布里生成：桥接层 `designer-bridge.ts` 按 `run-designer.mjs` 的 `EXPORTS` 依次点导出按钮，截住下载的文件（在 iframe 里拦 `a[download]` 的点击和 `URL.createObjectURL`），再加上 `roomAreas()`、`shot2d()`、水电统计。
- 存进这件作品的新键 `reference-bundle`：`{ revision, createdAt, items }`。新键，不改旧键。
- 什么时候生成：
  1. 点「生成汇报 PPT」时；
  2. 设计器里确认户型后，在后台顺手生成一次（3D 渲染慢，放最后，可以先出其余几项）。
- 从别的画布引用这套户型时：
  - 户型未确认 → 窗口里提示"先去确认户型"，附"打开这套户型"按钮；
  - 交付包缺失或 revision 对不上 → 提示"交付物需要更新"，附"去生成"按钮（打开室内设计并开始生成）。
  - 不在别的画布里偷偷开一个看不见的设计器：设计器很重，3D 还要 WebGL，放到后台不可控。

## 5. 落点

| 画布 | 落点 | 做法 |
|---|---|---|
| 所有画布的对话框 | "+" → 引用作品 → 引用卡片 | `chat-input.tsx` 加菜单项和卡片区；发送时由各画布的 ChatPanel 决定怎么用（见下） |
| PPT · 开始页（填想法 / 大纲时） | 引用整套作品作为生成依据 | 文本项并入参考资料，图片项作为素材候选；引用室内设计时，提示词换成"室内设计汇报"大纲模板（第 6 节） |
| PPT · 某一页 | 素材区「从作品引用」 | 只要图片项，转成 File 交给现有的 `useSlideMaterials.addImages` |
| PPT · 生成后的对话 | 引用的图片作为修改参考 | 转成图片附件，走现有 imagesOnly 通道 |
| 自由画布 | 引用的图片放到白板上 | 现有的 `insertGeneratedImage`；对话框现在 `uploadMode="none"`，引用直接落到白板 |
| 图表 | 引用的图片作为参考图 | 转成图片附件，走图表对话现有的附件 |
| 室内设计 | 暂不做落点 | 主要是被引用 |

## 6. 三条通路

**通路 3：图表 → PPT**
- 图表画布加「放进 PPT」：渲染当前图 → 写入待带引用 → 打开 PPT 当前作品 → 弹出"放到哪一页"（现有页面列表）→ 加为那一页的素材图。
- PPT 页面素材区的「从作品引用」走选择窗口，同样能选到图表。

**通路 1：室内设计 → PPT 汇报**
- 室内设计画布加「生成汇报 PPT」（户型确认后出现）：生成或复用交付包 → 写入待带引用 → 打开 PPT 的**新作品** → 开始页已带好引用卡片和一句默认需求"根据这套户型做一份给业主的装修汇报"。
- PPT 生成大纲时：引用的文本（需求、概况、面积表、报价单汇总）进参考资料；新增一段提示词，说明汇报的常见结构（项目概况、改造前后、平面方案、分区说明、效果图、预算、施工图）和"预算数字只用报价单里的"。图片按标签对应到页面素材：效果图 → 效果图页，彩平图 / 平面图 → 平面方案页，原始户型图 → 改造前后页。
- 之后照常走大纲审阅和出图。

**通路 2：PPT 页 → 自由画布 → 送回**
- PPT 某页加「到自由画布修改」：把当前版本的图带过去，并记下 `{ pptWorkId, slideId }`。
- 自由画布把图放到白板上，`customData.canvasAnvil.returnTo` 记下来源。选中这张图（或它的新版本）时，版本条旁出现「送回 PPT 第 N 页」。
- 送回：PPT 那件作品当时没打开，不直接改它的状态，写到它的收件箱键 `inbox`（新键）；PPT 打开这件作品时读收件箱，把图加成那一页的新版本（`imageVersions`，类型 `edited`），然后清空收件箱。送回后跳到 PPT 那一页。

## 7. 分阶段

| 阶段 | 内容 | 做完能用的 | 状态 |
|---|---|---|---|
| 1 | 第 1、2 节的公共部分，选择窗口，对话框入口和卡片；PPT、自由画布、图表三个提取器；`drawio-render.ts` | 在任意画布引用这三类作品，作为附件或白板图片 | 已完成 |
| 2 | 通路 3：PPT 页面「从作品引用」，图表「放进 PPT」 | 图表进 PPT | 已完成 |
| 3 | 第 4 节交付包，室内设计提取器，通路 1 | 一键生成室内设计汇报 PPT | 已完成 |
| 4 | 通路 2：到自由画布修改、送回、收件箱 | PPT 页在白板上圈改再送回 | 已完成 |

第 2 阶段的实际做法：引用来的图加为那一页的素材，同时在这一页的描述里写上 `放入{{image:第N张}}（来自「作品名」）`，因为只有描述里点名的素材才会送给生图模型。「放进 PPT」打开 PPT 当前作品；它还没有页面时只提示先生成大纲。已出图的 PPT 里，素材要等用户把这一页加入对话、要求放进画面时才用上，提示里会说明。

第 3 阶段的实际做法：设计器的导出全都是 `createObjectURL` + 点 `<a download>`，桥接层在 iframe 里临时替换这两个函数截住文件（报价单要先开报价面板，彩平图和效果图要先进 3D 视图并重置相机）。导出期间暂停每 1.5 秒的同步，否则彩平图临时改的 `plan.look` 会被当成用户修改、让户型变回未确认。交付包存在室内设计作品的 `reference-bundle` 键，记着生成时的修订号，户型一改就过期，引用时提示「更新交付物」。只取设计器当前层。交付包不用手动生成：点「确认户型」后立即生成；打开一套已确认但交付包缺失或过期的户型时也会自动生成。导出期间底部有进度。失败时户型仍是已确认的，提示里带「重试」。没有单独的「更新交付物」按钮。引用一套交付包没准备好的户型时，提示「打开这套户型会自动准备」。「生成汇报 PPT」新建一份 PPT 草稿：需求和默认勾选的文本、报价单 CSV 作为一张引用卡片进对话框，图片存到 PPT 的 `report-images` 键，大纲出来后按页标题和要点匹配（效果图→效果/渲染页，彩平图、平面布置图→平面/布置页，原始户型图→原始/现状/改造页），匹配不到的提示用户手动放。

第 4 阶段的实际做法：「到自由画布修改」在 PPT 预览左上角版本选择旁，带上当前版本的图（data URL）和 `returnTo = { workId, slideId, slideLabel, deckName }`，打开自由画布最近的作品。白板准备好后先看一眼待带引用，过 400 毫秒（等存档的画面先放上去，且只在留下来的那份画布上）才取走、放图并强制打开画布。`returnTo` 存在图片的 `customData.canvasAnvil` 里，同一 lineage 的新版本通过 `getLineageReturnTo` 找到它，所以圈改出的新版本也能送回。「送回 PPT 第 N 页」在版本条末尾（只有一版时单独靠右）。送回经 bus 新增的 `updateWorkValue` 写进那件 PPT 作品的 `inbox` 键（由 app 注册实现，画布不碰作品库），作品已被删除时提示。PPT 打开作品、存档读完后取出收件箱并清空，按时间顺序加成对应页的 `edited` 版本，跳到最后一页并提示；对应页已删除的计数提示。注意：画布最窄 600px、对话最窄 340px，窗口太窄时画布打不开（原有限制）。

每个阶段做完都跑类型检查、lint、测试，并在浏览器里实际走一遍。纯逻辑（提取器、引用转 File、收件箱合并）加 `tests/references-*.test.ts`。

## 8. 待核实（动手时确认）

1. 设计器的导出在网站 iframe 里怎么截住文件（`a[download]` / `createObjectURL` / `showSaveFilePicker`）；报价单要先打开报价面板。
2. 多层户型：交付包按楼层分，还是只取设计器当前层。
3. PPT 开始页的参考资料（`ReferenceFile`）和素材候选怎么接收引用来的文本和图片。
4. 后台 draw.io 渲染：用一个隐藏 iframe 跑现有的消息协议（`load` → `export` png），离线时走本地副本。
5. 自由画布的版本条组件里放「送回 PPT」按钮的位置。
