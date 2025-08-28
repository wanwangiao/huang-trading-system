const BaseAgent = require('./BaseAgent');

/**
 * 訂單處理代理程式
 * 負責處理所有訂單相關的業務邏輯
 */
class OrderAgent extends BaseAgent {
  constructor(agentManager = null, databasePool = null) {
    super('OrderAgent', agentManager);
    this.pool = databasePool;
    this.demoMode = false;
    this.orderStatusFlow = {
      'placed': ['cancelled', 'confirmed', 'quoted'],
      'confirmed': ['cancelled', 'quoted', 'packed'],
      'quoted': ['cancelled', 'confirmed', 'packed'],
      'packed': ['delivering'],
      'delivering': ['delivered', 'failed'],
      'delivered': [],
      'cancelled': [],
      'failed': ['delivering'] // 可重新配送
    };
  }

  async initialize() {
    console.log('📋 OrderAgent 初始化...');
    
    // 檢查資料庫連線
    if (this.pool) {
      try {
        await this.pool.query('SELECT 1');
        this.demoMode = false;
        console.log('✅ OrderAgent 已連接資料庫');
      } catch (error) {
        console.warn('⚠️ OrderAgent 無法連接資料庫，啟用示範模式');
        this.demoMode = true;
      }
    } else {
      this.demoMode = true;
    }

    // 註冊可處理的任務類型
    this.taskHandlers = {
      'create_order': this.handleCreateOrder.bind(this),
      'update_order_status': this.handleUpdateOrderStatus.bind(this),
      'calculate_order_total': this.handleCalculateOrderTotal.bind(this),
      'get_order_details': this.handleGetOrderDetails.bind(this),
      'cancel_order': this.handleCancelOrder.bind(this),
      'validate_order': this.handleValidateOrder.bind(this),
      'get_orders_by_status': this.handleGetOrdersByStatus.bind(this),
      'get_customer_orders': this.handleGetCustomerOrders.bind(this)
    };

    console.log('✅ OrderAgent 初始化完成');
  }

  async processTask(task) {
    const handler = this.taskHandlers[task.type];
    if (!handler) {
      throw new Error(`不支援的任務類型: ${task.type}`);
    }

    return await handler(task.data);
  }

  /**
   * 建立新訂單
   */
  async handleCreateOrder(orderData) {
    console.log('📝 建立新訂單:', orderData);
    
    try {
      // 驗證訂單資料
      const validation = await this.validateOrderData(orderData);
      if (!validation.isValid) {
        throw new Error(`訂單驗證失敗: ${validation.errors.join(', ')}`);
      }

      // 計算訂單金額
      const totals = await this.calculateOrderTotals(orderData.items);
      
      const order = {
        contact_name: orderData.name,
        contact_phone: orderData.phone,
        address: orderData.address,
        notes: orderData.notes || '',
        invoice: orderData.invoice || '',
        subtotal: totals.subtotal,
        delivery_fee: totals.deliveryFee,
        total_amount: totals.total,
        status: 'placed',
        created_at: new Date()
      };

      let orderId;

      if (!this.demoMode && this.pool) {
        // 真實資料庫操作
        const result = await this.pool.query(`
          INSERT INTO orders (contact_name, contact_phone, address, notes, invoice, 
                            subtotal, delivery_fee, total_amount, status, created_at) 
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP) 
          RETURNING id
        `, [
          order.contact_name, order.contact_phone, order.address,
          order.notes, order.invoice, order.subtotal, order.delivery_fee,
          order.total_amount, order.status
        ]);
        
        orderId = result.rows[0].id;
        
        // 插入訂單項目
        for (const item of orderData.items) {
          await this.pool.query(`
            INSERT INTO order_items (order_id, product_id, name, is_priced_item, 
                                   quantity, unit_price, line_total, actual_weight)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          `, [
            orderId, item.productId, item.name, item.is_priced_item,
            item.quantity, item.unit_price, item.line_total, item.actual_weight
          ]);
        }
      } else {
        // 示範模式
        orderId = Math.floor(Math.random() * 9000) + 1000;
        console.log('📝 示範模式：模擬訂單建立，ID:', orderId);
      }

      // 通知其他 Agent
      await this.notifyOrderCreated(orderId, order);

      return {
        success: true,
        orderId: orderId,
        order: { ...order, id: orderId, items: orderData.items },
        totals: totals
      };

    } catch (error) {
      console.error('❌ 建立訂單失敗:', error);
      throw error;
    }
  }

