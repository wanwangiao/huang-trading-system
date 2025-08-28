// =====================================
// 智能路線規劃 API 路由
// 支援自動分組、路線優化、批次配送管理
// =====================================

const express = require('express');
const router = express.Router();

// 導入智能路線規劃服務
const RouteOptimizationService = require('../services/RouteOptimizationService');
const GeographicClusteringService = require('../services/GeographicClusteringService');
const GoogleMapsService = require('../services/GoogleMapsService');

// 創建服務實例
const routeOptimizer = new RouteOptimizationService();
const clusteringService = new GeographicClusteringService();
const mapsService = new GoogleMapsService();

// 中間件：驗證管理員權限
function ensureAdmin(req, res, next) {
  if (!req.session.adminId && !req.session.managerId) {
    return res.status(401).json({ error: '需要管理員權限' });
  }
  next();
}

// 中間件：驗證請求資料
function validateRouteRequest(req, res, next) {
  const { orderIds } = req.body;
  
  if (!orderIds || !Array.isArray(orderIds) || orderIds.length === 0) {
    return res.status(400).json({ error: '請提供有效的訂單ID列表' });
  }
  
  if (orderIds.length > 50) {
    return res.status(400).json({ error: '單次處理的訂單數量不能超過50個' });
  }
  
  next();
}

// ==========================================
// 智能分組相關 API
// ==========================================

