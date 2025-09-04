/**
 * 蔬果外送系統 - 全面API功能測試
 * 測試所有API端點的功能、安全性和性能
 */

const axios = require('axios');
const WebSocket = require('ws');
const fs = require('fs');

// 測試配置
const BASE_URL = 'http://localhost:3002';
const WS_URL = 'ws://localhost:3002';
const TEST_RESULTS = [];

// 測試數據
const TEST_DATA = {
  // 外送員測試數據
  driver: {
    phone: '0912345678',
    password: 'driver123'
  },
  // 客戶測試數據
  customer: {
    phone: '0912345679',
    address: '新北市三峽區大學路1號'
  },
  // 管理員測試數據
  admin: {
    username: 'admin',
    password: 'admin123'
  },
  // 測試地址
  testAddresses: [
    '新北市三峽區大學路1號',
    '台北市信義區市府路1號',
    '桃園市中壢區中大路300號'
  ]
};

// 輔助函數：記錄測試結果
function logTestResult(category, testName, status, details = {}) {
  const result = {
    timestamp: new Date().toISOString(),
    category,
    testName,
    status,
    details
  };
  
  TEST_RESULTS.push(result);
  console.log(`[${status.toUpperCase()}] ${category} - ${testName}`);
  
  if (status === 'FAIL') {
    console.error('  Error:', details.error);
  }
}

// 輔助函數：HTTP請求
async function makeRequest(method, url, data = null, headers = {}) {
  try {
    const config = {
      method,
      url: `${BASE_URL}${url}`,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      timeout: 10000
    };
    
    if (data) {
      config.data = data;
    }
    
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return { 
      success: false, 
      error: error.message, 
      status: error.response?.status || 0,
      data: error.response?.data || null
    };
  }
}

// 測試類別1：外送員API測試
async function testDriverAPI() {
  console.log('\n=== 測試外送員API ===');
  
  let driverSession = {};
  
  // 1.1 測試外送員登入
  const loginResult = await makeRequest('POST', '/api/driver/login', TEST_DATA.driver);
  
  if (loginResult.success && loginResult.data.success) {
    logTestResult('Driver API', '外送員登入', 'PASS', { 
      response: loginResult.data 
    });
    
    // 保存session cookie（模擬）
    driverSession.authenticated = true;
  } else {
    logTestResult('Driver API', '外送員登入', 'FAIL', { 
      error: loginResult.error || loginResult.data?.error 
    });
    return; // 如果登入失敗，後續測試無法進行
  }
  
  // 1.2 測試獲取可接訂單
  const availableOrdersResult = await makeRequest('GET', '/api/driver/available-orders');
  logTestResult('Driver API', '獲取可接訂單', 
    availableOrdersResult.success ? 'PASS' : 'FAIL',
    { response: availableOrdersResult }
  );
  
  // 1.3 測試獲取外送員個人資料
  const profileResult = await makeRequest('GET', '/api/driver/profile');
  logTestResult('Driver API', '獲取個人資料', 
    profileResult.success ? 'PASS' : 'FAIL',
    { response: profileResult }
  );
  
  // 1.4 測試更新位置（GPS追蹤）
  const locationData = {
    lat: 24.9347,
    lng: 121.5681,
    accuracy: 10,
    speed: 25,
    heading: 45,
    timestamp: new Date().getTime()
  };
  
  const updateLocationResult = await makeRequest('POST', '/api/driver/update-location', locationData);
  logTestResult('Driver API', '更新GPS位置', 
    updateLocationResult.success ? 'PASS' : 'FAIL',
    { response: updateLocationResult }
  );
  
  // 1.5 測試獲取位置歷史
  const locationHistoryResult = await makeRequest('GET', '/api/driver/location-history?limit=10&hours=24');
  logTestResult('Driver API', '獲取位置歷史', 
    locationHistoryResult.success ? 'PASS' : 'FAIL',
    { response: locationHistoryResult }
  );
  
  // 1.6 測試今日統計
  const todayStatsResult = await makeRequest('GET', '/api/driver/today-stats');
  logTestResult('Driver API', '獲取今日統計', 
    todayStatsResult.success ? 'PASS' : 'FAIL',
    { response: todayStatsResult }
  );
  
  // 1.7 測試權限控制 - 嘗試存取非授權訂單
  const unauthorizedOrderResult = await makeRequest('POST', '/api/driver/accept-order/99999');
  logTestResult('Driver API', '權限控制測試', 
    !unauthorizedOrderResult.success || unauthorizedOrderResult.data?.error ? 'PASS' : 'FAIL',
    { 
      description: '應該拒絕存取非授權訂單',
      response: unauthorizedOrderResult 
    }
  );
}

