import { test, expect } from '@playwright/test';

test.describe('商品登録のスモーク', () => {
  test('メーカー選択して商品を登録できる', async ({ page }) => {
    // 先にメーカーが存在することを保証（なければ作成）
    await page.goto('/masters');
    await page.getByRole('tab', { name: 'メーカー' }).click();
    const targetRow = page.getByRole('row', { name: /E2EメーカーA/ });
    if (await targetRow.count() === 0) {
      await page.getByTestId('btn-open-add-manufacturer').click();
      const mDialog = page.getByRole('dialog', { name: 'メーカー登録' });
      await expect(mDialog).toBeVisible();
      await mDialog.getByTestId('input-manufacturer-name').fill('E2EメーカーA');
      await mDialog.getByTestId('input-manufacturer-contact').fill('e2e@example.com');
      await mDialog.getByTestId('btn-save-manufacturer').click();
      await expect(page.getByRole('row', { name: /E2EメーカーA/ }).first()).toBeVisible();
    }

    await page.goto('/products');

    await page.getByRole('button', { name: '新規商品登録' }).click();

    const dialog = page.getByRole('dialog', { name: '新規商品登録' });
    await dialog.getByLabel('商品名').fill('E2Eテスト商品');
    await dialog.getByTestId('select-manufacturer').click();
    // 事前に作成したメーカー名を選択（明示的に listbox 経由で選択）
    const listbox = page.getByRole('listbox');
    await expect(listbox).toBeVisible({ timeout: 5000 });
    await listbox.getByRole('option', { name: 'E2EメーカーA' }).first().click();
    await dialog.getByTestId('input-unit-price').fill('123');

    // ダイアログの下部にある「登録」ボタンを押下
    await dialog.getByTestId('btn-submit-product').click();

    // ダイアログが閉じるまで待機。閉じない場合はキャンセルで明示的に閉じる
    try {
      await expect(dialog).toBeHidden({ timeout: 5000 });
    } catch {
      await dialog.getByRole('button', { name: 'キャンセル' }).click();
      await expect(dialog).toBeHidden({ timeout: 10000 });
    }

    // 検索に商品名を入力して対象を絞り込み
    await page.getByLabel('商品名').fill('E2Eテスト商品');

    // 一覧に反映されることを確認（タイムアウト延長）
    await expect(page.getByRole('row', { name: /E2Eテスト商品/ }).first()).toBeVisible({ timeout: 20000 });
  });
});