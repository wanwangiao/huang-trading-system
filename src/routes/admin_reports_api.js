const express = require('express');
const router = express.Router();

/**
 * 後台報表統計API
 * 提供營收分析、商品分析、客戶分析、配送分析等統計資料
 */

// 中介軟體：驗證管理員權限
function requireAdmin(req, res, next) {
    if (!req.session.isAdmin) {
        return res.status(403).json({ error: '需要管理員權限' });
    }
    next();
}

// 營收統計API
router.get('/revenue-stats', requireAdmin, async (req, res) => {
    try {
        const { timeRange = 30, compareWith = 'previous' } = req.query;
        const days = parseInt(timeRange);
        
        if (req.app.locals.demoMode) {
            return res.json({
                success: true,
                data: {
                    totalRevenue: 287650,
                    totalOrders: 1247,
                    avgOrderValue: 231,
                    profitMargin: 42.5,
                    revenueChange: 8.3,
                    ordersChange: 12.5,
                    avgOrderChange: -2.1,
                    profitChange: 1.2,
                    dailyRevenue: [
                        { date: '2025-01-14', revenue: 8500, orders: 35 },
                        { date: '2025-01-15', revenue: 9200, orders: 41 },
                        { date: '2025-01-16', revenue: 8800, orders: 38 },
                        { date: '2025-01-17', revenue: 10100, orders: 43 },
                        { date: '2025-01-18', revenue: 11200, orders: 47 },
                        { date: '2025-01-19', revenue: 13500, orders: 56 },
                        { date: '2025-01-20', revenue: 12800, orders: 52 }
                    ],
                    regionDistribution: [
                        { region: '三峽區', revenue: 98450, percentage: 34.2 },
                        { region: '北大特區', revenue: 86295, percentage: 30.0 },
                        { region: '樹林區', revenue: 57530, percentage: 20.0 },
                        { region: '鶯歌區', revenue: 28765, percentage: 10.0 },
                        { region: '土城區', revenue: 16675, percentage: 5.8 }
                    ]
                }
            });
        }
        
        // 計算時間範圍
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);
        
        // 獲取當前期間營收統計
        const currentStats = await getCurrentPeriodStats(req.app.locals.pool, startDate, endDate);
        
        // 獲取比較期間統計
        let compareStartDate, compareEndDate;
        if (compareWith === 'previous') {
            compareEndDate = new Date(startDate);
            compareStartDate = new Date(compareEndDate);
            compareStartDate.setDate(compareStartDate.getDate() - days);
        } else { // lastYear
            compareStartDate = new Date(startDate);
            compareEndDate = new Date(endDate);
            compareStartDate.setFullYear(compareStartDate.getFullYear() - 1);
            compareEndDate.setFullYear(compareEndDate.getFullYear() - 1);
        }
        
        const compareStats = await getCurrentPeriodStats(req.app.locals.pool, compareStartDate, compareEndDate);
        
        // 計算變化率
        const revenueChange = calculateChangeRate(currentStats.totalRevenue, compareStats.totalRevenue);
        const ordersChange = calculateChangeRate(currentStats.totalOrders, compareStats.totalOrders);
        const avgOrderChange = calculateChangeRate(currentStats.avgOrderValue, compareStats.avgOrderValue);
        
        // 獲取每日營收趨勢
        const dailyRevenue = await getDailyRevenueTrend(req.app.locals.pool, startDate, endDate);
        
        // 獲取地區分布
        const regionDistribution = await getRegionDistribution(req.app.locals.pool, startDate, endDate);
        
        res.json({
            success: true,
            data: {
                totalRevenue: currentStats.totalRevenue,
                totalOrders: currentStats.totalOrders,
                avgOrderValue: currentStats.avgOrderValue,
                profitMargin: currentStats.profitMargin,
                revenueChange,
                ordersChange,
                avgOrderChange,
                profitChange: 1.2, // 需要成本資料計算
                dailyRevenue,
                regionDistribution
            }
        });
        
    } catch (error) {
        console.error('獲取營收統計錯誤:', error);
        res.status(500).json({ 
            error: '獲取營收統計失敗',
            details: error.message
        });
    }
});

