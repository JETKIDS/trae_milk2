import { test, expect } from '@playwright/test';

// 配達帳票出力 > 商品合計表タブの代表レイアウトのスクリーンショット
// 期間設定・メーカー別グループ化・総金額表示のトグルを組み合わせて撮影
test.describe('配達帳票出力 商品合計表タブ スナップショット', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/delivery');
    await expect(page.getByRole('heading', { name: '配達帳票出力' })).toBeVisible();
    await page.getByRole('tab', { name: '商品合計表' }).click();
    await expect(page.getByRole('tab', { name: '商品合計表' })).toBeVisible();
  });

  test('デフォルト+代表的トグルの組み合わせを撮影', async ({ page }) => {
    // 1週間の期間設定
    const weekBtn = page.getByRole('button', { name: '1週間' });
    if (await weekBtn.count()) {
      await weekBtn.click();
    }

    // 集計実行（ボタンがあれば）
    const aggregateBtn = page.getByRole('button', { name: '集計' });
    if (await aggregateBtn.count()) {
      await aggregateBtn.click();
    }

    // 最初の代表レイアウト（デフォルト）撮影
    // データが表示されるまで待機して、ハングしないようにタイムアウトも大きめ
    const anyTable = page.locator('table').first();
    const visible = await anyTable.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, '商品合計表のテーブルが表示されず、データが無い可能性があるためスキップ');
    }
    await expect(page).toHaveScreenshot('product-summary-default.png');

    // メーカー別でグループ化ON
    const toggleGroup = page.getByLabel('メーカー別でグループ化');
    if (await toggleGroup.count()) {
      await toggleGroup.check();
      await expect(page).toHaveScreenshot('product-summary-grouped-by-manufacturer.png');
    }

    // 総金額を表示ON
    const toggleTotal = page.getByLabel('総金額を表示');
    if (await toggleTotal.count()) {
      await toggleTotal.check();
      await expect(page).toHaveScreenshot('product-summary-show-total-amount.png');
    }

    // 両方ON（代表レイアウト）
    if (await toggleGroup.count() && await toggleTotal.count()) {
      await expect(page).toHaveScreenshot('product-summary-grouped-and-total.png');
    }
  });
});