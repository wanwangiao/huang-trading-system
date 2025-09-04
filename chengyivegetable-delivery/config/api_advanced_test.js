/**
 * 蔬果外送系統 - 進階API功能測試（含會話管理）
 * 修復認證問題並深度測試API功能
 */

const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');

// 配置
const BASE_URL = 'http://localhost:3002';
const WS_URL = 'ws://localhost:3002';

// 全域session存儲
const sessions = {
  driver: null,
  admin: null,
  customer: null
};

// axios實例配置，支援Cookie會話管理
const axiosInstance = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  withCredentials: true // 重要：支援cookie會話
});

// 測試結果儲存
const testResults = [];

// 輔助函數：記錄測試結果
function logResult(category, test, status, details = {}) {
  const result = {
    timestamp: new Date().toISOString(),
    category,
    test,
    status,
    details
  };
  
  testResults.push(result);
  
  const emoji = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : '⚠️';
  console.log(`${emoji} ${category} - ${test}`);
  
  if (status === 'FAIL' && details.error) {
    console.log(`   錯誤: ${details.error}`);
  }
}

// 輔助函數：HTTP請求（支援會話）
async function makeRequest(method, url, data = null, headers = {}) {
  try {
    const config = {
      method,
      url,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axiosInstance(config);
    return { 
      success: true, 
      data: response.data, 
      status: response.status,
      headers: response.headers 
    };
  } catch (error) {
    return { 
      success: false, 
      error: error.message, 
      status: error.response?.status || 0,
      data: error.response?.data || null 
    };
  }
}

// 1. 完整的外送員API測試（含會話管理）
async function testDriverAPIComplete() {
  console.log('\n🚗 === 外送員API完整測試 ===');
  
  // 1.1 外送員登入
  const loginResult = await makeRequest('POST', '/api/driver/login', {
    phone: '0912345678',
    password: 'driver123'
  });
  
  if (loginResult.success && loginResult.data.success) {
    logResult('Driver API', '外送員登入', 'PASS', { 
      response: loginResult.data 
    });
    sessions.driver = 'authenticated';
    
    // 1.2 測試所有需要認證的端點
    const authenticatedTests = [
      { name: '獲取可接訂單', url: '/api/driver/available-orders', method: 'GET' },
      { name: '獲取我的訂單', url: '/api/driver/my-orders', method: 'GET' },
      { name: '獲取個人資料', url: '/api/driver/profile', method: 'GET' },
      { name: '獲取今日統計', url: '/api/driver/today-stats', method: 'GET' },
      { name: '獲取已完成訂單', url: '/api/driver/completed-orders', method: 'GET' },
      { name: '獲取當前位置', url: '/api/driver/current-location', method: 'GET' }
    ];
    
    for (const test of authenticatedTests) {
      const result = await makeRequest(test.method, test.url);
      logResult('Driver API', test.name, 
        result.success ? 'PASS' : 'FAIL',
        { response: result }
      );
    }
    
    // 1.3 測試GPS功能
    const locationData = {
      lat: 24.9347,
      lng: 121.5681,
      accuracy: 10,
      speed: 25,
      heading: 45,
      timestamp: Date.now()
    };
    
    const updateLocationResult = await makeRequest('POST', '/api/driver/update-location', locationData);
    logResult('Driver API', 'GPS位置更新', 
      updateLocationResult.success ? 'PASS' : 'FAIL',
      { response: updateLocationResult }
    );
    
    // 1.4 測試位置歷史
    const locationHistoryResult = await makeRequest('GET', '/api/driver/location-history?limit=10&hours=24');
    logResult('Driver API', '位置歷史查詢', 
      locationHistoryResult.success ? 'PASS' : 'FAIL',
      { response: locationHistoryResult }
    );
    
    // 1.5 測試訂單操作（如果有可接訂單）
    const availableOrdersResult = await makeRequest('GET', '/api/driver/available-orders');
    if (availableOrdersResult.success && availableOrdersResult.data.length > 0) {
      const orderId = availableOrdersResult.data[0].id;
      
      // 測試接受訂單
      const acceptOrderResult = await makeRequest('POST', `/api/driver/accept-order/${orderId}`);
      logResult('Driver API', '接受訂單', 
        acceptOrderResult.success ? 'PASS' : 'FAIL',
        { orderId, response: acceptOrderResult }
      );
    }
    
  } else {
    logResult('Driver API', '外送員登入', 'FAIL', { 
      error: loginResult.error || loginResult.data?.error 
    });
  }
}

// 2. 客戶API深度測試
async function testCustomerAPIDeep() {
  console.log('\n👤 === 客戶API深度測試 ===');
  
  // 測試不同情境的訂單查詢
  const testCases = [
    { orderId: 1, phone: '0912345678', description: '正常訂單查詢' },
    { orderId: 999, phone: '0912345678', description: '不存在的訂單' },
    { orderId: 1, phone: '0000000000', description: '錯誤的電話號碼' },
  ];
  
  for (const testCase of testCases) {
    const statusResult = await makeRequest('GET', 
      `/api/customer/orders/${testCase.orderId}/status?phone=${testCase.phone}`);
    
    const shouldPass = testCase.orderId === 1 && testCase.phone === '0912345678';
    const actualPass = statusResult.success;
    
    logResult('Customer API', `訂單狀態查詢 - ${testCase.description}`, 
      shouldPass === actualPass ? 'PASS' : 'FAIL',
      { testCase, response: statusResult }
    );
  }
  
  // 測試所有客戶API端點
  const validOrder = { orderId: 1, phone: '0912345678' };
  const customerEndpoints = [
    { name: '獲取外送員位置', url: `/api/customer/orders/${validOrder.orderId}/driver-location?phone=${validOrder.phone}` },
    { name: '計算送達時間', url: `/api/customer/orders/${validOrder.orderId}/eta?phone=${validOrder.phone}` },
    { name: '獲取訂單時間軸', url: `/api/customer/orders/${validOrder.orderId}/timeline?phone=${validOrder.phone}` }
  ];
  
  for (const endpoint of customerEndpoints) {
    const result = await makeRequest('GET', endpoint.url);
    logResult('Customer API', endpoint.name, 
      result.success ? 'PASS' : 'FAIL',
      { response: result }
    );
  }
  
  // 測試訂單取消功能
  const cancelResult = await makeRequest('POST', 
    `/api/customer/orders/${validOrder.orderId}/cancel?phone=${validOrder.phone}`, 
    { reason: '測試取消' }
  );
  logResult('Customer API', '訂單取消', 
    cancelResult.success ? 'PASS' : 'FAIL',
    { response: cancelResult }
  );
}

// 3. Google Maps API功能測試
async function testGoogleMapsAPIFunctions() {
  console.log('\n🗺️ === Google Maps API功能測試 ===');
  
  // 3.1 基本地理編碼測試
  const addresses = [
    '台北101',
    '新北市三峽區大學路1號',
    '台中市西屯區文心路二段688號',
    '無效地址123456'
  ];
  
  for (const address of addresses) {
    const geocodeResult = await makeRequest('POST', '/api/maps/geocode', { address });
    logResult('Google Maps API', `地理編碼 - ${address}`, 
      geocodeResult.success ? 'PASS' : 'FAIL',
      { address, response: geocodeResult }
    );
  }
  
  // 3.2 測試輸入驗證
  const invalidInputs = [
    { data: {}, description: '空物件' },
    { data: { address: '' }, description: '空地址' },
    { data: { address: null }, description: 'null地址' }
  ];
  
  for (const input of invalidInputs) {
    const result = await makeRequest('POST', '/api/maps/geocode', input.data);
    logResult('Google Maps API', `輸入驗證 - ${input.description}`, 
      !result.success || result.status >= 400 ? 'PASS' : 'FAIL',
      { input, response: result }
    );
  }
}

// 4. WebSocket深度連接測試
async function testWebSocketDeep() {
  console.log('\n🔌 === WebSocket深度連接測試 ===');
  
  return new Promise((resolve) => {
    const tests = {
      connection: false,
      authentication: false,
      messaging: false,
      locationUpdate: false,
      disconnection: false
    };
    
    let testTimeout;
    let messagesReceived = 0;
    
    const ws = new WebSocket(`${WS_URL}/websocket`);
    
    const finishTests = () => {
      if (testTimeout) clearTimeout(testTimeout);
      
      // 評估測試結果
      Object.keys(tests).forEach(testName => {
        logResult('WebSocket API', `${testName}測試`, 
          tests[testName] ? 'PASS' : 'FAIL'
        );
      });
      
      resolve();
    };
    
    testTimeout = setTimeout(() => {
      logResult('WebSocket API', '整體連接測試', 'FAIL', { 
        error: '測試超時',
        testsCompleted: tests 
      });
      ws.close();
      finishTests();
    }, 15000);
    
    ws.on('open', () => {
      tests.connection = true;
      
      // 發送認證訊息
      ws.send(JSON.stringify({
        type: 'auth',
        userType: 'driver',
        userId: '1',
        token: 'test_token'
      }));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messagesReceived++;
        
        // 處理不同類型的訊息
        if (message.type === 'connected') {
          tests.messaging = true;
        }
        
        if (message.type === 'auth_success') {
          tests.authentication = true;
          
          // 發送位置更新
          ws.send(JSON.stringify({
            type: 'location_update',
            data: {
              lat: 24.9347,
              lng: 121.5681,
              accuracy: 10,
              timestamp: new Date().toISOString()
            }
          }));
        }
        
        if (message.type === 'location_update_success' || message.type === 'location_received') {
          tests.locationUpdate = true;
        }
        
        // 如果所有主要測試都完成，準備關閉
        if (tests.connection && tests.authentication && tests.messaging) {
          setTimeout(() => {
            tests.disconnection = true;
            ws.close();
          }, 1000);
        }
        
      } catch (error) {
        logResult('WebSocket API', '訊息解析', 'FAIL', { error: error.message });
      }
    });
    
    ws.on('close', () => {
      tests.disconnection = true;
      finishTests();
    });
    
    ws.on('error', (error) => {
      logResult('WebSocket API', '連接錯誤', 'FAIL', { error: error.message });
      finishTests();
    });
  });
}

