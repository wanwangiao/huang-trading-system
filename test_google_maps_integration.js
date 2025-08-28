// =====================================
// Google Maps 整合功能測試腳本
// 測試地理編碼、路線規劃、智能路線等功能
// =====================================

const GoogleMapsService = require('./src/services/GoogleMapsService');
const SmartRouteService = require('./src/services/SmartRouteService');

// 設定環境變數（測試用）
process.env.GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || 'your_test_api_key_here';

console.log('🧪 Google Maps 整合功能測試開始...\n');

async function testGoogleMapsService() {
  console.log('📍 測試 GoogleMapsService...');
  
  const googleMapsService = new GoogleMapsService();
  
  // 測試1: 單個地址地理編碼
  try {
    console.log('測試1: 地理編碼單個地址...');
    const address = '新北市三峽區中山路123號';
    const result = await googleMapsService.geocodeAddress(address);
    
    console.log(`✅ 地理編碼成功:`);
    console.log(`   地址: ${address}`);
    console.log(`   座標: ${result.lat}, ${result.lng}`);
    console.log(`   格式化地址: ${result.formatted_address}`);
    console.log('');
  } catch (error) {
    console.log(`❌ 地理編碼失敗: ${error.message}\n`);
  }

  // 測試2: 批量地理編碼
  try {
    console.log('測試2: 批量地理編碼...');
    const orders = [
      { id: 1, address: '台北市大安區忠孝東路四段1號' },
      { id: 2, address: '新北市板橋區文化路一段188號' },
      { id: 3, address: '桃園市桃園區中正路1號' }
    ];
    
    const batchResults = await googleMapsService.batchGeocode(orders);
    console.log(`✅ 批量地理編碼完成，處理 ${batchResults.length} 個地址:`);
    
    batchResults.forEach(result => {
      if (result.success) {
        console.log(`   訂單 ${result.orderId}: ${result.lat}, ${result.lng}`);
      } else {
        console.log(`   訂單 ${result.orderId}: 失敗 - ${result.error}`);
      }
    });
    console.log('');
  } catch (error) {
    console.log(`❌ 批量地理編碼失敗: ${error.message}\n`);
  }

  // 測試3: 路線規劃
  try {
    console.log('測試3: 路線規劃...');
    const origin = { lat: 25.0330, lng: 121.5654 }; // 台北車站
    const destination = { lat: 24.9347, lng: 121.3681 }; // 三峽
    const waypoints = [
      { lat: 25.0173, lng: 121.4467 }, // 板橋
      { lat: 24.9939, lng: 121.4208 }  // 樹林
    ];
    
    const routeResult = await googleMapsService.planRoute(origin, destination, waypoints);
    
    if (routeResult.success) {
      console.log(`✅ 路線規劃成功:`);
      console.log(`   總距離: ${routeResult.totalDistance} km`);
      console.log(`   總時間: ${routeResult.totalDuration} 分鐘`);
      console.log(`   途徑點數: ${waypoints.length}`);
    } else {
      console.log(`❌ 路線規劃失敗: ${routeResult.error}`);
    }
    console.log('');
  } catch (error) {
    console.log(`❌ 路線規劃測試失敗: ${error.message}\n`);
  }

  // 測試4: 距離矩陣計算
  try {
    console.log('測試4: 距離矩陣計算...');
    const origins = [
      { lat: 25.0330, lng: 121.5654 }, // 台北車站
      { lat: 25.0173, lng: 121.4467 }  // 板橋
    ];
    const destinations = [
      { lat: 24.9347, lng: 121.3681 }, // 三峽
      { lat: 24.9939, lng: 121.4208 }  // 樹林
    ];
    
    const distanceMatrix = await googleMapsService.getDistanceMatrix(origins, destinations);
    console.log(`✅ 距離矩陣計算完成:`);
    console.log(`   矩陣大小: ${origins.length}x${destinations.length}`);
    console.log(`   狀態: ${distanceMatrix.status}`);
    console.log('');
  } catch (error) {
    console.log(`❌ 距離矩陣計算失敗: ${error.message}\n`);
  }
}

