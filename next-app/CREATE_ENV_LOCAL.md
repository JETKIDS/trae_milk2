# .env.local ファイルの作成方法

`next-app/.env.local` ファイルを手動で作成し、以下の内容を設定してください：

```bash
NEXT_PUBLIC_SUPABASE_URL="https://dvmanjcavamgljdtloby.supabase.co"
NEXT_PUBLIC_SUPABASE_ANON_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImR2bWFuamNhdmFtZ2xqZHRsb2J5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI3NjExNjcsImV4cCI6MjA3ODMzNzE2N30.etfO2-Dg7e131y08YlJ27G5SXDoyI81lCAh3INlTo9M"
SUPABASE_SERVICE_ROLE_KEY="<ここに Service Role Key を設定>"
```

## Service Role Key の取得方法

1. Supabase Dashboard にログイン: https://supabase.com/dashboard
2. プロジェクトを選択: https://supabase.com/dashboard/project/dvmanjcavamgljdtloby
3. 左メニューから「Settings」→「API」を選択
4. 「Service Role Key」セクションの「Reveal」ボタンをクリック
5. 表示されたキーをコピーして、上記の `<ここに Service Role Key を設定>` の部分に貼り付け

## ファイル作成後

以下のコマンドでインポートを実行できます：

```bash
cd next-app
npm run migrate:import
```

