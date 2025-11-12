import { test, expect } from '@playwright/test';

test.describe('一括入金のスモーク', () => {
  test('対象月・表示モード切替・読み込み・操作ボタンが表示される', async ({ page }) => {
    // 一括入金タブ（集金モード）へ移動
    await page.goto('/billing?tab=bulk&method=collection');

    // 対象月入力が見えていること
    await expect(page.getByTestId('input-month-bulk')).toBeVisible({ timeout: 15000 });

    // 表示モード：コース毎へ切替
    const viewToggle = page.getByTestId('group-view-mode');
    await viewToggle.getByRole('button', { name: 'コース毎' }).click();

    // コース選択を「全コース」に設定（常に存在する選択肢）
    await page.getByTestId('select-course-bulk').click();
    await page.getByRole('option', { name: '全コース' }).first().click();

    // 読み込みボタン押下後、主要操作ボタンが表示されること
    const loadBtn = page.getByTestId('btn-load-bulk');
    await loadBtn.click();

    // ローディングの有無に関わらず、操作ボタンの可視性を確認（有効/無効は状況依存）
    await expect(page.getByTestId('btn-auto-payment')).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('btn-register-manual')).toBeVisible({ timeout: 20000 });
  });
});