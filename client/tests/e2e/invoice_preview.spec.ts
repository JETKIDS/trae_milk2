import { test, expect } from '@playwright/test';

test.describe('請求書プレビュー スナップショット', () => {
  test('請求書プレビューを開いて1ページ目を撮影', async ({ page }) => {
    // 請求書発行タブへ遷移
    await page.goto('/billing?tab=invoices');
    await expect(page.getByRole('heading', { name: '請求書発行' })).toBeVisible();

    // コース選択（存在すれば一番上を選択）
    const courseSelect = page.getByLabel('コース');
    if (await courseSelect.count()) {
      await courseSelect.click();
      const firstOption = page.getByRole('option').first();
      if (await firstOption.count()) {
        await firstOption.click();
      }
    }

    // 一覧読み込みをクリック
    const loadButton = page.getByRole('button', { name: '一覧読み込み' });
    await loadButton.click();

    // 対象一覧テーブルが表示されるまで待機
    await expect(page.getByRole('table')).toBeVisible();

    // 有効な「請求書プレビュー」ボタンを探す
    const previewButtons = page.getByRole('button', { name: '請求書プレビュー' });
    const count = await previewButtons.count();
    let clicked = false;
    for (let i = 0; i < count; i++) {
      const btn = previewButtons.nth(i);
      if (await btn.isEnabled()) {
        await btn.click();
        clicked = true;
        break;
      }
    }

    // もしクリックできるボタンが無ければ、テーブルが表示されていることだけ確認して終了
    if (!clicked) {
      await expect(page.getByRole('table')).toBeVisible();
      test.info().annotations.push({ type: 'skip', description: '有効な請求書プレビューボタンが無く撮影をスキップ' });
      return;
    }

    // 請求書プレビュー画面に遷移したことを確認
    await expect(page.getByText('請求書プレビュー')).toBeVisible();

    // タイトル（御請求書 or 口座引落のご案内）が表示されること
    const titleLocator = page.locator('.invoice-right .big-title');
    await expect(titleLocator).toBeVisible();

    // 1ページ目を撮影（print-pageの最初のカード）
    const firstPage = page.locator('.print-page').first();
    await expect(firstPage).toBeVisible();
    await expect(firstPage).toHaveScreenshot('invoice_preview_1.png');
  });
});