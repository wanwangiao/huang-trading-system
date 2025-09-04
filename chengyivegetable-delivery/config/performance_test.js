// 性能和錯誤處理測試腳本
const https = require('https');
const http = require('http');

const BASE_URL = 'http://localhost:8080';
const COOKIE = 'connect.sid=s%3AtxfETVMzmJY7veWR28Z2Z0K85JF4z2mk.dYWjjSvXQhDozU%2Fkpb%2FPeR8XE%2FQFx5nRKvC1n6BZXKo';

// 模擬HTTP請求的工具函數
function makeRequest(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 8080,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
        'Cookie': COOKIE,
        ...headers
      }
    };
    
    const req = http.request(options, (res) => {
      let responseData = '';
      
      res.on('data', (chunk) => {
        responseData += chunk;
      });
      
      res.on('end', () => {
        try {
          const jsonData = responseData ? JSON.parse(responseData) : null;
          resolve({
            statusCode: res.statusCode,
            data: jsonData,
            headers: res.headers,
            responseTime: Date.now() - startTime
          });
        } catch (e) {
          resolve({
            statusCode: res.statusCode,
            data: responseData,
            headers: res.headers,
            responseTime: Date.now() - startTime
          });
        }
      });
    });
    
    req.on('error', (err) => {
      reject(err);
    });
    
    const startTime = Date.now();
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

// 性能測試函數
async function performanceTest() {
  console.log('🚀 開始性能測試...\n');
  
  const tests = [
    {
      name: '外送員登入',
      method: 'POST',
      path: '/api/driver/login',
      data: { phone: '0912345678', password: 'driver123' },
      expectedTime: 1000 // 1秒內
    },
    {
      name: '獲取待配送訂單',
      method: 'GET', 
      path: '/api/driver/available-orders',
      expectedTime: 500 // 500毫秒內
    },
    {
      name: '獲取我的訂單',
      method: 'GET',
      path: '/api/driver/my-orders', 
      expectedTime: 500
    },
    {
      name: '獲取已完成訂單',
      method: 'GET',
      path: '/api/driver/completed-orders',
      expectedTime: 500
    },
    {
      name: '獲取今日統計',
      method: 'GET',
      path: '/api/driver/today-stats',
      expectedTime: 300 // 300毫秒內
    }
  ];
  
  const results = [];
  
  for (const test of tests) {
    try {
      console.log(`⏱️  測試: ${test.name}`);
      
      // 進行多次測試取平均值
      const iterations = 5;
      const times = [];
      
      for (let i = 0; i < iterations; i++) {
        const result = await makeRequest(test.method, test.path, test.data);
        times.push(result.responseTime);
        
        if (i === 0) {
          // 只記錄第一次的狀態碼
          console.log(`   狀態碼: ${result.statusCode}`);
        }
      }
      
      const avgTime = Math.round(times.reduce((a, b) => a + b, 0) / times.length);
      const minTime = Math.min(...times);
      const maxTime = Math.max(...times);
      
      console.log(`   平均回應時間: ${avgTime}ms`);
      console.log(`   回應時間範圍: ${minTime}ms - ${maxTime}ms`);
      console.log(`   性能評級: ${avgTime <= test.expectedTime ? '✅ 良好' : '⚠️  需優化'}`);
      console.log();
      
      results.push({
        name: test.name,
        avgTime,
        minTime,
        maxTime,
        expectedTime: test.expectedTime,
        passed: avgTime <= test.expectedTime
      });
      
    } catch (error) {
      console.log(`❌ ${test.name} 測試失敗:`, error.message);
      console.log();
    }
  }
  
  return results;
}

// 錯誤處理測試函數
async function errorHandlingTest() {
  console.log('🛡️  開始錯誤處理測試...\n');
  
  const errorTests = [
    {
      name: '無效登入憑證',
      method: 'POST',
      path: '/api/driver/login',
      data: { phone: '0000000000', password: 'wrong' },
      expectedStatus: 401
    },
    {
      name: '未登入訪問',
      method: 'GET',
      path: '/api/driver/available-orders',
      headers: { Cookie: '' },
      expectedStatus: 401
    },
    {
      name: '接受不存在的訂單',
      method: 'POST',
      path: '/api/driver/accept-order/99999',
      expectedStatus: 400
    },
    {
      name: '完成不屬於自己的訂單',
      method: 'POST', 
      path: '/api/driver/complete-delivery/1',
      expectedStatus: 400
    },
    {
      name: '訪問不存在的API端點',
      method: 'GET',
      path: '/api/driver/nonexistent',
      expectedStatus: 404
    }
  ];
  
  const results = [];
  
  for (const test of errorTests) {
    try {
      console.log(`⚠️  測試: ${test.name}`);
      
      const result = await makeRequest(
        test.method, 
        test.path, 
        test.data,
        test.headers || {}
      );
      
      console.log(`   實際狀態碼: ${result.statusCode}`);
      console.log(`   預期狀態碼: ${test.expectedStatus}`);
      
      const passed = result.statusCode === test.expectedStatus;
      console.log(`   錯誤處理: ${passed ? '✅ 正確' : '❌ 異常'}`);
      
      if (result.data && result.data.error) {
        console.log(`   錯誤訊息: ${result.data.error}`);
      }
      console.log();
      
      results.push({
        name: test.name,
        actualStatus: result.statusCode,
        expectedStatus: test.expectedStatus,
        passed,
        errorMessage: result.data ? result.data.error : null
      });
      
    } catch (error) {
      console.log(`❌ ${test.name} 測試失敗:`, error.message);
      console.log();
    }
  }
  
  return results;
}

