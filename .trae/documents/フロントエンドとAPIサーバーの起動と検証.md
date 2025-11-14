## 前提・構成
- APIは `server/index.js` でポート `9000` を使用 (`server/index.js:8`)。ヘルスは `GET /api/health` (`server/index.js:38`)。
- フロントは Vite 開発サーバーでポート `3000`、`/api` を `http://localhost:9000` へプロキシ (`client/vite.config.ts:14-22`)。
- Axios は既定で `baseURL='/api'` を使用 (`client/src/utils/apiClient.ts:4-12`)、二重 `/api` を正規化 (`client/src/utils/apiClient.ts:17-29`)。
- ルートのスクリプト: `npm run server` と `npm run client` で各サーバー起動 (`package.json:7-9`)。同時起動は `npm run dev` (`package.json:7`)。

## 起動手順
1. 依存関係の確認/インストール
   - 実行: `npm run install-all` または `npm run setup`（ルート）。
2. DB 初期化（必要時）
   - 実行: `cd server && npm run init-db`。
3. API サーバー起動（ポート9000）
   - 実行: ルートで `npm run server`（内部で `server` ディレクトリの `nodemon index.js`）。
4. API ヘルス確認
   - 実行: `http://localhost:9000/api/health` へアクセスし `{"status":"OK"}` を確認。
5. フロントエンド起動（ポート3000）
   - 実行: ルートで `npm run client`（`client` ディレクトリの `vite`）。
6. ブラウザ確認
   - 実行: `http://localhost:3000/` を開く。開発プロキシ経由で API に接続できることを確認。

## 動作確認項目
- API 呼び出し正常性
  - `GET http://localhost:9000/api/customers` で顧客一覧取得。
  - フロントから `/api/customers` へ呼び出し成功（Network タブで 200 を確認）。
- ルーティング/ページ表示
  - トップ/顧客一覧/請求画面などの主要ページのロードと基本操作（検索・ページング）。

## トラブルシューティング
- ポート競合: `9000`/`3000` が使用中の場合は該当プロセスを終了または代替ポート設定。
- 環境変数: `VITE_API_BASE_URL` を未設定にして開発プロキシを有効化（`client/vite.config.ts:17-22`）。外部 API を使う場合は `VITE_API_BASE_URL` にベースURLを設定。
- CORS/ネットワーク: サーバーは `cors()` 済み (`server/index.js:11`)。Firewall がブロックしていないか確認。
- テスト環境: `NODE_ENV` が `test` だと `listen` しないため、開発では未設定/`development` を使用 (`server/index.js:70-75`)。

## 次の確認シナリオ（起動後すぐ実施）
- 顧客一覧ロード→任意顧客詳細→請求確認（該当月の `confirm` 実行）→支払登録→再計算の整合性を API レスポンスで検証。

この手順で両サーバーを起動・検証します。ご承認いただければ、直ちに実行に移ります。