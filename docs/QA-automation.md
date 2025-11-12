# テスト自動化ガイド（フェーズ1）

本書は、手動の回帰確認を効率化するための自動テスト方針・手順・技術スタックをまとめたものです。まずはフェーズ1（スモーク＋重要API）から導入します。

## 目的
- 作業ごとの手動確認（入力・変更・入金・出力）を、最小限の自動テストで置き換え、短時間で安全に回帰確認する。
- ブラウザ操作（UI）とサーバー集計（API/固定長出力）の両面をカバーする。

## 技術スタック
- クライアント E2E: Playwright（`@playwright/test`）
- サーバー統合: Jest + supertest
- 文字コード復号: iconv-lite（固定長出力の CP932 → UTF-8）

## 対象範囲（フェーズ1）
- スモークE2E: トップページが起動し、タイトルが正しいこと。
- KPI API: `/api/analyses/kpi?month=YYYY-MM` が基本項目を返すこと（型検証）。
- 口座引き落とし固定長: `/api/debits/generate?month=YYYY-MM&format=zengin_fixed` の行長が正しく 120 桁であること。

## 導入手順（クライアント）
1. 依存追加（開発）
   - `client/package.json` に `@playwright/test` を追加済み。
   - スクリプト `npm run test:e2e` を追加済み。
2. Playwright 設定
   - `client/playwright.config.ts` を追加。`webServer` 経由で `npm run dev` を起動し、`http://localhost:3000` に接続。
3. スモークテスト
   - `client/tests/e2e/smoke.spec.ts` に、トップページのタイトル検証を実装。

## 実行方法（クライアント）
- 開発サーバーを起動せずにそのまま:
  - `cd client`
  - `npm run test:e2e`
  - Playwright が `npm run dev` を起動し、テスト完了後に自動終了します。

## 導入手順（サーバー）
1. 既存 Jest 設定を使用（`server/jest.config.cjs`）。
2. 統合テスト追加
   - KPI: `server/__tests__/api.kpi.test.js`
   - 固定長: `server/__tests__/debits.format.test.js`

## 実行方法（サーバー）
- API サーバーを起動した状態で:
  - `cd server`
  - `npm test`
  - `http://localhost:9000` を叩く統合テストが実行されます。

## データと安定性
- 月指定はテスト時点の `YYYY-MM` を使用（データがなくても項目型の検証でパス）。
- 固定長出力はヘッダー行（120 桁）が常に生成されるため、顧客不在でも最低1行で検証可。

## 今後（フェーズ2 以降の拡張）
- 入金（個別/一括）、月次確定、繰越のシナリオテスト。
- 出力物（請求書・配達リスト・商品合計）のスナップショット比較と主要値検証。
- UIの主要入力に `data-testid` を最小限付与して、E2Eで入力～出力までを自動化。