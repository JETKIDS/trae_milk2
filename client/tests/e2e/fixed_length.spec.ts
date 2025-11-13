import { test, expect } from '@playwright/test';
import * as fs from 'fs/promises';

// 固定長出力（全銀固定長）のスモーク：
// - 画面からフォーマット選択（全銀固定長）
// - 生成ボタンでダウンロード発火
// - ダウンロード内容の行長（バイト長）が120であることを最低1行確認
// - 併せてプレビュー/解析の押下でUIが反応することも簡易確認
test('固定長出力の生成とプレビュー/解析の基本確認', async ({ page, context }) => {
  await page.goto('/billing?tab=debitData');

  // フォーマット選択を全銀（固定長）に変更
  const formatSelect = page.getByLabel('フォーマット');
  await expect(formatSelect).toBeVisible({ timeout: 15000 });
  await formatSelect.click();
  await page.getByRole('option', { name: '全銀（固定長）' }).click();

  // CSV生成（固定長ファイルのダウンロード）
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('btn-generate-csv').click(),
  ]);

  const tmpPath = await download.path();
  if (tmpPath) {
    const buf = await fs.readFile(tmpPath);
    // CRLF(\r\n)区切りで行バイト列を抽出
    const lines: number[] = [];
    let start = 0;
    for (let i = 0; i < buf.length - 1; i++) {
      if (buf[i] === 0x0d && buf[i + 1] === 0x0a) {
        const len = i - start; // CRまでの長さ
        if (len > 0) lines.push(len);
        start = i + 2; // 次行の開始（CRLFの後）
      }
    }
    // 最低1行は120バイトであることを確認（ヘッダ行が存在）
    const has120 = lines.some((l) => l === 120);
    expect(has120).toBeTruthy();
  }

  // プレビュー/解析の押下で結果カードが表示される（エラーでもUI反応確認）
  await page.getByTestId('btn-load-preview').click();
  // プレビュー結果の箱が現れるまで待機
  await expect(page.getByText('プレビュー結果')).toBeVisible({ timeout: 15000 });

  await page.getByTestId('btn-load-parse').click();
  await expect(page.getByText('解析結果')).toBeVisible({ timeout: 15000 });
});