// 商品分析API
router.get('/product-stats', requireAdmin, async (req, res) => {
    try {
        const { timeRange = 30 } = req.query;
        const days = parseInt(timeRange);
        
        if (req.app.locals.demoMode) {
            return res.json({
                success: true,
                data: {
                    totalProducts: 45,
                    hotProducts: 23,
                    slowProducts: 2,
                    turnoverRate: 8.2,
                    topProducts: [
                        { name: '高麗菜', quantity: 456, revenue: 36480, profit: 45, trend: 90 },
                        { name: '葡萄', quantity: 234, revenue: 29250, profit: 38, trend: 75 },
                        { name: '大白菜', quantity: 189, revenue: 22680, profit: 52, trend: 60 },
                        { name: '番茄', quantity: 567, revenue: 22110, profit: 35, trend: 58 },
                        { name: '胡蘿蔔', quantity: 345, revenue: 20700, profit: 60, trend: 55 }
                    ],
                    categoryDistribution: [
                        { category: '葉菜類', revenue: 89500, percentage: 32.1 },
                        { category: '根莖類', revenue: 67200, percentage: 24.1 },
                        { category: '水果類', revenue: 78300, percentage: 28.1 },
                        { category: '瓜果類', revenue: 43800, percentage: 15.7 }
                    ]
                }
            });
        }
        
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);
        
        // 獲取熱銷商品
        const topProducts = await getTopProducts(req.app.locals.pool, startDate, endDate, 10);
        
        // 獲取商品類別分布
        const categoryDistribution = await getCategoryDistribution(req.app.locals.pool, startDate, endDate);
        
        // 計算商品統計
        const productStats = await getProductStats(req.app.locals.pool, startDate, endDate);
        
        res.json({
            success: true,
            data: {
                totalProducts: productStats.totalProducts,
                hotProducts: productStats.hotProducts,
                slowProducts: productStats.slowProducts,
                turnoverRate: productStats.turnoverRate,
                topProducts,
                categoryDistribution
            }
        });
        
    } catch (error) {
        console.error('獲取商品統計錯誤:', error);
        res.status(500).json({ 
            error: '獲取商品統計失敗',
            details: error.message
        });
    }
});

// 客戶分析API
router.get('/customer-stats', requireAdmin, async (req, res) => {
    try {
        const { timeRange = 30 } = req.query;
        const days = parseInt(timeRange);
        
        if (req.app.locals.demoMode) {
            return res.json({
                success: true,
                data: {
                    totalCustomers: 1456,
                    newCustomers: 234,
                    returningCustomers: 991,
                    vipCustomers: 89,
                    retentionRate: 68,
                    customerGrowth: 15.3,
                    newCustomerGrowth: 8.7,
                    vipGrowth: 13.5,
                    retentionGrowth: 5.2,
                    customerSegments: [
                        { segment: '新客戶', count: 234, percentage: 16.1 },
                        { segment: '活躍客戶', count: 778, percentage: 53.4 },
                        { segment: 'VIP客戶', count: 89, percentage: 6.1 },
                        { segment: '沉睡客戶', count: 355, percentage: 24.4 }
                    ],
                    locationDistribution: [
                        { location: '三峽區', customers: 498, percentage: 34.2 },
                        { location: '北大特區', customers: 430, percentage: 29.5 },
                        { location: '樹林區', customers: 287, percentage: 19.7 },
                        { location: '鶯歌區', customers: 144, percentage: 9.9 },
                        { location: '土城區', customers: 97, percentage: 6.7 }
                    ]
                }
            });
        }
        
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);
        
        // 獲取客戶統計
        const customerStats = await getCustomerStats(req.app.locals.pool, startDate, endDate);
        
        // 獲取客戶分群
        const customerSegments = await getCustomerSegments(req.app.locals.pool, startDate, endDate);
        
        // 獲取地區分布
        const locationDistribution = await getCustomerLocationDistribution(req.app.locals.pool, startDate, endDate);
        
        res.json({
            success: true,
            data: {
                ...customerStats,
                customerSegments,
                locationDistribution
            }
        });
        
    } catch (error) {
        console.error('獲取客戶統計錯誤:', error);
        res.status(500).json({ 
            error: '獲取客戶統計失敗',
            details: error.message
        });
    }
});

