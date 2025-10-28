/**
 * 一括入金取消スクリプト: 指定年・月の入金（正の金額のみ）を全顧客で取消します
 *
 * 実行例:
 *   node server/scripts/cancel_payments_in_months.js --year=2025 --months=10,11,12 --base-url=http://localhost:9000
 *
 * 仕様:
 *  - 全顧客の一覧を取得
 *  - 指定された各月について、入金一覧を取得（limitを広めに）
 *  - 金額が正の入金のみ取消APIを呼び出してマイナス入金を登録
 *  - 請求が未確定でも取消は可能（取消は既存入金の相殺レコードを追加するだけのため）
 */

const DEFAULT_BASE = 'http://localhost:9000';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    year: new Date().getFullYear(),
    months: [],
    baseUrl: process.env.BASE_URL || DEFAULT_BASE,
    dryRun: false,
  };
  for (const a of args) {
    if (a.startsWith('--year=')) opts.year = Number(a.split('=')[1]);
    else if (a.startsWith('--months=')) {
      const raw = a.split('=')[1];
      opts.months = String(raw).split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n >= 1 && n <= 12);
    }
    else if (a.startsWith('--base-url=')) opts.baseUrl = a.split('=')[1];
    else if (a === '--dry-run') opts.dryRun = true;
  }
  if (!opts.months || opts.months.length === 0) {
    // デフォルト: 10,11,12
    opts.months = [10, 11, 12];
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
    body: JSON.stringify(body || {}),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`POST ${url} -> ${resp.status} ${text}`);
  }
  return await resp.json();
}

async function cancelPaymentsForCustomerMonths(baseUrl, cid, year, months, dryRun) {
  let totalCanceled = 0;
  for (const m of months) {
    let payments = [];
    try {
      payments = await getJson(`${baseUrl}/api/customers/${cid}/payments?year=${year}&month=${m}&limit=2000`);
    } catch (e) {
      console.warn(`payments fetch error cid=${cid} ${year}-${String(m).padStart(2,'0')}:`, e.message);
      continue;
    }
    const positives = (payments || []).filter(p => Number(p.amount || 0) > 0);
    if (positives.length === 0) {
      console.log(`No positive payments: cid=${cid} ${year}-${String(m).padStart(2,'0')}`);
      continue;
    }

    for (const p of positives) {
      const pid = Number(p.id);
      if (!Number.isFinite(pid)) continue;
      console.log(`Cancel payment: cid=${cid} pid=${pid} ${year}-${String(m).padStart(2,'0')} amount=${p.amount}`);
      if (!dryRun) {
        try {
          await postJson(`${baseUrl}/api/customers/${cid}/payments/${pid}/cancel`, {});
          totalCanceled++;
        } catch (e) {
          console.error(`cancel failed cid=${cid} pid=${pid}:`, e.message);
        }
      }
    }
  }
  return totalCanceled;
}

async function main() {
  const opts = parseArgs();
  console.log(`Start bulk cancel payments: year=${opts.year}, months=[${opts.months.join(',')}], base=${opts.baseUrl}, dryRun=${opts.dryRun}`);

  // 顧客一覧取得
  let customers = [];
  try {
    customers = await getJson(`${opts.baseUrl}/api/customers`);
  } catch (e) {
    console.error('fetch customers failed:', e.message);
    process.exit(1);
  }
  const list = Array.isArray(customers) ? customers : [];
  console.log(`Customers: ${list.length}`);

  let grandTotal = 0;
  for (const c of list) {
    const cid = Number(c.id);
    if (!Number.isFinite(cid)) continue;
    const count = await cancelPaymentsForCustomerMonths(opts.baseUrl, cid, opts.year, opts.months, opts.dryRun);
    if (count > 0) {
      console.log(`Canceled ${count} payments for cid=${cid}`);
    }
    grandTotal += count;
  }

  console.log(`Done bulk cancel. Total canceled records: ${grandTotal}`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});