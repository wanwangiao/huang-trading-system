// =====================================
// 詳細安全測試腳本
// 針對具體安全修復進行深度測試
// =====================================

const http = require('http');
const fs = require('fs');

// 測試配置
const config = {
  baseUrl: 'http://localhost:3003',
  testAccount: {
    phone: '0912345678',
    password: 'driver123'
  }
};

// HTTP 請求工具（增強版）
async function makeRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let responseBody = '';
      
      res.on('data', (chunk) => {
        responseBody += chunk.toString('utf8');
      });
      
      res.on('end', () => {
        try {
          const jsonBody = responseBody ? JSON.parse(responseBody) : {};
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: jsonBody,
            rawBody: responseBody
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: responseBody,
            rawBody: responseBody
          });
        }
      });
    });
    
    req.on('error', reject);
    
    if (data) {
      req.write(typeof data === 'string' ? data : JSON.stringify(data));
    }
    
    req.end();
  });
}

// 詳細權限測試
async function runDetailedPermissionTests() {
  console.log('🔐 執行詳細權限測試...');
  
  // Step 1: 外送員登入
  console.log('\n1️⃣ 外送員登入');
  const loginResponse = await makeRequest({
    hostname: 'localhost',
    port: 3003,
    path: '/api/driver/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, config.testAccount);
  
  if (loginResponse.statusCode !== 200) {
    console.log('❌ 登入失敗，無法繼續測試');
    return;
  }
  
  console.log('✅ 外送員登入成功');
  const sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  
  // Step 2: 測試各種權限場景
  console.log('\n2️⃣ 測試權限場景');
  
  // 場景1: 嘗試取貨不存在的訂單
  console.log('\n📦 場景1: 取貨不存在的訂單');
  const pickup1 = await makeRequest({
    hostname: 'localhost',
    port: 3003,
    path: '/api/driver/pickup-order/99999',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    }
  });
  
  console.log(`   狀態碼: ${pickup1.statusCode}`);
  console.log(`   回應: ${JSON.stringify(pickup1.body)}`);
  
  // 場景2: 嘗試開始配送不存在的訂單
  console.log('\n🚚 場景2: 開始配送不存在的訂單');
  const delivery1 = await makeRequest({
    hostname: 'localhost',
    port: 3003,
    path: '/api/driver/start-delivery/99999',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    }
  });
  
  console.log(`   狀態碼: ${delivery1.statusCode}`);
  console.log(`   回應: ${JSON.stringify(delivery1.body)}`);
  
  // 場景3: 嘗試完成配送不存在的訂單
  console.log('\n✅ 場景3: 完成配送不存在的訂單');
  const complete1 = await makeRequest({
    hostname: 'localhost',
    port: 3003,
    path: '/api/driver/complete-delivery/99999',
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    }
  });
  
  console.log(`   狀態碼: ${complete1.statusCode}`);
  console.log(`   回應: ${JSON.stringify(complete1.body)}`);
  
  // 場景4: 測試不同ID格式
  console.log('\n🔢 場景4: 測試無效ID格式');
  const invalidIds = ['abc', '-1', '0', 'null', 'undefined'];
  
  for (const id of invalidIds) {
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3003,
      path: `/api/driver/pickup-order/${id}`,
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': sessionCookie
      }
    });
    
    console.log(`   ID "${id}" -> 狀態碼: ${response.statusCode}`);
  }
}

// 中文編碼深度測試
async function runChineseEncodingTests() {
  console.log('\n🔤 執行中文編碼深度測試...');
  
  const testStrings = [
    '張小明',
    '新北市三峽區大學路1號',
    '請按門鈴，謝謝！🔔',
    '🥬 有機蔬菜 🥕',
    '特殊字符：""、。！？',
    '數字混合：123號4樓5室',
    '英中混合：John 王小明 123'
  ];
  
  console.log('\n📝 測試中文訂單資料提交與回傳');
  
  for (let i = 0; i < testStrings.length; i++) {
    const testString = testStrings[i];
    console.log(`\n測試字串 ${i + 1}: "${testString}"`);
    
    const orderData = {
      name: testString,
      phone: '0912345678',
      address: testString,
      notes: testString,
      items: [{ productId: 1, quantity: 1 }]
    };
    
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3003,
      path: '/api/orders',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json; charset=UTF-8'
      }
    }, orderData);
    
    console.log(`   狀態碼: ${response.statusCode}`);
    if (response.body.success) {
      console.log(`   ✅ 訂單建立成功: ${response.body.orderId}`);
    } else {
      console.log(`   ❌ 訂單建立失敗: ${response.body.message}`);
    }
  }
}

