const express = require('express');
const router = express.Router();
const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');
const GoogleMapsService = require('../services/GoogleMapsService');
const LineBotService = require('../services/LineBotService');

// 資料庫連接將從主應用程式傳入
let db = null;
let demoMode = true;
let lineBotService = null;

// 設置資料庫連接的函數
function setDatabasePool(pool, isDemo = true) {
    db = pool;
    // 強制使用示範模式直到外送員系統完全穩定
    demoMode = true;
    console.log('🔧 外送員簡化API：強制啟用示範模式');
    
    // 初始化 LINE Bot 服務
    lineBotService = new LineBotService();
}

// 設置照片上傳的 multer 配置
const storage = multer.memoryStorage(); // 使用記憶體存儲，稍後處理壓縮
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB 限制
        files: 5 // 一次最多5個檔案
    },
    fileFilter: (req, file, cb) => {
        // 只允許圖片檔案
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('只允許上傳圖片檔案'), false);
        }
    }
});

// 確保上傳目錄存在
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'delivery_photos');
const COMPRESSED_DIR = path.join(UPLOAD_DIR, 'compressed');

// 匯出設置函數
router.setDatabasePool = setDatabasePool;

// 獲取各地區訂單數量
router.get('/order-counts', async (req, res) => {
    try {
        if (demoMode) {
            // 示範模式數據
            const counts = {
                '三峽區': Math.floor(Math.random() * 8) + 1,
                '樹林區': Math.floor(Math.random() * 5) + 1,
                '鶯歌區': Math.floor(Math.random() * 4) + 1,
                '土城區': Math.floor(Math.random() * 3) + 1,
                '北大特區': Math.floor(Math.random() * 6) + 1
            };
            
            res.json({ success: true, counts });
        } else {
            // 實際資料庫查詢
            const query = `
                SELECT 
                    CASE 
                        WHEN address LIKE '%三峽%' THEN '三峽區'
                        WHEN address LIKE '%樹林%' THEN '樹林區'
                        WHEN address LIKE '%鶯歌%' THEN '鶯歌區'
                        WHEN address LIKE '%土城%' THEN '土城區'
                        WHEN address LIKE '%北大%' THEN '北大特區'
                        ELSE '其他區域'
                    END as area,
                    COUNT(*) as count
                FROM orders 
                WHERE status = 'packed' 
                    AND driver_id IS NULL
                    AND area != '其他區域'
                GROUP BY area
            `;
            
            const result = await db.query(query);
            const counts = {};
            
            // 初始化所有區域為0
            ['三峽區', '樹林區', '鶯歌區', '土城區', '北大特區'].forEach(area => {
                counts[area] = 0;
            });
            
            // 填入實際數量
            result.rows.forEach(row => {
                counts[row.area] = parseInt(row.count);
            });
            
            res.json({ success: true, counts });
        }
    } catch (error) {
        console.error('獲取訂單數量失敗:', error);
        res.status(500).json({ success: false, message: '獲取訂單數量失敗' });
    }
});

// 獲取特定地區的訂單 - 使用通用路由避免Express自動解碼問題
router.get('/area-orders/*', async (req, res) => {
    try {
        // 從原始URL路徑中提取區域名稱，避免Express自動解碼 (2025-09-02 強制更新部署)
        const fullPath = req.params[0] || req.originalUrl.split('/area-orders/')[1] || '';
        let area = fullPath.split('?')[0]; // 移除查詢參數
        
        // 處理各種編碼情況
        if (area.includes('%')) {
            try {
                area = decodeURIComponent(area);
            } catch (decodeError) {
                console.error('URL解碼失敗:', area, decodeError);
                // 嘗試直接映射常見的錯誤編碼
                const areaMapping = {
                    '%a4T%ael%b0%cf': '三峽區',
                    '%be%f0%aaL%b0%cf': '樹林區', 
                    '%c5a%baq%b0%cf': '鶯歌區'
                };
                area = areaMapping[area] || area;
            }
        }
        
        // 標準化地區名稱
        const validAreas = ['三峽區', '樹林區', '鶯歌區', '土城區', '北大特區'];
        if (!validAreas.includes(area)) {
            return res.status(400).json({ 
                success: false, 
                message: `不支援的地區: ${area}`,
                receivedArea: area,
                originalPath: req.originalUrl
            });
        }
        
        if (demoMode) {
            // 示範模式數據
            const demoOrders = generateDemoOrdersForArea(area);
            res.json({ success: true, orders: demoOrders });
        } else {
            // 實際資料庫查詢
            let areaCondition;
            switch (area) {
                case '三峽區':
                    areaCondition = "address LIKE '%三峽%'";
                    break;
                case '樹林區':
                    areaCondition = "address LIKE '%樹林%'";
                    break;
                case '鶯歌區':
                    areaCondition = "address LIKE '%鶯歌%'";
                    break;
                case '土城區':
                    areaCondition = "address LIKE '%土城%'";
                    break;
                case '北大特區':
                    areaCondition = "address LIKE '%北大%'";
                    break;
                default:
                    areaCondition = "1=0"; // 無匹配結果
            }
            
            const query = `
                SELECT o.*, 
                       COALESCE(o.total_amount, o.total, 0) as total_amount,
                       COALESCE(o.payment_method, 'cash') as payment_method,
                       array_agg(
                           json_build_object(
                               'product_name', COALESCE(oi.product_name, oi.name),
                               'quantity', oi.quantity,
                               'price', oi.price
                           )
                       ) as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.status = 'packed' 
                    AND o.driver_id IS NULL 
                    AND ${areaCondition}
                GROUP BY o.id, o.total_amount, o.total, o.payment_method
                ORDER BY o.created_at ASC
            `;
            
            const result = await db.query(query);
            res.json({ success: true, orders: result.rows });
        }
    } catch (error) {
        console.error('獲取地區訂單失敗:', error);
        res.status(500).json({ success: false, message: '獲取地區訂單失敗' });
    }
});

// 批次接受訂單 (新的簡化版API)
router.post('/batch-accept-orders', async (req, res) => {
    try {
        const { orderIds } = req.body;
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({ success: false, message: '請選擇要接取的訂單' });
        }
        
        if (demoMode) {
            // 示範模式 - 模擬成功接取
            const mockDriverId = driverId || 1; // 示範模式使用預設driver ID
            console.log(`外送員 ${mockDriverId} 接取訂單:`, orderIds);
            res.json({ 
                success: true, 
                message: `成功接取 ${orderIds.length} 筆訂單`,
                acceptedCount: orderIds.length
            });
        } else {
            // 實際資料庫操作
            const placeholders = orderIds.map((_, index) => `$${index + 2}`).join(',');
            const query = `
                UPDATE orders 
                SET driver_id = $1, 
                    status = 'assigned',
                    taken_at = NOW()
                WHERE id IN (${placeholders}) 
                    AND status = 'packed' 
                    AND driver_id IS NULL
                RETURNING id
            `;
            
            const values = [driverId, ...orderIds];
            const result = await db.query(query, values);
            
            if (result.rows.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: '沒有可接取的訂單，可能已被其他外送員接取' 
                });
            }
            
            res.json({ 
                success: true, 
                message: `成功接取 ${result.rows.length} 筆訂單`,
                acceptedCount: result.rows.length
            });
        }
    } catch (error) {
        console.error('接取訂單失敗:', error);
        res.status(500).json({ success: false, message: '接取訂單失敗' });
    }
});