// 配送分析API
router.get('/delivery-stats', requireAdmin, async (req, res) => {
    try {
        const { timeRange = 30 } = req.query;
        const days = parseInt(timeRange);
        
        if (req.app.locals.demoMode) {
            return res.json({
                success: true,
                data: {
                    avgDeliveryTime: 42,
                    onTimeRate: 94.2,
                    deliveryCost: 12450,
                    customerSatisfaction: 4.8,
                    timeChange: -3,
                    onTimeChange: 2.1,
                    costChange: 3.2,
                    satisfactionChange: 0.2,
                    timeDistribution: [
                        { timeRange: '<30分', count: 234, percentage: 18.8 },
                        { timeRange: '30-45分', count: 567, percentage: 45.5 },
                        { timeRange: '45-60分', count: 345, percentage: 27.7 },
                        { timeRange: '60-90分', count: 89, percentage: 7.1 },
                        { timeRange: '>90分', count: 12, percentage: 1.0 }
                    ],
                    weeklyEfficiency: [
                        { day: '週一', onTimeRate: 92, avgTime: 45 },
                        { day: '週二', onTimeRate: 94, avgTime: 42 },
                        { day: '週三', onTimeRate: 96, avgTime: 38 },
                        { day: '週四', onTimeRate: 93, avgTime: 44 },
                        { day: '週五', onTimeRate: 95, avgTime: 41 },
                        { day: '週六', onTimeRate: 98, avgTime: 35 },
                        { day: '週日', onTimeRate: 91, avgTime: 48 }
                    ],
                    driverPerformance: [
                        { driverId: 1, name: '李大明', deliveries: 89, avgTime: 38, onTimeRate: 96.6, rating: 4.9 },
                        { driverId: 2, name: '王小華', deliveries: 76, avgTime: 41, onTimeRate: 94.7, rating: 4.7 },
                        { driverId: 3, name: '張志偉', deliveries: 65, avgTime: 45, onTimeRate: 92.3, rating: 4.6 }
                    ]
                }
            });
        }
        
        const endDate = new Date();
        const startDate = new Date(endDate);
        startDate.setDate(startDate.getDate() - days);
        
        // 獲取配送統計
        const deliveryStats = await getDeliveryStats(req.app.locals.pool, startDate, endDate);
        
        // 獲取配送時間分布
        const timeDistribution = await getDeliveryTimeDistribution(req.app.locals.pool, startDate, endDate);
        
        // 獲取週間效率
        const weeklyEfficiency = await getWeeklyDeliveryEfficiency(req.app.locals.pool, startDate, endDate);
        
        // 獲取外送員績效
        const driverPerformance = await getDriverPerformance(req.app.locals.pool, startDate, endDate);
        
        res.json({
            success: true,
            data: {
                ...deliveryStats,
                timeDistribution,
                weeklyEfficiency,
                driverPerformance
            }
        });
        
    } catch (error) {
        console.error('獲取配送統計錯誤:', error);
        res.status(500).json({ 
            error: '獲取配送統計失敗',
            details: error.message
        });
    }
});

