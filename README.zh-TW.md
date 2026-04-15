<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>面向 Flow、CAD 與 PPT 的多畫布 AI 創作平台。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">简体中文</a> ·
  <a href="README.zh-TW.md">繁體中文</a> ·
  <a href="README.ja-JP.md">日本語</a> ·
  <a href="README.ko-KR.md">한국어</a> ·
  <a href="README.fr-FR.md">Français</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v1.0.2-2563eb?style=for-the-badge" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-Flow%20%7C%20CAD%20%7C%20PPT-0f766e?style=for-the-badge" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-7c3aed?style=for-the-badge" />
</p>

> CanvasAnvil 將流程圖生成、CAD 工作流與 PPT 製作整合在同一個工作空間中。

## 版本

目前版本：`v1.0.2`

- `v1.0.2`：PPT 切換為圖片優先工作流，將文字辨識與文字回填延後到可編輯 PPTX 匯出時執行，並把 PPT 模板改為 IndexedDB 持久化
- `v1.0.1`：修復 PPT 與 CAD 工作區圖片的持久化問題

## ✨ 產品概覽

| 畫布 | 聚焦能力 | 常見產出 |
| --- | --- | --- |
| `Flow` | 基於 draw.io XML 的生成與局部編輯 | 流程圖、系統圖、邏輯圖 |
| `CAD` | 面向室內設計的工作流規劃與分析 | 分析板、2D 平面圖、渲染任務、BOM |
| `PPT` | 結構化投影片生成與圖片優先迭代 | 簡報、頁面視覺稿、多格式匯出 |

## 🚀 本次更新

- PPT 現在改為圖片優先工作流
- 在互動區中的微調與重新渲染，會直接重新生成頁面圖片，不再在建立階段預先處理可編輯文字層
- 匯出拆分為 `PDF`、`圖片版 PPT`、`可編輯 PPTX`
- 文字辨識、去字底圖與文字回填只會在匯出 `可編輯 PPTX` 時觸發
- 上傳模板與隱藏預設模板的偏好現在會透過 IndexedDB 在本地持久化保存

## 🖼️ 畫布預覽

<table>
  <tr><td width="680" align="center"><strong>Flow 畫布</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Flow 畫布" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>CAD 畫布</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="CAD 畫布" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>PPT 畫布</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="PPT 畫布" width="680" /></td></tr>
</table>

## 🌐 線上體驗

- [開啟 CanvasAnvil](https://canvasanvil.codingfgd.asia)

## 🎬 影片教學

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [抖音](https://v.douyin.com/JwlwhmE6R40/)

## 🧩 能力概覽

- `Flow`：基於 draw.io XML 的流程圖生成與局部編輯
- `CAD`：室內工作流規劃、分析板、2D 平面圖、渲染任務與 BOM
- `PPT`：結構化投影片生成、圖片優先迭代、模板持久化與多格式匯出

## ⚡ 快速開始

1. 安裝依賴

```bash
npm install
```

2. 啟動本地開發

```bash
npm run dev
```

預設位址：`http://localhost:5173`

3. 執行型別檢查

```bash
npm run check
```

4. 建置正式版本

```bash
npm run build
```

## 🛠️ 常用命令

- `npm run dev`：啟動 Vite 開發伺服器
- `npm run dev:full`：同時啟動 Web 與 API 開發服務
- `npm run dev:web`：啟動前端開發服務
- `npm run dev:api`：啟動 API 開發服務
- `npm run check`：執行 TypeScript 檢查
- `npm run lint`：執行 ESLint
- `npm run build`：正式建置
- `npm run preview`：預覽建置結果
- `npm start`：啟動 API 服務

## 🧪 開發說明

- AI 設定從本地應用設定中讀取，也可以接入自訂模型服務
- PPT 本地開發依賴本地 `/api/ppt-ai` 代理路由
- 若修改了 `vite.config.ts` 中的本地 API 路由映射，需要重新啟動開發伺服器

## 🗂️ 專案結構

```text
.
├── agent/                      # Agent Prompt 與子 Agent 規範
├── public/                     # 靜態資源
├── src/
│   └── workspaces/
│       ├── flow/               # Flow 畫布
│       ├── cad/                # CAD 畫布
│       └── ppt/                # PPT 畫布
├── api/                        # 本地 API 路由入口
└── README.md
```

## 🔗 來源與整合

- Flow 畫布：整合並擴展自 [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT 畫布：整合並擴展自 [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD 畫布：專案自研，包含 agent 工作流、2D SVG 編輯、渲染編排與 BOM 鏈路

## 📚 文件

- 部署說明：[deploy/README.md](deploy/README.md)

## 📮 聯絡方式

可掃描下方微信二維碼聯絡作者。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