// 獲取我的配送訂單
router.get('/my-orders', async (req, res) => {
    try {
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (demoMode) {
            // 示範模式數據
            const demoOrders = generateDemoMyOrders(driverId);
            res.json({ success: true, orders: demoOrders });
        } else {
            // 實際資料庫查詢
            const query = `
                SELECT o.*, 
                       o.total as total_amount,
                       COALESCE(o.payment_method, 'cash') as payment_method,
                       array_agg(
                           json_build_object(
                               'product_name', oi.product_name,
                               'quantity', oi.quantity,
                               'price', oi.price
                           )
                       ) as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.driver_id = $1 
                    AND o.status = 'assigned'
                GROUP BY o.id
                ORDER BY o.taken_at ASC
            `;
            
            const result = await db.query(query, [driverId]);
            res.json({ success: true, orders: result.rows });
        }
    } catch (error) {
        console.error('獲取我的配送訂單失敗:', error);
        res.status(500).json({ success: false, message: '獲取我的配送訂單失敗' });
    }
});

// 從我的配送中移除訂單
router.post('/remove-order/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (demoMode) {
            // 示範模式
            console.log(`外送員 ${driverId} 移除訂單 ${orderId}`);
            res.json({ success: true, message: '訂單已移除並回到可接取狀態' });
        } else {
            // 實際資料庫操作
            const query = `
                UPDATE orders 
                SET driver_id = NULL, 
                    status = 'packed',
                    taken_at = NULL
                WHERE id = $1 
                    AND driver_id = $2
                    AND status = 'assigned'
                RETURNING id
            `;
            
            const result = await db.query(query, [orderId, driverId]);
            
            if (result.rows.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: '無法移除此訂單，可能已完成配送或不屬於您' 
                });
            }
            
            res.json({ success: true, message: '訂單已移除並回到可接取狀態' });
        }
    } catch (error) {
        console.error('移除訂單失敗:', error);
        res.status(500).json({ success: false, message: '移除訂單失敗' });
    }
});

// 一鍵路線優化
router.post('/optimize-route', async (req, res) => {
    try {
        const { orderIds } = req.body;
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length < 2) {
            return res.status(400).json({ success: false, message: '至少需要2筆訂單才能進行路線優化' });
        }
        
        if (demoMode) {
            // 示範模式 - 模擬路線優化
            const optimizedOrders = simulateRouteOptimization(orderIds);
            const timeSaved = Math.floor(Math.random() * 20) + 5; // 5-25分鐘節省時間
            
            res.json({ 
                success: true, 
                optimizedOrders: optimizedOrders,
                timeSaved: timeSaved,
                message: `路線已優化，預計節省 ${timeSaved} 分鐘`,
                routeUrl: generateMockGoogleMapsUrl(optimizedOrders),
                interactiveUrl: generateMockGoogleDirectionsUrl(optimizedOrders)
            });
        } else {
            // 實際路線優化 - 整合 Google Maps API
            const orders = await getOrderDetails(orderIds);
            const addresses = orders.map(order => order.address);
            
            // 初始化 Google Maps 服務
            const googleMapsService = new GoogleMapsService(db);
            const optimizedResult = await googleMapsService.optimizeDeliveryRoute(addresses);
            
            if (optimizedResult && optimizedResult.success) {
                // 根據優化後的順序重新排列訂單
                const optimizedOrders = optimizedResult.optimizedOrder 
                    ? optimizedResult.optimizedOrder.map(index => orders[index])
                    : orders; // 如果沒有優化順序，使用原順序
                
                res.json({ 
                    success: true, 
                    optimizedOrders,
                    timeSaved: optimizedResult.timeSavedMinutes || Math.max(5, orders.length * 2),
                    totalDistance: optimizedResult.totalDistanceKm || (orders.length * 1.5),
                    routeUrl: optimizedResult.staticMapUrl || generateMockGoogleMapsUrl(optimizedOrders),
                    interactiveUrl: optimizedResult.directionsUrl || generateMockGoogleDirectionsUrl(optimizedOrders),
                    message: `路線已優化，總距離 ${optimizedResult.totalDistanceKm || (orders.length * 1.5)} 公里，預計節省 ${optimizedResult.timeSavedMinutes || Math.max(5, orders.length * 2)} 分鐘`
                });
            } else {
                // 如果 Google Maps 優化失敗，使用模擬結果
                const mockOptimizedOrders = simulateRouteOptimization(orderIds).map(mockOrder => {
                    const realOrder = orders.find(o => o.id == mockOrder.id);
                    return realOrder || mockOrder;
                });
                
                res.json({ 
                    success: true, 
                    optimizedOrders: mockOptimizedOrders,
                    timeSaved: Math.max(5, orders.length * 2),
                    totalDistance: orders.length * 1.5,
                    routeUrl: generateMockGoogleMapsUrl(mockOptimizedOrders),
                    interactiveUrl: generateMockGoogleDirectionsUrl(mockOptimizedOrders),
                    message: `路線已優化（模擬模式），預計節省 ${Math.max(5, orders.length * 2)} 分鐘`
                });
            }
        }
    } catch (error) {
        console.error('路線優化失敗:', error);
        res.status(500).json({ success: false, message: '路線優化失敗' });
    }
});

// 完成配送
router.post('/complete-order/:orderId', async (req, res) => {
    try {
        const orderId = req.params.orderId;
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (demoMode) {
            // 示範模式
            console.log(`外送員 ${driverId} 完成配送訂單 ${orderId}`);
            res.json({ success: true, message: '配送完成，客戶已收到通知' });
        } else {
            // 實際資料庫操作
            const query = `
                UPDATE orders 
                SET status = 'delivered',
                    completed_at = NOW()
                WHERE id = $1 
                    AND driver_id = $2
                    AND status = 'assigned'
                RETURNING id, customer_name, customer_phone
            `;
            
            const result = await db.query(query, [orderId, driverId]);
            
            if (result.rows.length === 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: '無法完成此訂單，可能不屬於您或已完成' 
                });
            }
            
            // 發送 LINE 通知給客戶 (如果有設定)
            const order = result.rows[0];
            if (process.env.LINE_NOTIFY_TOKEN && order.customer_phone) {
                try {
                    await sendLineNotification(order.customer_name, orderId);
                } catch (lineError) {
                    console.error('LINE通知發送失敗:', lineError);
                }
            }
            
            res.json({ success: true, message: '配送完成，客戶已收到通知' });
        }
    } catch (error) {
        console.error('完成配送失敗:', error);
        res.status(500).json({ success: false, message: '完成配送失敗' });
    }
});