// 測試類別2：客戶API測試
async function testCustomerAPI() {
  console.log('\n=== 測試客戶API ===');
  
  // 2.1 測試獲取訂單狀態（需要有效訂單ID和電話）
  const orderStatusResult = await makeRequest('GET', '/api/customer/orders/1/status?phone=0912345678');
  logTestResult('Customer API', '獲取訂單狀態', 
    orderStatusResult.success ? 'PASS' : 'FAIL',
    { response: orderStatusResult }
  );
  
  // 2.2 測試獲取外送員位置
  const driverLocationResult = await makeRequest('GET', '/api/customer/orders/1/driver-location?phone=0912345678');
  logTestResult('Customer API', '獲取外送員位置', 
    driverLocationResult.success ? 'PASS' : 'FAIL',
    { response: driverLocationResult }
  );
  
  // 2.3 測試計算預計送達時間
  const etaResult = await makeRequest('GET', '/api/customer/orders/1/eta?phone=0912345678');
  logTestResult('Customer API', '計算預計送達時間', 
    etaResult.success ? 'PASS' : 'FAIL',
    { response: etaResult }
  );
  
  // 2.4 測試獲取訂單時間軸
  const timelineResult = await makeRequest('GET', '/api/customer/orders/1/timeline?phone=0912345678');
  logTestResult('Customer API', '獲取訂單時間軸', 
    timelineResult.success ? 'PASS' : 'FAIL',
    { response: timelineResult }
  );
  
  // 2.5 測試輸入驗證 - 無效的訂單ID
  const invalidOrderResult = await makeRequest('GET', '/api/customer/orders/invalid/status?phone=0912345678');
  logTestResult('Customer API', '輸入驗證測試', 
    !invalidOrderResult.success || invalidOrderResult.status >= 400 ? 'PASS' : 'FAIL',
    { 
      description: '應該拒絕無效的訂單ID',
      response: invalidOrderResult 
    }
  );
  
  // 2.6 測試權限控制 - 錯誤的電話號碼
  const wrongPhoneResult = await makeRequest('GET', '/api/customer/orders/1/status?phone=0000000000');
  logTestResult('Customer API', '權限控制測試', 
    !wrongPhoneResult.success || wrongPhoneResult.status >= 400 ? 'PASS' : 'FAIL',
    { 
      description: '應該拒絕錯誤的電話號碼',
      response: wrongPhoneResult 
    }
  );
}

// 測試類別3：Google Maps API測試
async function testGoogleMapsAPI() {
  console.log('\n=== 測試Google Maps API ===');
  
  // 3.1 測試單個地址地理編碼
  const geocodeResult = await makeRequest('POST', '/api/maps/geocode', {
    address: TEST_DATA.testAddresses[0]
  });
  logTestResult('Google Maps API', '單個地址地理編碼', 
    geocodeResult.success ? 'PASS' : 'FAIL',
    { response: geocodeResult }
  );
  
  // 3.2 測試獲取訂單地圖數據
  const mapDataResult = await makeRequest('GET', '/api/maps/orders-map-data?status=all&limit=10');
  logTestResult('Google Maps API', '獲取訂單地圖數據', 
    mapDataResult.success ? 'PASS' : 'FAIL',
    { response: mapDataResult }
  );
  
  // 3.3 測試快取統計
  const cacheStatsResult = await makeRequest('GET', '/api/maps/cache-stats');
  logTestResult('Google Maps API', '獲取快取統計', 
    cacheStatsResult.success ? 'PASS' : 'FAIL',
    { response: cacheStatsResult }
  );
  
  // 3.4 測試距離矩陣計算
  const distanceMatrixResult = await makeRequest('POST', '/api/maps/distance-matrix', {
    origins: [{ lat: 24.9347, lng: 121.5681 }],
    destinations: [{ lat: 25.0330, lng: 121.5654 }]
  });
  logTestResult('Google Maps API', '距離矩陣計算', 
    distanceMatrixResult.success ? 'PASS' : 'FAIL',
    { response: distanceMatrixResult }
  );
  
  // 3.5 測試輸入驗證
  const invalidGeocodeResult = await makeRequest('POST', '/api/maps/geocode', {});
  logTestResult('Google Maps API', '輸入驗證測試', 
    !invalidGeocodeResult.success || invalidGeocodeResult.status >= 400 ? 'PASS' : 'FAIL',
    { 
      description: '應該拒絕空的地址參數',
      response: invalidGeocodeResult 
    }
  );
  
  // 3.6 測試API使用效率（批量處理）
  const batchGeocodeResult = await makeRequest('POST', '/api/maps/batch-geocode', {
    orderIds: [1, 2, 3]
  });
  logTestResult('Google Maps API', '批量地理編碼效率', 
    batchGeocodeResult.success ? 'PASS' : 'FAIL',
    { response: batchGeocodeResult }
  );
}

