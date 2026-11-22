# 快速开始

从一份干净的代码，到在浏览器里画出第一张图，大约只需要五分钟。

## 在线使用

不想在本地安装的话，可以直接打开在线版：[canvasanvil.codingfgd.asia](https://canvasanvil.codingfgd.asia)。打开后在设置里填好自己的模型，就能开始。

## 在本地运行

需要 Node.js 20 或更高版本。

### 1. 安装依赖

```bash
npm install
```

### 2. 启动

```bash
npm run dev
```

这一条命令同时启动网页和接口服务。打开 `http://127.0.0.1:8001` 就能看到首页。

> [!NOTE]
> 开发时接口由 Vite 中间件在同一进程里提供，所以不需要另开一个后端。部署到服务器时，CanvasAnvil 也是单服务运行，细节见仓库里的 `deploy/README.zh-CN.md`。

### 3. 接上模型

点左下角的设置，或按 `Ctrl + ,`，进入「模型」：填入 Base URL、API Key 和模型名，再点「测试连接」。详细说明见 [接入模型](/docs/models)。

### 4. 画第一张图

回到首页，选一张画布，在输入框里写下你想要的东西，比如：

```text
画一张电商系统的架构图：前端、网关、订单 / 库存 / 支付三个服务，各自的数据库，以及一条消息队列。
```

几秒后，第一稿就会出现在右边的画布上。之后的每一句话，都是在这张图上接着改。

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 在 8001 端口启动应用 |
| `npm run check` | TypeScript 类型检查 |
| `npm run lint` | ESLint |
| `npm test` | 运行测试 |
| `npm run build` | 构建生产版本 |

## 可选的依赖

大多数功能只需要 Node。下面两项是室内设计画布的增强功能，缺了不会报错，只是对应的按钮不显示：

- **上传原始户型图**：服务器需要 Python，并执行 `pip install -r server/recognizer/requirements.txt`。
- **交付检查**：服务器上需要 Chrome、Edge 或 Chromium（也可以用 `CHROME_PATH` 指定）。

Docker 镜像已经自带这些依赖。
