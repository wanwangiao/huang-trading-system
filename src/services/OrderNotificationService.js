/**
 * 訂單即時通知服務
 * 處理訂單狀態變更和相關通知邏輯
 */
class OrderNotificationService {
  constructor(database, sseService) {
    this.db = database;
    this.sse = sseService;
    
    // 訂單狀態對應的中文描述
    this.statusMessages = {
      'placed': '訂單已成立',
      'confirmed': '訂單已確認',
      'preparing': '正在準備商品',
      'ready': '商品準備完成',
      'assigned': '已分配外送員',
      'picked_up': '外送員已取貨',
      'delivering': '配送中',
      'delivered': '已送達',
      'completed': '訂單完成',
      'cancelled': '訂單已取消'
    };

    // 狀態變更的通知模板
    this.notificationTemplates = {
      'confirmed': {
        title: '訂單確認',
        message: '您的訂單已確認，我們正在準備您的商品。',
        icon: '✅',
        priority: 'normal'
      },
      'assigned': {
        title: '外送員已分配',
        message: '外送員已接單，正準備為您送達。',
        icon: '🚚',
        priority: 'high'
      },
      'picked_up': {
        title: '外送員已取貨',
        message: '外送員已取得您的商品，正在前往您的地址。',
        icon: '📦',
        priority: 'high'
      },
      'delivering': {
        title: '配送中',
        message: '外送員正在路上，即將為您送達。',
        icon: '🛵',
        priority: 'high'
      },
      'delivered': {
        title: '已送達',
        message: '您的訂單已成功送達，感謝您的訂購！',
        icon: '🎉',
        priority: 'high'
      },
      'cancelled': {
        title: '訂單取消',
        message: '很抱歉，您的訂單已被取消。',
        icon: '❌',
        priority: 'high'
      }
    };
  }