// 測試類別4：WebSocket連接測試
async function testWebSocketAPI() {
  console.log('\n=== 測試WebSocket連接 ===');
  
  return new Promise((resolve) => {
    let wsTestPassed = false;
    let connectionEstablished = false;
    let messageReceived = false;
    
    const ws = new WebSocket(`${WS_URL}/websocket`);
    const timeout = setTimeout(() => {
      if (!wsTestPassed) {
        logTestResult('WebSocket API', '連接測試', 'FAIL', {
          error: '連接超時',
          connectionEstablished,
          messageReceived
        });
      }
      ws.close();
      resolve();
    }, 10000);
    
    ws.on('open', () => {
      connectionEstablished = true;
      logTestResult('WebSocket API', 'WebSocket連接建立', 'PASS', {
        description: 'WebSocket連接成功建立'
      });
      
      // 測試發送認證訊息
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
        messageReceived = true;
        
        logTestResult('WebSocket API', '訊息接收', 'PASS', {
          description: '成功接收WebSocket訊息',
          message
        });
        
        // 測試即時位置更新
        if (message.type === 'auth_success') {
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
        
        if (message.type === 'location_update_success') {
          wsTestPassed = true;
          logTestResult('WebSocket API', '即時位置更新', 'PASS', {
            description: '即時位置更新功能正常'
          });
        }
      } catch (error) {
        logTestResult('WebSocket API', '訊息解析', 'FAIL', {
          error: error.message
        });
      }
    });
    
    ws.on('error', (error) => {
      logTestResult('WebSocket API', 'WebSocket錯誤', 'FAIL', {
        error: error.message
      });
      clearTimeout(timeout);
      resolve();
    });
    
    ws.on('close', () => {
      logTestResult('WebSocket API', 'WebSocket斷線', 'INFO', {
        description: 'WebSocket連接已關閉'
      });
      clearTimeout(timeout);
      resolve();
    });
  });
}

// 測試類別5：安全性測試
async function testSecurity() {
  console.log('\n=== 測試安全性 ===');
  
  // 5.1 測試SQL注入防護
  const sqlInjectionTest = await makeRequest('GET', '/api/customer/orders/1\' OR 1=1--/status?phone=0912345678');
  logTestResult('Security', 'SQL注入防護', 
    !sqlInjectionTest.success || sqlInjectionTest.status >= 400 ? 'PASS' : 'FAIL',
    { 
      description: '應該阻擋SQL注入嘗試',
      response: sqlInjectionTest 
    }
  );
  
  // 5.2 測試XSS防護
  const xssTest = await makeRequest('POST', '/api/maps/geocode', {
    address: '<script>alert("XSS")</script>台北市'
  });
  logTestResult('Security', 'XSS防護', 
    xssTest.success && !xssTest.data?.data?.formatted_address?.includes('<script>') ? 'PASS' : 'FAIL',
    { 
      description: '應該過濾XSS攻擊腳本',
      response: xssTest 
    }
  );
  
  // 5.3 測試速率限制
  const rateLimitPromises = [];
  for (let i = 0; i < 20; i++) {
    rateLimitPromises.push(makeRequest('GET', '/api/driver/profile'));
  }
  
  const rateLimitResults = await Promise.all(rateLimitPromises);
  const blockedRequests = rateLimitResults.filter(result => result.status === 429).length;
  
  logTestResult('Security', '速率限制', 
    blockedRequests > 0 ? 'PASS' : 'FAIL',
    { 
      description: '應該限制過度頻繁的請求',
      totalRequests: 20,
      blockedRequests 
    }
  );
  
  // 5.4 測試CSRF防護
  const csrfTest = await makeRequest('POST', '/api/driver/login', TEST_DATA.driver, {
    'Origin': 'http://malicious-site.com'
  });
  logTestResult('Security', 'CSRF防護', 
    !csrfTest.success || csrfTest.status >= 400 ? 'PASS' : 'FAIL',
    { 
      description: '應該阻擋來自惡意網站的請求',
      response: csrfTest 
    }
  );
  
  // 5.5 測試權限邊界
  const unauthorizedAdminAccess = await makeRequest('GET', '/api/maps/cache-stats');
  logTestResult('Security', '管理員權限控制', 
    !unauthorizedAdminAccess.success || unauthorizedAdminAccess.status === 401 ? 'PASS' : 'FAIL',
    { 
      description: '非管理員不應能存取管理功能',
      response: unauthorizedAdminAccess 
    }
  );
}

