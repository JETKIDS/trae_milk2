/**
 * Settle arrears up to last month (carryforward = 0) for all/specified customers.
 * Steps per month:
 * 1) Confirm invoices for target customers
 * 2) For each course and billing method (collection/debit), fetch invoice amounts and payment sums
 * 3) Register batch payments for the difference
 *
 * CLI options:
 *  --dry-run            : Do not post payments, only show plan
 *  --from=<m>          : Start month (1-12), default 1
 *  --to=<m>            : End month (1-12), default prev month
 *  --year=<yyyy>       : Target year, default current year
 *  --courses=<codes>   : Course codes (comma separated, e.g. A,B,C). Empty = all
 *  --methods=<m1,m2>   : Methods subset (collection,debit), default both
 *  --note=<text>       : Payment note text, default '自動調整（未収金ゼロ化）'
 *  --base-url=<url>    : API base url, default http://localhost:9000
 */

const fs = require('fs');
const path = require('path');
const BASE_DEFAULT = 'http://localhost:9000';

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    dryRun: false,
    fromMonth: 1,
    toMonth: null,
    year: new Date().getFullYear(),
    courses: [],
    methods: ['collection','debit'],
    note: '自動調整（未収金ゼロ化）',
    baseUrl: process.env.BASE_URL || BASE_DEFAULT,
  };
  for (const a of args) {
    if (a === '--dry-run') opts.dryRun = true;
    else if (a.startsWith('--from=')) opts.fromMonth = Number(a.split('=')[1]);
    else if (a.startsWith('--to=')) opts.toMonth = Number(a.split('=')[1]);
    else if (a.startsWith('--year=')) opts.year = Number(a.split('=')[1]);
    else if (a.startsWith('--courses=')) opts.courses = a.split('=')[1].split(',').map(s=>s.trim()).filter(Boolean);
    else if (a.startsWith('--methods=')) opts.methods = a.split('=')[1].split(',').map(s=>s.trim()).filter(Boolean);
    else if (a.startsWith('--note=')) opts.note = a.split('=')[1];
    else if (a.startsWith('--base-url=')) opts.baseUrl = a.split('=')[1];
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

async function main() {
  const opts = parseArgs();
  const now = new Date();
  const prevMonth = opts.toMonth ?? now.getMonth(); // 0-based JS month: Oct -> 9 (September)
  if (prevMonth <= 0) {
    console.log('No previous month in the current year to process.');
    return;
  }
  const fromMonth = Math.max(1, Number(opts.fromMonth || 1));
  const toMonth = Math.min(12, Number(prevMonth));

  console.log(`Starting settlement: year=${opts.year}, months=${fromMonth}..${toMonth}, dryRun=${opts.dryRun}`);
  console.log(`Targets: methods=${opts.methods.join(',') || '(none)'}, courses=${opts.courses.join(',') || '(all)'}`);

  const courses = await getJson(`${opts.baseUrl}/api/masters/courses`);
  const courseList = Array.isArray(courses) ? courses.map(c => ({ id: c.id, name: c.course_name, code: c.custom_id })) : [];
  const targetCourses = opts.courses.length > 0
    ? courseList.filter(c => opts.courses.includes(String(c.code)) || opts.courses.includes(String(c.id)))
    : courseList;
  console.log(`Courses: ${targetCourses.map(c => `${c.code}:${c.name}`).join(', ') || '(none)'}`);

  const summary = [];

  for (let month = fromMonth; month <= toMonth; month++) {
    console.log(`\n=== ${opts.year}-${String(month).padStart(2,'0')} ===`);

    // 1) Confirm invoices for all customers
    try {
      if (opts.dryRun) {
        console.log(`[DRY] Would confirm invoices for ${opts.year}-${String(month).padStart(2,'0')}`);
      } else {
        const conf = await postJson(`${opts.baseUrl}/api/customers/invoices/confirm-batch`, { year: opts.year, month });
        console.log(`Confirmed: ${conf.count} customers for ${opts.year}-${String(month).padStart(2,'0')}`);
      }
    } catch (e) {
      console.error(`Confirm failed for ${opts.year}-${String(month).padStart(2,'0')}:`, e.message);
    }

    let totalAdjustments = 0;
    let totalFailed = 0;

    // 2) For each course and method, register payments for remaining amounts
    for (const course of targetCourses) {
      for (const method of opts.methods) {
        try {
          const inv = await getJson(`${opts.baseUrl}/api/customers/by-course/${course.id}/invoices-amounts?year=${opts.year}&month=${month}&method=${method}`);
          const pay = await getJson(`${opts.baseUrl}/api/customers/by-course/${course.id}/payments-sum?year=${opts.year}&month=${month}`);
          const paidMap = {};
          for (const it of (pay.items || [])) paidMap[Number(it.customer_id)] = Number(it.total || 0);
          const entries = [];
          for (const it of (inv.items || [])) {
            const cid = Number(it.customer_id);
            const amount = Number(it.amount || 0);
            const paid = Number(paidMap[cid] || 0);
            const rem = amount - paid;
            if (rem > 0) entries.push({ customer_id: cid, amount: rem, note: opts.note });
          }
          if (entries.length > 0) {
            if (opts.dryRun) {
              console.log(`[DRY] Course ${course.code} ${method}: would adjust ${entries.length} entries`);
            } else {
              const resBatch = await postJson(`${opts.baseUrl}/api/customers/payments/batch`, { year: opts.year, month, entries, method });
              totalAdjustments += resBatch.success || 0;
              totalFailed += resBatch.failed || 0;
              console.log(`Course ${course.code} ${method}: adjusted=${resBatch.success}, failed=${resBatch.failed}`);
            }
          } else {
            console.log(`Course ${course.code} ${method}: no adjustments needed`);
          }
        } catch (e) {
          console.error(`Course ${course.code} ${method}: error`, e.message);
        }
      }
    }

    summary.push({ year: opts.year, month, adjusted: totalAdjustments, failed: totalFailed, dryRun: opts.dryRun });
  }

  // Write summary file
  try {
    const out = { generatedAt: new Date().toISOString(), summary };
    const outfile = path.join(__dirname, `settlement-summary-${opts.year}-${String(toMonth).padStart(2,'0')}.json`);
    fs.writeFileSync(outfile, JSON.stringify(out, null, 2), 'utf-8');
    console.log(`\nSummary written: ${outfile}`);
  } catch (e) {
    console.warn('Failed to write summary file:', e.message);
  }

  console.log('\n=== Summary ===');
  for (const s of summary) console.log(`${s.year}-${String(s.month).padStart(2,'0')}: adjusted=${s.adjusted}, failed=${s.failed}, dryRun=${s.dryRun}`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal error:', err);
});