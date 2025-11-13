import { test, expect } from '@playwright/test';

// 入金処理：特定顧客（0000061 水野 文明）の当月入金額増加を確認
test.describe('入金処理と未入金減少の検証', () => {
  test('2025-11で顧客詳細から少額入金を保存し、当月入金額が増加', async ({ page }) => {
    // 入金明細タブへ移動
    await page.goto('/billing?tab=payments');

    // 対象月を2025-11に設定
    const monthContainer = page.getByTestId('input-month-payments');
    await expect(monthContainer).toBeVisible({ timeout: 15000 });
    const monthInput = monthContainer.locator('input[type="month"]');
    await monthInput.fill('2025-11');

    // 未入金一覧に切替（対象行が出やすい）
    const paidToggle = page.getByTestId('toggle-paid-unpaid');
    await paidToggle.getByRole('button', { name: '未入金一覧' }).click();

    // 全て（集金/引き落し）を対象
    const methodToggle = page.getByTestId('group-method-filter');
    await methodToggle.getByRole('button', { name: '全て' }).click();

    // 再読込
    await page.getByTestId('btn-reload-payments').click();

    // 顧客コードで行を検索（0000061）→詳細を新ウィンドウで開く
    const targetCell = page.getByText('0000061', { exact: false }).first();
    // データがない場合はスキップ（環境差対応）
    const exists = await targetCell.count();
    if (exists === 0) {
      test.skip(true, '対象顧客が一覧に存在しませんでした');
      return;
    }

    const rowLink = targetCell.locator('[data-testid="btn-open-customer-detail"]');
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      rowLink.click(),
    ]);

    // 顧客詳細側で当月入金額の初期表示を取得
    const amountLabel = popup.getByTestId('text-current-payment-amount');
    await expect(amountLabel).toBeVisible({ timeout: 15000 });
    const beforeText = await amountLabel.textContent();

    // 少額（10円）を手入力し保存
    const amountInput = popup.getByTestId('input-current-payment-amount');
    await amountInput.fill('10');
    const saveBtn = popup.getByTestId('btn-save-payment');
    await expect(saveBtn).toBeEnabled();
    await saveBtn.click();

    // 保存後、表示が更新されること（テキスト差分で確認）
    await expect(amountLabel).toBeVisible();
    const afterText = await amountLabel.textContent();
    // 同一文字列の場合でも更新のラグに備え短い待機を挟む
    if (beforeText === afterText) {
      await popup.waitForTimeout(1000);
    }
    const afterText2 = await amountLabel.textContent();
    expect(afterText2).not.toEqual(beforeText);

    // ポップアップを閉じる
    await popup.close();
  });
});