// 5. 安全性進階測試
async function testSecurityAdvanced() {
  console.log('\n🔐 === 安全性進階測試 ===');
  
  // 5.1 SQL注入測試集
  const sqlInjectionPayloads = [
    "1' OR '1'='1",
    "1; DROP TABLE orders--",
    "1 UNION SELECT * FROM drivers--",
    "1' OR 1=1--"
  ];
  
  for (const payload of sqlInjectionPayloads) {
    const result = await makeRequest('GET', 
      `/api/customer/orders/${payload}/status?phone=0912345678`);
    
    logResult('Security', `SQL注入防護 - ${payload}`, 
      !result.success || result.status >= 400 ? 'PASS' : 'FAIL',
      { payload, response: result }
    );
  }
  
  // 5.2 XSS測試集
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src="x" onerror="alert(1)">',
    'javascript:alert("XSS")',
    '<svg onload="alert(1)">'
  ];
  
  for (const payload of xssPayloads) {
    const result = await makeRequest('POST', '/api/maps/geocode', {
      address: payload + '台北市信義區'
    });
    
    const hasXSS = result.success && 
      result.data?.data?.formatted_address?.includes('<script>');
    
    logResult('Security', `XSS防護 - ${payload.substring(0, 20)}`, 
      !hasXSS ? 'PASS' : 'FAIL',
      { payload, response: result }
    );
  }
  
  // 5.3 認證繞過測試
  const protectedEndpoints = [
    '/api/driver/profile',
    '/api/driver/my-orders',
    '/api/maps/orders-map-data',
    '/api/maps/cache-stats'
  ];
  
  // 清除認證會話進行測試
  const tempAxios = axios.create({
    baseURL: BASE_URL,
    timeout: 5000
  });
  
  for (const endpoint of protectedEndpoints) {
    try {
      const result = await tempAxios.get(endpoint);
      logResult('Security', `認證繞過測試 - ${endpoint}`, 'FAIL', {
        description: '應該需要認證',
        status: result.status
      });
    } catch (error) {
      logResult('Security', `認證繞過測試 - ${endpoint}`, 
        error.response?.status === 401 ? 'PASS' : 'FAIL',
        { expectedStatus: 401, actualStatus: error.response?.status }
      );
    }
  }
}

