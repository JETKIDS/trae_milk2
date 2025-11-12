import { test, expect } from '@playwright/test';

test.describe('トップページスモーク', () => {
  test('ダッシュボードのタイトルが表示される', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ダッシュボード' })).toBeVisible({ timeout: 15000 });
  });
});