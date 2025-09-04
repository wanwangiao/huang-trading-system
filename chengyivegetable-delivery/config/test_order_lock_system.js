/**
 * 外送員訂單鎖定系統測試腳本
 * 測試30秒鎖定機制和API端點
 */

const http = require('http');
const querystring = require('querystring');

class OrderLockSystemTester {
    constructor(baseUrl = 'http://localhost:3003') {
        this.baseUrl = baseUrl;
        this.testResults = [];
        this.sessionCookie = null;
    }

    // HTTP請求輔助函數
    async makeRequest(method, path, data = null) {
        return new Promise((resolve, reject) => {
            const url = new URL(path, this.baseUrl);
            const options = {
                hostname: url.hostname,
                port: url.port || 3003,
                path: url.pathname + url.search,
                method: method.toUpperCase(),
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'OrderLockSystemTester/1.0'
                }
            };

            // 添加session cookie
            if (this.sessionCookie) {
                options.headers['Cookie'] = this.sessionCookie;
            }

            const req = http.request(options, (res) => {
                let body = '';
                res.on('data', (chunk) => {
                    body += chunk;
                });
                res.on('end', () => {
                    // 保存session cookie
                    if (res.headers['set-cookie']) {
                        this.sessionCookie = res.headers['set-cookie']
                            .map(cookie => cookie.split(';')[0])
                            .join('; ');
                    }
                    
                    try {
                        const jsonBody = JSON.parse(body);
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: jsonBody
                        });
                    } catch (e) {
                        resolve({
                            statusCode: res.statusCode,
                            headers: res.headers,
                            body: body
                        });
                    }
                });
            });

            req.on('error', (err) => {
                reject(err);
            });

            if (data && (method.toUpperCase() === 'POST' || method.toUpperCase() === 'PUT')) {
                const jsonData = JSON.stringify(data);
                req.write(jsonData);
            }