// 測試類別6：性能測試
async function testPerformance() {
  console.log('\n=== 測試性能 ===');
  
  // 6.1 測試API響應時間
  const startTime = Date.now();
  const performanceTest = await makeRequest('GET', '/api/driver/available-orders');
  const responseTime = Date.now() - startTime;
  
  logTestResult('Performance', 'API響應時間', 
    responseTime < 2000 ? 'PASS' : 'FAIL',
    { 
      responseTime: `${responseTime}ms`,
      threshold: '2000ms'
    }
  );
  
  // 6.2 測試並發請求處理
  const concurrentPromises = [];
  const concurrentStartTime = Date.now();
  
  for (let i = 0; i < 10; i++) {
    concurrentPromises.push(makeRequest('GET', '/api/maps/orders-map-data?limit=5'));
  }
  
  const concurrentResults = await Promise.all(concurrentPromises);
  const concurrentTime = Date.now() - concurrentStartTime;
  const successfulConcurrent = concurrentResults.filter(r => r.success).length;
  
  logTestResult('Performance', '並發請求處理', 
    successfulConcurrent >= 8 && concurrentTime < 10000 ? 'PASS' : 'FAIL',
    { 
      totalRequests: 10,
      successfulRequests: successfulConcurrent,
      totalTime: `${concurrentTime}ms`
    }
  );
  
  // 6.3 測試大數據處理
  const bigDataTest = await makeRequest('GET', '/api/driver/location-history?limit=1000&hours=168');
  logTestResult('Performance', '大數據處理', 
    bigDataTest.success ? 'PASS' : 'FAIL',
    { 
      description: '處理大量位置歷史數據',
      response: bigDataTest 
    }
  );
}

// 生成測試報告
function generateReport() {
  console.log('\n=== 生成測試報告 ===');
  
  const summary = {
    totalTests: TEST_RESULTS.length,
    passedTests: TEST_RESULTS.filter(r => r.status === 'PASS').length,
    failedTests: TEST_RESULTS.filter(r => r.status === 'FAIL').length,
    infoTests: TEST_RESULTS.filter(r => r.status === 'INFO').length,
    categories: {}
  };
  
  // 按類別統計
  TEST_RESULTS.forEach(result => {
    if (!summary.categories[result.category]) {
      summary.categories[result.category] = {
        total: 0,
        passed: 0,
        failed: 0,
        info: 0
      };
    }
    
    summary.categories[result.category].total++;
    if (result.status === 'PASS') summary.categories[result.category].passed++;
    if (result.status === 'FAIL') summary.categories[result.category].failed++;
    if (result.status === 'INFO') summary.categories[result.category].info++;
  });
  
  const report = {
    testDateTime: new Date().toISOString(),
    summary,
    detailedResults: TEST_RESULTS
  };
  
  // 儲存報告到檔案
  fs.writeFileSync('api_test_report.json', JSON.stringify(report, null, 2));
  
  // 輸出摘要
  console.log('\n📊 測試摘要：');
  console.log(`總測試數: ${summary.totalTests}`);
  console.log(`通過: ${summary.passedTests}`);
  console.log(`失敗: ${summary.failedTests}`);
  console.log(`資訊: ${summary.infoTests}`);
  console.log(`通過率: ${((summary.passedTests / summary.totalTests) * 100).toFixed(1)}%`);
  
  console.log('\n📋 各類別結果：');
  Object.keys(summary.categories).forEach(category => {
    const cat = summary.categories[category];
    console.log(`${category}: ${cat.passed}/${cat.total} 通過 (${((cat.passed / cat.total) * 100).toFixed(1)}%)`);
  });
  
  console.log(`\n📄 詳細報告已儲存至: api_test_report.json`);
}

// 主測試函數
async function runAllTests() {
  console.log('🚀 開始蔬果外送系統API全面測試');
  console.log(`測試目標: ${BASE_URL}`);
  console.log(`開始時間: ${new Date().toISOString()}`);
  
  try {
    // 測試伺服器是否可達
    const healthCheck = await makeRequest('GET', '/');
    if (!healthCheck.success) {
      console.error('❌ 伺服器無法連接，測試終止');
      return;
    }
    
    logTestResult('System', '伺服器連接', 'PASS', {
      description: '伺服器正常運行'
    });
    
    // 依序執行所有測試類別
    await testDriverAPI();
    await testCustomerAPI();
    await testGoogleMapsAPI();
    await testWebSocketAPI();
    await testSecurity();
    await testPerformance();
    
  } catch (error) {
    console.error('💥 測試過程中發生錯誤:', error.message);
    logTestResult('System', '測試執行', 'FAIL', {
      error: error.message
    });
  } finally {
    generateReport();
    console.log('\n✅ 測試完成');
  }
}

// 如果直接執行此腳本，則運行測試
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  runAllTests,
  testDriverAPI,
  testCustomerAPI,
  testGoogleMapsAPI,
  testWebSocketAPI,
  testSecurity,
  testPerformance
};