  /**
   * 更新訂單狀態
   */
  async handleUpdateOrderStatus(data) {
    const { orderId, newStatus, reason } = data;
    console.log(`📋 更新訂單 ${orderId} 狀態: ${newStatus}`);

    try {
      // 檢查狀態流程是否合法
      const currentOrder = await this.getOrderById(orderId);
      if (!currentOrder) {
        throw new Error(`訂單 ${orderId} 不存在`);
      }

      const allowedStatuses = this.orderStatusFlow[currentOrder.status] || [];
      if (!allowedStatuses.includes(newStatus)) {
        throw new Error(`無法從 ${currentOrder.status} 狀態變更為 ${newStatus}`);
      }

      if (!this.demoMode && this.pool) {
        // 更新資料庫
        await this.pool.query(`
          UPDATE orders 
          SET status = $1, updated_at = CURRENT_TIMESTAMP 
          WHERE id = $2
        `, [newStatus, orderId]);

        // 記錄狀態變更歷史
        await this.pool.query(`
          INSERT INTO order_status_history (order_id, old_status, new_status, reason, changed_at)
          VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
        `, [orderId, currentOrder.status, newStatus, reason || '']);
      }

      // 通知相關 Agent
      await this.notifyStatusChanged(orderId, currentOrder.status, newStatus);

      return {
        success: true,
        orderId: orderId,
        oldStatus: currentOrder.status,
        newStatus: newStatus,
        updatedAt: new Date()
      };

    } catch (error) {
      console.error(`❌ 更新訂單狀態失敗:`, error);
      throw error;
    }
  }

  /**
   * 計算訂單總金額
   */
  async handleCalculateOrderTotal(data) {
    const { items } = data;
    return await this.calculateOrderTotals(items);
  }

  /**
   * 獲取訂單詳情
   */
  async handleGetOrderDetails(data) {
    const { orderId } = data;
    
    if (!this.demoMode && this.pool) {
      const orderQuery = await this.pool.query(`
        SELECT o.*, 
               json_agg(
                 json_build_object(
                   'id', oi.id,
                   'product_id', oi.product_id,
                   'name', oi.name,
                   'quantity', oi.quantity,
                   'unit_price', oi.unit_price,
                   'line_total', oi.line_total,
                   'actual_weight', oi.actual_weight
                 )
               ) as items
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.id = $1
        GROUP BY o.id
      `, [orderId]);

      if (orderQuery.rows.length === 0) {
        throw new Error(`訂單 ${orderId} 不存在`);
      }

      return orderQuery.rows[0];
    } else {
      // 示範模式
      return {
        id: orderId,
        contact_name: '示範客戶',
        status: 'placed',
        total_amount: 250,
        items: [
          { name: '高麗菜', quantity: 2, unit_price: 45, line_total: 90 }
        ]
      };
    }
  }

  /**
   * 取消訂單
   */
  async handleCancelOrder(data) {
    const { orderId, reason } = data;
    
    const currentOrder = await this.getOrderById(orderId);
    if (!currentOrder) {
      throw new Error(`訂單 ${orderId} 不存在`);
    }

    // 檢查是否可以取消
    const cancellableStatuses = ['placed', 'confirmed', 'quoted'];
    if (!cancellableStatuses.includes(currentOrder.status)) {
      throw new Error(`訂單狀態 ${currentOrder.status} 無法取消`);
    }

    return await this.handleUpdateOrderStatus({
      orderId: orderId,
      newStatus: 'cancelled',
      reason: reason || '客戶取消'
    });
  }

