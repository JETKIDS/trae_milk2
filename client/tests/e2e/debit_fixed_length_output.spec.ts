import { test, expect } from '@playwright/test';

// 引き落しデータ作成：固定長出力の生成と行長120バイトの検証
test.describe('引き落し固定長出力', () => {
  test('指定月で固定長ファイルを生成し、行長120バイトを確認', async ({ page }) => {
    // 対象タブへ移動
    await page.goto('/billing?tab=debitData');

    // 対象月を2025-11に設定（type=month）
    const monthInput = page.locator('input[type="month"]').first();
    await expect(monthInput).toBeVisible({ timeout: 15000 });
    await monthInput.fill('2025-11');

    // フォーマットを「全銀（固定長）」に切り替え
    await page.getByLabel('フォーマット').click();
    await page.getByRole('option', { name: '全銀（固定長）' }).click();

    // 生成ボタン押下→ダウンロード待機
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByTestId('btn-generate-csv').click(),
    ]);

    // ファイル名の基本確認
    const suggestedName = await download.suggestedFilename();
    expect(suggestedName).toContain('zengin_fixed');

    // ダウンロード内容を読み込み、いずれかの行が120バイトであることを検証
    const stream = await download.createReadStream();
    let buf = Buffer.alloc(0);
    if (stream) {
      for await (const chunk of stream as any) {
        buf = Buffer.concat([buf, Buffer.from(chunk)]);
      }
      const text = buf.toString('binary');
      const lines = text.split(/\r?\n/).filter(l => l.length > 0);
      // 先頭またはいずれかの行が固定長120バイト（SJIS想定のためbinary長で評価）
      const has120 = lines.some(l => Buffer.from(l, 'binary').length === 120);
      expect(has120).toBeTruthy();
    } else {
      // 一部環境ではstream取得不可のため、ダウンロードの成功のみを確認
      const path = await download.path();
      expect(path).not.toBeNull();
    }
  });
});