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

CanvasAnvil 是一個多畫布 AI 創作平台，能把單一需求轉換為可持續迭代的交付成果。

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

## 影片教學

- [在 Bilibili 觀看](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [在 YouTube 觀看](https://youtu.be/n3Otj--aLRo)
- [在抖音觀看](https://v.douyin.com/JwlwhmE6R40/)

## 線上試用 CanvasAnvil

- [開啟 CanvasAnvil](https://canvasanvil.codingfgd.asia)
- 注意：目前伺服器配置較低，服務偶爾可能有延遲或卡頓，感謝理解。

## 功能概覽（使用者視角）

- `Flow`：流程圖生成與局部編輯（draw.io XML）
- `CAD`：室內設計規劃、分析看板、2D 平面圖、渲染任務與 BOM
- `PPT`：簡報草稿生成與迭代編輯

## 典型工作流程

1. 輸入需求
2. 生成並迭代設計方案
3. 生成分析看板並確認策略
4. 生成並編輯 2D 平面圖
5. 匯出成果（圖表 / 清單 / 簡報）

## 快速開始

1. 安裝依賴
```bash
npm install
```
2. 啟動開發模式
```bash
npm run dev
```
預設網址：`http://localhost:5173`

3. 型別檢查
```bash
npm run check
```
4. 生產建置
```bash
npm run build
```

## 來源與整合

- Flow 畫布：整合並增強自 [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io)
- PPT 畫布：整合並增強自 [banana-slides](https://github.com/Anionex/banana-slides.git)
- CAD 畫布：內部自研（架構、Agent 工作流、2D SVG 編輯管線、BOM/渲染管線）

主要改進：

- 跨畫布統一體驗（對話、程式碼區塊、一鍵套用到畫布）
- 更穩定的 Agent 路由與重試機制
- CAD 專屬能力（patch / replace / BOM / 7 槽位渲染流程）
- 跨畫布狀態/版本/匯出管線

## 核心能力（開發者視角）

- Flow：對話驅動流程圖生成、patch/replace、一鍵套用、快照回復
- CAD：`cad_plan` 輸出、分析看板並行生成、引用分析圖的 2D SVG 局部更新、渲染任務併發、BOM 匯出
- PPT：結構化內容生成、頁面級增量編輯、串流式迭代

## 技術棧

- 前端：React 18 + TypeScript + Vite
- UI：Tailwind CSS + Radix UI + Lucide
- 圖形引擎：Flow 使用 draw.io/diagrams.net，CAD 使用 SVG-Edit
- 模型整合：可配置多模型接入（聊天 / 圖像）

## 常用腳本

- `npm run dev`：啟動開發伺服器
- `npm start`：生產啟動（靜態站點 + API）
- `npm run build`：生產建置
- `npm run check`：TypeScript 檢查
- `npm run lint`：ESLint

## 專案結構（關鍵路徑）

```text
.
|- agent/                      # CAD/Flow/PPT 的提示詞與子 Agent 規格
|- public/                     # 靜態資產（含 SVG-Edit）
|- src/
|  |- workspaces/
|  |  |- flow/                 # Flow 畫布
|  |  |- cad/                  # CAD 畫布（自研核心）
|  |  |- ppt/                  # PPT 畫布
|- api/                        # API 邏輯
|- README.md
```

## 文件

- 部署指南：[開啟部署指南](deploy/README.md)

## 微信

我的微信二維碼如下，歡迎聯繫我。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
