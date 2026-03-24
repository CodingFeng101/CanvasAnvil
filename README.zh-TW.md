<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <a href="README.md">English</a> |
  <a href="README.zh-CN.md">简体中文</a> |
  <a href="README.zh-TW.md">繁體中文</a> |
  <a href="README.ja-JP.md">日本語</a> |
  <a href="README.ko-KR.md">한국어</a> |
  <a href="README.fr-FR.md">Français</a>
</p>

CanvasAnvil 是一個多畫布 AI 創作平台，面向流程圖、CAD 工作流與 PPT 生成/編輯。

## 版本

目前版本：`v1.0.1`

`v1.0.1` 是一個以持久化修復為重點的補丁版本。PPT 與 CAD 工作區中的圖片現在可以更穩定地跨重新整理保留，除非使用者明確清空工作區。

`v1.0.0` 是第一個重大可用版本，重點是更好地支援現有 PPT 的編輯，尤其是支援對 NotebookLM 匯出的 PPT 進行文字編輯與迭代。

## v1.0.1 補丁更新

- 將 PPT 工作區中的大型圖片狀態改為 IndexedDB 持久化，修復重新整理後圖片遺失問題
- 修復 PPT 的恢復順序，避免輕量快照覆蓋最新的圖片持久化狀態
- 將 CAD 渲染圖與分析圖改為 IndexedDB 持久化，並優化占位狀態處理，提升重新整理後的恢復穩定性

## v1.0.0 重點更新

- 統一 `Flow`、`CAD`、`PPT` 三類畫布的互動模式
- 支援對 NotebookLM 匯出的 PPT 進行文字編輯
- 更適合對既有 PPT 進行修改與迭代，而不只是首輪生成
- PPT 圖片上傳不再把原始 base64 大文本塞進聊天輸入
- PPT 圖像生成與編輯統一走本地代理，減少瀏覽器跨域問題
- 圖片參考鏈路增加數量限制、壓縮與失敗降級重試
- 修復多處 PPT 工作區與文件亂碼問題

## 畫布預覽

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

## 線上體驗

- [打開 CanvasAnvil](https://canvasanvil.codingfgd.asia)

## 教學影片

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [抖音](https://v.douyin.com/JwlwhmE6R40/)

## 能力概覽

- `Flow`：基於 draw.io XML 的流程圖生成與局部編輯
- `CAD`：室內工作流規劃、分析板、2D 平面圖、渲染任務與 BOM
- `PPT`：結構化投影片生成、頁面級編輯、圖像輔助迭代與匯出

## 快速開始

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

4. 建構正式版本

```bash
npm run build
```

## 常用命令

- `npm run dev`：啟動 Vite 開發服務
- `npm run dev:full`：同時啟動 Web 與 API 開發服務
- `npm run dev:web`：啟動前端開發服務
- `npm run dev:api`：啟動 API 開發服務
- `npm run check`：TypeScript 檢查
- `npm run lint`：ESLint 檢查
- `npm run build`：正式建構
- `npm run preview`：預覽建構結果
- `npm start`：啟動 API 服務

## 開發說明

- AI 設定從本地應用設定中讀取，可接入自訂模型服務
- PPT 本地開發現在依賴本地 `/api/ppt-ai` 代理路由
- 若修改了 `vite.config.ts` 中的本地 API 路由映射，需要重新啟動開發服務

## 專案結構

```text
.
├─ agent/                      # Agent Prompt 與子 Agent 規格
├─ public/                     # 靜態資源
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # Flow 畫布
│     ├─ cad/                  # CAD 畫布
│     └─ ppt/                  # PPT 畫布
├─ api/                        # 本地 API 路由入口
└─ README.md
```

## 來源與整合

- Flow 畫布：整合並擴展自 [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT 畫布：整合並擴展自 [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD 畫布：專案自研，包含 agent 工作流、2D SVG 編輯、渲染編排與 BOM 鏈路

## 文件

- 部署說明：[deploy/README.md](deploy/README.md)

## 聯絡方式

可掃描下方微信 QR code 聯絡作者。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
