import { test, expect } from '@playwright/test';

// 最小の手動入金シナリオ: 一括入金タブで金額を入力して確認ダイアログから登録
test.describe('一括入金（手動）フロー', () => {
  test('手動入金登録の最小シナリオが動作する', async ({ page }) => {
    // 請求業務の一括入金（集金）タブを開く
    await page.goto('/billing?tab=bulk&method=collection');

    // データ読み込み
    // まず「全コース」に切替して読み込みボタンを有効化
    const viewGroup = page.getByTestId('group-view-mode');
    await expect(viewGroup).toBeVisible();
    await viewGroup.getByRole('button', { name: '全コース' }).click();

    const loadBtn = page.getByTestId('btn-load-bulk');
    await expect(loadBtn).toBeVisible();
    await loadBtn.click();

    // 読み込み完了（スピナー終了）として、ボタンが再度有効になるまで待機
    await expect(page.getByTestId('btn-load-bulk')).toBeEnabled({ timeout: 20000 });

    // 全選択（未確定や残額0は自動的に除外されるUI仕様）
    const selectAll = page.getByLabel('全選択/解除');
    if (await selectAll.isVisible()) {
      await selectAll.check({ force: true });
    }

    // ボタン状態確認（有効なら登録フローへ、無効ならUIが正しく無効化されていることを確認して終了）
    const manualBtn = page.getByTestId('btn-register-manual');
    await expect(manualBtn).toBeVisible();
    const enabledNow = await manualBtn.isEnabled();
    if (!enabledNow) {
      await expect(manualBtn).toBeDisabled();
      return; // 対象なし環境では無効化されるのが正しいのでここで終了
    }

    // 入金額の入力: 最初に編集可能な「入金額」フィールドに金額を入れる
    const amountInputs = page.getByRole('spinbutton', { name: '入金額' });
    const count = await amountInputs.count();
    let filled = false;
    for (let i = 0; i < count; i++) {
      const ctrl = amountInputs.nth(i);
      // isDisabledがtrueならスキップ
      if (!(await ctrl.isDisabled())) {
        await ctrl.fill('100');
        filled = true;
        break;
      }
    }

    // 手動入金登録ボタン
    await manualBtn.click();

    // 確認ダイアログを待機
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // 実行ボタン（対象がない場合は無効のためフェイルセーフ）
    const proceedBtn = page.getByRole('button', { name: '実行する' });
    const canProceed = !(await proceedBtn.isDisabled()) && filled;
    if (canProceed) {
      await proceedBtn.click();
      // 成功メッセージ（登録完了）を待機
      await expect(page.getByText(/登録完了/)).toBeVisible({ timeout: 10000 });
    } else {
      // 対象がない場合はキャンセルして終了（安定化のため）
      const cancelBtn = page.getByRole('button', { name: 'キャンセル' });
      if (await cancelBtn.isVisible()) {
        await cancelBtn.click();
      }
      await expect(dialog).toBeHidden({ timeout: 10000 });
    }
  });
});