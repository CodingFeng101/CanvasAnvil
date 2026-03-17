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

CanvasAnvil は、フローチャート、CAD ワークフロー、PPT の生成と編集に対応したマルチキャンバス AI 制作プラットフォームです。

## バージョン

現在のバージョン: `v1.0.0`

`v1.0.0` は最初の大きな実用リリースです。特に既存の PPT 編集を強化し、NotebookLM から書き出した PPT のテキスト編集と反復修正をより扱いやすくしました。

## v1.0.0 の主な更新

- `Flow`、`CAD`、`PPT` の操作体験を統一
- NotebookLM から書き出した PPT のテキスト編集をサポート
- 新規生成だけでなく、既存 PPT の修正と反復改善により適したワークフロー
- PPT 画像アップロード時に raw base64 をチャット入力へ直接埋め込まないよう改善
- PPT の画像生成・編集をローカルプロキシ経由に変更し、ブラウザ互換性を向上
- 画像参照チェーンに枚数制限、圧縮、失敗時のフォールバック再試行を追加
- PPT ワークスペースとドキュメント内の文字化けを複数修正

## キャンバスプレビュー

<table>
  <tr><td width="680" align="center"><strong>Flow Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/flow.gif?raw=1" alt="Flow canvas" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>CAD Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/cad.gif?raw=1" alt="CAD canvas" width="680" /></td></tr>
</table>

<table>
  <tr><td width="680" align="center"><strong>PPT Canvas</strong></td></tr>
  <tr><td width="680" align="left"><img src="public/demos/ppt.gif?raw=1" alt="PPT canvas" width="680" /></td></tr>
</table>

## オンラインデモ

- [CanvasAnvil を開く](https://canvasanvil.codingfgd.asia)

## チュートリアル動画

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## 機能概要

- `Flow`: draw.io XML ベースのフローチャート生成と部分編集
- `CAD`: 室内ワークフロー計画、分析ボード、2D 平面図、レンダータスク、BOM
- `PPT`: 構造化スライド生成、ページ単位の編集、画像補助付き反復、エクスポート

## クイックスタート

1. 依存関係をインストール

```bash
npm install
```

2. ローカル開発を起動

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

## よく使うコマンド

- `npm run dev`: Vite 開発サーバーを起動
- `npm run dev:full`: Web と API の開発サーバーを同時起動
- `npm run dev:web`: フロントエンド開発サーバーを起動
- `npm run dev:api`: API 開発サーバーを起動
- `npm run check`: TypeScript チェック
- `npm run lint`: ESLint
- `npm run build`: 本番ビルド
- `npm run preview`: ビルド結果をプレビュー
- `npm start`: API サーバーを起動

## 開発メモ

- AI 設定はローカルアプリ設定から読み込まれ、カスタムモデルサービスへ接続可能
- PPT のローカル開発は `/api/ppt-ai` ローカルプロキシルートに依存
- `vite.config.ts` のローカル API ルート設定を変更した場合は開発サーバーを再起動してください

## プロジェクト構成

```text
.
├─ agent/                      # Agent プロンプトとサブ Agent 仕様
├─ public/                     # 静的アセット
├─ src/
│  └─ workspaces/
│     ├─ flow/                 # Flow canvas
│     ├─ cad/                  # CAD canvas
│     └─ ppt/                  # PPT canvas
├─ api/                        # ローカル API ルート入口
└─ README.md
```

## 由来と統合

- Flow canvas: [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) を統合・拡張
- PPT canvas: [banana-slides](https://github.com/Anionex/banana-slides.git) を統合・拡張
- CAD canvas: エージェントワークフロー、2D SVG 編集、レンダー制御、BOM を含む自社実装

## ドキュメント

- デプロイガイド: [deploy/README.md](deploy/README.md)

## 連絡先

作者への連絡は下記 WeChat QR コードをご利用ください。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
