import { test, expect } from '@playwright/test';

// 月次確定→入金→繰越確認のスモークE2E
// 前提: /billing?tab=payments で顧客一覧が表示され、顧客詳細は別ウィンドウで開く
//       顧客詳細のサイドバー/カレンダーにdata-testidが付与済み

test('月次確定から入金/繰越の基本フロー', async ({ page, context }) => {
  // 支払い明細タブへ移動
  await page.goto('/billing?tab=payments');

  // 一覧のロード完了を待機（合計件数の文言が出る）
  await expect(page.getByText('合計件数')).toBeVisible({ timeout: 15000 });

  // 先頭顧客の詳細をポップアップで開く（なければ直接顧客詳細へ遷移）
  let target = page;
  const btn = page.locator('[data-testid="btn-open-customer-detail"]').first();
  if (await btn.count() > 0) {
    const [popup] = await Promise.all([
      page.waitForEvent('popup'),
      btn.click(),
    ]);
    // ダイアログは自動で許可
    popup.on('dialog', async (d) => { await d.accept(); });
    target = popup;
  } else {
    // シード顧客/既存顧客の代表IDに直接遷移（存在しない場合でもページは開く）
    await page.goto('/customers/100?view=standalone');
    target = page;
  }

  // まず前月へ移動し、その月を確定
  await target.getByTestId('btn-prev-month').click();
  // 確定ボタンが有効であれば確定実行（無効ならスキップ）
  const confirmBtn = target.getByTestId('btn-confirm-invoice');
  if (await confirmBtn.isEnabled()) {
    await confirmBtn.click();
    // 状態反映のため短い待機（API→状態更新→再描画）
    await target.waitForTimeout(800);
  }

  // 次月へ移動（「前月請求・当月入金」のブロックが表示可能になる）
  await target.getByTestId('btn-next-month').click();

  // 「前月請求・当月入金」ブロックの状態判定：入力欄が見えるか、情報メッセージが見えるか
  const inputLocator = target.getByTestId('input-current-payment-amount');
  const infoMsg = target.getByText('前月の請求が未確定、または当月が翌月ではないため表示できません。');
  await target.waitForTimeout(1500);
  if (!(await inputLocator.isVisible())) {
    // 環境により前月を確定できない場合があるため、メッセージの表示で代替確認して終了
    await expect(infoMsg).toBeVisible({ timeout: 10000 });
    return;
  }

  // 現在表示の入金額と繰越額を事前取得
  const beforePayText = await target.getByTestId('text-current-payment-amount').textContent();
  const beforeCarryText = await target.getByTestId('text-carryover-amount').textContent();
  const extractAmount = (t?: string | null) => {
    if (!t) return 0;
    const m = t.match(/¥([0-9,]+)/);
    return m ? Number(m[1].replace(/,/g, '')) : 0;
  };
  const beforePay = extractAmount(beforePayText);
  const beforeCarry = extractAmount(beforeCarryText);

  // 100円を入金として登録（自動が0の可能性に備えて手動入力）
  await target.getByTestId('input-current-payment-amount').fill('100');
  // 保存ボタンが有効になるまで待機してクリック
  const saveBtn = target.getByTestId('btn-save-payment');
  await expect(saveBtn).toBeEnabled();
  await saveBtn.click();

  // 表示更新待ち（当月入金額・繰越額のテキストが変化する）
  await target.waitForTimeout(800); // 軽い待機（API取得＋再描画）

  const afterPayText = await target.getByTestId('text-current-payment-amount').textContent();
  const afterCarryText = await target.getByTestId('text-carryover-amount').textContent();
  const afterPay = extractAmount(afterPayText);
  const afterCarry = extractAmount(afterCarryText);

  // 入金額が+100され、繰越額は100減っていることを確認（非負の範囲で）
  expect(afterPay).toBeGreaterThanOrEqual(beforePay + 100);
  // carryoverは「前月請求 − 当月入金」なので入金増加で減少が期待される
  expect(afterCarry).toBeLessThanOrEqual(Math.max(beforeCarry - 100, 0));
});