// 即時統計摘要API
router.get('/dashboard-summary', requireAdmin, async (req, res) => {
    try {
        if (req.app.locals.demoMode) {
            return res.json({
                success: true,
                data: {
                    todayRevenue: 12800,
                    todayOrders: 52,
                    pendingOrders: 8,
                    deliveringOrders: 15,
                    completedOrders: 29,
                    activeDrivers: 3,
                    avgDeliveryTime: 42,
                    customerSatisfaction: 4.8,
                    lowStockItems: 5,
                    recentActivities: [
                        { time: '10:30', event: '新訂單', description: '張小明下了一筆$350的訂單' },
                        { time: '10:25', event: '配送完成', description: '外送員李大明完成了訂單#1245' },
                        { time: '10:20', event: '庫存警告', description: '高麗菜庫存不足10顆' },
                        { time: '10:15', event: '新客戶', description: '新客戶王美麗註冊成功' }
                    ]
                }
            });
        }
        
        // 獲取今日摘要統計
        const today = new Date();
        const todayStart = new Date(today.setHours(0, 0, 0, 0));
        const todayEnd = new Date(today.setHours(23, 59, 59, 999));
        
        // 並行查詢各種統計資料
        const [
            todayStats,
            orderCounts,
            driverStatus,
            recentActivities,
            lowStockItems
        ] = await Promise.all([
            getTodayStats(req.app.locals.pool, todayStart, todayEnd),
            getOrderCounts(req.app.locals.pool),
            getDriverStatus(req.app.locals.pool),
            getRecentActivities(req.app.locals.pool, 10),
            getLowStockItems(req.app.locals.pool)
        ]);
        
        res.json({
            success: true,
            data: {
                todayRevenue: todayStats.revenue,
                todayOrders: todayStats.orders,
                pendingOrders: orderCounts.pending,
                deliveringOrders: orderCounts.delivering,
                completedOrders: orderCounts.completed,
                activeDrivers: driverStatus.active,
                avgDeliveryTime: todayStats.avgDeliveryTime,
                customerSatisfaction: todayStats.satisfaction || 4.8,
                lowStockItems: lowStockItems.length,
                recentActivities
            }
        });
        
    } catch (error) {
        console.error('獲取儀表板摘要錯誤:', error);
        res.status(500).json({ 
            error: '獲取儀表板摘要失敗',
            details: error.message
        });
    }
});

// 輔助函數：獲取當前期間統計
async function getCurrentPeriodStats(pool, startDate, endDate) {
    const { rows } = await pool.query(`
        SELECT 
            COUNT(*) as total_orders,
            COALESCE(SUM(total_amount), 0) as total_revenue,
            COALESCE(AVG(total_amount), 0) as avg_order_value
        FROM orders 
        WHERE created_at >= $1 AND created_at <= $2
        AND status NOT IN ('cancelled')
    `, [startDate, endDate]);
    
    return {
        totalOrders: parseInt(rows[0].total_orders),
        totalRevenue: parseFloat(rows[0].total_revenue),
        avgOrderValue: parseFloat(rows[0].avg_order_value),
        profitMargin: 42.5 // 需要成本資料計算
    };
}

// 輔助函數：計算變化率
function calculateChangeRate(current, previous) {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100);
}

// 輔助函數：獲取每日營收趨勢
async function getDailyRevenueTrend(pool, startDate, endDate) {
    const { rows } = await pool.query(`
        SELECT 
            DATE(created_at) as date,
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue
        FROM orders 
        WHERE created_at >= $1 AND created_at <= $2
        AND status NOT IN ('cancelled')
        GROUP BY DATE(created_at)
        ORDER BY date
    `, [startDate, endDate]);
    
    return rows.map(row => ({
        date: row.date,
        orders: parseInt(row.orders),
        revenue: parseFloat(row.revenue)
    }));
}

// 輔助函數：獲取地區分布
async function getRegionDistribution(pool, startDate, endDate) {
    const { rows } = await pool.query(`
        SELECT 
            CASE 
                WHEN address LIKE '%三峽%' THEN '三峽區'
                WHEN address LIKE '%北大%' THEN '北大特區'
                WHEN address LIKE '%樹林%' THEN '樹林區'
                WHEN address LIKE '%鶯歌%' THEN '鶯歌區'
                WHEN address LIKE '%土城%' THEN '土城區'
                ELSE '其他地區'
            END as region,
            COUNT(*) as order_count,
            COALESCE(SUM(total_amount), 0) as revenue
        FROM orders 
        WHERE created_at >= $1 AND created_at <= $2
        AND status NOT IN ('cancelled')
        GROUP BY region
        ORDER BY revenue DESC
    `, [startDate, endDate]);
    
    const totalRevenue = rows.reduce((sum, row) => sum + parseFloat(row.revenue), 0);
    
    return rows.map(row => ({
        region: row.region,
        revenue: parseFloat(row.revenue),
        percentage: totalRevenue > 0 ? (parseFloat(row.revenue) / totalRevenue * 100) : 0
    }));
}

