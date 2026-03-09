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

CanvasAnvil は、1つの要件を反復可能な成果物へ変換するマルチキャンバス AI 制作プラットフォームです。

## キャンバスプレビュー

<table>
  <tr><td width="680" align="center"><strong>Flow キャンバス</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Flow キャンバス" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>CAD キャンバス</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="CAD キャンバス" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>PPT キャンバス</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="PPT キャンバス" width="680" /></td></tr>
</table>

## 動画チュートリアル

- [Bilibili で見る](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube で見る](https://youtu.be/n3Otj--aLRo)
- [Douyin で見る](https://v.douyin.com/JwlwhmE6R40/)

## CanvasAnvil を試す

- [CanvasAnvil を開く](https://canvasanvil.codingfgd.asia)
- 注: 現在のサーバー構成は控えめなため、動作が遅く感じる場合があります。ご了承ください。

## 機能概要（ユーザー視点）

- `Flow`: フローチャート生成と部分編集（draw.io XML）
- `CAD`: 室内設計計画、分析ボード、2D 平面図、レンダータスク、BOM
- `PPT`: プレゼン草案の生成と反復編集

## 典型的なワークフロー

1. 要件を入力
2. 設計プランを生成・反復
3. 分析ボードを生成して方針を確認
4. 2D 平面図を生成・編集
5. 成果物をエクスポート（図 / リスト / スライド）

## クイックスタート

1. 依存関係をインストール
```bash
npm install
```
2. 開発サーバーを起動
```bash
npm run dev
```
既定 URL: `http://localhost:5173`

3. 型チェック
```bash
npm run check
```
4. 本番ビルド
```bash
npm run build
```

## 起源と統合

- Flow キャンバス: [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) を統合・拡張
- PPT キャンバス: [banana-slides](https://github.com/Anionex/banana-slides.git) を統合・拡張
- CAD キャンバス: 自社実装（アーキテクチャ、Agent ワークフロー、2D SVG 編集パイプライン、BOM/レンダーパイプライン）

主な改善点:

- キャンバス横断で統一された UX（チャット、コードブロック、ワンクリック適用）
- より安定した Agent ルーティングとリトライ機構
- CAD 専用機能（patch / replace / BOM / 7スロットレンダーフロー）
- キャンバス横断の状態/バージョン/エクスポートパイプライン

## コア機能（開発者視点）

- Flow: チャット駆動のフローチャート生成、patch/replace、ワンクリック適用、スナップショット復元
- CAD: `cad_plan` 出力、分析ボード並列生成、分析画像参照付き 2D SVG 部分更新、レンダー同時実行、BOM エクスポート
- PPT: 構造化コンテンツ生成、ページ単位の増分編集、ストリーミング反復

## 技術スタック

- フロントエンド: React 18 + TypeScript + Vite
- UI: Tailwind CSS + Radix UI + Lucide
- 図形エンジン: Flow は draw.io/diagrams.net、CAD は SVG-Edit
- モデル連携: 設定可能なマルチモデル接続（チャット / 画像）

## 便利なスクリプト

- `npm run dev`: 開発サーバー起動
- `npm start`: 本番起動（静的サイト + API）
- `npm run build`: 本番ビルド
- `npm run check`: TypeScript チェック
- `npm run lint`: ESLint

## プロジェクト構成（主要パス）

```text
.
|- agent/                      # CAD/Flow/PPT 向けプロンプトとサブ Agent 仕様
|- public/                     # 静的アセット（SVG-Edit を含む）
|- src/
|  |- workspaces/
|  |  |- flow/                 # Flow キャンバス
|  |  |- cad/                  # CAD キャンバス（自社コア）
|  |  |- ppt/                  # PPT キャンバス
|- api/                        # API ロジック
|- README.md
```

## ドキュメント

- デプロイガイド: [デプロイガイドを開く](deploy/README.md)

## WeChat 連絡先

私の WeChat QR コードはこちらです。お気軽にご連絡ください。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