  /**
   * 驗證訂單
   */
  async handleValidateOrder(orderData) {
    return await this.validateOrderData(orderData);
  }

  /**
   * 根據狀態獲取訂單
   */
  async handleGetOrdersByStatus(data) {
    const { status, limit = 50 } = data;
    
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT id, contact_name, contact_phone, address, total_amount, 
               status, created_at, updated_at
        FROM orders 
        WHERE status = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [status, limit]);
      
      return result.rows;
    } else {
      // 示範模式
      return [
        {
          id: 1001,
          contact_name: '示範客戶',
          status: status,
          total_amount: 250,
          created_at: new Date()
        }
      ];
    }
  }

  /**
   * 獲取客戶訂單
   */
  async handleGetCustomerOrders(data) {
    const { phone, limit = 10 } = data;
    
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT id, contact_name, address, total_amount, status, created_at
        FROM orders 
        WHERE contact_phone = $1 
        ORDER BY created_at DESC 
        LIMIT $2
      `, [phone, limit]);
      
      return result.rows;
    } else {
      return [];
    }
  }

  // ============ 輔助方法 ============

  async calculateOrderTotals(items) {
    let subtotal = 0;
    
    for (const item of items) {
      if (item.line_total) {
        subtotal += parseFloat(item.line_total);
      } else if (item.unit_price && item.quantity) {
        subtotal += parseFloat(item.unit_price) * parseInt(item.quantity);
      }
    }
    
    const deliveryFee = subtotal >= 200 ? 0 : 50;
    const total = subtotal + deliveryFee;
    
    return {
      subtotal: subtotal,
      deliveryFee: deliveryFee,
      total: total
    };
  }

  async validateOrderData(orderData) {
    const errors = [];
    
    if (!orderData.name || orderData.name.trim() === '') {
      errors.push('客戶姓名必填');
    }
    
    if (!orderData.phone || orderData.phone.trim() === '') {
      errors.push('聯絡電話必填');
    }
    
    if (!orderData.address || orderData.address.trim() === '') {
      errors.push('送貨地址必填');
    }
    
    if (!orderData.items || !Array.isArray(orderData.items) || orderData.items.length === 0) {
      errors.push('訂單項目不能為空');
    }
    
    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }

  async getOrderById(orderId) {
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return result.rows.length > 0 ? result.rows[0] : null;
    } else {
      // 示範模式
      return {
        id: orderId,
        status: 'placed',
        contact_name: '示範客戶'
      };
    }
  }

  async notifyOrderCreated(orderId, order) {
    // 通知庫存 Agent 扣減庫存
    try {
      await this.sendMessage('InventoryAgent', {
        type: 'reserve_stock',
        data: { orderId, items: order.items }
      });
    } catch (error) {
      console.warn('⚠️ 無法通知 InventoryAgent:', error.message);
    }

    // 通知分析 Agent
    try {
      await this.sendMessage('AnalyticsAgent', {
        type: 'order_created',
        data: { orderId, order }
      });
    } catch (error) {
      console.warn('⚠️ 無法通知 AnalyticsAgent:', error.message);
    }
  }

  async notifyStatusChanged(orderId, oldStatus, newStatus) {
    const message = {
      type: 'order_status_changed',
      data: { orderId, oldStatus, newStatus, timestamp: new Date() }
    };

    // 通知配送 Agent
    if (newStatus === 'packed') {
      try {
        await this.sendMessage('DeliveryAgent', {
          type: 'order_ready_for_delivery',
          data: { orderId }
        });
      } catch (error) {
        console.warn('⚠️ 無法通知 DeliveryAgent:', error.message);
      }
    }

    // 通知客戶服務 Agent
    try {
      await this.sendMessage('NotificationAgent', message);
    } catch (error) {
      console.warn('⚠️ 無法通知 NotificationAgent:', error.message);
    }
  }
}

module.exports = OrderAgent;