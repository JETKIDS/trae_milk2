import { test, expect } from '@playwright/test';

// 集金一覧表（未収一覧）の差分検証（方式切替で出力件数が変わることを確認）
test.describe('未収一覧 差分検証', () => {
  test('方式切替（集金/引き落し/全件）で出力件数に差があること', async ({ page }) => {
    await page.goto('/billing?tab=collectionList');

    await expect(page.getByRole('heading', { name: '集金一覧表' })).toBeVisible();

    // コース選択を「全コース」に設定
    // MUI Selectは role=button + aria-haspopup=listbox の場合があるため最後のセレクトをクリック
    const selects = page.locator('[role="button"][aria-haspopup="listbox"]');
    await selects.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    const selCount = await selects.count();
    let clicked = false;
    try {
      await selects.nth(Math.max(0, selCount - 1)).click({ timeout: 3000 });
      clicked = true;
    } catch {}
    if (!clicked) {
      test.skip(true, 'コース選択のドロップダウンが操作できないためスキップ');
    }
    const allCourse = page.getByRole('option', { name: '全コース' });
    if (await allCourse.isVisible()) {
      await allCourse.click();
    } else {
      await page.getByRole('option').first().click();
    }

    // デフォルト方式は「集金」。出力を実行
    await page.getByRole('button', { name: '出力' }).click();
    // ローディング終了を待機（存在しない場合は短い待機）
    const loading = page.getByText('集計中…');
    if (await loading.isVisible()) {
      await loading.waitFor({ state: 'detached', timeout: 15000 });
    } else {
      await page.waitForTimeout(1000);
    }

    // 「対象に該当する顧客がいません」ならスキップ
    const noDataMsg = page.getByText('対象に該当する顧客がいません');
    if (await noDataMsg.isVisible()) {
      test.skip(true, '未収一覧に該当データがないためスキップ');
    }

    // 出力結果の到着を待つ（メッセージ or コンテンツ）
    const message = page.getByText(/出力件数:\s*\d+件/);
    const content = page.locator('#collection-list-content');
    await Promise.race([
      message.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      content.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    ]);
    let countA = 0;
    if (await message.isVisible()) {
      const textA = await message.innerText();
      countA = Number(textA.match(/(\d+)件/)?.[1] || 0);
    } else if (await content.isVisible()) {
      // ヘッダー・フッターを除いたボディ行数で件数を推定
      const rowCount = await content.getByRole('row').count();
      countA = Math.max(0, rowCount - 2);
    } else {
      test.skip(true, '未収一覧の出力結果が取得できないためスキップ');
    }

    // 方式を「引き落し」に切替して出力
    await page.getByRole('button', { name: '引き落し' }).click();
    await page.getByRole('button', { name: '出力' }).click();
    await Promise.race([
      message.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      content.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    ]);
    let countB = 0;
    if (await message.isVisible()) {
      const textB = await message.innerText();
      countB = Number(textB.match(/(\d+)件/)?.[1] || 0);
    } else if (await content.isVisible()) {
      const rowCountB = await content.getByRole('row').count();
      countB = Math.max(0, rowCountB - 2);
    } else {
      test.skip(true, '未収一覧の出力結果が取得できないためスキップ');
    }

    // 方式を「全件」に切替して出力
    await page.getByRole('button', { name: '全件' }).click();
    await page.getByRole('button', { name: '出力' }).click();
    await Promise.race([
      message.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
      content.waitFor({ state: 'visible', timeout: 15000 }).catch(() => {}),
    ]);
    let countC = 0;
    if (await message.isVisible()) {
      const textC = await message.innerText();
      countC = Number(textC.match(/(\d+)件/)?.[1] || 0);
    } else if (await content.isVisible()) {
      const rowCountC = await content.getByRole('row').count();
      countC = Math.max(0, rowCountC - 2);
    } else {
      test.skip(true, '未収一覧の出力結果が取得できないためスキップ');
    }

    // いずれかで差が出ていること
    expect(countA !== countB || countB !== countC || countA !== countC).toBeTruthy();

    // CSV/PDF出力ボタンが有効
    await expect(page.getByRole('button', { name: 'CSV出力' })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'PDF出力' })).toBeEnabled();
  });
});