async function testSmartRouteService() {
  console.log('🧠 測試 SmartRouteService...');
  
  const smartRouteService = new SmartRouteService();
  
  // 模擬訂單資料
  const mockOrders = [
    {
      id: 101,
      address: '台北市大安區忠孝東路四段1號',
      lat: 25.0418,
      lng: 121.5440,
      contact_name: '王小明',
      contact_phone: '0912345678',
      total_amount: 280,
      status: 'paid'
    },
    {
      id: 102,
      address: '新北市板橋區文化路一段188號',
      lat: 25.0173,
      lng: 121.4467,
      contact_name: '李小華',
      contact_phone: '0923456789',
      total_amount: 350,
      status: 'paid'
    },
    {
      id: 103,
      address: '新北市三峽區中山路123號',
      lat: 24.9347,
      lng: 121.3681,
      contact_name: '張小英',
      contact_phone: '0934567890',
      total_amount: 420,
      status: 'paid'
    }
  ];

  try {
    console.log('測試: 本地路線優化...');
    
    // 使用本地優化演算法
    const routePlan = await smartRouteService.planWithLocalOptimization(mockOrders, {
      algorithm: 'tsp_2opt',
      startPoint: null
    });
    
    console.log(`✅ 本地路線優化成功:`);
    console.log(`   總距離: ${routePlan.totalDistance} km`);
    console.log(`   總時間: ${routePlan.totalDuration} 分鐘`);
    console.log(`   優化方法: ${routePlan.method}`);
    console.log(`   改善程度: ${routePlan.improvementPercentage?.toFixed(2) || 'N/A'}%`);
    
    if (routePlan.sequence) {
      console.log('   配送順序:');
      routePlan.sequence.forEach(stop => {
        console.log(`     ${stop.sequence}. 訂單 ${stop.orderId} - ${stop.estimatedArrival?.toLocaleTimeString('zh-TW') || 'N/A'}`);
      });
    }
    console.log('');
    
  } catch (error) {
    console.log(`❌ 本地路線優化失敗: ${error.message}\n`);
  }

  // 測試不同的優化演算法
  try {
    console.log('測試: 不同優化演算法比較...');
    
    const algorithms = ['nearest_neighbor', 'tsp_2opt', 'simulated_annealing'];
    const results = {};
    
    for (const algorithm of algorithms) {
      try {
        console.log(`  執行 ${algorithm}...`);
        const result = await smartRouteService.planWithLocalOptimization(mockOrders, {
          algorithm: algorithm
        });
        
        results[algorithm] = {
          totalDistance: result.totalDistance,
          totalDuration: result.totalDuration,
          improvementPercentage: result.improvementPercentage || 0
        };
        
        console.log(`    距離: ${result.totalDistance} km, 時間: ${result.totalDuration} min, 改善: ${(result.improvementPercentage || 0).toFixed(2)}%`);
      } catch (algoError) {
        console.log(`    ${algorithm} 失敗: ${algoError.message}`);
      }
    }
    
    // 找出最佳演算法
    const bestAlgorithm = Object.keys(results).reduce((best, current) => {
      return results[current].totalDistance < results[best].totalDistance ? current : best;
    }, Object.keys(results)[0]);
    
    if (bestAlgorithm) {
      console.log(`✅ 最佳演算法: ${bestAlgorithm} (距離: ${results[bestAlgorithm].totalDistance} km)`);
    }
    console.log('');
    
  } catch (error) {
    console.log(`❌ 演算法比較失敗: ${error.message}\n`);
  }
}

