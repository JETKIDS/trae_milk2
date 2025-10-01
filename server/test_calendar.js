const http = require('http');

function makeRequest(options) {
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
    req.end();
  });
}

async function testCalendar() {
  try {
    console.log('=== カレンダーAPIテスト ===');
    
    // 2025年1月のカレンダーを取得（顧客ID: 1）
    const options = {
      hostname: 'localhost',
      port: 9000,
      path: '/api/customers/1/calendar/2025/1',
      method: 'GET'
    };

    const response = await makeRequest(options);
    console.log('ステータス:', response.status);
    
    if (response.data && Array.isArray(response.data)) {
      console.log('カレンダーデータ件数:', response.data.length);
      
      // 1月15日前後のデータを確認
      const relevantDays = response.data.filter(day => {
        const dayNum = parseInt(day.date.split('-')[2]);
        return dayNum >= 10 && dayNum <= 20;
      });
      
      console.log('\n=== 1月10日〜20日のデータ ===');
      relevantDays.forEach(day => {
        console.log(`${day.date} (${['日','月','火','水','木','金','土'][day.dayOfWeek]}曜日):`);
        if (day.products.length > 0) {
          day.products.forEach(product => {
            console.log(`  - ${product.productName}: ${product.quantity}${product.unit}`);
          });
        } else {
          console.log('  配達なし');
        }
      });
    } else {
      console.log('レスポンス:', response.data);
    }
    
  } catch (error) {
    console.error('エラー:', error.message);
  }
}

testCalendar();