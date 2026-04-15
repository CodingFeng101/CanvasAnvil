<p align="center">
  <img src="public/logo.png" alt="CanvasAnvil logo" width="92%" />
</p>

<h1 align="center">CanvasAnvil</h1>

<p align="center">
  <strong>Flow、CAD、PPT をひとつにまとめたマルチキャンバス AI 制作プラットフォーム。</strong>
</p>

<p align="center">
  <a href="README.md">English</a> ·
  <a href="README.zh-CN.md">Simplified Chinese</a> ·
  <a href="README.zh-TW.md">Traditional Chinese</a> ·
  <a href="README.ja-JP.md">Japanese</a> ·
  <a href="README.ko-KR.md">Korean</a> ·
  <a href="README.fr-FR.md">French</a>
</p>

<p align="center">
  <img alt="version" src="https://img.shields.io/badge/version-v1.0.1-2563eb?style=for-the-badge" />
  <img alt="workspaces" src="https://img.shields.io/badge/workspaces-Flow%20%7C%20CAD%20%7C%20PPT-0f766e?style=for-the-badge" />
  <img alt="stack" src="https://img.shields.io/badge/stack-Vite%20%2B%20React%20%2B%20TypeScript-7c3aed?style=for-the-badge" />
</p>

> CanvasAnvil は、フローチャート生成、CAD 向けワークフロー、PPT 制作をひとつの作業空間にまとめた AI プラットフォームです。

## ✨ 概要

| キャンバス | 主な役割 | 代表的な出力 |
| --- | --- | --- |
| `Flow` | draw.io XML ベースの生成と部分編集 | フローチャート、システム図、ロジック図 |
| `CAD` | インテリア向けワークフロー設計と分析 | 分析ボード、2D 平面図、レンダータスク、BOM |
| `PPT` | 構造化スライド生成と画像優先の反復編集 | プレゼン資料、スライドビジュアル、多形式エクスポート |

## 🚀 今回の更新

- PPT は画像優先ワークフローに切り替わりました
- 編集画面での微調整や再レンダリングは、作成段階で編集可能なテキストレイヤーを事前処理せず、スライド画像を直接再生成します
- エクスポートは `PDF`、`画像ベース PPT`、`編集可能 PPTX` の 3 種類に分かれます
- OCR、文字なし背景の生成、テキストの再配置は `編集可能 PPTX` を書き出すときだけ実行されます
- アップロードした PPT テンプレートと非表示にしたプリセットテンプレートの設定は、IndexedDB ベースのローカル保存に対応しました

## 🖼️ キャンバスプレビュー

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

## 🌐 オンラインデモ

- [CanvasAnvil を開く](https://canvasanvil.codingfgd.asia)

## 🎬 動画チュートリアル

- [Bilibili](https://www.bilibili.com/video/BV1jzZ3BBEHc?vd_source=b6b031f92061ae667eba1185f4782a1c)
- [YouTube](https://youtu.be/n3Otj--aLRo)
- [Douyin](https://v.douyin.com/JwlwhmE6R40/)

## 🧩 機能概要

- `Flow`: draw.io XML ベースのフローチャート生成と部分編集
- `CAD`: インテリア向けワークフロー設計、分析ボード、2D 平面図、レンダータスク、BOM
- `PPT`: 構造化スライド生成、画像優先の反復編集、テンプレート保存、複数形式でのエクスポート

## ⚡ クイックスタート

1. 依存関係をインストール

```bash
npm install
```

2. ローカル開発を起動

```bash
npm run dev
```

既定の URL: `http://localhost:5173`

3. 型チェックを実行

```bash
npm run check
```

4. 本番ビルド

```bash
npm run build
```

## 🛠️ よく使うコマンド

- `npm run dev`: Vite 開発サーバーを起動
- `npm run dev:full`: Web と API の開発サーバーを同時に起動
- `npm run dev:web`: フロントエンド開発サーバーを起動
- `npm run dev:api`: API 開発サーバーを起動
- `npm run check`: TypeScript チェック
- `npm run lint`: ESLint
- `npm run build`: 本番ビルド
- `npm run preview`: ビルド結果のプレビュー
- `npm start`: API サービスを起動

## 🧪 開発メモ

- AI 設定はローカルアプリ設定から読み込み、カスタムモデルプロバイダーにも接続できます
- PPT のローカル開発はローカル `/api/ppt-ai` プロキシルートに依存します
- `vite.config.ts` のローカル API ルーティングを変更した場合は、開発サーバーを再起動してください

## 🗂️ プロジェクト構成

```text
.
├── agent/                      # Agent プロンプトとサブ Agent 仕様
├── public/                     # 静的アセット
├── src/
│   └── workspaces/
│       ├── flow/               # Flow キャンバス
│       ├── cad/                # CAD キャンバス
│       └── ppt/                # PPT キャンバス
├── api/                        # ローカル API ルート
└── README.md
```

## 🔗 由来と統合

- Flow キャンバス: [next-ai-draw-io](https://github.com/DayuanJiang/next-ai-draw-io) を統合・拡張
- PPT キャンバス: [banana-slides](https://github.com/Anionex/banana-slides.git) を統合・拡張
- CAD キャンバス: agent ワークフロー、2D SVG 編集、レンダー制御、BOM パイプラインを含む自社実装

## 📚 ドキュメント

- デプロイガイド: [deploy/README.md](deploy/README.md)

## 📮 連絡先

下の WeChat QR コードをスキャンして作者へ連絡できます。

<p align="left">
  <img src="public/wechat.jpg" alt="WeChat QR code" width="280" />
</p>