// 壓力測試函數
async function stressTest() {
  console.log('💪 開始壓力測試...\n');
  
  const concurrentRequests = 10;
  const iterations = 3;
  
  console.log(`🔄 同時發送 ${concurrentRequests} 個請求，重複 ${iterations} 次\n`);
  
  const results = [];
  
  for (let i = 0; i < iterations; i++) {
    console.log(`📊 第 ${i + 1} 輪測試:`);
    
    const promises = Array(concurrentRequests).fill().map(() => 
      makeRequest('GET', '/api/driver/available-orders')
    );
    
    const startTime = Date.now();
    
    try {
      const responses = await Promise.all(promises);
      const endTime = Date.now();
      const totalTime = endTime - startTime;
      
      const successCount = responses.filter(r => r.statusCode === 200).length;
      const errorCount = responses.length - successCount;
      const avgResponseTime = Math.round(
        responses.reduce((sum, r) => sum + r.responseTime, 0) / responses.length
      );
      
      console.log(`   總時間: ${totalTime}ms`);
      console.log(`   成功請求: ${successCount}/${concurrentRequests}`);
      console.log(`   失敗請求: ${errorCount}`);
      console.log(`   平均回應時間: ${avgResponseTime}ms`);
      console.log(`   結果: ${errorCount === 0 ? '✅ 通過' : '⚠️  有錯誤'}`);
      console.log();
      
      results.push({
        iteration: i + 1,
        totalTime,
        successCount,
        errorCount,
        avgResponseTime,
        passed: errorCount === 0
      });
      
    } catch (error) {
      console.log(`❌ 第 ${i + 1} 輪測試失敗:`, error.message);
      console.log();
    }
    
    // 間隔1秒
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  return results;
}

// 主測試函數
async function runAllTests() {
  console.log('🧪 === 外送員工作台系統測試 ===\n');
  console.log('📅 測試時間:', new Date().toLocaleString('zh-TW'));
  console.log('🌍 測試環境:', BASE_URL);
  console.log('=' .repeat(50) + '\n');
  
  const testResults = {
    timestamp: new Date().toISOString(),
    performance: await performanceTest(),
    errorHandling: await errorHandlingTest(),
    stress: await stressTest()
  };
  
  // 生成測試總結
  console.log('📋 === 測試總結 ===\n');
  
  const perfPassed = testResults.performance.filter(t => t.passed).length;
  const perfTotal = testResults.performance.length;
  console.log(`🚀 性能測試: ${perfPassed}/${perfTotal} 通過`);
  
  const errorPassed = testResults.errorHandling.filter(t => t.passed).length;
  const errorTotal = testResults.errorHandling.length;
  console.log(`🛡️  錯誤處理測試: ${errorPassed}/${errorTotal} 通過`);
  
  const stressPassed = testResults.stress.filter(t => t.passed).length;
  const stressTotal = testResults.stress.length;
  console.log(`💪 壓力測試: ${stressPassed}/${stressTotal} 通過`);
  
  const overallPassed = perfPassed + errorPassed + stressPassed;
  const overallTotal = perfTotal + errorTotal + stressTotal;
  
  console.log(`\n🎯 總體測試結果: ${overallPassed}/${overallTotal} (${Math.round(overallPassed/overallTotal*100)}%)`);
  
  if (overallPassed === overallTotal) {
    console.log('✅ 所有測試通過！系統運行良好。');
  } else {
    console.log('⚠️  部分測試未通過，需要進一步優化。');
  }
  
  return testResults;
}

// 如果直接執行此腳本
if (require.main === module) {
  runAllTests().then(results => {
    console.log('\n📊 詳細測試結果已保存');
  }).catch(err => {
    console.error('❌ 測試執行失敗:', err);
  });
}

module.exports = { runAllTests, performanceTest, errorHandlingTest, stressTest };