// 1. 自動分組 API
router.post('/auto-group', ensureAdmin, validateRouteRequest, async (req, res) => {
  const { 
    orderIds, 
    maxGroupSize = 8, 
    maxDistanceKm = 5,
    algorithm = 'kmeans' 
  } = req.body;
  
  try {
    console.log(`🤖 開始自動分組 ${orderIds.length} 個訂單...`);
    
    // 1. 獲取訂單資料和地理位置
    const { rows: orders } = await req.app.locals.pool.query(`
      SELECT id, contact_name, address, lat, lng, total, created_at
      FROM orders 
      WHERE id = ANY($1) AND status IN ('confirmed', 'preparing')
      AND lat IS NOT NULL AND lng IS NOT NULL
    `, [orderIds]);
    
    if (orders.length === 0) {
      return res.status(400).json({ error: '找不到可分組的訂單或訂單缺少地理位置資訊' });
    }
    
    // 2. 對缺少地理編碼的訂單進行地理編碼
    const uncodedOrders = orders.filter(order => !order.lat || !order.lng);
    if (uncodedOrders.length > 0) {
      console.log(`📍 對 ${uncodedOrders.length} 個訂單進行地理編碼...`);
      await mapsService.batchGeocode(uncodedOrders);
      
      // 重新獲取更新後的訂單資料
      const { rows: updatedOrders } = await req.app.locals.pool.query(`
        SELECT id, contact_name, address, lat, lng, total, created_at
        FROM orders 
        WHERE id = ANY($1) AND lat IS NOT NULL AND lng IS NOT NULL
      `, [orderIds]);
      
      orders.splice(0, orders.length, ...updatedOrders);
    }
    
    // 3. 執行地理聚類分組
    const clusteringOptions = {
      maxGroupSize,
      maxDistanceKm,
      algorithm
    };
    
    const groups = await clusteringService.clusterOrders(orders, clusteringOptions);
    
    // 4. 儲存分組結果到資料庫
    const savedGroups = [];
    const client = await req.app.locals.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      for (let i = 0; i < groups.length; i++) {
        const group = groups[i];
        
        // 建立路線群組
        const { rows: [newGroup] } = await client.query(`
          INSERT INTO route_groups (
            name, status, total_orders, center_lat, center_lng, 
            created_by, estimated_distance, estimated_duration
          ) VALUES ($1, 'planning', $2, $3, $4, 'admin', $5, $6)
          RETURNING *
        `, [
          group.name || `自動分組 ${String.fromCharCode(65 + i)}`, // A, B, C...
          group.orders.length,
          group.centerLat,
          group.centerLng,
          group.estimatedDistance,
          group.estimatedDuration
        ]);
        
        // 建立訂單與群組的關聯
        for (let j = 0; j < group.orders.length; j++) {
          await client.query(`
            INSERT INTO order_group_assignments (order_id, route_group_id, sequence_order)
            VALUES ($1, $2, $3)
          `, [group.orders[j].id, newGroup.id, j + 1]);
        }
        
        savedGroups.push({
          ...newGroup,
          orders: group.orders
        });
      }
      
      await client.query('COMMIT');
      
      // 5. 記錄分組歷史
      await req.app.locals.pool.query(`
        INSERT INTO route_optimization_history (
          algorithm_used, input_orders, output_sequence, 
          optimization_time_ms, parameters
        ) VALUES ($1, $2, $3, $4, $5)
      `, [
        algorithm,
        JSON.stringify(orders),
        JSON.stringify(savedGroups),
        Date.now() - startTime,
        JSON.stringify(clusteringOptions)
      ]);
      
      console.log(`✅ 成功建立 ${savedGroups.length} 個路線群組`);
      
      res.json({
        success: true,
        message: `成功建立 ${savedGroups.length} 個路線群組`,
        groups: savedGroups.map(group => ({
          id: group.id,
          name: group.name,
          orderCount: group.orders.length,
          orders: group.orders.map(o => ({
            id: o.id,
            contact_name: o.contact_name,
            address: o.address,
            lat: o.lat,
            lng: o.lng
          })),
          centerLat: group.center_lat,
          centerLng: group.center_lng,
          estimatedDistance: group.estimated_distance,
          estimatedDuration: group.estimated_duration
        }))
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('自動分組錯誤:', error);
    res.status(500).json({ 
      error: '自動分組失敗',
      details: error.message
    });
  }
});

// 2. 路線優化 API
router.post('/optimize-sequence', ensureAdmin, async (req, res) => {
  const { groupId, algorithm = 'tsp_2opt' } = req.body;
  
  if (!groupId) {
    return res.status(400).json({ error: '請提供路線群組ID' });
  }
  
  try {
    console.log(`🔧 開始優化路線群組 ${groupId}...`);
    const startTime = Date.now();
    
    // 1. 獲取群組和訂單資料
    const { rows: groupData } = await req.app.locals.pool.query(`
      SELECT rg.*, 
             json_agg(
               json_build_object(
                 'id', o.id,
                 'lat', o.lat,
                 'lng', o.lng,
                 'address', o.address,
                 'contact_name', o.contact_name,
                 'sequence', oga.sequence_order
               ) ORDER BY oga.sequence_order
             ) as orders
      FROM route_groups rg
      JOIN order_group_assignments oga ON rg.id = oga.route_group_id
      JOIN orders o ON oga.order_id = o.id
      WHERE rg.id = $1 AND rg.status = 'planning'
      GROUP BY rg.id
    `, [groupId]);
    
    if (groupData.length === 0) {
      return res.status(404).json({ error: '找不到指定的路線群組或群組狀態不允許優化' });
    }
    
    const group = groupData[0];
    const orders = group.orders;
    
    // 2. 執行路線優化
    const optimizedResult = await routeOptimizer.optimizeRoute(orders, {
      algorithm,
      startPoint: { lat: group.center_lat, lng: group.center_lng }
    });
    
    // 3. 更新資料庫中的優化結果
    const client = await req.app.locals.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 更新路線群組的優化資訊
      await client.query(`
        UPDATE route_groups 
        SET optimized_sequence = $1, 
            estimated_distance = $2,
            estimated_duration = $3,
            updated_at = NOW()
        WHERE id = $4
      `, [
        JSON.stringify(optimizedResult.sequence),
        optimizedResult.totalDistance,
        optimizedResult.totalDuration,
        groupId
      ]);
      
      // 更新訂單在群組中的順序
      for (let i = 0; i < optimizedResult.sequence.length; i++) {
        const orderSequence = optimizedResult.sequence[i];
        await client.query(`
          UPDATE order_group_assignments 
          SET sequence_order = $1,
              estimated_arrival_time = $2,
              distance_to_next = $3,
              duration_to_next = $4
          WHERE order_id = $5 AND route_group_id = $6
        `, [
          orderSequence.sequence,
          orderSequence.estimatedArrival,
          orderSequence.distanceToNext,
          orderSequence.durationToNext,
          orderSequence.orderId,
          groupId
        ]);
      }
      
      await client.query('COMMIT');
      
      // 4. 記錄優化歷史
      const optimizationTime = Date.now() - startTime;
      await req.app.locals.pool.query(`
        INSERT INTO route_optimization_history (
          route_group_id, algorithm_used, input_orders, output_sequence,
          optimization_time_ms, distance_before, distance_after,
          improvement_percentage, parameters
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        groupId,
        algorithm,
        JSON.stringify(orders),
        JSON.stringify(optimizedResult.sequence),
        optimizationTime,
        group.estimated_distance || 0,
        optimizedResult.totalDistance,
        optimizedResult.improvementPercentage,
        JSON.stringify({ algorithm })
      ]);
      
      console.log(`✅ 路線優化完成，提升效率 ${optimizedResult.improvementPercentage}%`);
      
      res.json({
        success: true,
        message: '路線優化完成',
        optimizedSequence: optimizedResult.sequence,
        totalDistance: optimizedResult.totalDistance,
        totalDuration: optimizedResult.totalDuration,
        improvementPercentage: optimizedResult.improvementPercentage,
        optimizationTimeMs: optimizationTime
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('路線優化錯誤:', error);
    res.status(500).json({ 
      error: '路線優化失敗',
      details: error.message
    });
  }
});

// ==========================================
// 批次操作相關 API
// ==========================================

// 3. 批次分配外送員 API
router.post('/assign-batch', ensureAdmin, async (req, res) => {
  const { assignments } = req.body;
  
  if (!assignments || !Array.isArray(assignments)) {
    return res.status(400).json({ error: '請提供有效的分配列表' });
  }
  
  try {
    console.log(`👥 開始批次分配 ${assignments.length} 個路線群組...`);
    
    const client = await req.app.locals.pool.connect();
    let successCount = 0;
    let errors = [];
    
    try {
      await client.query('BEGIN');
      
      for (const assignment of assignments) {
        const { groupId, driverId } = assignment;
        
        try {
          // 檢查外送員是否可用
          const { rows: driverCheck } = await client.query(
            'SELECT id, name, status FROM drivers WHERE id = $1 AND status = $2',
            [driverId, 'online']
          );
          
          if (driverCheck.length === 0) {
            errors.push({ groupId, error: '外送員不存在或不在線上' });
            continue;
          }
          
          // 檢查路線群組狀態
          const { rows: groupCheck } = await client.query(
            'SELECT id, name, status FROM route_groups WHERE id = $1 AND status = $2',
            [groupId, 'planning']
          );
          
          if (groupCheck.length === 0) {
            errors.push({ groupId, error: '路線群組不存在或狀態不允許分配' });
            continue;
          }
          
          // 分配路線群組給外送員
          await client.query(`
            UPDATE route_groups 
            SET driver_id = $1, status = 'assigned', assigned_at = NOW(), updated_at = NOW()
            WHERE id = $2
          `, [driverId, groupId]);
          
          // 更新該群組中的所有訂單狀態
          await client.query(`
            UPDATE orders 
            SET driver_id = $1, status = 'assigned', assigned_at = NOW()
            WHERE id IN (
              SELECT order_id FROM order_group_assignments WHERE route_group_id = $2
            )
          `, [driverId, groupId]);
          
          // 建立通知記錄
          await client.query(`
            INSERT INTO notifications (
              type, recipient_type, recipient_id, title, message, 
              order_id, created_at
            )
            SELECT 
              'batch_assignment', 'driver', $1::text, '新的批次配送任務',
              '您已被分配新的批次配送路線，共 ' || COUNT(*) || ' 個訂單',
              NULL, NOW()
            FROM order_group_assignments 
            WHERE route_group_id = $2
          `, [driverId, groupId]);
          
          successCount++;
          
        } catch (assignError) {
          errors.push({ 
            groupId, 
            error: `分配失敗: ${assignError.message}` 
          });
        }
      }
      
      await client.query('COMMIT');
      
      console.log(`✅ 批次分配完成：成功 ${successCount}，失敗 ${errors.length}`);
      
      res.json({
        success: true,
        message: `批次分配完成`,
        assignedGroups: successCount,
        totalGroups: assignments.length,
        errors: errors.length > 0 ? errors : undefined
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('批次分配錯誤:', error);
    res.status(500).json({ 
      error: '批次分配失敗',
      details: error.message
    });
  }
});

// ==========================================
// 查詢和管理 API
// ==========================================

// 4. 獲取路線群組列表
router.get('/groups', ensureAdmin, async (req, res) => {
  const { status, driverId, page = 1, limit = 20 } = req.query;
  
  try {
    let whereConditions = ['1=1'];
    let queryParams = [];
    let paramIndex = 1;
    
    if (status) {
      whereConditions.push(`rg.status = $${paramIndex}`);
      queryParams.push(status);
      paramIndex++;
    }
    
    if (driverId) {
      whereConditions.push(`rg.driver_id = $${paramIndex}`);
      queryParams.push(parseInt(driverId));
      paramIndex++;
    }
    
    const offset = (page - 1) * limit;
    
    const { rows } = await req.app.locals.pool.query(`
      SELECT 
        rg.*,
        d.name as driver_name,
        d.phone as driver_phone,
        COUNT(oga.order_id) as actual_order_count,
        COALESCE(SUM(o.total), 0) as total_order_value,
        STRING_AGG(o.contact_name, ', ' ORDER BY oga.sequence_order) as customer_names
      FROM route_groups rg
      LEFT JOIN drivers d ON rg.driver_id = d.id
      LEFT JOIN order_group_assignments oga ON rg.id = oga.route_group_id
      LEFT JOIN orders o ON oga.order_id = o.id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY rg.id, d.id, d.name, d.phone
      ORDER BY rg.created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `, [...queryParams, limit, offset]);
    
    // 獲取總數
    const { rows: countResult } = await req.app.locals.pool.query(`
      SELECT COUNT(DISTINCT rg.id) as total
      FROM route_groups rg
      LEFT JOIN drivers d ON rg.driver_id = d.id
      WHERE ${whereConditions.join(' AND ')}
    `, queryParams);
    
    res.json({
      success: true,
      groups: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: parseInt(countResult[0].total),
        totalPages: Math.ceil(countResult[0].total / limit)
      }
    });
    
  } catch (error) {
    console.error('獲取路線群組列表錯誤:', error);
    res.status(500).json({ error: '獲取路線群組列表失敗' });
  }
});

// 5. 獲取單一路線群組詳情
router.get('/groups/:groupId', ensureAdmin, async (req, res) => {
  const { groupId } = req.params;
  
  try {
    const { rows } = await req.app.locals.pool.query(`
      SELECT 
        rg.*,
        d.name as driver_name,
        d.phone as driver_phone,
        d.status as driver_status,
        json_agg(
          json_build_object(
            'id', o.id,
            'contact_name', o.contact_name,
            'contact_phone', o.contact_phone,
            'address', o.address,
            'lat', o.lat,
            'lng', o.lng,
            'total', o.total,
            'status', o.status,
            'sequence_order', oga.sequence_order,
            'estimated_arrival_time', oga.estimated_arrival_time,
            'distance_to_next', oga.distance_to_next,
            'duration_to_next', oga.duration_to_next
          ) ORDER BY oga.sequence_order
        ) as orders
      FROM route_groups rg
      LEFT JOIN drivers d ON rg.driver_id = d.id
      LEFT JOIN order_group_assignments oga ON rg.id = oga.route_group_id
      LEFT JOIN orders o ON oga.order_id = o.id
      WHERE rg.id = $1
      GROUP BY rg.id, d.id, d.name, d.phone, d.status
    `, [groupId]);
    
    if (rows.length === 0) {
      return res.status(404).json({ error: '找不到指定的路線群組' });
    }
    
    res.json({
      success: true,
      group: rows[0]
    });
    
  } catch (error) {
    console.error('獲取路線群組詳情錯誤:', error);
    res.status(500).json({ error: '獲取路線群組詳情失敗' });
  }
});

// 6. 刪除路線群組
router.delete('/groups/:groupId', ensureAdmin, async (req, res) => {
  const { groupId } = req.params;
  
  try {
    const client = await req.app.locals.pool.connect();
    
    try {
      await client.query('BEGIN');
      
      // 檢查群組狀態
      const { rows: groupCheck } = await client.query(
        'SELECT status FROM route_groups WHERE id = $1',
        [groupId]
      );
      
      if (groupCheck.length === 0) {
        return res.status(404).json({ error: '找不到指定的路線群組' });
      }
      
      if (groupCheck[0].status === 'in_progress') {
        return res.status(400).json({ error: '無法刪除進行中的路線群組' });
      }
      
      // 重置相關訂單的狀態
      await client.query(`
        UPDATE orders 
        SET driver_id = NULL, status = 'confirmed', assigned_at = NULL
        WHERE id IN (
          SELECT order_id FROM order_group_assignments WHERE route_group_id = $1
        )
      `, [groupId]);
      
      // 刪除訂單分組關聯
      await client.query(
        'DELETE FROM order_group_assignments WHERE route_group_id = $1',
        [groupId]
      );
      
      // 刪除路線群組
      await client.query('DELETE FROM route_groups WHERE id = $1', [groupId]);
      
      await client.query('COMMIT');
      
      res.json({
        success: true,
        message: '路線群組已成功刪除'
      });
      
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    
  } catch (error) {
    console.error('刪除路線群組錯誤:', error);
    res.status(500).json({ error: '刪除路線群組失敗' });
  }
});

// ==========================================
// 統計和分析 API
// ==========================================

// 7. 配送效率統計
router.get('/statistics/efficiency', ensureAdmin, async (req, res) => {
  const { startDate, endDate, driverId } = req.query;
  
  try {
    let whereConditions = ['bd.started_at IS NOT NULL'];
    let queryParams = [];
    let paramIndex = 1;
    
    if (startDate) {
      whereConditions.push(`DATE(bd.started_at) >= $${paramIndex}`);
      queryParams.push(startDate);
      paramIndex++;
    }
    
    if (endDate) {
      whereConditions.push(`DATE(bd.started_at) <= $${paramIndex}`);
      queryParams.push(endDate);
      paramIndex++;
    }
    
    if (driverId) {
      whereConditions.push(`bd.driver_id = $${paramIndex}`);
      queryParams.push(parseInt(driverId));
      paramIndex++;
    }
    
    const { rows } = await req.app.locals.pool.query(`
      SELECT 
        d.id as driver_id,
        d.name as driver_name,
        COUNT(bd.id) as total_batches,
        SUM(bd.orders_delivered) as total_orders_delivered,
        AVG(bd.delivery_efficiency) as avg_efficiency,
        SUM(bd.total_distance) as total_distance,
        AVG(bd.total_duration) as avg_duration,
        AVG(bd.customer_satisfaction) as avg_satisfaction,
        SUM(bd.fuel_cost) as total_fuel_cost
      FROM batch_deliveries bd
      JOIN drivers d ON bd.driver_id = d.id
      WHERE ${whereConditions.join(' AND ')}
      GROUP BY d.id, d.name
      ORDER BY avg_efficiency DESC
    `, queryParams);
    
    res.json({
      success: true,
      statistics: rows,
      period: { startDate, endDate }
    });
    
  } catch (error) {
    console.error('獲取配送效率統計錯誤:', error);
    res.status(500).json({ error: '獲取配送效率統計失敗' });
  }
});

// 8. 地理分佈分析
router.get('/analytics/geographic-distribution', ensureAdmin, async (req, res) => {
  const { date = new Date().toISOString().split('T')[0] } = req.query;
  
  try {
    const { rows } = await req.app.locals.pool.query(`
      SELECT 
        COUNT(*) as total_orders,
        AVG(ST_X(location)) as avg_lng,
        AVG(ST_Y(location)) as avg_lat,
        ST_AsGeoJSON(ST_Extent(location)) as bounding_box,
        COUNT(*) FILTER (WHERE rg.id IS NOT NULL) as grouped_orders,
        COUNT(*) FILTER (WHERE rg.id IS NULL) as ungrouped_orders,
        COUNT(DISTINCT rg.id) as total_groups
      FROM orders o
      LEFT JOIN order_group_assignments oga ON o.id = oga.order_id
      LEFT JOIN route_groups rg ON oga.route_group_id = rg.id
      WHERE DATE(o.created_at) = $1 AND o.location IS NOT NULL
    `, [date]);
    
    res.json({
      success: true,
      analysis: rows[0],
      date
    });
    
  } catch (error) {
    console.error('地理分佈分析錯誤:', error);
    res.status(500).json({ error: '地理分佈分析失敗' });
  }
});

module.exports = router;