async function testIntegrationScenarios() {
  console.log('🔗 測試整合場景...');
  
  // 測試場景1: 完整的配送路線規劃流程
  try {
    console.log('場景1: 完整配送路線規劃流程...');
    
    const googleMapsService = new GoogleMapsService();
    const smartRouteService = new SmartRouteService();
    
    // 步驟1: 準備地址列表
    const addresses = [
      '台北市中正區重慶南路一段122號',
      '台北市大安區敦化南路二段63號',
      '台北市信義區市府路1號',
      '台北市松山區八德路四段692號'
    ];
    
    console.log('  步驟1: 批量地理編碼...');
    const orders = addresses.map((address, index) => ({
      id: index + 1,
      address: address
    }));
    
    const geocodingResults = await googleMapsService.batchGeocode(orders);
    const validOrders = geocodingResults
      .filter(result => result.success)
      .map(result => ({
        id: result.orderId,
        address: orders.find(o => o.id === result.orderId).address,
        lat: result.lat,
        lng: result.lng,
        contact_name: `客戶${result.orderId}`,
        contact_phone: `091234567${result.orderId}`,
        total_amount: 200 + result.orderId * 50,
        status: 'paid'
      }));
    
    console.log(`  地理編碼完成，${validOrders.length}/${orders.length} 個地址成功`);
    
    // 步驟2: 路線優化
    console.log('  步驟2: 執行路線優化...');
    const routePlan = await smartRouteService.planWithLocalOptimization(validOrders, {
      algorithm: 'tsp_2opt'
    });
    
    console.log(`  路線優化完成：距離 ${routePlan.totalDistance} km，時間 ${routePlan.totalDuration} min`);
    
    // 步驟3: 生成詳細計劃
    console.log('  步驟3: 生成配送計劃...');
    const deliveryPlan = await smartRouteService.generateDeliveryPlan(routePlan, validOrders);
    
    console.log(`  配送計劃生成完成，計劃ID: ${deliveryPlan.id}`);
    console.log(`  預估開始時間: ${deliveryPlan.summary.estimatedStartTime?.toLocaleTimeString('zh-TW') || 'N/A'}`);
    console.log(`  預估結束時間: ${deliveryPlan.summary.estimatedEndTime?.toLocaleTimeString('zh-TW') || 'N/A'}`);
    console.log(`  總價值: $${deliveryPlan.summary.totalValue || 0}`);
    
    console.log('✅ 完整流程測試成功\n');
    
  } catch (error) {
    console.log(`❌ 完整流程測試失敗: ${error.message}\n`);
  }

  // 測試場景2: 錯誤處理
  try {
    console.log('場景2: 錯誤處理測試...');
    
    const googleMapsService = new GoogleMapsService();
    
    // 測試無效地址
    console.log('  測試無效地址處理...');
    const invalidAddress = '這是一個無效的地址123456789';
    const result = await googleMapsService.geocodeAddress(invalidAddress);
    
    if (!result.success) {
      console.log(`  ✅ 正確處理無效地址: ${result.error}`);
    } else {
      console.log(`  ⚠️ 無效地址居然成功了: ${result.formatted_address}`);
    }
    
    // 測試空訂單列表
    const smartRouteService = new SmartRouteService();
    try {
      await smartRouteService.planWithLocalOptimization([], {});
      console.log('  ❌ 空訂單列表應該要失敗');
    } catch (emptyError) {
      console.log('  ✅ 正確處理空訂單列表錯誤');
    }
    
    console.log('✅ 錯誤處理測試完成\n');
    
  } catch (error) {
    console.log(`❌ 錯誤處理測試失敗: ${error.message}\n`);
  }
}

async function runAllTests() {
  const startTime = Date.now();
  
  try {
    // 檢查API Key
    if (!process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_MAPS_API_KEY === 'your_test_api_key_here') {
      console.log('⚠️ Google Maps API Key 未設定，將使用模擬資料進行測試\n');
    }
    
    await testGoogleMapsService();
    await testSmartRouteService();
    await testIntegrationScenarios();
    
    const endTime = Date.now();
    const totalTime = endTime - startTime;
    
    console.log(`🎉 所有測試完成！總耗時: ${totalTime}ms (${(totalTime/1000).toFixed(2)}秒)`);
    
  } catch (error) {
    console.error('❌ 測試執行失敗:', error);
    process.exit(1);
  }
}

// 執行測試
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  testGoogleMapsService,
  testSmartRouteService,
  testIntegrationScenarios,
  runAllTests
};