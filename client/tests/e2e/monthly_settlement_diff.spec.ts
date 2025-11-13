import { test, expect } from '@playwright/test';

// 月次確定→解除→再確定でステータスの差分が生じることをラベルで確認
test.describe('月次確定の差分検証', () => {
  test('2025-11のコースで解除→確定の順に実行し、ラベル変化を確認', async ({ page }) => {
    await page.goto('/billing?tab=monthly');

    // 年/月設定
    const yearInput = page.getByTestId('input-year-monthly');
    await yearInput.fill('2025');
    const monthSelect = page.getByTestId('select-month-monthly');
    await monthSelect.click();
    await page.getByRole('option', { name: '11' }).click();

    // コース選択（先頭を選択）
    const courseSelect = page.getByTestId('select-course-monthly');
    await expect(courseSelect).toBeVisible({ timeout: 15000 });
    await courseSelect.click();
    const firstOption = page.getByRole('option').first();
    await firstOption.click();

    // 初期ラベル取得
    const label = page.getByTestId('label-confirmed-count');
    await expect(label).toBeVisible({ timeout: 20000 });
    const before = await label.textContent();

    // 解除→確認ダイアログを許可
    page.once('dialog', async (d) => { await d.accept(); });
    await page.getByTestId('btn-unconfirm-batch').click();
    await expect(page.getByText(/解除が完了/)).toBeVisible({ timeout: 15000 });
    const afterUnconfirm = await label.textContent();

    // 再度確定
    await page.getByTestId('btn-confirm-batch').click();
    await expect(page.getByText(/月次確定が完了/)).toBeVisible({ timeout: 15000 });
    const afterConfirm = await label.textContent();

    // いずれかの段階でラベルが変化していること
    const changed = (before !== afterUnconfirm) || (afterUnconfirm !== afterConfirm) || (before !== afterConfirm);
    expect(changed).toBeTruthy();
  });
});