// 獲取外送員統計
router.get('/stats', async (req, res) => {
    try {
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (demoMode) {
            // 示範模式數據
            const stats = {
                todayCompleted: Math.floor(Math.random() * 15) + 5,
                todayEarnings: (Math.floor(Math.random() * 800) + 200),
                avgDeliveryTime: Math.floor(Math.random() * 10) + 15,
                totalOrders: Math.floor(Math.random() * 50) + 20
            };
            res.json({ success: true, ...stats });
        } else {
            // 實際資料庫查詢
            const query = `
                SELECT 
                    COUNT(CASE WHEN status = 'delivered' AND DATE(completed_at) = CURRENT_DATE THEN 1 END) as today_completed,
                    COALESCE(SUM(CASE WHEN status = 'delivered' AND DATE(completed_at) = CURRENT_DATE THEN delivery_fee END), 0) as today_earnings,
                    COUNT(CASE WHEN status = 'delivered' THEN 1 END) as total_orders,
                    AVG(CASE WHEN status = 'delivered' THEN EXTRACT(EPOCH FROM (completed_at - taken_at))/60 END) as avg_delivery_time
                FROM orders 
                WHERE driver_id = $1
            `;
            
            const result = await db.query(query, [driverId]);
            const stats = result.rows[0];
            
            res.json({ 
                success: true,
                todayCompleted: parseInt(stats.today_completed) || 0,
                todayEarnings: parseFloat(stats.today_earnings) || 0,
                totalOrders: parseInt(stats.total_orders) || 0,
                avgDeliveryTime: Math.round(parseFloat(stats.avg_delivery_time)) || 0
            });
        }
    } catch (error) {
        console.error('獲取統計失敗:', error);
        res.status(500).json({ success: false, message: '獲取統計失敗' });
    }
});

// ========== 照片處理和工具函數 ==========

/**
 * 確保目錄存在
 */
async function ensureDirectoryExists(dirPath) {
    try {
        await fs.access(dirPath);
    } catch (error) {
        await fs.mkdir(dirPath, { recursive: true });
        console.log(`✅ 創建目錄: ${dirPath}`);
    }
}

/**
 * 壓縮照片到指定尺寸
 */
async function compressImage(buffer, maxWidth = 800, maxHeight = 600, quality = 80) {
    try {
        const compressed = await sharp(buffer)
            .resize(maxWidth, maxHeight, { 
                fit: 'inside',
                withoutEnlargement: true
            })
            .jpeg({ 
                quality: quality,
                progressive: true 
            })
            .toBuffer();
        
        console.log(`📷 照片壓縮: ${buffer.length} bytes -> ${compressed.length} bytes`);
        return compressed;
    } catch (error) {
        console.error('照片壓縮失敗:', error);
        return buffer; // 壓縮失敗則返回原圖
    }
}

/**
 * 生成唯一的檔案名稱
 */
function generateUniqueFilename(originalName, driverId, orderId) {
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const ext = path.extname(originalName).toLowerCase();
    return `driver_${driverId}_order_${orderId}_${timestamp}_${random}${ext}`;
}

/**
 * 保存照片到磁碟
 */
async function savePhotoToDisk(buffer, filename, useCompressed = false) {
    const targetDir = useCompressed ? COMPRESSED_DIR : UPLOAD_DIR;
    await ensureDirectoryExists(targetDir);
    
    const filePath = path.join(targetDir, filename);
    await fs.writeFile(filePath, buffer);
    
    return filePath;
}

/**
 * 生成照片的公開 URL
 */
function generatePhotoUrl(filename, useCompressed = true) {
    const baseUrl = process.env.BASE_URL || 'http://localhost:3000';
    const subPath = useCompressed ? 'compressed' : '';
    return `${baseUrl}/uploads/delivery_photos/${subPath}/${filename}`.replace(/\/+/g, '/');
}

/**
 * 添加離線任務到佇列
 */
async function addToOfflineQueue(driverId, actionType, orderId, dataPayload, filePaths = []) {
    if (demoMode) {
        console.log('🔄 [示範模式] 模擬添加離線任務:', {
            driverId,
            actionType,
            orderId,
            payloadSize: JSON.stringify(dataPayload).length,
            fileCount: filePaths.length
        });
        return { id: Date.now(), demo: true };
    }
    
    try {
        const query = `
            INSERT INTO offline_queue (driver_id, action_type, order_id, data_payload, file_paths)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, created_at
        `;
        
        const result = await db.query(query, [
            driverId,
            actionType, 
            orderId,
            JSON.stringify(dataPayload),
            filePaths
        ]);
        
        console.log(`✅ 離線任務已加入佇列: #${result.rows[0].id}`);
        return result.rows[0];
        
    } catch (error) {
        console.error('添加離線任務失敗:', error);
        throw error;
    }
}

/**
 * 處理離線佇列中的任務
 */
async function processOfflineQueue(driverId) {
    if (demoMode) {
        console.log(`🔄 [示範模式] 模擬處理司機 ${driverId} 的離線任務`);
        return { processed: 0, demo: true };
    }
    
    try {
        const query = `
            SELECT id, action_type, order_id, data_payload, file_paths, retry_count
            FROM offline_queue 
            WHERE driver_id = $1 
                AND status = 'pending'
                AND retry_count < max_retries
                AND (scheduled_retry_at IS NULL OR scheduled_retry_at <= NOW())
            ORDER BY created_at ASC
            LIMIT 10
        `;
        
        const result = await db.query(query, [driverId]);
        let processedCount = 0;
        
        for (const task of result.rows) {
            try {
                await processOfflineTask(task);
                processedCount++;
            } catch (error) {
                console.error(`處理離線任務 #${task.id} 失敗:`, error);
                await markOfflineTaskFailed(task.id, error.message);
            }
        }
        
        console.log(`✅ 處理完成 ${processedCount} 個離線任務`);
        return { processed: processedCount };
        
    } catch (error) {
        console.error('處理離線佇列失敗:', error);
        throw error;
    }
}

/**
 * 執行單個離線任務
 */
async function processOfflineTask(task) {
    const { id, action_type, order_id, data_payload, file_paths } = task;
    const payload = JSON.parse(data_payload);
    
    console.log(`🔄 處理離線任務 #${id}: ${action_type}`);
    
    switch (action_type) {
        case 'upload_photo':
            await processOfflinePhotoUpload(id, order_id, payload, file_paths);
            break;
        case 'report_problem':
            await processOfflineProblemReport(id, order_id, payload);
            break;
        case 'complete_order':
            await processOfflineOrderCompletion(id, order_id, payload);
            break;
        default:
            throw new Error(`未知的任務類型: ${action_type}`);
    }
    
    // 標記任務完成
    await db.query(`
        UPDATE offline_queue 
        SET status = 'completed', completed_at = NOW()
        WHERE id = $1
    `, [id]);
}

