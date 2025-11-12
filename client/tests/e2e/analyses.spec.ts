import { test, expect } from '@playwright/test';

// 分析ページのタブ表示ひな形（フェーズ3）
test.describe('分析ページの基本表示', () => {
  test('タブが表示され、遷移可能である', async ({ page }) => {
    await page.goto('/analyses');
    await expect(page.getByRole('tab', { name: '売上・粗利分析' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('tab', { name: '顧客推移分析' })).toBeVisible();
    await expect(page.getByRole('tab', { name: '商品別顧客リスト' })).toBeVisible();

    // タブ切替が動作するか簡易確認
    await page.getByRole('tab', { name: '顧客推移分析' }).click();
    await page.getByRole('tab', { name: '商品別顧客リスト' }).click();
  });
});