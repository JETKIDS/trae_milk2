const http = require('http');

function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(body);
          resolve({ status: res.statusCode, data: result });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function confirmInvoice(customerId, year, month) {
  const options = {
    hostname: 'localhost',
    port: 9000,
    path: `/api/customers/${customerId}/invoices/confirm`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };
  return await makeRequest(options, { year, month });
}

async function createPattern(customerId, startDate, endDate) {
  const testData = {
    customer_id: customerId,
    product_id: 1,
    quantity: 1,
    unit_price: 150,
    delivery_days: JSON.stringify([1]), // 月曜日
    daily_quantities: JSON.stringify({ 1: 1 }),
    start_date: startDate,
    end_date: endDate,
    is_active: 1
  };
  const options = {
    hostname: 'localhost',
    port: 9000,
    path: '/api/delivery-patterns',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  };
  return await makeRequest(options, testData);
}

async function getPatterns(customerId) {
  const options = {
    hostname: 'localhost',
    port: 9000,
    path: `/api/delivery-patterns/customer/${customerId}`,
    method: 'GET'
  };
  return await makeRequest(options);
}

async function updatePattern(id, payload) {
  const options = {
    hostname: 'localhost',
    port: 9000,
    path: `/api/delivery-patterns/${id}`,
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' }
  };
  return await makeRequest(options, payload);
}

async function runTests() {
  const customerId = 1; // 既存の顧客IDを利用
  console.log('=== 配達パターン更新の回帰テスト開始 ===');

  // 1) 無期限の契約を作成 → 最新確定月以降への終了日短縮は許可、以前は拒否
  console.log('\n[ケース1] 無期限→終了日短縮（解約）');
  const create1 = await createPattern(customerId, '2025-01-01', null);
  console.log('作成レスポンス:', create1);
  const patternId1 = create1?.data?.id;
  if (!patternId1) {
    console.error('パターンIDが取得できませんでした');
    return;
  }

  // 顧客の最新確定月を 2025-10 と仮定（実際に確定）
  const conf1 = await confirmInvoice(customerId, 2025, 10);
  console.log('確定レスポンス(2025-10):', conf1);

  // 最新確定月「以降」への短縮 → 許可されるべき
  const shortenOk = await updatePattern(patternId1, {
    product_id: 1,
    quantity: 1,
    unit_price: 150,
    delivery_days: JSON.stringify([1]),
    daily_quantities: JSON.stringify({ 1: 1 }),
    start_date: '2025-01-01',
    end_date: '2025-10-31',
    is_active: 1
  });
  console.log('短縮(OK期待):', shortenOk.status, shortenOk.data);

  // 最新確定月「より前」への短縮 → 拒否されるべき
  const shortenNg = await updatePattern(patternId1, {
    product_id: 1,
    quantity: 1,
    unit_price: 150,
    delivery_days: JSON.stringify([1]),
    daily_quantities: JSON.stringify({ 1: 1 }),
    start_date: '2025-01-01',
    end_date: '2025-09-30',
    is_active: 1
  });
  console.log('短縮(NG期待):', shortenNg.status, shortenNg.data);

  // 2) 有期限→延長（解約取り消し）: 延長範囲に確定月があると拒否、なければ許可
  console.log('\n[ケース2] 有期限→延長（解約取り消し）');
  const create2 = await createPattern(customerId, '2025-01-01', '2025-03-31');
  console.log('作成レスポンス2:', create2);
  const patternId2 = create2?.data?.id;
  if (!patternId2) {
    console.error('パターンID2が取得できませんでした');
    return;
  }

  // 延長範囲に確定を作成（2025-05 を確定）
  const conf2 = await confirmInvoice(customerId, 2025, 5);
  console.log('確定レスポンス(2025-05):', conf2);

  // 延長範囲に確定が含まれる → 拒否されるべき
  const extendNg = await updatePattern(patternId2, {
    product_id: 1,
    quantity: 1,
    unit_price: 150,
    delivery_days: JSON.stringify([1]),
    daily_quantities: JSON.stringify({ 1: 1 }),
    start_date: '2025-01-01',
    end_date: '2025-06-30',
    is_active: 1
  });
  console.log('延長(NG期待):', extendNg.status, extendNg.data);

  // 延長範囲に確定が含まれない → 許可されるべき
  const extendOk = await updatePattern(patternId2, {
    product_id: 1,
    quantity: 1,
    unit_price: 150,
    delivery_days: JSON.stringify([1]),
    daily_quantities: JSON.stringify({ 1: 1 }),
    start_date: '2025-01-01',
    end_date: '2025-04-30',
    is_active: 1
  });
  console.log('延長(OK期待):', extendOk.status, extendOk.data);

  console.log('\n=== 回帰テスト終了 ===');
}

runTests().catch(err => {
  console.error('テスト実行エラー:', err);
});