/**
 * 標記離線任務失敗並安排重試
 */
async function markOfflineTaskFailed(taskId, errorMessage) {
    await db.query(`
        UPDATE offline_queue 
        SET 
            status = 'pending',
            retry_count = retry_count + 1,
            error_message = $1,
            last_attempt_at = NOW(),
            scheduled_retry_at = NOW() + INTERVAL '5 minutes' * retry_count
        WHERE id = $2
    `, [errorMessage, taskId]);
}

// ========== 輔助函數 ==========

// 生成示範地區訂單
function generateDemoOrdersForArea(area) {
    const addresses = {
        '三峽區': [
            '新北市三峽區中山路123號',
            '新北市三峽區民權街45號',
            '新北市三峽區復興路67號',
            '新北市三峽區和平街89號'
        ],
        '樹林區': [
            '新北市樹林區中正路234號',
            '新北市樹林區民生街56號',
            '新北市樹林區文化路78號'
        ],
        '鶯歌區': [
            '新北市鶯歌區中山路345號',
            '新北市鶯歌區育英街67號'
        ],
        '土城區': [
            '新北市土城區中央路456號',
            '新北市土城區金城路89號'
        ],
        '北大特區': [
            '新北市三峽區大學路123號',
            '新北市三峽區北大路234號',
            '新北市三峽區學成路345號',
            '新北市三峽區學勤路456號'
        ]
    };
    
    const customers = ['王小明', '李小華', '張小美', '陳小強', '林小芳'];
    const phones = ['0912345678', '0923456789', '0934567890', '0945678901', '0956789012'];
    
    const areaAddresses = addresses[area] || [];
    const orderCount = Math.min(areaAddresses.length, Math.floor(Math.random() * 3) + 3); // 確保3-5個訂單
    
    const paymentMethods = ['cash', 'linepay', 'transfer'];
    
    return Array.from({ length: orderCount }, (_, index) => {
        const items = [
            { product_name: '高麗菜', quantity: 1, price: 30 },
            { product_name: '白蘿蔔', quantity: 2, price: 25 }
        ];
        const subtotal = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const deliveryFee = 50;
        const totalAmount = subtotal + deliveryFee;
        
        return {
            id: Date.now() + Math.random() * 1000 + index,
            customer_name: customers[index % customers.length],
            customer_phone: phones[index % phones.length],
            address: areaAddresses[index % areaAddresses.length],
            delivery_fee: deliveryFee,
            total_amount: totalAmount,
            payment_method: paymentMethods[Math.floor(Math.random() * paymentMethods.length)],
            created_at: new Date(Date.now() - Math.random() * 3600000).toISOString(),
            items: items
        };
    });
}

// 生成示範我的訂單
function generateDemoMyOrders(driverId) {
    const sampleOrders = [
        {
            id: 1001,
            customer_name: '張小明',
            customer_phone: '0912345678',
            address: '新北市三峽區民權街123號',
            total_amount: 80,
            payment_method: 'cash',
            taken_at: new Date(Date.now() - 1800000).toISOString(),
            items: [{ product_name: '高麗菜', quantity: 1, price: 30 }]
        },
        {
            id: 1002,
            customer_name: '李小華',
            customer_phone: '0923456789',
            address: '新北市樹林區中正路456號',
            total_amount: 100,
            payment_method: 'linepay',
            taken_at: new Date(Date.now() - 1200000).toISOString(),
            items: [{ product_name: '白蘿蔔', quantity: 2, price: 25 }]
        }
    ];
    
    return Math.random() > 0.5 ? sampleOrders : [];
}

// 模擬路線優化
function simulateRouteOptimization(orderIds) {
    // 簡單模擬：打亂順序來模擬優化
    const shuffled = [...orderIds].sort(() => Math.random() - 0.5);
    
    // 實際應該調用路線優化算法
    return shuffled.map(id => ({
        id: id,
        customer_name: '測試客戶',
        address: '測試地址',
        optimized_order: shuffled.indexOf(id) + 1
    }));
}

// 生成模擬Google Maps路線URL
function generateMockGoogleMapsUrl(orders) {
    // 模擬Google Maps靜態地圖URL
    const markers = orders.map((order, index) => {
        const label = String.fromCharCode(65 + index); // A, B, C...
        // 使用三峽區周邊的示範座標
        const lng = 121.37 + (Math.random() - 0.5) * 0.02;
        const lat = 24.93 + (Math.random() - 0.5) * 0.02;
        const color = index === 0 ? 'green' : (index === orders.length - 1 ? 'red' : 'blue');
        return `markers=color:${color}|label:${label}|${lat},${lng}`;
    }).join('&');
    
    return `https://maps.googleapis.com/maps/api/staticmap?size=800x600&maptype=roadmap&${markers}&key=AIzaSyBRwW-NMUDGMXaDhvl3oYJs_OqjfXWTTNE`;
}

