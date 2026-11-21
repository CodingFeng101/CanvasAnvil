# 在编程助手里用画布

画布不只活在这个网站里。装上插件或 Skill 后，在 Claude Code、Codex 这样的编程助手里说一句话，就能在对话旁边打开同一张画布。

## 四个 Skill

| Skill | 能做什么 |
| --- | --- |
| `diagram-skill` | 在对话里画 draw.io 图表，可以手动改，导出 drawio / SVG / PNG，数据存在项目的 `diagram/` 下 |
| `cad-skill` | 户型重建、布局、水电、检查，导出报价单和施工图，数据存在 `cad/` 下 |
| `ppt-skill` | 与网站同一套流程做演示稿：模板、大纲审阅、并发出图、导出 PPTX / PDF |
| `canvas-skill` | Excalidraw 白板生图与按标注改图，也带着图表和室内设计两张画布 |

所有 Skill 默认使用宿主自己的文本模型，不需要另填 API Key。只有生图需要单独配置图片服务。

## 插件（推荐）

插件把画布打包成一个 MCP 服务：装好后，助手可以直接打开画布、读取你在上面的修改。

### Claude Code

```bash
claude plugin marketplace add CodingFeng101/CanvasAnvil
claude plugin install canvasanvil-canvas@canvasanvil
```

也可以在 Claude Code 里用 `/plugin` 命令完成同样的操作。

### Codex

```bash
codex plugin marketplace add CodingFeng101/CanvasAnvil --ref main
codex plugin add canvasanvil-canvas@canvasanvil
```

装好后重启助手，调用 `$canvas-skill`、`$diagram-skill` 或 `$cad-skill` 打开对应画布。运行环境为 Node 20 以上；发布包已经包含 MCP 服务和界面，不需要再装 npm 依赖。

> [!NOTE]
> 以前从 `canvasanvil-local` 市场装过的，市场名已经改成 `canvasanvil`，请用第一条命令重新添加一次。

## 单独安装 Skill

只想要某一个 Skill，可以把它的文件夹放进助手的 skills 目录（Claude Code 是 `~/.claude/skills`，Codex 是 `~/.codex/skills`）。设置 → 技能与插件 里有四种方式，按你的环境挑一种：

- **一键安装**：本地运行时，网站可以直接替你复制过去；
- **npx**：一条 `npx degit` 命令，只取这一个文件夹；
- **git**：浅克隆加稀疏检出，再复制；
- **压缩包**：下载 zip，自己解压。

> [!WHY]
> 每个 Skill 文件夹都是**自足的**：不引用仓库里的其他代码，需要的脚本和资源都打包在里面。这样它可以被单独拷进任何项目使用，而不必带上整个 CanvasAnvil。