// 6. 性能與負載測試
async function testPerformanceAdvanced() {
  console.log('\n🚀 === 性能與負載測試 ===');
  
  // 6.1 響應時間測試
  const responseTimeTests = [
    { name: '地理編碼API', url: '/api/maps/geocode', method: 'POST', data: { address: '台北101' } },
    { name: '訂單狀態查詢', url: '/api/customer/orders/1/status?phone=0912345678', method: 'GET' }
  ];
  
  for (const test of responseTimeTests) {
    const startTime = Date.now();
    const result = await makeRequest(test.method, test.url, test.data);
    const responseTime = Date.now() - startTime;
    
    logResult('Performance', `${test.name}響應時間`, 
      responseTime < 1000 ? 'PASS' : 'FAIL',
      { responseTime: `${responseTime}ms`, threshold: '1000ms' }
    );
  }
  
  // 6.2 並發請求測試
  const concurrentRequests = 15;
  const promises = [];
  
  for (let i = 0; i < concurrentRequests; i++) {
    promises.push(makeRequest('GET', '/api/customer/orders/1/status?phone=0912345678'));
  }
  
  const startTime = Date.now();
  const results = await Promise.all(promises);
  const totalTime = Date.now() - startTime;
  
  const successfulRequests = results.filter(r => r.success).length;
  const averageTime = totalTime / concurrentRequests;
  
  logResult('Performance', '並發請求處理', 
    successfulRequests >= concurrentRequests * 0.8 && averageTime < 200 ? 'PASS' : 'FAIL',
    { 
      totalRequests: concurrentRequests,
      successfulRequests,
      totalTime: `${totalTime}ms`,
      averageTime: `${averageTime.toFixed(2)}ms`
    }
  );
  
  // 6.3 記憶體使用測試（通過檢查響應大小）
  const memoryTest = await makeRequest('GET', '/api/driver/location-history?limit=100&hours=168');
  
  let responseSize = 0;
  if (memoryTest.success && memoryTest.data) {
    responseSize = JSON.stringify(memoryTest.data).length;
  }
  
  logResult('Performance', '大數據響應處理', 
    responseSize < 100000 ? 'PASS' : 'FAIL', // 小於100KB
    { 
      responseSize: `${Math.round(responseSize / 1024)}KB`,
      threshold: '100KB'
    }
  );
}

