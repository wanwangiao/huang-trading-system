const express = require('express');
const router = express.Router();

/**
 * 客戶端API路由 - 支援訂單追蹤和即時通知
 * 提供客戶查看訂單狀態、外送員位置、預計送達時間等功能
 */

// 中介軟體：驗證訂單存取權限
async function validateOrderAccess(req, res, next) {
    const { orderId } = req.params;
    const { phone } = req.query;
    
    try {
        if (req.app.locals.demoMode) {
            req.orderInfo = {
                id: parseInt(orderId),
                contact_phone: phone || '0912345678',
                status: 'delivering'
            };
            return next();
        }
        
        const { rows } = await req.app.locals.pool.query(`
            SELECT id, contact_phone, contact_name, address, status, total_amount,
                   driver_id, created_at, estimated_delivery_time, lat, lng
            FROM orders 
            WHERE id = $1 AND contact_phone = $2
        `, [orderId, phone]);
        
        if (rows.length === 0) {
            return res.status(404).json({ 
                error: '訂單不存在或無權限查看',
                code: 'ORDER_NOT_FOUND'
            });
        }
        
        req.orderInfo = rows[0];
        next();
        
    } catch (error) {
        console.error('驗證訂單權限錯誤:', error);
        res.status(500).json({ 
            error: '驗證失敗',
            code: 'VALIDATION_ERROR'
        });
    }
}

// 獲取訂單狀態詳情
router.get('/orders/:orderId/status', validateOrderAccess, async (req, res) => {
    try {
        const order = req.orderInfo;
        
        if (req.app.locals.demoMode) {
            return res.json({
                id: order.id,
                status: 'delivering',
                contact_name: '測試客戶',
                contact_phone: '0912345678',
                address: '新北市三峽區大學路1號',
                total: 350,
                created_at: new Date(),
                estimated_delivery_time: new Date(Date.now() + 20 * 60000), // 20分鐘後
                driver: {
                    id: 1,
                    name: '李大明',
                    phone: '0912345678',
                    vehicleType: '機車',
                    rating: 4.8,
                    currentLocation: {
                        lat: 24.9340,
                        lng: 121.3675,
                        timestamp: new Date().toISOString(),
                        accuracy: 10
                    }
                }
            });
        }
        
        // 獲取完整訂單資訊
        const { rows: orderRows } = await req.app.locals.pool.query(`
            SELECT o.*, 
                   d.id as driver_id, d.name as driver_name, d.phone as driver_phone,
                   d.vehicle_type, d.rating, d.current_lat, d.current_lng, 
                   d.last_location_update
            FROM orders o
            LEFT JOIN drivers d ON o.driver_id = d.id
            WHERE o.id = $1
        `, [order.id]);
        
        if (orderRows.length === 0) {
            return res.status(404).json({ error: '訂單不存在' });
        }
        
        const orderDetail = orderRows[0];
        
        // 組織回應資料
        const response = {
            id: orderDetail.id,
            status: orderDetail.status,
            contact_name: orderDetail.contact_name,
            contact_phone: orderDetail.contact_phone,
            address: orderDetail.address,
            total: parseFloat(orderDetail.total_amount || 0),
            created_at: orderDetail.created_at,
            estimated_delivery_time: orderDetail.estimated_delivery_time,
            lat: orderDetail.lat ? parseFloat(orderDetail.lat) : null,
            lng: orderDetail.lng ? parseFloat(orderDetail.lng) : null
        };
        
        // 如果有外送員，添加外送員資訊
        if (orderDetail.driver_id) {
            response.driver = {
                id: orderDetail.driver_id,
                name: orderDetail.driver_name,
                phone: orderDetail.driver_phone,
                vehicleType: orderDetail.vehicle_type,
                rating: parseFloat(orderDetail.rating || 0)
            };
            
            // 如果有位置資訊，添加當前位置
            if (orderDetail.current_lat && orderDetail.current_lng) {
                response.driver.currentLocation = {
                    lat: parseFloat(orderDetail.current_lat),
                    lng: parseFloat(orderDetail.current_lng),
                    timestamp: orderDetail.last_location_update,
                    accuracy: null // 可以從位置歷史中獲取
                };
            }
        }
        
        res.json(response);
        
    } catch (error) {
        console.error('獲取訂單狀態錯誤:', error);
        res.status(500).json({ 
            error: '獲取訂單狀態失敗',
            code: 'STATUS_FETCH_ERROR'
        });
    }
});

