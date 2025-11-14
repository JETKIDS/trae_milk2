import { test, expect } from '@playwright/test';

test.describe('ダッシュボードのタスクUI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

test('日別・月別タスクの追加と完了・削除', async ({ page }) => {
    const dailyTitle = 'E2E-前日まとめ';
    const monthlyTitle = 'E2E-支払い';
    // 見出しが表示される
    await expect(page.getByText(/日別タスク（/)).toBeVisible();
    await expect(page.getByText(/月別タスク（/)).toBeVisible();

    // 日別に「前日まとめ」を追加
    const dailyInput = page.getByPlaceholder('タスクを追加（例：前日まとめ）');
    await dailyInput.fill(dailyTitle);
    await dailyInput.press('Enter');

    // 追加されたことを確認
    const dailyItem = page.getByRole('listitem').filter({ hasText: dailyTitle }).last();
    await expect(dailyItem).toBeVisible();

    // チェックで完了
    const dailyCheckbox = dailyItem.getByRole('checkbox');
    await dailyCheckbox.click();
    await expect(dailyCheckbox).toBeChecked();

    // 月別に「支払い」を追加
    const monthlyInput = page.getByPlaceholder('タスクを追加（例：支払い）');
    await monthlyInput.fill(monthlyTitle);
    await monthlyInput.press('Enter');

    // 追加されたことを確認
    const monthlyItem = page.getByRole('listitem').filter({ hasText: monthlyTitle }).last();
    await expect(monthlyItem).toBeVisible();

    // 月別チェックで完了
    const monthlyCheckbox = monthlyItem.getByRole('checkbox');
    await monthlyCheckbox.click();
    await expect(monthlyCheckbox).toBeChecked();

    // 日別タスクを削除
    const dailyDeleteBtn = dailyItem.getByRole('button', { name: 'delete' });
    await dailyDeleteBtn.click();
    await expect(page.getByText(dailyTitle)).toHaveCount(0);

    // 月別タスクを削除
    const monthlyDeleteBtn = monthlyItem.getByRole('button', { name: 'delete' });
    await monthlyDeleteBtn.click();
    await expect(page.getByText(monthlyTitle)).toHaveCount(0);
  });
});