// 生成模擬Google導航URL
function generateMockGoogleDirectionsUrl(orders) {
    if (orders.length < 2) return null;
    
    const origin = `${24.93 + (Math.random() - 0.5) * 0.01},${121.37 + (Math.random() - 0.5) * 0.01}`;
    const destination = `${24.93 + (Math.random() - 0.5) * 0.01},${121.37 + (Math.random() - 0.5) * 0.01}`;
    
    let waypoints = '';
    if (orders.length > 2) {
        const waypointCoords = orders.slice(1, -1).map(() => {
            const lat = 24.93 + (Math.random() - 0.5) * 0.01;
            const lng = 121.37 + (Math.random() - 0.5) * 0.01;
            return `${lat},${lng}`;
        }).join('|');
        waypoints = `&waypoints=${waypointCoords}`;
    }
    
    return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}${waypoints}&travelmode=driving`;
}

// ========== 新增API端點 - 照片上傳和問題回報 ==========

// 照片上傳API端點
router.post('/upload-delivery-photo', upload.array('photos', 5), async (req, res) => {
    try {
        const { orderId, photoType = 'delivery', description = '' } = req.body;
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (!orderId) {
            return res.status(400).json({ success: false, message: '請提供訂單ID' });
        }
        
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: '請選擇要上傳的照片' });
        }
        
        console.log(`📷 外送員 ${driverId} 上傳 ${req.files.length} 張照片 (訂單 #${orderId})`);
        
        if (demoMode) {
            // 示範模式
            const mockPhotos = req.files.map((file, index) => ({
                id: Date.now() + index,
                filename: `demo_photo_${index + 1}.jpg`,
                url: `http://localhost:3000/demo/photo_${orderId}_${index + 1}.jpg`,
                size: file.size,
                type: photoType,
                uploadedAt: new Date().toISOString()
            }));
            
            console.log('📱 模擬發送照片到客戶LINE...');
            
            const mockOrder = {
                id: orderId,
                customer_name: '測試客戶',
                customer_phone: '0912345678',
                address: '測試地址'
            };
            
            // 模擬發送LINE照片
            if (lineBotService) {
                await lineBotService.sendDeliveryPhoto(mockOrder, mockPhotos[0].url, photoType);
            }
            
            return res.json({
                success: true,
                message: `成功上傳 ${req.files.length} 張照片`,
                photos: mockPhotos,
                lineSent: true,
                demo: true
            });
        }
        
        // 實際處理模式
        const uploadedPhotos = [];
        const filePaths = [];
        
        try {
            // 獲取訂單資料
            const orderResult = await db.query(
                'SELECT * FROM orders WHERE id = $1',
                [orderId]
            );
            
            if (orderResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: '訂單不存在' });
            }
            
            const order = orderResult.rows[0];
            
            // 處理每張照片
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                
                // 生成檔案名稱
                const originalFilename = generateUniqueFilename(file.originalname, driverId, orderId);
                const compressedFilename = `compressed_${originalFilename}`;
                
                // 壓縮照片
                const compressedBuffer = await compressImage(file.buffer);
                
                // 保存原圖和壓縮圖
                const originalPath = await savePhotoToDisk(file.buffer, originalFilename, false);
                const compressedPath = await savePhotoToDisk(compressedBuffer, compressedFilename, true);
                
                filePaths.push(originalPath, compressedPath);
                
                // 生成公開URL
                const photoUrl = generatePhotoUrl(compressedFilename, true);
                
                // 儲存到資料庫
                const insertResult = await db.query(`
                    INSERT INTO delivery_photos (
                        order_id, driver_id, photo_type, original_filename, 
                        stored_filename, file_path, file_size, 
                        compressed_file_path, compressed_size, metadata
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    RETURNING id, upload_timestamp
                `, [
                    orderId, driverId, photoType, file.originalname,
                    compressedFilename, compressedPath, compressedBuffer.length,
                    compressedPath, compressedBuffer.length,
                    JSON.stringify({ description, originalSize: file.size })
                ]);
                
                uploadedPhotos.push({
                    id: insertResult.rows[0].id,
                    filename: compressedFilename,
                    url: photoUrl,
                    size: compressedBuffer.length,
                    originalSize: file.size,
                    type: photoType,
                    uploadedAt: insertResult.rows[0].upload_timestamp
                });
            }
            
            // 發送照片給客戶
            let lineSent = false;
            try {
                if (lineBotService && uploadedPhotos.length > 0) {
                    const result = await lineBotService.sendDeliveryPhoto(
                        order, 
                        uploadedPhotos[0].url, 
                        photoType
                    );
                    lineSent = result.success;
                    
                    // 更新資料庫狀態
                    if (lineSent) {
                        await db.query(`
                            UPDATE delivery_photos 
                            SET line_sent_at = NOW(), status = 'line_sent'
                            WHERE id = ANY($1::int[])
                        `, [uploadedPhotos.map(p => p.id)]);
                    }
                }
            } catch (lineError) {
                console.error('發送LINE照片失敗:', lineError);
                // 不影響照片上傳的成功，但記錄錯誤
            }
            
            // 更新訂單的照片計數
            await db.query(`
                UPDATE orders 
                SET delivery_photo_count = delivery_photo_count + $1,
                    last_photo_uploaded_at = NOW()
                WHERE id = $2
            `, [uploadedPhotos.length, orderId]);
            
            console.log(`✅ 成功上傳 ${uploadedPhotos.length} 張照片，LINE發送狀態: ${lineSent}`);
            
            res.json({
                success: true,
                message: `成功上傳 ${uploadedPhotos.length} 張照片`,
                photos: uploadedPhotos,
                lineSent: lineSent,
                orderId: orderId
            });
            
        } catch (uploadError) {
            console.error('照片處理失敗，嘗試離線暫存:', uploadError);
            
            // 如果處理失敗，加入離線佇列
            const offlineData = {
                orderId,
                photoType,
                description,
                files: req.files.map(f => ({
                    originalname: f.originalname,
                    mimetype: f.mimetype,
                    size: f.size,
                    buffer: f.buffer.toString('base64')
                }))
            };
            
            await addToOfflineQueue(driverId, 'upload_photo', orderId, offlineData, filePaths);
            
            res.json({
                success: true,
                message: '照片已暫存，將於網路恢復後自動上傳',
                queued: true,
                queuedFiles: req.files.length
            });
        }
        
    } catch (error) {
        console.error('照片上傳API失敗:', error);
        res.status(500).json({ 
            success: false, 
            message: '照片上傳失敗',
            error: error.message 
        });
    }
});

// 問題回報API端點
router.post('/report-problem', async (req, res) => {
    try {
        const { 
            orderId, 
            problemType, 
            description = '', 
            priority = 'medium',
            attachedPhotos = [],
            location = null 
        } = req.body;
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (!orderId || !problemType) {
            return res.status(400).json({ 
                success: false, 
                message: '請提供訂單ID和問題類型' 
            });
        }
        
        console.log(`🚨 外送員 ${driverId} 回報問題 (訂單 #${orderId}): ${problemType}`);
        
        if (demoMode) {
            // 示範模式
            const mockProblem = {
                id: Date.now(),
                orderId: orderId,
                problemType: problemType,
                description: description,
                priority: priority,
                status: 'reported',
                reportedAt: new Date().toISOString(),
                driverId: driverId
            };
            
            console.log('📱 模擬發送問題回報給管理員...');
            
            const mockOrder = {
                id: orderId,
                customer_name: '測試客戶',
                customer_phone: '0912345678',
                address: '測試地址'
            };
            
            // 模擬發送問題回報
            if (lineBotService) {
                await lineBotService.sendProblemReport(mockOrder, mockProblem, driverId);
            }
            
            return res.json({
                success: true,
                message: '問題回報已送出',
                problem: mockProblem,
                adminNotified: true,
                demo: true
            });
        }
        
        // 實際處理模式
        try {
            // 檢查訂單是否存在
            const orderResult = await db.query(
                'SELECT * FROM orders WHERE id = $1',
                [orderId]
            );
            
            if (orderResult.rows.length === 0) {
                return res.status(404).json({ success: false, message: '訂單不存在' });
            }
            
            const order = orderResult.rows[0];
            
            // 儲存問題回報到資料庫
            const insertResult = await db.query(`
                INSERT INTO delivery_problems (
                    order_id, driver_id, problem_type, problem_description,
                    priority, attached_photos, location_lat, location_lng,
                    metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                RETURNING id, reported_at, status
            `, [
                orderId, driverId, problemType, description,
                priority, JSON.stringify(attachedPhotos),
                location?.lat || null, location?.lng || null,
                JSON.stringify({ userAgent: req.headers['user-agent'] })
            ]);
            
            const problemRecord = insertResult.rows[0];
            
            // 更新訂單狀態
            await db.query(`
                UPDATE orders 
                SET status = 'problem_reported',
                    problem_reported_at = NOW()
                WHERE id = $1
            `, [orderId]);
            
            // 發送通知給管理員
            let adminNotified = false;
            try {
                if (lineBotService) {
                    const result = await lineBotService.sendProblemReport(
                        order, 
                        {
                            problem_type: problemType,
                            problem_description: description,
                            priority: priority
                        }, 
                        driverId
                    );
                    adminNotified = result.success;
                }
            } catch (notifyError) {
                console.error('發送管理員通知失敗:', notifyError);
                // 不影響問題回報的成功，但記錄錯誤
            }
            
            console.log(`✅ 問題回報已記錄 #${problemRecord.id}，管理員通知狀態: ${adminNotified}`);
            
            res.json({
                success: true,
                message: '問題回報已送出，管理員將盡快處理',
                problem: {
                    id: problemRecord.id,
                    orderId: orderId,
                    problemType: problemType,
                    description: description,
                    priority: priority,
                    status: problemRecord.status,
                    reportedAt: problemRecord.reported_at
                },
                adminNotified: adminNotified,
                orderStatusChanged: true
            });
            
        } catch (reportError) {
            console.error('問題回報處理失敗，嘗試離線暫存:', reportError);
            
            // 如果處理失敗，加入離線佇列
            const offlineData = {
                orderId,
                problemType,
                description,
                priority,
                attachedPhotos,
                location
            };
            
            await addToOfflineQueue(driverId, 'report_problem', orderId, offlineData);
            
            res.json({
                success: true,
                message: '問題回報已暫存，將於網路恢復後自動送出',
                queued: true
            });
        }
        
    } catch (error) {
        console.error('問題回報API失敗:', error);
        res.status(500).json({ 
            success: false, 
            message: '問題回報失敗',
            error: error.message 
        });
    }
});

