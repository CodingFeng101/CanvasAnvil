# 架构

CanvasAnvil 是同一个仓库里的三个程序：浏览器里的 Vite + React 应用、一个小小的 Node 服务，以及两者之间的约定。四张画布共用一个外壳、一套组件和一个模型客户端。

```diagram
architecture
```

## 目录

```text
client/                 浏览器应用
  app/                  外壳：App、画布注册表、设置、错误边界
  ai/                   浏览器端的模型门面与设置存储
  workspaces/<id>/      每张画布一个目录，结构相同：
      <Id>Workspace.tsx   注册表懒加载的入口
      canvas/             画布那一半
      chat/               对话那一半
      lib/                只有这张画布用的纯逻辑
      hooks/              它的有状态部分
      storage.ts          它持久化的键
  pages/                首页、文档
  shared/               不止一张画布用到的东西

server/                 接口服务
  routes/               每个接口一个文件
  chat/                 /api/chat 的管线，每个阶段一个模块
  ai/                   OpenAI 协议的传输层
  http/                 路由表、Node 与 Web 的适配、Vite 中间件

contracts/              客户端与服务端的共同约定（AIConfig 及其规范化），不含浏览器或 Node API
resources/              运行时读取的数据：提示词、draw.io 图形库说明
skill/                  四个可以独立拷走的 Skill
```

## 结构所依赖的规则

**`server/` 不从 `client/` 引入任何东西。** 它们是两个程序，唯一共享的是 `contracts/`。

> [!WHY]
> 曾经有一段时间，draw.io 的系统提示词和 Langfuse 客户端都住在图表画布的目录里——因为后端顺手从前端文件夹里取了东西。这条规则就是从那次教训里来的。

**`server/**` 用相对路径导入，不用 `@/` 别名。** `vite.config.ts` 会引入开发中间件，好让 `npm run dev` 一条命令就带上接口；而 Vite 用纯 Node 加载自己的配置，不认识 tsconfig 里的路径别名。

**`shared/` 与 `workspaces/` 不引入 `@/app`。** 依赖只向下走：外壳可以用画布，画布不能反过来依赖外壳。

**存储键是承重墙。** IndexedDB 的库名和 localStorage 的键承载着用户跨版本的作品。图表画布的键至今保留着 `next-ai-draw-io-` 前缀，因为改名就会让旧数据成为孤儿。

## 一张画布内部

画布只朝一个方向长：掌管屏幕的那个组件越来越大。`PptCanvas.tsx` 曾经长到 5300 行。它被拆成三层，按需要多少 React 来分：

- **`lib/`——完全不需要。** 纯函数处理纯数据：一页幻灯片解析到哪个版本、缩放手柄的几何、提示词的结构。规则住在这里，测试也覆盖这里。
- **`hooks/`——状态与副作用，一个功能一个。** 需要别的功能所拥有的东西时，作为参数传进来，而不是伸手去拿。
- **`views/`——只有 JSX。** 一个界面一个文件，接收 hooks 的返回值作为 props。视图自己持有状态，说明状态放错了地方。

> [!WHY]
> **先抽状态，再抽视图。** PPT 的开始界面原本需要组件里的 30 个值；先抽出 `useCreationInputs` 之后只剩 9 个。顺序反过来，只是把一个长文件换成了一串长长的 props。
>
> 但不是什么都该进 hook。幻灯片本身——`localSlides` 及其同伴——留在了 `PptCanvas` 里：每条生成流程都碰它，214 处引用。判断标准是边界是否已经存在：存在，hook 给它起个名字；不存在，hook 就凭空发明一条边界，下游的每一处都要为此付出代价。

## 打包

入口 chunk 只包含外壳。每张画布、每个重依赖（`pptxgenjs`、`pdf-lib`、`pdfjs`、`mammoth`、ELK）都按需加载；这份文档也是一个独立的 chunk。

`vite.config.ts` 里的 `manualChunks` 特意用函数形式：对象形式会让 Vite 的动态导入预加载助手被提升进某个 vendor chunk，结果把整个 chunk 拖进了首屏加载。