// 其他輔助函數（簡化實作，實際應用需要更詳細的查詢）
async function getTopProducts(pool, startDate, endDate, limit) {
    // 簡化實作，實際需要從order_items表查詢
    return [];
}

async function getCategoryDistribution(pool, startDate, endDate) {
    // 簡化實作
    return [];
}

async function getProductStats(pool, startDate, endDate) {
    // 簡化實作
    return {
        totalProducts: 45,
        hotProducts: 23,
        slowProducts: 2,
        turnoverRate: 8.2
    };
}

async function getCustomerStats(pool, startDate, endDate) {
    // 簡化實作
    return {
        totalCustomers: 1456,
        newCustomers: 234,
        returningCustomers: 991,
        vipCustomers: 89,
        retentionRate: 68,
        customerGrowth: 15.3,
        newCustomerGrowth: 8.7,
        vipGrowth: 13.5,
        retentionGrowth: 5.2
    };
}

async function getCustomerSegments(pool, startDate, endDate) {
    // 簡化實作
    return [];
}

async function getCustomerLocationDistribution(pool, startDate, endDate) {
    // 簡化實作
    return [];
}

async function getDeliveryStats(pool, startDate, endDate) {
    // 簡化實作
    return {
        avgDeliveryTime: 42,
        onTimeRate: 94.2,
        deliveryCost: 12450,
        customerSatisfaction: 4.8,
        timeChange: -3,
        onTimeChange: 2.1,
        costChange: 3.2,
        satisfactionChange: 0.2
    };
}

async function getDeliveryTimeDistribution(pool, startDate, endDate) {
    // 簡化實作
    return [];
}

async function getWeeklyDeliveryEfficiency(pool, startDate, endDate) {
    // 簡化實作
    return [];
}

async function getDriverPerformance(pool, startDate, endDate) {
    // 簡化實作
    return [];
}

async function getTodayStats(pool, startDate, endDate) {
    const { rows } = await pool.query(`
        SELECT 
            COUNT(*) as orders,
            COALESCE(SUM(total_amount), 0) as revenue,
            AVG(EXTRACT(EPOCH FROM (delivered_at - created_at))/60) as avg_delivery_minutes
        FROM orders 
        WHERE created_at >= $1 AND created_at <= $2
        AND status NOT IN ('cancelled')
    `, [startDate, endDate]);
    
    return {
        orders: parseInt(rows[0].orders),
        revenue: parseFloat(rows[0].revenue),
        avgDeliveryTime: Math.round(rows[0].avg_delivery_minutes || 42)
    };
}

async function getOrderCounts(pool) {
    const { rows } = await pool.query(`
        SELECT 
            status,
            COUNT(*) as count
        FROM orders 
        WHERE status IN ('placed', 'confirmed', 'assigned', 'delivering', 'delivered')
        GROUP BY status
    `);
    
    const counts = {
        pending: 0,
        delivering: 0,
        completed: 0
    };
    
    rows.forEach(row => {
        if (['placed', 'confirmed'].includes(row.status)) {
            counts.pending += parseInt(row.count);
        } else if (['assigned', 'delivering'].includes(row.status)) {
            counts.delivering += parseInt(row.count);
        } else if (row.status === 'delivered') {
            counts.completed += parseInt(row.count);
        }
    });
    
    return counts;
}

async function getDriverStatus(pool) {
    const { rows } = await pool.query(`
        SELECT 
            COUNT(*) as active_count
        FROM drivers 
        WHERE status IN ('online', 'busy', 'delivering')
    `);
    
    return {
        active: parseInt(rows[0].active_count)
    };
}

async function getRecentActivities(pool, limit) {
    // 簡化實作，實際應該從多個表查詢最近活動
    return [
        { time: new Date().toLocaleTimeString('zh-TW'), event: '系統運行中', description: '所有服務正常運行' }
    ];
}

async function getLowStockItems(pool) {
    // 簡化實作，實際需要查詢inventory表
    return [];
}

module.exports = router;