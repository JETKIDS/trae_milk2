import { test, expect } from '@playwright/test';

test.describe('顧客登録のスモーク', () => {
  test('必須項目を入力して新規顧客登録できる', async ({ page }) => {
    await page.goto('/customers');

    await page.getByRole('button', { name: '新規顧客登録' }).click();

    const dialog = page.getByRole('dialog', { name: '新規顧客登録' });
    await dialog.getByLabel('顧客名').fill('E2E顧客 太郎');
    await dialog.getByLabel('住所').fill('テスト県テスト市1-2-3');
    await dialog.getByLabel('電話番号').fill('09012345678');
    await dialog.getByTestId('select-course').click();
    // 先頭のプレースホルダを除いた最初の選択肢が表示されるまで待機して選択
    const firstCourse = page.getByRole('option').nth(1);
    await firstCourse.waitFor();
    await firstCourse.click();
    await dialog.getByLabel('契約開始日').fill('2025-11-12');

    await dialog.getByTestId('btn-submit-customer').click();

    // 登録後、ダイアログが閉じること（顧客一覧に戻るヘッダーを確認）
    await expect(page.getByRole('heading', { name: '顧客管理' })).toBeVisible();
  });
});