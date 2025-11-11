import Link from "next/link";
import styles from "./page.module.css";

const nextSteps = [
  "Supabase スキーマを用意し、データ移行スクリプトを実装する",
  "顧客詳細・請求・入金機能を Next.js の新しい API 経由で再構築する",
  "広告枠に本番タグを埋め込めるよう、配信ネットワークを決定する",
];

export default function Home() {
  return (
    <section className={styles.container}>
      <header className={styles.heading}>
        <h1>Next.js 版ダッシュボード準備中</h1>
        <p>
          既存フロントエンド／バックエンド要件を Supabase と Next.js 上で再構築するための
          プレースホルダ画面です。リプレース完了までは段階的に各ページを移植していきます。
        </p>
      </header>

      <div className={styles.section}>
        <h2>現在の進捗</h2>
        <ul>
          <li>Next.js プロジェクトを初期化し、Supabase 接続設定を整備</li>
          <li>全ページ共通レイアウトと広告プレースホルダを配置</li>
          <li>Supabase 用スキーマ定義を作成（`supabase/schema.sql`）</li>
        </ul>
      </div>

      <div className={styles.section}>
        <h2>次に行うこと</h2>
        <ol>
          {nextSteps.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      </div>

      <div className={styles.section}>
        <h2>プレビュー</h2>
        <p>
          <Link href="/masters" className={styles.primaryLink}>
            マスター管理ページを開く
          </Link>
        </p>
      </div>

      <footer className={styles.note}>
        <p>
          集金・請求ロジックの移行時には既存データでの回帰テストを実施予定です。機能追加や API
          仕様の変更が伴う場合は、要件定義書を更新したうえで合意をお願いします。
        </p>
      </footer>
    </section>
  );
}
