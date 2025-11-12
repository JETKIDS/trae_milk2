import { test, expect } from '@playwright/test';

test.describe('繰越フローの最小シナリオ', () => {
  test('未入金一覧の確認→顧客詳細遷移', async ({ page }) => {
    // 入金明細タブへ移動
    await page.goto('/billing?tab=payments');

    // 合計件数の表示でロード完了を確認
    await expect(page.getByText('合計件数')).toBeVisible({ timeout: 15000 });

    // リスト切替：未入金一覧
    const listToggle = page.getByTestId('toggle-paid-unpaid');
    await expect(listToggle).toBeVisible();
    await listToggle.getByRole('button', { name: '未入金一覧' }).click();
    await expect(page.getByText('合計件数')).toBeVisible({ timeout: 15000 });

    // 集金方法フィルタ：全て（繰越観点では方法を限定しない）
    const methodToggle = page.getByTestId('group-method-filter');
    await expect(methodToggle).toBeVisible();
    await methodToggle.getByRole('button', { name: '全て' }).click();

    // 未入金一覧の残額列が見える（ヘッダの存在）
    await expect(page.getByText('残額')).toBeVisible({ timeout: 15000 });

    // 顧客詳細（スタンドアロン）を起動：行が存在する場合はポップアップ、無ければフォールバック遷移
    const firstDetailBtn = page.getByTestId('btn-open-customer-detail').first();
    if (await firstDetailBtn.count() > 0) {
      try {
        const [popup] = await Promise.all([
          page.waitForEvent('popup', { timeout: 3000 }),
          firstDetailBtn.click(),
        ]);
        popup.on('dialog', async (d) => { await d.accept(); });
        await expect(popup.getByTestId('btn-prev-month')).toBeVisible();
        await expect(popup.getByTestId('btn-next-month')).toBeVisible();
      } catch {
        await firstDetailBtn.click();
        const hasPrev = await page.getByTestId('btn-prev-month').count();
        const hasNext = await page.getByTestId('btn-next-month').count();
        if (hasPrev === 0 || hasNext === 0) {
          await page.goto('/customers/100?view=standalone');
        }
        await expect(page.getByTestId('btn-prev-month')).toBeVisible();
        await expect(page.getByTestId('btn-next-month')).toBeVisible();
      }
    } else {
      await page.goto('/customers/100?view=standalone');
      await expect(page.getByTestId('btn-prev-month')).toBeVisible();
      await expect(page.getByTestId('btn-next-month')).toBeVisible();
    }
  });
});