            req.end();
        });
    }

    // 記錄測試結果
    logResult(testName, passed, details) {
        const result = {
            test: testName,
            status: passed ? 'PASS' : 'FAIL',
            details: details,
            timestamp: new Date().toISOString()
        };
        this.testResults.push(result);
        
        const statusIcon = passed ? '✅' : '❌';
        console.log(`${statusIcon} ${testName}: ${details}`);
    }

    // 測試1: 訂單池載入功能
    async testUnifiedOrderPool() {
        console.log('\n🧪 測試1: 統一訂單池載入...');
        
        try {
            // 測試各地區訂單數量API
            const countsResponse = await this.makeRequest('GET', '/api/driver/order-counts');
            
            if (countsResponse.statusCode === 200 && countsResponse.body.success) {
                const areas = ['三峽區', '樹林區', '鶯歌區', '土城區', '北大特區'];
                const hasAllAreas = areas.every(area => 
                    countsResponse.body.counts.hasOwnProperty(area)
                );
                
                if (hasAllAreas) {
                    this.logResult('訂單數量API', true, 
                        `5個地區訂單數量: ${JSON.stringify(countsResponse.body.counts)}`);
                } else {
                    this.logResult('訂單數量API', false, '缺少部分地區數據');
                }
            } else {
                this.logResult('訂單數量API', false, 
                    `響應失敗: ${countsResponse.statusCode}`);
            }

            // 測試三峽區訂單載入
            const areaResponse = await this.makeRequest('GET', '/api/driver/area-orders/三峽區');
            
            if (areaResponse.statusCode === 200 && areaResponse.body.orders) {
                this.logResult('地區訂單API', true, 
                    `三峽區載入 ${areaResponse.body.orders.length} 筆訂單`);
            } else {
                this.logResult('地區訂單API', false, 
                    `載入失敗: ${areaResponse.statusCode}`);
            }

        } catch (error) {
            this.logResult('統一訂單池', false, `錯誤: ${error.message}`);
        }
    }

    // 測試2: 訂單鎖定功能
    async testOrderLocking() {
        console.log('\n🧪 測試2: 訂單鎖定機制...');
        
        try {
            // 先獲取一些測試訂單ID
            const areaResponse = await this.makeRequest('GET', '/api/driver/area-orders/三峽區');
            
            if (areaResponse.body.orders && areaResponse.body.orders.length > 0) {
                const testOrderIds = areaResponse.body.orders
                    .slice(0, 2)
                    .map(order => order.id);

                // 測試訂單鎖定
                const lockData = {
                    orderIds: testOrderIds,
                    lockDuration: 30
                };
                
                const lockResponse = await this.makeRequest('POST', '/api/driver/lock-orders', lockData);
                
                if (lockResponse.statusCode === 200 && lockResponse.body.success) {
                    this.logResult('訂單鎖定', true, 
                        `成功鎖定訂單 ${testOrderIds.join(', ')} 共30秒`);
                    
                    // 測試鎖定狀態檢查
                    const checkResponse = await this.makeRequest('GET', '/api/driver/check-locks');
                    
                    if (checkResponse.statusCode === 200) {
                        this.logResult('鎖定狀態檢查', true, 
                            `鎖定數量: ${checkResponse.body.lockCount}`);
                    } else {
                        this.logResult('鎖定狀態檢查', false, '檢查失敗');
                    }

                    // 等待2秒後測試解鎖
                    console.log('⏱️ 等待2秒後測試解鎖...');
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    
                    const unlockResponse = await this.makeRequest('POST', '/api/driver/unlock-orders', 
                        { orderIds: testOrderIds });
                    
                    if (unlockResponse.statusCode === 200 && unlockResponse.body.success) {
                        this.logResult('訂單解鎖', true, 
                            `成功解鎖 ${testOrderIds.length} 筆訂單`);
                    } else {
                        this.logResult('訂單解鎖', false, '解鎖失敗');
                    }
                } else {
                    this.logResult('訂單鎖定', false, 
                        `鎖定失敗: ${lockResponse.body?.message || '未知錯誤'}`);
                }
            } else {
                this.logResult('訂單鎖定', false, '無可測試的訂單');
            }

        } catch (error) {
            this.logResult('訂單鎖定測試', false, `錯誤: ${error.message}`);
        }
    }

    // 測試3: 批量接取和路線優化
    async testBatchAcceptAndOptimize() {
        console.log('\n🧪 測試3: 批量接取與路線優化...');
        
        try {
            // 獲取測試訂單
            const areaResponse = await this.makeRequest('GET', '/api/driver/area-orders/三峽區');
            
            if (areaResponse.body.orders && areaResponse.body.orders.length >= 2) {
                const testOrderIds = areaResponse.body.orders
                    .slice(0, 3)
                    .map(order => order.id);

                // 先鎖定訂單
                const lockResponse = await this.makeRequest('POST', '/api/driver/lock-orders', {
                    orderIds: testOrderIds,
                    lockDuration: 30
                });
                
                if (lockResponse.body.success) {
                    // 測試批量接取
                    const acceptResponse = await this.makeRequest('POST', '/api/driver/batch-accept-orders', {
                        orderIds: testOrderIds
                    });
                    
                    if (acceptResponse.statusCode === 200 && acceptResponse.body.success) {
                        this.logResult('批量接取訂單', true, 
                            `成功接取 ${testOrderIds.length} 筆訂單`);
                        
                        // 測試路線優化
                        const optimizeResponse = await this.makeRequest('POST', '/api/driver/optimize-route', {
                            orderIds: testOrderIds
                        });
                        
                        if (optimizeResponse.statusCode === 200 && optimizeResponse.body.success) {
                            this.logResult('路線優化', true, 
                                `優化完成，預計節省 ${optimizeResponse.body.timeSaved || 0} 分鐘`);
                        } else {
                            this.logResult('路線優化', false, '優化失敗');
                        }
                        
                        // 測試我的訂單列表
                        const myOrdersResponse = await this.makeRequest('GET', '/api/driver/my-orders');
                        
                        if (myOrdersResponse.statusCode === 200 && myOrdersResponse.body.orders) {
                            this.logResult('我的訂單列表', true, 
                                `載入 ${myOrdersResponse.body.orders.length} 筆配送中訂單`);
                        } else {
                            this.logResult('我的訂單列表', false, '載入失敗');
                        }
                    } else {
                        this.logResult('批量接取訂單', false, '接取失敗');
                    }
                } else {
                    this.logResult('預先鎖定', false, '鎖定失敗，無法測試後續步驟');
                }
            } else {
                this.logResult('批量接取測試', false, '訂單數量不足（需要至少2筆）');
            }

        } catch (error) {
            this.logResult('批量接取測試', false, `錯誤: ${error.message}`);
        }
    }

    // 測試4: 30秒自動解鎖機制（模擬）
    async testAutoUnlockSimulation() {
        console.log('\n🧪 測試4: 30秒自動解鎖機制（快速模擬）...');
        
        try {
            // 獲取測試訂單
            const areaResponse = await this.makeRequest('GET', '/api/driver/area-orders/三峽區');
            
            if (areaResponse.body.orders && areaResponse.body.orders.length > 0) {
                const testOrderId = areaResponse.body.orders[0].id;

                // 鎖定訂單（設定較短時間進行快速測試）
                const lockResponse = await this.makeRequest('POST', '/api/driver/lock-orders', {
                    orderIds: [testOrderId],
                    lockDuration: 3  // 3秒測試
                });
                
                if (lockResponse.body.success) {
                    this.logResult('短期鎖定', true, '成功設定3秒鎖定用於測試');
                    
                    // 等待4秒讓鎖定過期
                    console.log('⏱️ 等待4秒讓鎖定自然過期...');
                    await new Promise(resolve => setTimeout(resolve, 4000));
                    
                    // 檢查鎖定狀態（應該自動清除）
                    const checkResponse = await this.makeRequest('GET', '/api/driver/check-locks');
                    
                    if (checkResponse.statusCode === 200) {
                        if (checkResponse.body.lockCount === 0) {
                            this.logResult('自動解鎖機制', true, '過期鎖定已自動清除');
                        } else {
                            this.logResult('自動解鎖機制', false, 
                                `仍有 ${checkResponse.body.lockCount} 筆鎖定未清除`);
                        }
                    } else {
                        this.logResult('自動解鎖檢查', false, '檢查失敗');
                    }
                } else {
                    this.logResult('短期鎖定', false, '設定失敗');
                }
            } else {
                this.logResult('自動解鎖測試', false, '無可測試的訂單');
            }

        } catch (error) {
            this.logResult('自動解鎖測試', false, `錯誤: ${error.message}`);
        }
    }

    // 測試5: 外送員統計
    async testDriverStats() {
        console.log('\n🧪 測試5: 外送員統計數據...');
        
        try {
            const statsResponse = await this.makeRequest('GET', '/api/driver/stats');
            
            if (statsResponse.statusCode === 200) {
                const stats = statsResponse.body;
                const expectedFields = ['todayCompleted', 'todayEarnings', 'totalOrders', 'avgDeliveryTime'];
                const hasAllFields = expectedFields.every(field => 
                    stats.hasOwnProperty(field) || stats.hasOwnProperty(field.replace('avg', '').toLowerCase())
                );
                
                if (hasAllFields) {
                    this.logResult('外送員統計', true, 
                        `統計數據完整: 今日${stats.todayCompleted || 0}筆, 收入$${stats.todayEarnings || 0}`);
                } else {
                    this.logResult('外送員統計', false, '統計數據欄位不完整');
                }
            } else {
                this.logResult('外送員統計', false, `API響應失敗: ${statsResponse.statusCode}`);
            }

        } catch (error) {
            this.logResult('外送員統計', false, `錯誤: ${error.message}`);
        }
    }

    // 執行完整測試套件
    async runCompleteTest() {
        console.log('🚀 啟動外送員訂單鎖定系統完整測試...\n');
        console.log(`📡 測試目標: ${this.baseUrl}`);
        console.log(`🕐 測試開始時間: ${new Date().toLocaleString('zh-TW')}\n`);

        // 執行所有測試
        await this.testUnifiedOrderPool();
        await this.testOrderLocking();
        await this.testBatchAcceptAndOptimize();
        await this.testAutoUnlockSimulation();
        await this.testDriverStats();

        // 生成測試報告
        this.generateTestReport();
    }

    // 生成測試報告
    generateTestReport() {
        console.log('\n📋 ===== 外送員訂單鎖定系統測試報告 =====\n');
        
        const passed = this.testResults.filter(r => r.status === 'PASS').length;
        const failed = this.testResults.filter(r => r.status === 'FAIL').length;
        const total = this.testResults.length;
        
        console.log(`📊 測試概況:`);
        console.log(`   總測試數: ${total}`);
        console.log(`   ✅ 通過: ${passed}`);
        console.log(`   ❌ 失敗: ${failed}`);
        console.log(`   🎯 成功率: ${((passed / total) * 100).toFixed(1)}%\n`);

        console.log(`📝 詳細結果:`);
        this.testResults.forEach((result, index) => {
            const icon = result.status === 'PASS' ? '✅' : '❌';
            console.log(`   ${index + 1}. ${icon} ${result.test}`);
            console.log(`      ${result.details}\n`);
        });

        // 評估系統狀態
        const successRate = (passed / total) * 100;
        let systemStatus = '';
        
        if (successRate >= 90) {
            systemStatus = '🟢 系統狀態優秀 - 訂單鎖定系統運作正常';
        } else if (successRate >= 70) {
            systemStatus = '🟡 系統狀態良好 - 大部分功能正常，建議檢查失敗項目';
        } else {
            systemStatus = '🔴 系統需要修復 - 多項核心功能異常';
        }

        console.log(`🏁 ${systemStatus}`);
        console.log(`🕐 測試完成時間: ${new Date().toLocaleString('zh-TW')}\n`);

        // 核心功能檢查表
        console.log(`🔧 核心功能檢查表:`);
        const coreFeatures = [
            '統一訂單池載入',
            '跨區域訂單顯示',
            '30秒訂單鎖定機制',
            '訂單解鎖功能', 
            '批量接取訂單',
            '路線優化整合',
            '外送員統計數據'
        ];
        
        coreFeatures.forEach(feature => {
            const hasRelatedTest = this.testResults.some(r => 
                r.test.includes(feature) || r.details.includes(feature)
            );
            const status = hasRelatedTest ? '✅' : '⚠️';
            console.log(`   ${status} ${feature}`);
        });

        console.log(`\n💡 建議: 如果測試失敗，請檢查server.js是否運行在port 3003`);
        console.log(`🌐 前端界面: http://localhost:3003/driver/dashboard`);
    }
}

// 執行測試
if (require.main === module) {
    const tester = new OrderLockSystemTester();
    tester.runCompleteTest().catch(error => {
        console.error('❌ 測試執行失敗:', error);
        process.exit(1);
    });
}

module.exports = OrderLockSystemTester;