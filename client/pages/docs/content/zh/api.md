# 接口与模型客户端

浏览器从不直接和模型服务商说话，所有请求都经过 CanvasAnvil 自己的服务。这一篇列出这些接口，以及模型客户端怎样只用一种协议接上所有厂商。

## 路由表

所有接口登记在 `server/http/routes.ts` 的 `API_ROUTES` 一张表里，Express 和 Vite 开发中间件读的是同一张表。

| 接口 | 作用 |
| --- | --- |
| `POST /api/chat` | 图表画布的流式对话，带工具调用 |
| `POST /api/ppt-ai` | 非流式的模型调用，室内设计、PPT、自由绘制共用 |
| `POST /api/ppt-ai/stream` | 同上的流式版本 |
| `POST /api/cad/recognize` | 从原始户型图识别墙体和门窗（需要 Python） |
| `POST /api/cad/qa` | 户型的交付检查（需要浏览器） |
| `POST /api/editable-export` | 可编辑 PPTX 导出 |
| `GET /api/skills` | 列出可安装的 Skill 及安装状态 |
| `GET /api/skills/zip` | 下载某个 Skill 的压缩包 |
| `POST /api/skills/install` | 本地一键安装 Skill |
| `GET /api/config` | 服务端的公开配置 |

## 一种协议

每一次模型调用都说 OpenAI 的 HTTP 协议：

| 用途 | 路径 |
| --- | --- |
| 对话、视觉、所有文本生成 | `POST {baseUrl}/chat/completions` |
| 生成图片 | `POST {baseUrl}/images/generations` |
| 带参考图改图 | `POST {baseUrl}/images/edits` |

没有厂商列表。换厂商，就是在设置里把 Base URL 指向它的 OpenAI 兼容端点。

> [!WHY]
> 维护一张厂商列表，意味着每个厂商的怪癖都要写进代码，每次它们改接口都要跟着改。而 OpenAI 协议已经是事实上的通用语：几乎每家服务商、每个网关都提供兼容端点。只说这一种语言，代码最少，能接的却最多。

生图先试 images 接口，失败再退回 `/chat/completions` 加 `image_url` 的方式，因为不少兼容网关把图片模型暴露成对话模型。这个回退顺序由 `tests/ai-request-shape.test.ts` 固定下来。

## 两条通往模型的路

- **`/api/ppt-ai`**：非流式，通过 `client/ai/client.ts` 调用。密钥不出现在跨域请求里，服务端还能把浏览器取不到的远程图片内联进来。
- **`/api/chat`**：流式加工具调用，供图表画布使用。它是一条管线：校验、提取附件、摘要、拼装提示词、流式返回。详见 [图表的对话管线](/docs/diagram-pipeline)。

## 调试

设置环境变量 `PROMPT_LOG_DIR`，可以把拼装好的完整提示词写到磁盘上。默认关闭，因为日志里有用户的内容。
