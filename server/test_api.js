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

async function testCreateDeliveryPattern() {
  try {
    console.log('=== 配達パターン作成テスト ===');
    
    const testData = {
      customer_id: 1,
      product_id: 1,
      quantity: 4, // 最大値（後方互換性）
      unit_price: 150,
      delivery_days: JSON.stringify([1, 4]), // 月曜日と木曜日
      daily_quantities: JSON.stringify({
        1: 3, // 月曜日: 3本
        4: 4  // 木曜日: 4本
      }),
      start_date: '2025-01-15',
      end_date: null,
      is_active: true
    };

    console.log('送信データ:', testData);

    const postOptions = {
      hostname: 'localhost',
      port: 9000,
      path: '/api/delivery-patterns',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      }
    };

    const response = await makeRequest(postOptions, testData);
    console.log('レスポンス:', response);
    
    // 作成されたデータを確認
    const getOptions = {
      hostname: 'localhost',
      port: 9000,
      path: '/api/delivery-patterns/customer/1',
      method: 'GET'
    };
    
    const patterns = await makeRequest(getOptions);
    console.log('作成後の配達パターン:', patterns.data);
    
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

testCreateDeliveryPattern();