// 7. API一致性測試
async function testAPIConsistency() {
  console.log('\n📋 === API一致性測試 ===');
  
  // 測試API響應格式一致性
  const apiEndpoints = [
    { url: '/api/customer/orders/1/status?phone=0912345678', name: '客戶訂單狀態' },
    { url: '/api/maps/geocode', method: 'POST', data: { address: '台北101' }, name: '地理編碼' }
  ];
  
  for (const endpoint of apiEndpoints) {
    const method = endpoint.method || 'GET';
    const result = await makeRequest(method, endpoint.url, endpoint.data);
    
    if (result.success) {
      // 檢查響應結構
      const hasStandardFields = result.data && 
        (typeof result.data === 'object');
      
      logResult('API Consistency', `${endpoint.name}響應格式`, 
        hasStandardFields ? 'PASS' : 'FAIL',
        { structure: typeof result.data }
      );
    } else {
      logResult('API Consistency', `${endpoint.name}響應格式`, 'FAIL',
        { error: result.error }
      );
    }
  }
}

// 生成詳細測試報告
function generateDetailedReport() {
  console.log('\n📊 === 生成詳細測試報告 ===');
  
  const summary = {
    testDateTime: new Date().toISOString(),
    totalTests: testResults.length,
    passedTests: testResults.filter(r => r.status === 'PASS').length,
    failedTests: testResults.filter(r => r.status === 'FAIL').length,
    warningTests: testResults.filter(r => r.status === 'WARN').length,
    categories: {}
  };
  
  // 分類統計
  testResults.forEach(result => {
    if (!summary.categories[result.category]) {
      summary.categories[result.category] = {
        total: 0,
        passed: 0,
        failed: 0,
        warned: 0
      };
    }
    
    summary.categories[result.category].total++;
    if (result.status === 'PASS') summary.categories[result.category].passed++;
    if (result.status === 'FAIL') summary.categories[result.category].failed++;
    if (result.status === 'WARN') summary.categories[result.category].warned++;
  });
  
  const report = {
    summary,
    detailedResults: testResults,
    recommendations: generateRecommendations(testResults)
  };
  
  // 保存報告
  fs.writeFileSync('api_advanced_test_report.json', JSON.stringify(report, null, 2));
  
  // 輸出摘要
  console.log(`\n📈 測試摘要:`);
  console.log(`總測試: ${summary.totalTests}`);
  console.log(`✅ 通過: ${summary.passedTests} (${((summary.passedTests/summary.totalTests)*100).toFixed(1)}%)`);
  console.log(`❌ 失敗: ${summary.failedTests} (${((summary.failedTests/summary.totalTests)*100).toFixed(1)}%)`);
  console.log(`⚠️  警告: ${summary.warningTests}`);
  
  console.log(`\n📋 分類結果:`);
  Object.keys(summary.categories).forEach(category => {
    const cat = summary.categories[category];
    const passRate = ((cat.passed / cat.total) * 100).toFixed(1);
    console.log(`${category}: ${cat.passed}/${cat.total} (${passRate}%)`);
  });
  
  console.log(`\n📄 詳細報告: api_advanced_test_report.json`);
  
  return summary;
}

