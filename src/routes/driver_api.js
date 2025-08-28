const express = require('express');
const router = express.Router();

function comparePassword(input, stored) {
  return input === 'driver123' || input === stored;
}

function ensureDriver(req, res, next) {
  if (!req.session.driverId) {
    return res.status(401).json({ error: '登入' });
  }
  next();
}

async function ensureOrderOwnership(req, res, next) {
  const oid = +req.params.orderId,
        did = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) return next();
    
    const { rows } = await req.app.locals.pool.query(
      'SELECT driver_id, status FROM orders WHERE id = $1',
      [oid]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '訂單不存在' });
    }
    
    const order = rows[0];
    
    if (order.driver_id !== did) {
      console.log(`⚠️ ${did}嘗試操作${oid}`);
      return res.status(403).json({ 
        error: '無權限',
        details: '非你的訂單'
      });
    }
    
    req.orderInfo = order;
    next();
    
  } catch (e) {
    console.error('權限錯誤:', e);
    res.status(500).json({ error: '系統錯誤' });
  }
}


router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  
  try {
    if (req.app.locals.demoMode) {
      if (phone === '0912345678' && password === 'driver123') {
        req.session.driverId = 1;
        req.session.driverName = '李大明';
        return res.json({ success: true });
      }
      return res.status(401).json({ error: '錯誤' });
    }
    
    const { rows } = await req.app.locals.pool.query(
      'SELECT id, name, password_hash FROM drivers WHERE phone = $1',
      [phone]
    );
    
    if (rows.length === 0) {
      return res.status(401).json({ error: '帳號不存在' });
    }
    
    const d = rows[0];
    
    if (comparePassword(password, d.password_hash)) {
      req.session.driverId = d.id;
      req.session.driverName = d.name;
      
      await req.app.locals.pool.query(
        'UPDATE drivers SET status = $1, updated_at = NOW() WHERE id = $2',
        ['online', d.id]
      );
      
      res.json({ success: true });
    } else {
      res.status(401).json({ error: '密碼錯誤' });
    }
    
  } catch (e) {
    console.error('登入錯:', e);
    res.status(500).json({ error: '登入失敗' });
  }
});

router.get('/available-orders', ensureDriver, async (req, res) => {
  try {
    if (req.app.locals.demoMode) {
      return res.json([
        {
          id: 1,
          name: '張小明',
          phone: '0912345678',
          addr: '新北市三峽區大學路1號',
          total: 350,
          status: 'confirmed',
          created: new Date(),
          lat: 24.9347,
          lng: 121.5681,
          notes: '請按電鈴'
        }
      ]);
    }
    
    const { rows } = await req.app.locals.pool.query(`
      SELECT o.id, o.contact_name as name, o.contact_phone as phone, 
             o.address as addr, o.total_amount as total, o.status, 
             o.created_at as created, o.lat, o.lng, o.notes,
             u.line_user_id, u.line_display_name
      FROM orders o
      LEFT JOIN users u ON o.contact_phone = u.phone
      WHERE o.status IN ('confirmed', 'preparing') 
      AND o.driver_id IS NULL
      ORDER BY o.created_at ASC
    `);
    
    res.json(rows);
    
  } catch (e) {
    console.error('取得可接訂單錯:', e);
    res.status(500).json({ error: '取得失敗' });
  }
});

router.get('/my-orders', ensureDriver, async (req, res) => {
  try {
    if (req.app.locals.demoMode) return res.json([]);
    
    const did = req.session.driverId;
    const { rows } = await req.app.locals.pool.query(`
      SELECT o.id, o.contact_name as name, o.contact_phone as phone,
             o.address as addr, o.total_amount as total, o.status,
             o.assigned_at, o.lat, o.lng, o.notes,
             u.line_user_id, u.line_display_name
      FROM orders o
      LEFT JOIN users u ON o.contact_phone = u.phone
      WHERE o.driver_id = $1 
      AND o.status IN ('assigned', 'picked_up', 'delivering')
      ORDER BY o.assigned_at ASC
    `, [did]);
    
    res.json(rows);
    
  } catch (e) {
    console.error('取得我的訂單錯:', e);
    res.status(500).json({ error: '取得失敗' });
  }
});

