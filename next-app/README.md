## 牛乳配達顧客管理 Next.js 版

[`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app) をベースに、既存 React/Vite + Express 実装を Next.js + Supabase に移行するための土台です。

---

## 1. セットアップ

### 1.1 依存インストール

```bash
cd next-app
npm install
```

### 1.2 環境変数

`env.local.example` をコピーして `.env.local` を作成します。

```bash
cp env.local.example .env.local
```

下記の値を設定してください。

- `NEXT_PUBLIC_SUPABASE_URL` : Supabase プロジェクトの URL（例: `https://dvmanjcavamgljdtloby.supabase.co`）
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` : Supabase anon キー
- `SUPABASE_SERVICE_ROLE_KEY` : Route Handler やサーバーアクションで管理者操作が必要な場合に利用（未使用なら空で可）

※ 機密値は Git にはコミットせず、Vercel では Project Settings → Environment Variables に登録します。

---

## 2. スクリプト

### 開発サーバー

```bash
npm run dev
```

`http://localhost:3000` でアプリを確認できます。

### Lint / 型チェック（今後追加予定）

今後 `npm run lint` や `npm run type-check` を整備予定です。

---

## 3. フォルダ構成（暫定）

```
next-app/
├── src/
│   ├── app/               # App Router
│   └── lib/               # Supabase クライアント等の共通モジュール
├── env.local.example
├── next.config.ts
└── tsconfig.json
```

既存の `client` / `server` ディレクトリから段階的に移行し、完了後に本構成へ統合します。

---

## 4. デプロイ

Vercel で `next-app` ディレクトリを根としてデプロイします。環境変数に Supabase の URL / Key を登録し、必要に応じて Supabase サービスロールキーを保管してください。