// SQL注入測試
async function runSqlInjectionTests() {
  console.log('\n💉 執行SQL注入安全測試...');
  
  const sqlPayloads = [
    "'; DROP TABLE orders; --",
    "' OR '1'='1",
    "' UNION SELECT * FROM users --",
    "'; INSERT INTO orders VALUES (999, 'hacked'); --",
    "' OR 1=1 --",
    "'; UPDATE orders SET status='delivered' WHERE id > 0; --"
  ];
  
  // 外送員登入
  const loginResponse = await makeRequest({
    hostname: 'localhost',
    port: 3003,
    path: '/api/driver/login',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' }
  }, config.testAccount);
  
  const sessionCookie = loginResponse.headers['set-cookie']?.[0] || '';
  
  console.log('\n🎯 測試訂單ID參數SQL注入');
  for (let i = 0; i < sqlPayloads.length; i++) {
    const payload = sqlPayloads[i];
    console.log(`\n注入測試 ${i + 1}: "${payload}"`);
    
    try {
      const response = await makeRequest({
        hostname: 'localhost',
        port: 3003,
        path: `/api/driver/pickup-order/${encodeURIComponent(payload)}`,
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Cookie': sessionCookie
        }
      });
      
      console.log(`   狀態碼: ${response.statusCode}`);
      
      // 檢查是否有異常回應
      if (response.statusCode === 200 && response.body.success) {
        console.log('   ⚠️  可能存在SQL注入漏洞！');
      } else {
        console.log('   ✅ 安全防護有效');
      }
    } catch (error) {
      console.log(`   ✅ 請求被拒絕: ${error.message}`);
    }
  }
}

// XSS攻擊測試
async function runXssTests() {
  console.log('\n🕷️ 執行XSS攻擊測試...');
  
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '"><script>alert("XSS")</script>',
    "javascript:alert('XSS')",
    '<img src="x" onerror="alert(\'XSS\')">',
    '<svg onload="alert(\'XSS\')">',
    '&lt;script&gt;alert("XSS")&lt;/script&gt;'
  ];
  
  console.log('\n📝 測試訂單資料XSS注入');
  for (let i = 0; i < xssPayloads.length; i++) {
    const payload = xssPayloads[i];
    console.log(`\nXSS測試 ${i + 1}: "${payload}"`);
    
    const orderData = {
      name: payload,
      phone: '0912345678',
      address: payload,
      notes: payload,
      items: [{ productId: 1, quantity: 1 }]
    };
    
    const response = await makeRequest({
      hostname: 'localhost',
      port: 3003,
      path: '/api/orders',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      }
    }, orderData);
    
    console.log(`   狀態碼: ${response.statusCode}`);
    
    // 檢查回應是否包含未經處理的腳本
    if (response.rawBody && response.rawBody.includes('<script>')) {
      console.log('   ⚠️  可能存在XSS漏洞！');
    } else {
      console.log('   ✅ XSS防護有效');
    }
  }
}

// 主測試函數
async function runDetailedSecurityTests() {
  console.log('🛡️ 開始執行詳細安全測試...');
  console.log(`時間: ${new Date().toLocaleString('zh-TW')}`);
  console.log('=' * 80);
  
  try {
    await runDetailedPermissionTests();
    await runChineseEncodingTests();
    await runSqlInjectionTests();
    await runXssTests();
    
    console.log('\n' + '=' * 80);
    console.log('🏁 詳細安全測試完成');
    console.log('=' * 80);
    
  } catch (error) {
    console.error('❌ 測試執行錯誤:', error);
  }
}

// 執行測試
if (require.main === module) {
  runDetailedSecurityTests().catch(console.error);
}

module.exports = { runDetailedSecurityTests };