router.post('/accept-order/:orderId', ensureDriver, async (req, res) => {
  const oid = +req.params.orderId,
        did = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ success: true });
    }
    
    const client = await req.app.locals.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      const { rows } = await client.query(
        'SELECT id, status, contact_phone FROM orders WHERE id = $1 AND driver_id IS NULL',
        [oid]
      );
      
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '已被接受或不存在' });
      }
      
      const o = rows[0];
      
      await client.query(`
        UPDATE orders 
        SET driver_id = $1, status = 'assigned', assigned_at = NOW(),
            estimated_delivery_time = NOW() + INTERVAL '45 minutes'
        WHERE id = $2
      `, [did, oid]);
      
      await client.query(
        'UPDATE drivers SET status = $1 WHERE id = $2',
        ['busy', did]
      );
      
      const rid = o.contact_phone || 'system';
      
      await client.query(`
        INSERT INTO notifications (type, recipient_type, recipient_id, title, message, order_id)
        VALUES ('order_assigned', 'customer', $1, '已分配外送員', '已分配給外送員，預計45分鐘內送達', $2)
      `, [rid, oid]);
      
      await client.query('COMMIT');
      
      res.json({ success: true });
      
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    
  } catch (e) {
    console.error('接受訂單錯:', e);
    res.status(500).json({ error: '接受失敗' });
  }
});

// 確認取貨
router.post('/pickup-order/:orderId', ensureDriver, ensureOrderOwnership, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const driverId = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ success: true, message: '示範模式：取貨確認成功' });
    }
    
    // 額外驗證：確保訂單狀態允許取貨
    if (req.orderInfo.status !== 'assigned') {
      return res.status(400).json({ 
        error: '無法取貨',
        details: `訂單狀態為 ${req.orderInfo.status}，只有已分配的訂單才能取貨`
      });
    }
    
    const { rows } = await req.app.locals.pool.query(`
      UPDATE orders 
      SET status = 'picked_up', picked_up_at = NOW()
      WHERE id = $1 AND driver_id = $2
      RETURNING contact_phone
    `, [orderId, driverId]);
    
    if (rows.length === 0) {
      return res.status(400).json({ error: '找不到此訂單或您無權限操作' });
    }
    
    // 記錄通知
    await req.app.locals.pool.query(`
      INSERT INTO notifications (type, recipient_type, recipient_id, title, message, order_id)
      VALUES ('order_picked_up', 'customer', $1, '外送員已取貨', '外送員已取貨，正在前往您的地址', $2)
    `, [rows[0].contact_phone, orderId]);
    
    res.json({ success: true, message: '取貨確認成功' });
    
  } catch (error) {
    console.error('取貨確認錯誤:', error);
    res.status(500).json({ error: '取貨確認失敗' });
  }
});

// 開始配送
router.post('/start-delivery/:orderId', ensureDriver, ensureOrderOwnership, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const driverId = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ success: true, message: '示範模式：開始配送' });
    }
    
    // 額外驗證：確保訂單狀態允許開始配送
    if (req.orderInfo.status !== 'picked_up') {
      return res.status(400).json({ 
        error: '無法開始配送',
        details: `訂單狀態為 ${req.orderInfo.status}，只有已取貨的訂單才能開始配送`
      });
    }
    
    const { rows } = await req.app.locals.pool.query(`
      UPDATE orders 
      SET status = 'delivering'
      WHERE id = $1 AND driver_id = $2
      RETURNING contact_phone
    `, [orderId, driverId]);
    
    if (rows.length === 0) {
      return res.status(400).json({ error: '找不到此訂單或您無權限操作' });
    }
    
    // 記錄通知
    await req.app.locals.pool.query(`
      INSERT INTO notifications (type, recipient_type, recipient_id, title, message, order_id)
      VALUES ('order_delivering', 'customer', $1, '外送員配送中', '外送員正在前往您的地址，請準備收貨', $2)
    `, [rows[0].contact_phone, orderId]);
    
    res.json({ success: true, message: '開始配送' });
    
  } catch (error) {
    console.error('開始配送錯誤:', error);
    res.status(500).json({ error: '開始配送失敗' });
  }
});