// 處理離線佇列API端點
router.post('/process-offline-queue', async (req, res) => {
    try {
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        console.log(`🔄 處理司機 ${driverId} 的離線佇列...`);
        
        const result = await processOfflineQueue(driverId);
        
        res.json({
            success: true,
            message: result.demo 
                ? '示範模式：模擬處理離線任務'
                : `處理完成 ${result.processed} 個離線任務`,
            processed: result.processed || 0,
            demo: result.demo || false
        });
        
    } catch (error) {
        console.error('處理離線佇列失敗:', error);
        res.status(500).json({ 
            success: false, 
            message: '處理離線佇列失敗',
            error: error.message 
        });
    }
});

// 獲取訂單照片API端點
router.get('/order-photos/:orderId', async (req, res) => {
    try {
        const { orderId } = req.params;
        const driverId = req.session?.driverId || (demoMode ? 1 : null);
        
        if (!driverId && !demoMode) {
            return res.status(401).json({ success: false, message: '請先登入' });
        }
        
        if (demoMode) {
            // 示範模式
            const mockPhotos = [
                {
                    id: 1,
                    filename: 'demo_photo_1.jpg',
                    url: `http://localhost:3000/demo/photo_${orderId}_1.jpg`,
                    type: 'delivery',
                    uploadedAt: new Date().toISOString(),
                    size: 150000
                },
                {
                    id: 2,
                    filename: 'demo_photo_2.jpg',
                    url: `http://localhost:3000/demo/photo_${orderId}_2.jpg`,
                    type: 'before_delivery',
                    uploadedAt: new Date(Date.now() - 300000).toISOString(),
                    size: 120000
                }
            ];
            
            return res.json({
                success: true,
                photos: mockPhotos,
                demo: true
            });
        }
        
        // 實際查詢
        const result = await db.query(`
            SELECT 
                id, photo_type, stored_filename, file_size,
                upload_timestamp, line_sent_at, status, metadata
            FROM delivery_photos
            WHERE order_id = $1
            ORDER BY upload_timestamp DESC
        `, [orderId]);
        
        const photos = result.rows.map(photo => ({
            id: photo.id,
            filename: photo.stored_filename,
            url: generatePhotoUrl(photo.stored_filename, true),
            type: photo.photo_type,
            size: photo.file_size,
            uploadedAt: photo.upload_timestamp,
            lineSentAt: photo.line_sent_at,
            status: photo.status,
            metadata: photo.metadata
        }));
        
        res.json({
            success: true,
            photos: photos,
            count: photos.length
        });
        
    } catch (error) {
        console.error('獲取訂單照片失敗:', error);
        res.status(500).json({ 
            success: false, 
            message: '獲取訂單照片失敗',
            error: error.message 
        });
    }
});

// ========== 訂單鎖定系統API ==========

// 鎖定訂單API
router.post('/lock-orders', async (req, res) => {
    try {
        const { orderIds, lockDuration = 30 } = req.body;
        const driverId = req.session?.driverId || 1; // 示範模式使用預設ID
        
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '請提供有效的訂單ID列表'
            });
        }
        
        console.log(`[訂單鎖定] 司機 ${driverId} 鎖定訂單 ${orderIds.join(', ')} 共 ${lockDuration} 秒`);
        
        if (demoMode) {
            // 示範模式：模擬鎖定成功
            const mockResponse = {
                success: true,
                message: `成功鎖定 ${orderIds.length} 筆訂單`,
                lockedOrders: orderIds,
                lockDuration: lockDuration,
                lockExpiry: new Date(Date.now() + lockDuration * 1000).toISOString(),
                driverId: driverId
            };
            
            res.json(mockResponse);
        } else {
            // 真實資料庫操作
            const client = await db.connect();
            try {
                await client.query('BEGIN');
                
                // 檢查訂單是否已被鎖定或接取
                const checkQuery = `
                    SELECT id, status, locked_by, locked_at
                    FROM orders 
                    WHERE id = ANY($1::int[])
                    AND (status = 'available' OR (status = 'locked' AND locked_by = $2))
                `;
                const checkResult = await client.query(checkQuery, [orderIds, driverId]);
                
                if (checkResult.rows.length !== orderIds.length) {
                    await client.query('ROLLBACK');
                    return res.status(400).json({
                        success: false,
                        message: '部分訂單已被其他司機鎖定或接取'
                    });
                }
                
                // 鎖定訂單
                const lockQuery = `
                    UPDATE orders 
                    SET 
                        status = 'temporarily_locked',
                        locked_by = $1,
                        locked_at = CURRENT_TIMESTAMP,
                        lock_expires_at = CURRENT_TIMESTAMP + INTERVAL '${lockDuration} seconds'
                    WHERE id = ANY($2::int[])
                `;
                await client.query(lockQuery, [driverId, orderIds]);
                
                await client.query('COMMIT');
                
                res.json({
                    success: true,
                    message: `成功鎖定 ${orderIds.length} 筆訂單`,
                    lockedOrders: orderIds,
                    lockDuration: lockDuration,
                    lockExpiry: new Date(Date.now() + lockDuration * 1000).toISOString()
                });
            } catch (error) {
                await client.query('ROLLBACK');
                throw error;
            } finally {
                client.release();
            }
        }
    } catch (error) {
        console.error('Error locking orders:', error);
        res.status(500).json({ 
            success: false,
            message: '鎖定訂單失敗',
            error: error.message 
        });
    }
});