// 獲取外送員即時位置
router.get('/orders/:orderId/driver-location', validateOrderAccess, async (req, res) => {
    try {
        const order = req.orderInfo;
        
        if (req.app.locals.demoMode) {
            return res.json({
                success: true,
                location: {
                    lat: 24.9340 + (Math.random() - 0.5) * 0.01, // 模擬移動
                    lng: 121.3675 + (Math.random() - 0.5) * 0.01,
                    timestamp: new Date().toISOString(),
                    accuracy: 10,
                    speed: 25,
                    heading: 45
                },
                driver: {
                    id: 1,
                    name: '李大明',
                    status: 'delivering'
                }
            });
        }
        
        // 獲取外送員當前位置
        const { rows } = await req.app.locals.pool.query(`
            SELECT d.id, d.name, d.status, d.current_lat, d.current_lng, 
                   d.last_location_update,
                   dlh.accuracy, dlh.speed, dlh.heading
            FROM orders o
            JOIN drivers d ON o.driver_id = d.id
            LEFT JOIN driver_location_history dlh ON d.id = dlh.driver_id
            WHERE o.id = $1
            AND dlh.recorded_at = (
                SELECT MAX(recorded_at) 
                FROM driver_location_history 
                WHERE driver_id = d.id
            )
        `, [order.id]);
        
        if (rows.length === 0) {
            return res.json({
                success: false,
                message: '外送員尚未指派或位置不可用'
            });
        }
        
        const driverData = rows[0];
        
        if (!driverData.current_lat || !driverData.current_lng) {
            return res.json({
                success: false,
                message: '外送員位置暫時不可用'
            });
        }
        
        res.json({
            success: true,
            location: {
                lat: parseFloat(driverData.current_lat),
                lng: parseFloat(driverData.current_lng),
                timestamp: driverData.last_location_update,
                accuracy: driverData.accuracy ? parseFloat(driverData.accuracy) : null,
                speed: driverData.speed ? parseFloat(driverData.speed) : null,
                heading: driverData.heading ? parseFloat(driverData.heading) : null
            },
            driver: {
                id: driverData.id,
                name: driverData.name,
                status: driverData.status
            }
        });
        
    } catch (error) {
        console.error('獲取外送員位置錯誤:', error);
        res.status(500).json({ 
            error: '獲取外送員位置失敗',
            code: 'LOCATION_FETCH_ERROR'
        });
    }
});

// 計算預計送達時間
router.get('/orders/:orderId/eta', validateOrderAccess, async (req, res) => {
    try {
        const order = req.orderInfo;
        
        if (req.app.locals.demoMode) {
            const eta = new Date(Date.now() + 15 * 60000); // 15分鐘後
            return res.json({
                success: true,
                eta: eta.toISOString(),
                estimatedMinutes: 15,
                distance: '2.5 km',
                confidence: 'high'
            });
        }
        
        // 獲取外送員當前位置和訂單地址
        const { rows } = await req.app.locals.pool.query(`
            SELECT o.lat as dest_lat, o.lng as dest_lng,
                   d.current_lat as driver_lat, d.current_lng as driver_lng,
                   o.estimated_delivery_time
            FROM orders o
            LEFT JOIN drivers d ON o.driver_id = d.id
            WHERE o.id = $1
        `, [order.id]);
        
        if (rows.length === 0) {
            return res.status(404).json({ error: '訂單不存在' });
        }
        
        const locationData = rows[0];
        
        // 如果已有預計送達時間，直接返回
        if (locationData.estimated_delivery_time) {
            const etaMinutes = Math.ceil((new Date(locationData.estimated_delivery_time) - new Date()) / 60000);
            
            return res.json({
                success: true,
                eta: locationData.estimated_delivery_time,
                estimatedMinutes: etaMinutes > 0 ? etaMinutes : 0,
                distance: 'N/A',
                confidence: 'medium',
                source: 'database'
            });
        }
        
        // 如果沒有外送員位置資訊，返回預設時間
        if (!locationData.driver_lat || !locationData.driver_lng || !locationData.dest_lat || !locationData.dest_lng) {
            const defaultETA = new Date(Date.now() + 30 * 60000); // 預設30分鐘
            return res.json({
                success: true,
                eta: defaultETA.toISOString(),
                estimatedMinutes: 30,
                distance: 'N/A',
                confidence: 'low',
                source: 'default'
            });
        }
        
        // 使用Haversine公式計算距離（簡單估算）
        const distance = calculateDistance(
            locationData.driver_lat, locationData.driver_lng,
            locationData.dest_lat, locationData.dest_lng
        );
        
        // 簡單的ETA計算（假設平均速度25km/h）
        const avgSpeed = 25; // km/h
        const estimatedHours = distance / avgSpeed;
        const estimatedMinutes = Math.ceil(estimatedHours * 60);
        const eta = new Date(Date.now() + estimatedMinutes * 60000);
        
        res.json({
            success: true,
            eta: eta.toISOString(),
            estimatedMinutes,
            distance: `${distance.toFixed(1)} km`,
            confidence: 'medium',
            source: 'calculated'
        });
        
    } catch (error) {
        console.error('計算ETA錯誤:', error);
        res.status(500).json({ 
            error: '計算預計送達時間失敗',
            code: 'ETA_CALCULATION_ERROR'
        });
    }
});