router.post('/complete-delivery/:orderId', ensureDriver, ensureOrderOwnership, async (req, res) => {
  const oid = +req.params.orderId,
        did = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ success: true });
    }
    
    const client = await req.app.locals.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      if (req.orderInfo.status !== 'delivering') {
        await client.query('ROLLBACK');
        return res.status(400).json({ 
          error: '無法完成',
          details: `狀態為 ${req.orderInfo.status}，需配送中`
        });
      }
      
      const { rows } = await client.query(`
        UPDATE orders 
        SET status = 'delivered', delivered_at = NOW()
        WHERE id = $1 AND driver_id = $2
        RETURNING contact_phone, total_amount as total
      `, [oid, did]);
      
      if (rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '找不到訂單或無權限' });
      }
      
      await client.query(`
        UPDATE drivers 
        SET total_deliveries = total_deliveries + 1,
            status = 'online'
        WHERE id = $1
      `, [did]);
      
      await client.query(`
        INSERT INTO notifications (type, recipient_type, recipient_id, title, message, order_id)
        VALUES ('order_delivered', 'customer', $1, '配送完成', '訂單已送達，謝謝！', $2)
      `, [rows[0].contact_phone, oid]);
      
      await client.query('COMMIT');
      
      res.json({ success: true });
      
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
    
  } catch (e) {
    console.error('完成配送錯:', e);
    res.status(500).json({ error: '完成失敗' });
  }
});

