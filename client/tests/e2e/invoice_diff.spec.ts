import { test, expect } from '@playwright/test';

// 請求書発行の差分検証（コース切替で一覧の差が出ることを確認）
test.describe('請求書発行 差分検証', () => {
  test('コース切替で発行対象一覧に差があること', async ({ page }) => {
    await page.goto('/billing?tab=invoices');

    await expect(page.getByRole('heading', { name: '請求書発行' })).toBeVisible();

    // コース選択（唯一のコンボボックス）を開く
    const courseSelect = page.getByRole('combobox').first();
    await courseSelect.click();
    const options = page.locator('div[role="listbox"] [role="option"]');
    const optionCount = await options.count();

    // コースが2つ未満ならテストをスキップ
    test.skip(optionCount < 2, 'コースが2件未満のため差分検証をスキップ');

    const firstCourseName = await options.nth(0).innerText();
    const secondCourseName = await options.nth(1).innerText();

    // 1つ目のコースを選択して一覧読み込み
    await options.nth(0).click();
    await page.getByRole('button', { name: '一覧読み込み' }).click();

    // 一覧テーブルが描画されるまで待機
    const table = page.locator('table');
    await expect(table).toBeVisible();

    // データ未取得メッセージが出ていればスキップ
    const emptyMsg = page.getByText('対象一覧は未取得です');
    if (await emptyMsg.isVisible()) {
      test.skip(true, '請求書発行対象が存在しないためスキップ');
    }

    const rowsA = table.locator('tbody tr');
    const countA = await rowsA.count();
    const firstNameA = countA > 0 ? await rowsA.nth(0).locator('td').nth(2).innerText() : '';

    // 2つ目のコースを選択して一覧読み込み
    await courseSelect.click();
    await page.getByRole('option', { name: secondCourseName }).click();
    await page.getByRole('button', { name: '一覧読み込み' }).click();

    const rowsB = table.locator('tbody tr');
    const countB = await rowsB.count();
    const firstNameB = countB > 0 ? await rowsB.nth(0).locator('td').nth(2).innerText() : '';

    // 少なくとも件数か先頭顧客名に差があること（両方0ならスキップ）
    if (countA === 0 && countB === 0) {
      test.skip(true, '両コースとも対象が0件のため差分検証をスキップ');
    }
    expect(countB !== countA || firstNameB !== firstNameA).toBeTruthy();

    // 任意: 一括発行ボタンの存在確認（未確定が含まれる場合はdisabled）
    await expect(page.getByRole('button', { name: '請求書発行（2アップ一括）' })).toBeVisible();
  });
});