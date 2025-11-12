import { test, expect } from '@playwright/test';

test('トップページが起動しタイトルが正しい', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle('牛乳配達管理システム');
});