// 獲取訂單歷史事件
router.get('/orders/:orderId/timeline', validateOrderAccess, async (req, res) => {
    try {
        const order = req.orderInfo;
        
        if (req.app.locals.demoMode) {
            const now = new Date();
            return res.json({
                success: true,
                events: [
                    {
                        status: 'placed',
                        title: '訂單成立',
                        description: '您的訂單已成功建立',
                        timestamp: new Date(now - 3600000).toISOString() // 1小時前
                    },
                    {
                        status: 'confirmed',
                        title: '訂單確認',
                        description: '我們已確認您的訂單',
                        timestamp: new Date(now - 3000000).toISOString() // 50分鐘前
                    },
                    {
                        status: 'assigned',
                        title: '外送員接單',
                        description: '外送員李大明已接您的訂單',
                        timestamp: new Date(now - 1200000).toISOString() // 20分鐘前
                    },
                    {
                        status: 'delivering',
                        title: '配送中',
                        description: '外送員正在前往您的地址',
                        timestamp: new Date(now - 600000).toISOString() // 10分鐘前
                    }
                ]
            });
        }
        
        // 從多個表格獲取事件歷史
        const { rows } = await req.app.locals.pool.query(`
            SELECT 'order' as event_type, 'placed' as status, '訂單成立' as title, 
                   '您的訂單已成功建立' as description, created_at as timestamp
            FROM orders WHERE id = $1
            
            UNION ALL
            
            SELECT 'order' as event_type, 'assigned' as status, '外送員接單' as title,
                   CONCAT('外送員已接您的訂單') as description, assigned_at as timestamp
            FROM orders WHERE id = $1 AND assigned_at IS NOT NULL
            
            UNION ALL
            
            SELECT 'order' as event_type, 'picked_up' as status, '已取貨' as title,
                   '外送員已取得商品' as description, picked_up_at as timestamp
            FROM orders WHERE id = $1 AND picked_up_at IS NOT NULL
            
            UNION ALL
            
            SELECT 'order' as event_type, 'delivered' as status, '已送達' as title,
                   '商品已成功送達' as description, delivered_at as timestamp
            FROM orders WHERE id = $1 AND delivered_at IS NOT NULL
            
            ORDER BY timestamp ASC
        `, [order.id]);
        
        res.json({
            success: true,
            events: rows.map(row => ({
                eventType: row.event_type,
                status: row.status,
                title: row.title,
                description: row.description,
                timestamp: row.timestamp
            }))
        });
        
    } catch (error) {
        console.error('獲取訂單歷史錯誤:', error);
        res.status(500).json({ 
            error: '獲取訂單歷史失敗',
            code: 'TIMELINE_FETCH_ERROR'
        });
    }
});

// 客戶取消訂單
router.post('/orders/:orderId/cancel', validateOrderAccess, async (req, res) => {
    try {
        const order = req.orderInfo;
        const { reason } = req.body;
        
        if (req.app.locals.demoMode) {
            return res.json({
                success: true,
                message: '示範模式：訂單取消成功'
            });
        }
        
        // 檢查訂單狀態是否允許取消
        const cancelableStatuses = ['placed', 'confirmed', 'preparing'];
        if (!cancelableStatuses.includes(order.status)) {
            return res.status(400).json({
                error: '訂單已進入配送流程，無法取消',
                code: 'ORDER_NOT_CANCELABLE'
            });
        }
        
        const client = await req.app.locals.pool.connect();
        
        try {
            await client.query('BEGIN');
            
            // 更新訂單狀態
            await client.query(`
                UPDATE orders 
                SET status = 'cancelled', notes = CONCAT(COALESCE(notes, ''), '\n客戶取消原因: ', $2)
                WHERE id = $1
            `, [order.id, reason || '客戶主動取消']);
            
            // 如果已分配外送員，釋放外送員
            if (order.driver_id) {
                await client.query(`
                    UPDATE drivers 
                    SET status = 'online', tracking_order_id = NULL
                    WHERE id = $1
                `, [order.driver_id]);
            }
            
            // 記錄取消事件
            await client.query(`
                INSERT INTO notifications (type, recipient_type, recipient_id, title, message, order_id)
                VALUES ('order_cancelled', 'customer', $1, '訂單已取消', '您的訂單已成功取消', $2)
            `, [order.contact_phone, order.id]);
            
            await client.query('COMMIT');
            
            res.json({
                success: true,
                message: '訂單已成功取消',
                orderId: order.id
            });
            
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
        
    } catch (error) {
        console.error('取消訂單錯誤:', error);
        res.status(500).json({ 
            error: '取消訂單失敗',
            code: 'CANCEL_ORDER_ERROR'
        });
    }
});

// 輔助函數：計算兩點間距離 (Haversine公式)
function calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球半徑（公里）
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function toRad(degrees) {
    return degrees * (Math.PI / 180);
}

module.exports = router;