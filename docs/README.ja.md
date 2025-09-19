# PickShot

Electron と React で構築した画像分類ソフトです。大量の画像を読み込みながら星評価でふるい分け、リッチなアニメーションとキーボード操作でテンポよく選別できます。

## ダウンロード

[![GitHub release (latest by date)](https://img.shields.io/github/v/release/igz0/pickshot)](https://github.com/igz0/pickshot/releases/latest)

**[📥 最新版をダウンロード](https://github.com/igz0/pickshot/releases/latest)**

- **Windows**: `.exe` インストーラーまたは `.zip` ポータブル版をダウンロード
- **macOS**: `.dmg` ファイルをダウンロード (Intel および Apple Silicon 対応)
- **Linux**: `.AppImage` ファイルをダウンロード

## ハイライト

- サブフォルダーを含めた画像フォルダーの一括スキャン (隠しファイルはスキップ)
- `react-window` + `AutoSizer` による仮想化グリッドで数千枚のサムネイルも滑らかに表示
- `sharp` ベースのバックグラウンドサムネイル生成と `photo://` `photo-thumb://` 独自プロトコルで高速ストリーミング
- 星評価はカードとプレビュー双方から操作でき、リッチなトランジションでお気に入りを把握
- 評価は `better-sqlite3` で永続化し、`exiftool-vendored` が動作している環境ではファイルメタデータにも同期
- 並び替え (更新日・名前・評価)、★あり/★なしフィルター、全画面プレビュー、リネーム・削除・Finder/Explorer 表示などの管理操作を内蔵
- `Shift + ?` で呼び出せるショートカットパネルと `⌘/Ctrl + O`, `0-5`, `[` `]`, `Delete` などのキーバインドでマウスレス運用に対応
- Tailwind CSS で統一したダーク UI を構築し、プレビュー幅はデスクトップレイアウト時にドラッグでリサイズ可能

## キーボードショートカット概要

- `⌘ / Ctrl + O`: フォルダーを読み込み
- `← / →` + `Shift`: 画像移動 / リスト端へジャンプ
- `0-5`, `[` `]`: 星評価の設定・増減
- `F`: 表示フィルターの切り替え (すべて / ★あり / ★なし)
- `S`: 並び替えモードの切り替え
- `Delete / Backspace`: 選択画像をゴミ箱へ移動
- `Shift + ?`: ショートカットパネルの開閉

## データ永続化とメタデータ同期

- 星評価は `app.getPath('userData')/pickshot/ratings.db` に保存され、アプリ再起動後も引き継がれます。
- サムネイルは同じ `userData` 配下の `thumbnails/` に WebP 形式でキャッシュされ、変更されたファイルのみ再生成します。
- `exiftool-vendored` が利用可能な環境では、読み込み時にファイルの星評価を読み込み、必要に応じて書き戻します (タイムアウトやボリュームが極端に遅い場合は自動で無効化)。

## プロジェクト構成

- `src/main/`: アプリ起動、Electron プロトコル登録、サムネイルキュー、ファイル操作 IPC を担当
- `src/main/db/ratingsStore.ts`: `better-sqlite3` を使った星評価ストア
- `src/main/metadata/ratingMetadata.ts`: `exiftool-vendored` 連携とメタデータ同期ロジック
- `src/preload/`: セキュアな `window.api` ブリッジの定義
- `src/renderer/`: React UI (グリッド・プレビュー・コンテキストメニュー・リネームダイアログなど)
- `src/shared/types.ts`: プロセス間で共有する型定義

## 開発環境

- Node.js 24.8.0 / npm 10.8.2 (Volta で固定)
- macOS では Xcode Command Line Tools、Windows では Visual Studio Build Tools などネイティブモジュールのビルドに必要な環境が必要です。

## セットアップ

```bash
npm install
npm run dev
```

`npm run dev` はメイン・プリロード・レンダラーの変更を同時ウォッチし、ホットリロードします。

### ネイティブモジュールの再ビルド

Electron のバージョンを更新した場合やビルド環境を変えた場合は、ネイティブ依存 (`better-sqlite3`, `sharp`) を再ビルドしてください。

```bash
npm run rebuild-native
```

## コマンド一覧

- `npm run dev`: 開発用ホットリロードサーバーを起動
- `npm run preview`: レンダラーのみを Vite でプレビュー
- `npm run build`: 本番ビルドを `dist/` に出力
- `npm run package`: electron-builder で各プラットフォーム向けインストーラーを `release/` に生成
- `npm run package:mac` / `npm run package:win`: macOS / Windows 向けに限定してパッケージング
- `npm run lint`: Biome による静的解析
- `npm run lint:fix`, `npm run lint:fix-unsafe`: Biome の自動修正
- `npm run format`: コード整形

## 開発時の確認ポイント

- `npm run dev` の実行環境で、異なるフォルダーの読み込み、サムネイル生成、星評価の永続化とメタデータ同期、削除・リネーム・Finder/Explorer 表示、全画面プレビュー、ショートカット操作を手動で確認してください。

## 多言語対応

- アプリのデフォルト言語は英語です。OS が日本語環境の場合は自動的に日本語 UI になります。

## ライセンス

MIT