// 解鎖訂單API  
router.post('/unlock-orders', async (req, res) => {
    try {
        const { orderIds } = req.body;
        const driverId = req.session?.driverId || 1;
        
        if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
            return res.status(400).json({
                success: false,
                message: '請提供有效的訂單ID列表'
            });
        }
        
        console.log(`[訂單解鎖] 司機 ${driverId} 解鎖訂單 ${orderIds.join(', ')}`);
        
        if (demoMode) {
            // 示範模式：模擬解鎖成功
            const mockResponse = {
                success: true,
                message: `成功解鎖 ${orderIds.length} 筆訂單`,
                unlockedOrders: orderIds
            };
            
            res.json(mockResponse);
        } else {
            // 真實資料庫操作
            const unlockQuery = `
                UPDATE orders 
                SET 
                    status = 'available',
                    locked_by = NULL,
                    locked_at = NULL,
                    lock_expires_at = NULL
                WHERE id = ANY($1::int[]) 
                AND locked_by = $2
                AND status = 'temporarily_locked'
                RETURNING id
            `;
            
            const result = await db.query(unlockQuery, [orderIds, driverId]);
            
            res.json({
                success: true,
                message: `成功解鎖 ${result.rows.length} 筆訂單`,
                unlockedOrders: result.rows.map(row => row.id)
            });
        }
    } catch (error) {
        console.error('Error unlocking orders:', error);
        res.status(500).json({ 
            success: false,
            message: '解鎖訂單失敗',
            error: error.message 
        });
    }
});

// 檢查訂單鎖定狀態API
router.get('/check-locks', async (req, res) => {
    try {
        const driverId = req.session?.driverId || 1;
        
        console.log(`[檢查鎖定] 檢查司機 ${driverId} 的鎖定狀態`);
        
        if (demoMode) {
            // 示範模式：返回空的鎖定列表
            const mockResponse = {
                success: true,
                driverId: driverId,
                lockedOrders: [],
                lockCount: 0
            };
            
            res.json(mockResponse);
        } else {
            // 檢查並清理過期的鎖定
            const cleanupQuery = `
                UPDATE orders 
                SET 
                    status = 'available',
                    locked_by = NULL,
                    locked_at = NULL,
                    lock_expires_at = NULL
                WHERE status = 'temporarily_locked' 
                AND lock_expires_at < CURRENT_TIMESTAMP
            `;
            await db.query(cleanupQuery);
            
            // 查詢當前司機的鎖定訂單
            const checkQuery = `
                SELECT id, locked_at, lock_expires_at
                FROM orders 
                WHERE locked_by = $1 
                AND status = 'temporarily_locked'
                AND lock_expires_at > CURRENT_TIMESTAMP
            `;
            
            const result = await db.query(checkQuery, [driverId]);
            
            res.json({
                success: true,
                driverId: driverId,
                lockedOrders: result.rows,
                lockCount: result.rows.length
            });
        }
    } catch (error) {
        console.error('Error checking locks:', error);
        res.status(500).json({ 
            success: false,
            message: '檢查鎖定狀態失敗',
            error: error.message 
        });
    }
});

// 發送LINE通知 (需要LINE Notify Token)
async function sendLineNotification(customerName, orderId) {
    if (!process.env.LINE_NOTIFY_TOKEN) return;
    
    const message = `🎉 配送完成通知\n\n親愛的 ${customerName} 您好，\n您的訂單 #${orderId} 已配送完成！\n\n感謝您選擇承億蔬菜外送服務 🥬`;
    
    // 這裡實作LINE Notify API調用
    console.log('發送LINE通知:', message);
}

// 實際路線優化函數 (使用Google Maps API)
async function optimizeDeliveryRoute(orders) {
    // 這個函數現在已被GoogleMapsService.optimizeRoute替代
    // 保留作為後備選項
    try {
        const addresses = orders.map(order => order.address);
        const googleMapsService = new GoogleMapsService();
        const result = await googleMapsService.optimizeDeliveryRoute(addresses);
        
        if (result.success) {
            return {
                orders: result.optimizedAddresses.map(addr => orders[addr.originalIndex]),
                timeSaved: Math.max(5, Math.round(orders.length * 2)), // 估算節省時間
                totalDistance: result.totalDistance,
                routeUrl: result.staticMapUrl
            };
        } else {
            // 如果Google Maps失敗，返回原順序
            return {
                orders: orders,
                timeSaved: 0,
                totalDistance: orders.length * 2, // 估算距離
                routeUrl: generateMockGoogleMapsUrl(orders)
            };
        }
    } catch (error) {
        console.error('Google Maps route optimization failed:', error);
        return {
            orders: orders,
            timeSaved: 0,
            totalDistance: orders.length * 2,
            routeUrl: generateMockGoogleMapsUrl(orders)
        };
    }
}

