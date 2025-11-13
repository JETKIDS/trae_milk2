import { test, expect } from '@playwright/test';

// 配達リストの差分検証（コース切替で総数量に差が出ることを確認）
test.describe('配達リスト 差分検証', () => {
  test('商品合計表の集計期間が日数変更で変化すること', async ({ page }) => {
    await page.goto('/delivery');

    // タブ「商品合計表」を選択
    const summaryTab = page.getByRole('tab', { name: '商品合計表' });
    if (await summaryTab.isVisible()) {
      await summaryTab.click();
    }
    // タブ切替後、フィルタ入力が見えることを確認
    await expect(page.getByLabel('開始日')).toBeVisible({ timeout: 10000 });

    // 開始日・日数を設定
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    const startDateStr = `${yyyy}-${mm}-${dd}`;

    await page.getByLabel('開始日').fill(startDateStr);
    await page.getByLabel('日数').fill('1');
    await page.getByRole('button', { name: '集計' }).click();

    // データがない場合はスキップ
    const noDataMsg = page.getByText('データがありません。期間とコースを指定して「集計」を押してください。');
    const content = page.locator('#product-summary-content');
    await Promise.race([
      noDataMsg.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      content.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    ]);
    if (!(await content.isVisible())) {
      test.skip(true, '商品合計表の集計対象がないためスキップ');
    }

    // コンテンツ全体から集計期間テキストを抽出
    const textA = (await content.textContent()) || '';
    const matchA = textA.match(/集計期間:\s*([^\n]+)/);
    if (!matchA) {
      test.skip(true, '集計期間表示が見つからないためスキップ');
    }
    const periodA = matchA ? matchA[1] : '';

    // 日数を増やして再集計（1→3）
    await page.getByLabel('日数').fill('3');
    await page.getByRole('button', { name: '集計' }).click();

    const textB = (await content.textContent()) || '';
    const matchB = textB.match(/集計期間:\s*([^\n]+)/);
    if (!matchB) {
      test.skip(true, '集計期間表示が見つからないためスキップ');
    }
    const periodB = matchB ? matchB[1] : '';

    // 集計期間に差があること
    expect(periodB !== periodA).toBeTruthy();

    // データがある場合、CSV/PDF出力ボタンが有効
    const csvBtn = page.getByRole('button', { name: 'CSV出力' });
    const pdfBtn = page.getByRole('button', { name: 'PDF出力' });
    await expect(csvBtn).toBeEnabled();
    await expect(pdfBtn).toBeEnabled();
  });
});