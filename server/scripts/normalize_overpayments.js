/**
 * 正規化スクリプト: 月次の過入金を取消し、請求額と同額のみを同月に登録し直す
 * 目的: 各月の「請求累計 − 入金累計」をゼロ化（繰越額を0にする）
 *
 * 実行例:
 *   node server/scripts/normalize_overpayments.js --fromYear=2023 --toYear=2025 --base-url=http://localhost:9000
 *
 * 方針:
 *  - 対象顧客を全件取得
 *  - 指定年範囲の各月について、請求が確定済みかを確認
 *  - 同月の入金合計が請求額を超えている場合、既存入金を全取消（負の入金）
 *  - その後、請求額と同額の入金を同月に1件登録
 */

const BASE_DEFAULT = 'http://localhost:9000';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    fromYear: new Date().getFullYear(),
    toYear: new Date().getFullYear(),
    baseUrl: process.env.BASE_URL || BASE_DEFAULT,
    note: '自動調整（過入金正規化）',
  };
  for (const a of args) {
    if (a.startsWith('--fromYear=')) opts.fromYear = Number(a.split('=')[1]);
    else if (a.startsWith('--toYear=')) opts.toYear = Number(a.split('=')[1]);
    else if (a.startsWith('--base-url=')) opts.baseUrl = a.split('=')[1];
    else if (a.startsWith('--note=')) opts.note = a.split('=')[1];
  }
  return opts;
}

async function getJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`GET ${url} -> ${resp.status}`);
  return await resp.json();
}

async function postJson(url, body) {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`POST ${url} -> ${resp.status} ${text}`);
  }
  return await resp.json();
}

async function patchJson(url, body) {
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`PATCH ${url} -> ${resp.status} ${text}`);
  }
  return await resp.json();
}

async function normalizeCustomerMonths(baseUrl, customer, fromYear, toYear, note) {
  const cid = Number(customer.id);
  // 設定から請求方法を取得（未設定は集金）
  let billingMethod = 'collection';
  try {
    const detail = await getJson(`${baseUrl}/api/customers/${cid}`);
    billingMethod = detail?.settings?.billing_method || 'collection';
  } catch (_) {}

  for (let y = fromYear; y <= toYear; y++) {
    for (let m = 1; m <= 12; m++) {
      // 確定状況と請求額
      let status;
      try {
        status = await getJson(`${baseUrl}/api/customers/${cid}/invoices/status?year=${y}&month=${m}`);
      } catch (e) {
        console.warn(`status error cid=${cid} ${y}-${String(m).padStart(2,'0')}:`, e.message);
        continue;
      }
      if (!status?.confirmed) continue; // 未確定月は対象外

      const invoiceAmount = Number(status.amount || 0);

      // 同月の入金一覧と合計
      let payments = [];
      try {
        payments = await getJson(`${baseUrl}/api/customers/${cid}/payments?year=${y}&month=${m}&limit=1000`);
      } catch (e) {
        console.warn(`payments error cid=${cid} ${y}-${String(m).padStart(2,'0')}:`, e.message);
        continue;
      }
      const paidTotal = (payments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);

      if (paidTotal <= invoiceAmount) {
        // 同月の不足分は既存の別スクリプトで対応済み／不足なし
        continue;
      }

      const over = paidTotal - invoiceAmount;
      console.log(`Normalize overpay: cid=${cid} ${y}-${String(m).padStart(2,'0')} paid=${paidTotal} invoice=${invoiceAmount} over=${over}`);

      // 既存入金を全て取消（負の入金を自動登録）
      for (const p of (payments || [])) {
        try {
          await postJson(`${baseUrl}/api/customers/${cid}/payments/${p.id}/cancel`, {});
        } catch (e) {
          console.error(`cancel failed cid=${cid} paymentId=${p.id}:`, e.message);
        }
      }

      // 請求額と同額で入金を1件再登録
      if (invoiceAmount > 0) {
        try {
          await postJson(`${baseUrl}/api/customers/${cid}/payments`, {
            year: y,
            month: m,
            amount: invoiceAmount,
            method: billingMethod,
            note,
          });
        } catch (e) {
          console.error(`re-add payment failed cid=${cid} ${y}-${String(m).padStart(2,'0')}:`, e.message);
        }
      } else {
        console.log(`Invoice is 0; left month with no payments: cid=${cid} ${y}-${String(m).padStart(2,'0')}`);
      }
    }
  }
}

async function main() {
  const opts = parseArgs();
  if (opts.fromYear > opts.toYear) {
    console.error('fromYear は toYear 以下にしてください');
    process.exit(1);
  }
  console.log(`Start normalize overpayments: years=${opts.fromYear}..${opts.toYear}, base=${opts.baseUrl}`);

  // 顧客一覧（全件）
  let customers = [];
  try {
    customers = await getJson(`${opts.baseUrl}/api/customers`);
  } catch (e) {
    console.error('fetch customers failed:', e.message);
    process.exit(1);
  }
  const list = Array.isArray(customers) ? customers : [];
  console.log(`Customers: ${list.length}`);

  // 並列にしすぎないよう順次処理
  for (const c of list) {
    await normalizeCustomerMonths(opts.baseUrl, c, opts.fromYear, opts.toYear, opts.note);
  }

  console.log('Done normalize overpayments.');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});