// 生成改進建議
function generateRecommendations(results) {
  const recommendations = [];
  
  const failedTests = results.filter(r => r.status === 'FAIL');
  
  if (failedTests.some(t => t.category === 'Security')) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Security',
      issue: '安全性測試失敗',
      recommendation: '實施更強的輸入驗證、SQL注入防護和XSS過濾'
    });
  }
  
  if (failedTests.some(t => t.category === 'Performance')) {
    recommendations.push({
      priority: 'MEDIUM',
      category: 'Performance',
      issue: '性能測試未達標',
      recommendation: '優化API響應時間，考慮添加快取機制'
    });
  }
  
  if (failedTests.some(t => t.test.includes('認證'))) {
    recommendations.push({
      priority: 'HIGH',
      category: 'Authentication',
      issue: '認證機制問題',
      recommendation: '檢查會話管理和認證中間件實現'
    });
  }
  
  return recommendations;
}

// 主測試執行函數
async function runAdvancedTests() {
  console.log('🎯 蔬果外送系統 - 進階API功能測試');
  console.log(`測試目標: ${BASE_URL}`);
  console.log(`開始時間: ${new Date().toISOString()}`);
  
  try {
    // 檢查伺服器連接
    const healthCheck = await makeRequest('GET', '/');
    if (!healthCheck.success) {
      console.error('❌ 伺服器無法連接');
      return;
    }
    
    logResult('System', '伺服器連接', 'PASS');
    
    // 執行所有測試
    await testDriverAPIComplete();
    await testCustomerAPIDeep();
    await testGoogleMapsAPIFunctions();
    await testWebSocketDeep();
    await testSecurityAdvanced();
    await testPerformanceAdvanced();
    await testAPIConsistency();
    
    // 生成報告
    const summary = generateDetailedReport();
    
    console.log('\n🎉 進階測試完成!');
    return summary;
    
  } catch (error) {
    console.error('💥 測試執行錯誤:', error.message);
    logResult('System', '測試執行', 'FAIL', { error: error.message });
  }
}

// 如果直接執行
if (require.main === module) {
  runAdvancedTests().catch(console.error);
}

module.exports = { runAdvancedTests };