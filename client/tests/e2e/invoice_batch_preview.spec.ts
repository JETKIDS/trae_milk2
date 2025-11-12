import { test, expect } from '@playwright/test';

// 請求書バッチプレビュー（/invoice-preview/batch）のスナップショットテスト
// 条件: /billing?tab=invoices で「請求書発行（2アップ一括）」が有効な場合のみ撮影
test.describe('請求書バッチプレビューのスナップショット', () => {
  test('条件成立時のみ 1ページ目を撮影', async ({ page }) => {
    // 請求書発行タブへ遷移
    await page.goto('/billing?tab=invoices');

    // タブの見出し確認
    await expect(page.getByRole('heading', { name: '請求書発行' })).toBeVisible();

    // コース選択が存在する場合は最初のコースを選択（存在しない場合はスキップ）
    const courseSelect = page.getByRole('combobox', { name: 'コース' });
    if (await courseSelect.count()) {
      await courseSelect.first().click();
      // 最初のメニュー項目を選択（存在すれば）
      const firstOption = page.locator('ul[role="listbox"] li[role="option"]').first();
      if (await firstOption.count()) {
        await firstOption.click();
      }
    }

    // 一覧読み込みがあれば実行（無ければスキップ）
    const loadListBtn = page.getByRole('button', { name: '一覧読み込み' });
    if (await loadListBtn.count()) {
      await loadListBtn.click();
    }

    // バッチプレビューボタンの状態を確認
    const batchBtn = page.getByRole('button', { name: '請求書発行（2アップ一括）' });
    if (!(await batchBtn.count())) {
      test.skip(true, 'バッチプレビューボタンが見つからないため撮影をスキップ');
    }

    const isDisabled = await batchBtn.isDisabled();
    if (isDisabled) {
      test.skip(true, '未確定顧客等によりボタンが無効のため撮影をスキップ');
    }

    // クリックしてバッチプレビューへ
    await batchBtn.click();

    // タイトルと最初の印刷ページの表示を確認
    await expect(page.getByText('請求書一括印刷プレビュー（2アップ）')).toBeVisible({ timeout: 15000 });
    const firstPage = page.locator('.print-page').first();
    await expect(firstPage).toBeVisible();

    // 1ページ目のスクリーンショット
    await expect(firstPage).toHaveScreenshot('invoice-batch-page-1.png');
  });
});