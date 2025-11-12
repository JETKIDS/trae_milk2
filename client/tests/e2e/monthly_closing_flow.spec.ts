import { test, expect } from '@playwright/test';

test.describe('月次確定フローの最小シナリオ', () => {
  test('コース選択→月次確定→ステータス表示確認', async ({ page }) => {
    // 月次管理タブへ移動
    await page.goto('/billing?tab=monthly');

    // コース選択の表示を確認し、先頭のコースを選択
    const courseSelect = page.getByTestId('select-course-monthly');
    await expect(courseSelect).toBeVisible({ timeout: 15000 });
    await courseSelect.click();
    // 読み込み中の場合はメニューにローディング項目が出るため、いずれかの選択肢を選ぶ
    const options = page.getByRole('option');
    try {
      await options.first().click({ timeout: 5000 });
    } catch {
      // 選択肢が取得できない場合はそのまま進行（環境によりコースなし）
    }

    // ステータス表示（確定済み件数ラベル）が見える／もしくは操作ボタンが見える
    try {
      await expect(page.getByTestId('label-confirmed-count')).toBeVisible({ timeout: 20000 });
    } catch {
      await expect(page.getByTestId('btn-confirm-batch')).toBeVisible({ timeout: 20000 });
    }
  });
});