import { test, expect } from '@playwright/test';

test.describe('メーカー登録のスモーク', () => {
  test('メーカーを追加できる', async ({ page }) => {
    await page.goto('/masters');
    await page.getByRole('tab', { name: 'メーカー' }).click();

    await page.getByTestId('btn-open-add-manufacturer').click();
    const dialog = page.getByRole('dialog', { name: 'メーカー登録' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByTestId('input-manufacturer-name')).toBeVisible();
    await expect(dialog.getByTestId('input-manufacturer-contact')).toBeVisible();
    await dialog.getByTestId('input-manufacturer-name').fill('E2EメーカーA');
    await dialog.getByTestId('input-manufacturer-contact').fill('e2e@example.com');
    await dialog.getByTestId('btn-save-manufacturer').click();

    await expect(page.getByRole('row', { name: /E2EメーカーA/ }).first()).toBeVisible();
  });
});