# 扩展与测试

加一张画布、加一个接口，都只需要在一张表里添一行。这一篇讲怎么做，以及改完之后怎么确认没有弄坏别的东西。

## 加一张画布

1. 在 `client/workspaces/<id>/` 下按统一结构建目录：`<Id>Workspace.tsx`、`canvas/`、`chat/`、`lib/`、`hooks/`、`storage.ts`。
2. 在 `client/app/workspaces.ts` 的 `WORKSPACES` 数组里加一项，并给它单独的懒加载 import，让它不进首屏。

侧边栏、记住上次选择、渲染画布，读的都是这个数组，其他地方不用动。

> [!TIP]
> 画布的数据按键存进它自己的 IndexedDB，就会自动拥有「我的作品」：多份作品、切换、导出和导入。见 [作品如何保存](/docs/works-storage)。

### 别忘了

- 所有界面文字都要有中文和英文两份。
- 存储键一旦发布就不再改名。
- 画布内部的纯逻辑放进 `lib/`，测试也写给它。

## 加一个接口

在 `server/routes/` 下写好处理函数，再在 `server/http/routes.ts` 的 `API_ROUTES` 里登记一行。Express 和 Vite 开发中间件都读这张表。

改了 `vite.config.ts` 里的本地接口路由后，需要重启开发服务。

## 检查

```bash
npm run check   # tsc，严格模式
npm run lint    # eslint
npm test        # node:test，经由 tsx 运行
npm run build   # tsc + vite build
```

测试都在 `tests/` 下，覆盖的是各画布 `lib/` 里的规则：排版的打分与门槛、意图判断、户型几何、作品存储、模型请求的形状。

> [!WHY]
> 规则住在纯函数里，测试就不需要浏览器、不需要模型、也不需要网络，几秒钟跑完几百条。界面会变，规则不该悄悄变——测试守住的是后者。

## 图表排版的评测

排版算法的改动不靠感觉判断。`tools/eval/diagram` 里有一套评测图，分为 dev 和 holdout 两部分：在 dev 上调参数，到 holdout 上验证，确认顺序和对齐的保留率没有掉下来，再采用。