  /**
   * 更新訂單狀態並發送通知
   * @param {number} orderId - 訂單ID
   * @param {string} newStatus - 新狀態
   * @param {Object} options - 額外選項
   */
  async updateOrderStatus(orderId, newStatus, options = {}) {
    try {
      const {
        changedBy = 'system',
        changedById = null,
        notes = null,
        estimatedDeliveryTime = null,
        driverNotes = null
      } = options;

      // 獲取當前訂單資訊
      const orderResult = await this.db.query(`
        SELECT o.*, d.name as driver_name, d.phone as driver_phone
        FROM orders o
        LEFT JOIN drivers d ON o.driver_id = d.id
        WHERE o.id = $1
      `, [orderId]);

      if (orderResult.rows.length === 0) {
        throw new Error(`訂單 ${orderId} 不存在`);
      }

      const currentOrder = orderResult.rows[0];
      const oldStatus = currentOrder.status;

      // 如果狀態沒有變更，則跳過
      if (oldStatus === newStatus) {
        return currentOrder;
      }

      // 更新訂單狀態
      const updateQuery = `
        UPDATE orders 
        SET 
          status = $1,
          estimated_delivery_time = COALESCE($2, estimated_delivery_time),
          driver_notes = COALESCE($3, driver_notes),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = $4
        RETURNING *
      `;

      const updatedResult = await this.db.query(updateQuery, [
        newStatus,
        estimatedDeliveryTime,
        driverNotes,
        orderId
      ]);

      const updatedOrder = updatedResult.rows[0];

      // 記錄狀態變更歷史
      await this.db.query(`
        INSERT INTO order_status_history (
          order_id, old_status, new_status, changed_by, changed_by_id, notes
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [orderId, oldStatus, newStatus, changedBy, changedById, notes]);

      // 準備通知資料
      const notificationData = await this.prepareNotificationData(updatedOrder, oldStatus);

      // 發送即時通知
      await this.sendOrderStatusNotification(orderId, notificationData);

      // 記錄通知日誌
      await this.logNotification(orderId, newStatus, notificationData);

      console.log(`📋 訂單 ${orderId} 狀態已更新: ${oldStatus} -> ${newStatus}`);
      return updatedOrder;

    } catch (error) {
      console.error('更新訂單狀態失敗:', error);
      throw error;
    }
  }

  /**
   * 準備通知資料
   * @param {Object} order - 訂單資料
   * @param {string} oldStatus - 舊狀態
   */
  async prepareNotificationData(order, oldStatus) {
    const template = this.notificationTemplates[order.status] || {
      title: '訂單狀態更新',
      message: `您的訂單狀態已更新為：${this.statusMessages[order.status] || order.status}`,
      icon: '📋',
      priority: 'normal'
    };

    // 計算預計送達時間
    let estimatedDeliveryTime = order.estimated_delivery_time;
    if (!estimatedDeliveryTime && order.driver_id && order.status === 'assigned') {
      try {
        const result = await this.db.query(
          'SELECT calculate_estimated_delivery_time($1, $2) as estimated_time',
          [order.id, order.driver_id]
        );
        estimatedDeliveryTime = result.rows[0]?.estimated_time;
        
        // 更新訂單的預計送達時間
        if (estimatedDeliveryTime) {
          await this.db.query(
            'UPDATE orders SET estimated_delivery_time = $1 WHERE id = $2',
            [estimatedDeliveryTime, order.id]
          );
        }
      } catch (error) {
        console.error('計算預計送達時間失敗:', error);
      }
    }

    const notificationData = {
      orderId: order.id,
      oldStatus,
      newStatus: order.status,
      statusMessage: this.statusMessages[order.status],
      title: template.title,
      message: template.message,
      icon: template.icon,
      priority: template.priority,
      orderInfo: {
        contactName: order.contact_name,
        contactPhone: order.contact_phone,
        address: order.address,
        total: order.total,
        createdAt: order.created_at
      },
      estimatedDeliveryTime,
      driverInfo: order.driver_name ? {
        name: order.driver_name,
        phone: order.driver_phone
      } : null,
      timestamp: new Date().toISOString()
    };

    return notificationData;
  }

  /**
   * 發送訂單狀態通知
   * @param {number} orderId - 訂單ID
   * @param {Object} notificationData - 通知資料
   */
  async sendOrderStatusNotification(orderId, notificationData) {
    try {
      // 廣播給訂閱該訂單的所有連接
      this.sse.broadcastOrderUpdate(orderId, notificationData);

      // 發送給管理員
      this.sse.broadcastSystemNotification(
        `訂單 #${orderId} 狀態更新: ${notificationData.statusMessage}`,
        'info',
        { userType: 'admin' }
      );

      console.log(`📱 訂單 ${orderId} 通知已發送`);
    } catch (error) {
      console.error('發送訂單狀態通知失敗:', error);
      throw error;
    }
  }