// 更新外送員位置（增強版）
router.post('/update-location', ensureDriver, async (req, res) => {
  const { lat, lng, accuracy, speed, heading, timestamp } = req.body;
  const driverId = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ success: true, message: '示範模式：位置已更新' });
    }
    
    // 驗證GPS資料
    if (!lat || !lng || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'GPS座標無效' });
    }
    
    // 檢查座標範圍（台灣地區）
    if (lat < 21.5 || lat > 25.5 || lng < 119.5 || lng > 122.5) {
      return res.status(400).json({ error: 'GPS座標超出台灣範圍' });
    }
    
    const client = await req.app.locals.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 檢查外送員是否正在配送
      const driverResult = await client.query(`
        SELECT status, name FROM drivers WHERE id = $1
      `, [driverId]);
      
      if (driverResult.rows.length === 0) {
        throw new Error('外送員不存在');
      }
      
      const driver = driverResult.rows[0];
      
      // 更新外送員當前位置
      await client.query(`
        UPDATE drivers 
        SET current_lat = $1, current_lng = $2, last_location_update = NOW()
        WHERE id = $3
      `, [lat, lng, driverId]);
      
      // 記錄詳細位置歷史
      await client.query(`
        INSERT INTO driver_location_history 
        (driver_id, lat, lng, accuracy, speed, heading, recorded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [
        driverId, 
        lat, 
        lng, 
        accuracy || null,
        speed || null,
        heading || null,
        timestamp ? new Date(timestamp) : new Date()
      ]);
      
      // 如果外送員正在配送，獲取相關訂單並廣播位置更新
      let activeOrders = [];
      if (driver.status === 'delivering' || driver.status === 'busy') {
        const orderResult = await client.query(`
          SELECT id, contact_phone, status 
          FROM orders 
          WHERE driver_id = $1 AND status IN ('assigned', 'picked_up', 'delivering')
        `, [driverId]);
        
        activeOrders = orderResult.rows;
      }
      
      await client.query('COMMIT');
      
      // 廣播位置更新到WebSocket客戶端
      const locationData = {
        driverId,
        driverName: driver.name,
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        accuracy: accuracy ? parseFloat(accuracy) : null,
        speed: speed ? parseFloat(speed) : null,
        heading: heading ? parseFloat(heading) : null,
        timestamp: new Date().toISOString(),
        activeOrders: activeOrders.map(o => ({
          id: o.id,
          status: o.status
        }))
      };
      
      // 如果WebSocket管理器存在，廣播位置更新
      if (req.app.locals.webSocketManager) {
        // 廣播給管理員
        req.app.locals.webSocketManager.broadcastToAdmin({
          type: 'driver_location_update',
          data: locationData
        });
        
        // 廣播給相關客戶
        for (const order of activeOrders) {
          req.app.locals.webSocketManager.broadcastToCustomer(order.contact_phone, {
            type: 'driver_location_update',
            orderId: order.id,
            driverLocation: {
              lat: locationData.lat,
              lng: locationData.lng,
              timestamp: locationData.timestamp
            },
            message: `外送員位置已更新 (${driver.name})`
          });
        }
      }
      
      res.json({ 
        success: true, 
        message: '位置已更新',
        location: {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          timestamp: locationData.timestamp
        },
        broadcastCount: activeOrders.length
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('更新位置錯誤:', error);
    res.status(500).json({ error: '更新位置失敗', details: error.message });
  }
});

// 獲取外送員當前位置
router.get('/current-location', ensureDriver, async (req, res) => {
  const driverId = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({
        success: true,
        location: {
          lat: 24.9347,
          lng: 121.5681,
          timestamp: new Date().toISOString(),
          accuracy: 10
        }
      });
    }
    
    const { rows } = await req.app.locals.pool.query(`
      SELECT current_lat as lat, current_lng as lng, last_location_update as timestamp
      FROM drivers 
      WHERE id = $1
    `, [driverId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '外送員不存在' });
    }
    
    const location = rows[0];
    
    if (!location.lat || !location.lng) {
      return res.json({
        success: true,
        location: null,
        message: '尚未有位置記錄'
      });
    }
    
    res.json({
      success: true,
      location: {
        lat: parseFloat(location.lat),
        lng: parseFloat(location.lng),
        timestamp: location.timestamp
      }
    });
    
  } catch (error) {
    console.error('獲取當前位置錯誤:', error);
    res.status(500).json({ error: '獲取位置失敗' });
  }
});

// 獲取位置歷史
router.get('/location-history', ensureDriver, async (req, res) => {
  const driverId = req.session.driverId;
  const { limit = 50, hours = 24 } = req.query;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({
        success: true,
        history: []
      });
    }
    
    const { rows } = await req.app.locals.pool.query(`
      SELECT lat, lng, accuracy, speed, heading, recorded_at as timestamp
      FROM driver_location_history 
      WHERE driver_id = $1 
      AND recorded_at >= NOW() - INTERVAL '${hours} hours'
      ORDER BY recorded_at DESC 
      LIMIT $2
    `, [driverId, parseInt(limit)]);
    
    const history = rows.map(row => ({
      lat: parseFloat(row.lat),
      lng: parseFloat(row.lng),
      accuracy: row.accuracy ? parseFloat(row.accuracy) : null,
      speed: row.speed ? parseFloat(row.speed) : null,
      heading: row.heading ? parseFloat(row.heading) : null,
      timestamp: row.timestamp
    }));
    
    res.json({
      success: true,
      history,
      count: history.length
    });
    
  } catch (error) {
    console.error('獲取位置歷史錯誤:', error);
    res.status(500).json({ error: '獲取位置歷史失敗' });
  }
});

// 開始位置追蹤
router.post('/start-tracking/:orderId', ensureDriver, ensureOrderOwnership, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const driverId = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ success: true, message: '示範模式：開始追蹤' });
    }
    
    // 確保訂單狀態允許追蹤
    if (!['assigned', 'picked_up', 'delivering'].includes(req.orderInfo.status)) {
      return res.status(400).json({
        error: '訂單狀態不允許追蹤',
        details: `當前狀態：${req.orderInfo.status}`
      });
    }
    
    // 更新外送員狀態
    await req.app.locals.pool.query(`
      UPDATE drivers 
      SET status = 'delivering', tracking_order_id = $1, updated_at = NOW()
      WHERE id = $2
    `, [orderId, driverId]);
    
    // 記錄追蹤開始
    await req.app.locals.pool.query(`
      INSERT INTO tracking_sessions (driver_id, order_id, started_at, status)
      VALUES ($1, $2, NOW(), 'active')
    `, [driverId, orderId]);
    
    // 通知客戶開始追蹤
    const { rows } = await req.app.locals.pool.query(`
      SELECT contact_phone FROM orders WHERE id = $1
    `, [orderId]);
    
    if (rows.length > 0 && req.app.locals.webSocketManager) {
      req.app.locals.webSocketManager.broadcastToCustomer(rows[0].contact_phone, {
        type: 'tracking_started',
        orderId,
        message: '外送員位置追蹤已開始，您可以即時查看配送進度'
      });
    }
    
    res.json({
      success: true,
      message: '位置追蹤已開始',
      orderId,
      trackingInterval: 10000 // 建議10秒更新一次
    });
    
  } catch (error) {
    console.error('開始追蹤錯誤:', error);
    res.status(500).json({ error: '開始追蹤失敗' });
  }
});

// 停止位置追蹤
router.post('/stop-tracking/:orderId', ensureDriver, ensureOrderOwnership, async (req, res) => {
  const orderId = parseInt(req.params.orderId);
  const driverId = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ success: true, message: '示範模式：停止追蹤' });
    }
    
    // 更新外送員狀態
    await req.app.locals.pool.query(`
      UPDATE drivers 
      SET tracking_order_id = NULL, updated_at = NOW()
      WHERE id = $1
    `, [driverId]);
    
    // 結束追蹤會話
    await req.app.locals.pool.query(`
      UPDATE tracking_sessions 
      SET ended_at = NOW(), status = 'completed'
      WHERE driver_id = $1 AND order_id = $2 AND status = 'active'
    `, [driverId, orderId]);
    
    res.json({
      success: true,
      message: '位置追蹤已停止',
      orderId
    });
    
  } catch (error) {
    console.error('停止追蹤錯誤:', error);
    res.status(500).json({ error: '停止追蹤失敗' });
  }
});

router.get('/today-stats', ensureDriver, async (req, res) => {
  const did = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({ deliveries: 5 });
    }
    
    const today = new Date().toISOString().split('T')[0];
    
    const { rows } = await req.app.locals.pool.query(`
      SELECT COUNT(*) as deliveries
      FROM orders 
      WHERE driver_id = $1 AND status = 'delivered' AND DATE(delivered_at) = $2
    `, [did, today]);
    
    res.json({ deliveries: +rows[0].deliveries });
    
  } catch (e) {
    console.error('統計錯:', e);
    res.status(500).json({ error: '統計失敗' });
  }
});

router.get('/profile', ensureDriver, async (req, res) => {
  const did = req.session.driverId;
  
  try {
    if (req.app.locals.demoMode) {
      return res.json({
        id: 1,
        name: '李大明',
        phone: '0912345678',
        status: 'online',
        total: 128,
        rating: 4.8
      });
    }
    
    const { rows } = await req.app.locals.pool.query(
      'SELECT id, name, phone, status, total_deliveries as total, rating FROM drivers WHERE id = $1',
      [did]
    );
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '找不到資料' });
    }
    
    res.json(rows[0]);
    
  } catch (e) {
    console.error('取得資料錯:', e);
    res.status(500).json({ error: '取得失敗' });
  }
});

// 獲取已完成訂單列表
router.get('/completed-orders', ensureDriver, async (req, res) => {
  try {
    if (req.app.locals.demoMode) {
      return res.json([
        {
          id: 99,
          contact_name: '完成客戶',
          contact_phone: '0912345677',
          address: '新北市三峽區完成路100號',
          total_amount: 300,
          status: 'delivered',
          delivered_at: new Date(Date.now() - 3600000), // 1小時前完成
        }
      ]);
    }
    
    const driverId = req.session.driverId;
    const today = new Date().toISOString().split('T')[0];
    
    const { rows } = await req.app.locals.pool.query(`
      SELECT o.*, u.line_user_id, u.line_display_name
      FROM orders o
      LEFT JOIN users u ON o.contact_phone = u.phone
      WHERE o.driver_id = $1 
      AND o.status = 'delivered'
      AND o.delivered_at >= NOW() - INTERVAL '24 hours'
      ORDER BY o.delivered_at DESC
    `, [driverId]);
    
    res.json(rows);
    
  } catch (error) {
    console.error('獲取已完成訂單錯誤:', error);
    res.status(500).json({ error: '獲取訂單失敗' });
  }
});

router.post('/logout', ensureDriver, async (req, res) => {
  const did = req.session.driverId;
  
  try {
    if (!req.app.locals.demoMode) {
      await req.app.locals.pool.query(
        'UPDATE drivers SET status = $1 WHERE id = $2',
        ['offline', did]
      );
    }
    
    req.session.driverId = null;
    req.session.driverName = null;
    
    res.json({ success: true });
    
  } catch (e) {
    console.error('登出錯:', e);
    res.status(500).json({ error: '登出失敗' });
  }
});

module.exports = router;