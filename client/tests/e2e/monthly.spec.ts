import { test, expect } from '@playwright/test';

test.describe('月次管理', () => {
  test('コース選択後に月次確定のバッチ処理が成功する', async ({ page }) => {
    // 月次管理ページへ
    await page.goto('/monthly');

    // コース選択を開く
    const courseSelect = page.getByTestId('select-course-monthly');
    await expect(courseSelect).toBeVisible();
    await courseSelect.click();

    // 最初のオプションを選択
    const firstOption = page.getByRole('option').first();
    await firstOption.click();

    // 年/月は既定値のまま、月次確定ボタンを押下
    const confirmBtn = page.getByTestId('btn-confirm-batch');
    await expect(confirmBtn).toBeEnabled();
    await confirmBtn.click();

    // 成功スナックバーの表示を確認
    await expect(page.getByText(/月次確定が完了しました/)).toBeVisible({ timeout: 15000 });

    // ステータスラベルが表示されていること
    await expect(page.getByTestId('label-confirmed-count')).toBeVisible();
  });
});