  /**
   * 記錄通知日誌
   * @param {number} orderId - 訂單ID
   * @param {string} status - 訂單狀態
   * @param {Object} notificationData - 通知資料
   */
  async logNotification(orderId, status, notificationData) {
    try {
      await this.db.query(`
        INSERT INTO notification_logs (
          notification_type, target_type, order_id,
          title, message, data
        ) VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        'order_update',
        'customer',
        orderId,
        notificationData.title,
        notificationData.message,
        JSON.stringify(notificationData)
      ]);
    } catch (error) {
      console.error('記錄通知日誌失敗:', error);
      // 不拋出錯誤，避免影響主流程
    }
  }

  /**
   * 分配外送員給訂單
   * @param {number} orderId - 訂單ID
   * @param {number} driverId - 外送員ID
   * @param {Object} options - 額外選項
   */
  async assignDriverToOrder(orderId, driverId, options = {}) {
    try {
      const { assignedBy = 'system', notes = null } = options;

      // 檢查外送員是否可用
      const driverResult = await this.db.query(`
        SELECT * FROM drivers WHERE id = $1 AND status IN ('online', 'available')
      `, [driverId]);

      if (driverResult.rows.length === 0) {
        throw new Error('外送員不可用');
      }

      const driver = driverResult.rows[0];

      // 更新訂單分配外送員
      await this.db.query(`
        UPDATE orders SET driver_id = $1 WHERE id = $2
      `, [driverId, orderId]);

      // 記錄分配歷史
      await this.db.query(`
        INSERT INTO order_driver_assignments (
          order_id, driver_id, status
        ) VALUES ($1, $2, 'assigned')
      `, [orderId, driverId]);

      // 更新外送員狀態為忙碌
      await this.db.query(`
        UPDATE drivers SET status = 'busy' WHERE id = $1
      `, [driverId]);

      // 更新訂單狀態並發送通知
      await this.updateOrderStatus(orderId, 'assigned', {
        changedBy: assignedBy,
        notes: `已分配外送員: ${driver.name}`
      });

      console.log(`🚚 訂單 ${orderId} 已分配給外送員 ${driver.name}`);
      
      return {
        orderId,
        driverId,
        driverName: driver.name,
        assignedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('分配外送員失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取訂單狀態歷史
   * @param {number} orderId - 訂單ID
   */
  async getOrderStatusHistory(orderId) {
    try {
      const result = await this.db.query(`
        SELECT 
          osh.*,
          CASE 
            WHEN osh.changed_by = 'driver' THEN d.name
            ELSE osh.changed_by
          END as changed_by_name
        FROM order_status_history osh
        LEFT JOIN drivers d ON osh.changed_by = 'driver' AND osh.changed_by_id = d.id
        WHERE osh.order_id = $1
        ORDER BY osh.created_at ASC
      `, [orderId]);

      return result.rows.map(row => ({
        id: row.id,
        oldStatus: row.old_status,
        newStatus: row.new_status,
        statusMessage: this.statusMessages[row.new_status],
        changedBy: row.changed_by_name,
        notes: row.notes,
        createdAt: row.created_at,
        estimatedDeliveryTime: row.estimated_delivery_time,
        actualDeliveryTime: row.actual_delivery_time
      }));

    } catch (error) {
      console.error('獲取訂單狀態歷史失敗:', error);
      throw error;
    }
  }

  /**
   * 批量更新訂單狀態
   * @param {Array} orderUpdates - 訂單更新列表
   */
  async batchUpdateOrderStatus(orderUpdates) {
    const results = [];
    const errors = [];

    for (const update of orderUpdates) {
      try {
        const result = await this.updateOrderStatus(
          update.orderId,
          update.status,
          update.options || {}
        );
        results.push({ orderId: update.orderId, success: true, data: result });
      } catch (error) {
        errors.push({ orderId: update.orderId, error: error.message });
        console.error(`批量更新訂單 ${update.orderId} 失敗:`, error);
      }
    }

    return { results, errors };
  }

  /**
   * 取消訂單
   * @param {number} orderId - 訂單ID
   * @param {Object} options - 取消選項
   */
  async cancelOrder(orderId, options = {}) {
    try {
      const { reason = '客戶取消', cancelledBy = 'system' } = options;

      // 如果訂單已分配外送員，需要釋放外送員
      const orderResult = await this.db.query(`
        SELECT driver_id FROM orders WHERE id = $1
      `, [orderId]);

      if (orderResult.rows.length > 0 && orderResult.rows[0].driver_id) {
        const driverId = orderResult.rows[0].driver_id;
        
        // 更新外送員狀態
        await this.db.query(`
          UPDATE drivers SET status = 'online' WHERE id = $1
        `, [driverId]);

        // 更新分配記錄
        await this.db.query(`
          UPDATE order_driver_assignments 
          SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP, 
              cancellation_reason = $1
          WHERE order_id = $2 AND driver_id = $3 AND status NOT IN ('completed', 'cancelled')
        `, [reason, orderId, driverId]);
      }

      // 更新訂單狀態
      await this.updateOrderStatus(orderId, 'cancelled', {
        changedBy: cancelledBy,
        notes: reason
      });

      console.log(`❌ 訂單 ${orderId} 已取消: ${reason}`);
      return true;

    } catch (error) {
      console.error('取消訂單失敗:', error);
      throw error;
    }
  }
}

module.exports = OrderNotificationService;