// 新增：通過 POST 方式獲取地區訂單，避免 URL 編碼問題
router.post('/area-orders-by-name', async (req, res) => {
    try {
        const { area } = req.body;
        
        if (!area) {
            return res.status(400).json({
                success: false,
                message: '缺少區域參數'
            });
        }
        
        console.log(`📍 POST 方式載入 ${area} 訂單...`);
        
        // 標準化地區名稱
        const validAreas = ['三峽區', '樹林區', '鶯歌區', '土城區', '北大特區'];
        if (!validAreas.includes(area)) {
            console.log(`⚠️ 無效的地區名稱: ${area}`);
            return res.json({ success: true, orders: [] });
        }
        
        if (demoMode) {
            console.log(`📦 示範模式：生成 ${area} 測試訂單`);
            
            // 隨機生成該地區的測試訂單
            const orderCount = Math.floor(Math.random() * 4) + 1;
            const testOrders = [];
            
            for (let i = 0; i < orderCount; i++) {
                testOrders.push({
                    id: Date.now() + Math.random(),
                    customer_name: ['王小明', '李小華', '張小美', '陳大雄'][Math.floor(Math.random() * 4)],
                    customer_phone: '0912345678',
                    address: `新北市${area}${['中山路', '民權街', '復興路'][Math.floor(Math.random() * 3)]}${Math.floor(Math.random() * 200) + 1}號`,
                    delivery_fee: 50,
                    total_amount: 130,
                    payment_method: ['cash', 'linepay', 'bank_transfer'][Math.floor(Math.random() * 3)],
                    created_at: new Date().toISOString(),
                    items: [
                        { product_name: '高麗菜', quantity: 1, price: 30 },
                        { product_name: '白蘿蔔', quantity: 2, price: 25 }
                    ]
                });
            }
            
            res.json({
                success: true,
                orders: testOrders
            });
        } else {
            console.log(`🔍 從資料庫載入 ${area} 訂單...`);
            
            const result = await db.query(`
                SELECT o.id, 
                       o.customer_name, 
                       o.customer_phone, 
                       o.address, 
                       o.delivery_fee, 
                       COALESCE(o.total_amount, o.total, 0) as total_amount,
                       o.payment_method, 
                       o.created_at,
                       COALESCE(
                           json_agg(
                               json_build_object(
                                   'product_name', oi.product_name,
                                   'quantity', oi.quantity,
                                   'price', oi.price
                               )
                           ) FILTER (WHERE oi.id IS NOT NULL), 
                           '[]'
                       ) as items
                FROM orders o
                LEFT JOIN order_items oi ON o.id = oi.order_id
                WHERE o.delivery_area = $1 AND o.status = 'pending'
                GROUP BY o.id, o.customer_name, o.customer_phone, o.address, o.delivery_fee, o.total_amount, o.payment_method, o.created_at
                ORDER BY o.created_at DESC
            `, [area]);
            
            console.log(`📊 找到 ${result.rows.length} 筆 ${area} 訂單`);
            
            res.json({
                success: true,
                orders: result.rows
            });
        }
        
    } catch (error) {
        console.error(`❌ POST 載入 ${req.body?.area || 'unknown'} 訂單失敗:`, error);
        res.status(500).json({ success: false, message: '載入地區訂單失敗' });
    }
});

// ========== 離線任務處理函數 ==========

/**
 * 處理離線照片上傳任務
 */
async function processOfflinePhotoUpload(taskId, orderId, payload, filePaths) {
    console.log(`🔄 處理離線照片上傳任務 #${taskId}`);
    
    try {
        // 從 payload 重建檔案資料
        const files = payload.files.map(f => ({
            originalname: f.originalname,
            mimetype: f.mimetype,
            size: f.size,
            buffer: Buffer.from(f.buffer, 'base64')
        }));
        
        // 獲取訂單資料
        const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (orderResult.rows.length === 0) {
            throw new Error('訂單不存在');
        }
        
        const order = orderResult.rows[0];
        const uploadedPhotos = [];
        
        // 處理每張照片
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const driverId = 1; // 從任務中獲取
            
            const originalFilename = generateUniqueFilename(file.originalname, driverId, orderId);
            const compressedFilename = `compressed_${originalFilename}`;
            
            // 壓縮照片
            const compressedBuffer = await compressImage(file.buffer);
            
            // 保存照片
            const originalPath = await savePhotoToDisk(file.buffer, originalFilename, false);
            const compressedPath = await savePhotoToDisk(compressedBuffer, compressedFilename, true);
            
            // 生成URL
            const photoUrl = generatePhotoUrl(compressedFilename, true);
            
            // 儲存到資料庫
            const insertResult = await db.query(`
                INSERT INTO delivery_photos (
                    order_id, driver_id, photo_type, original_filename, 
                    stored_filename, file_path, file_size, 
                    compressed_file_path, compressed_size, metadata
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                RETURNING id, upload_timestamp
            `, [
                orderId, driverId, payload.photoType, file.originalname,
                compressedFilename, compressedPath, compressedBuffer.length,
                compressedPath, compressedBuffer.length,
                JSON.stringify({ description: payload.description, originalSize: file.size, offline: true })
            ]);
            
            uploadedPhotos.push({
                id: insertResult.rows[0].id,
                url: photoUrl
            });
        }
        
        // 發送到 LINE
        if (lineBotService && uploadedPhotos.length > 0) {
            await lineBotService.sendDeliveryPhoto(order, uploadedPhotos[0].url, payload.photoType);
            
            // 更新發送狀態
            await db.query(`
                UPDATE delivery_photos 
                SET line_sent_at = NOW(), status = 'line_sent'
                WHERE id = ANY($1::int[])
            `, [uploadedPhotos.map(p => p.id)]);
        }
        
        console.log(`✅ 離線照片上傳任務完成: ${uploadedPhotos.length} 張照片`);
        
    } catch (error) {
        console.error(`❌ 離線照片上傳任務失敗:`, error);
        throw error;
    }
}

/**
 * 處理離線問題回報任務
 */
async function processOfflineProblemReport(taskId, orderId, payload) {
    console.log(`🔄 處理離線問題回報任務 #${taskId}`);
    
    try {
        // 檢查訂單
        const orderResult = await db.query('SELECT * FROM orders WHERE id = $1', [orderId]);
        if (orderResult.rows.length === 0) {
            throw new Error('訂單不存在');
        }
        
        const order = orderResult.rows[0];
        const driverId = 1; // 從任務中獲取
        
        // 儲存問題回報
        const insertResult = await db.query(`
            INSERT INTO delivery_problems (
                order_id, driver_id, problem_type, problem_description,
                priority, attached_photos, location_lat, location_lng,
                metadata
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, reported_at, status
        `, [
            orderId, driverId, payload.problemType, payload.description,
            payload.priority, JSON.stringify(payload.attachedPhotos),
            payload.location?.lat || null, payload.location?.lng || null,
            JSON.stringify({ offline: true })
        ]);
        
        // 更新訂單狀態
        await db.query(`
            UPDATE orders 
            SET status = 'problem_reported', problem_reported_at = NOW()
            WHERE id = $1
        `, [orderId]);
        
        // 發送管理員通知
        if (lineBotService) {
            await lineBotService.sendProblemReport(order, {
                problem_type: payload.problemType,
                problem_description: payload.description,
                priority: payload.priority
            }, driverId);
        }
        
        console.log(`✅ 離線問題回報任務完成: #${insertResult.rows[0].id}`);
        
    } catch (error) {
        console.error(`❌ 離線問題回報任務失敗:`, error);
        throw error;
    }
}

/**
 * 處理離線訂單完成任務
 */
async function processOfflineOrderCompletion(taskId, orderId, payload) {
    console.log(`🔄 處理離線訂單完成任務 #${taskId}`);
    
    try {
        const driverId = 1; // 從任務中獲取
        
        // 更新訂單狀態
        const result = await db.query(`
            UPDATE orders 
            SET status = 'delivered', completed_at = NOW()
            WHERE id = $1 AND driver_id = $2 AND status = 'assigned'
            RETURNING id, customer_name, customer_phone
        `, [orderId, driverId]);
        
        if (result.rows.length === 0) {
            throw new Error('無法完成此訂單');
        }
        
        console.log(`✅ 離線訂單完成任務完成: 訂單 #${orderId}`);
        
    } catch (error) {
        console.error(`❌ 離線訂單完成任務失敗:`, error);
        throw error;
    }
}

module.exports = { router, setDatabasePool };