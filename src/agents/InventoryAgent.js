const BaseAgent = require('./BaseAgent');

/**
 * 庫存管理代理程式
 * 負責處理所有庫存相關的業務邏輯
 */
class InventoryAgent extends BaseAgent {
  constructor(agentManager = null, databasePool = null) {
    super('InventoryAgent', agentManager);
    this.pool = databasePool;
    this.demoMode = false;
    this.lowStockThreshold = 10; // 預設低庫存門檻
    this.stockMonitorInterval = null;
    this.stockReservations = new Map(); // 庫存預留記錄
  }

  async initialize() {
    console.log('📦 InventoryAgent 初始化...');
    
    // 檢查資料庫連線
    if (this.pool) {
      try {
        await this.pool.query('SELECT 1');
        this.demoMode = false;
        console.log('✅ InventoryAgent 已連接資料庫');
      } catch (error) {
        console.warn('⚠️ InventoryAgent 無法連接資料庫，啟用示範模式');
        this.demoMode = true;
      }
    } else {
      this.demoMode = true;
    }

    // 註冊可處理的任務類型
    this.taskHandlers = {
      'check_stock': this.handleCheckStock.bind(this),
      'update_stock': this.handleUpdateStock.bind(this),
      'reserve_stock': this.handleReserveStock.bind(this),
      'release_stock': this.handleReleaseStock.bind(this),
      'get_low_stock_items': this.handleGetLowStockItems.bind(this),
      'restock_item': this.handleRestockItem.bind(this),
      'get_stock_movements': this.handleGetStockMovements.bind(this),
      'calculate_stock_value': this.handleCalculateStockValue.bind(this),
      'forecast_demand': this.handleForecastDemand.bind(this),
      'auto_reorder': this.handleAutoReorder.bind(this)
    };

    // 啟動庫存監控
    this.startStockMonitoring();

    console.log('✅ InventoryAgent 初始化完成');
  }

  async cleanup() {
    // 停止庫存監控
    if (this.stockMonitorInterval) {
      clearInterval(this.stockMonitorInterval);
      this.stockMonitorInterval = null;
    }
  }

  async processTask(task) {
    const handler = this.taskHandlers[task.type];
    if (!handler) {
      throw new Error(`不支援的任務類型: ${task.type}`);
    }

    return await handler(task.data);
  }

  /**
   * 檢查庫存
   */
  async handleCheckStock(data) {
    const { productId, productIds } = data;
    
    if (productId) {
      return await this.getStockByProductId(productId);
    } else if (productIds && Array.isArray(productIds)) {
      const results = {};
      for (const id of productIds) {
        results[id] = await this.getStockByProductId(id);
      }
      return results;
    } else {
      return await this.getAllStock();
    }
  }

  /**
   * 更新庫存
   */
  async handleUpdateStock(data) {
    const { productId, quantity, type, reason, operator = 'System' } = data;
    
    console.log(`📦 更新庫存: Product ${productId}, ${type} ${quantity}`);
    
    try {
      const currentStock = await this.getStockByProductId(productId);
      if (!currentStock) {
        throw new Error(`商品 ${productId} 庫存記錄不存在`);
      }

      const newQuantity = type === 'in' 
        ? currentStock.current_stock + quantity 
        : currentStock.current_stock - quantity;
      
      if (newQuantity < 0) {
        throw new Error(`庫存不足：當前庫存 ${currentStock.current_stock}，嘗試減少 ${quantity}`);
      }

      if (!this.demoMode && this.pool) {
        // 更新庫存表
        await this.pool.query(`
          UPDATE inventory 
          SET current_stock = $1, last_updated = CURRENT_TIMESTAMP 
          WHERE product_id = $2
        `, [newQuantity, productId]);

        // 記錄庫存異動
        await this.pool.query(`
          INSERT INTO stock_movements 
          (product_id, movement_type, quantity, reason, operator_name, created_at)
          VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `, [productId, type, quantity, reason || '', operator]);
      }

      // 檢查是否需要補貨提醒
      if (newQuantity <= currentStock.min_stock_alert) {
        await this.sendLowStockAlert(productId, newQuantity, currentStock.min_stock_alert);
      }

      return {
        success: true,
        productId: productId,
        oldStock: currentStock.current_stock,
        newStock: newQuantity,
        movement: { type, quantity, reason, operator }
      };

    } catch (error) {
      console.error('❌ 更新庫存失敗:', error);
      throw error;
    }
  }

  /**
   * 預留庫存（用於訂單）
   */
  /**
   * 單位換算函數
   * 將客戶下單單位換算為庫存單位
   */
  convertToInventoryUnit(customerQuantity, customerUnit, inventoryUnit) {
    // 如果單位相同，直接返回
    if (customerUnit === inventoryUnit) {
      return customerQuantity;
    }
    
    // 重量單位換算 (每公斤 ⇄ 每斤)
    // 1斤 = 600克 = 0.6公斤
    if (customerUnit === '每斤' && inventoryUnit === '每公斤') {
      return customerQuantity * 0.6; // 1斤 = 0.6公斤
    }
    if (customerUnit === '每公斤' && inventoryUnit === '每斤') {
      return customerQuantity / 0.6; // 1公斤 = 1.67斤
    }
    
    // 顆數單位換算 (半顆 ⇄ 顆)
    if (customerUnit === '半顆' && inventoryUnit === '每顆') {
      return customerQuantity * 0.5; // 1個半顆 = 0.5顆
    }
    if (customerUnit === '每顆' && inventoryUnit === '半顆') {
      return customerQuantity * 2; // 1顆 = 2個半顆
    }
    
    // 如果無法換算，返回原數量 (假設同等對待)
    console.warn(`⚠️ 無法換算單位: ${customerUnit} → ${inventoryUnit}，使用原數量`);
    return customerQuantity;
  }

  async handleReserveStock(data) {
    const { orderId, items } = data;
    
    console.log(`📦 預留庫存: 訂單 ${orderId}`);
    
    const reservations = [];
    
    try {
      // 開始事務處理
      if (!this.demoMode && this.pool) {
        await this.pool.query('BEGIN');
      }

      for (const item of items) {
        // 獲取商品庫存資訊 (包含單位資訊)
        const stockInfo = await this.getStockWithProductInfo(item.productId);
        if (!stockInfo) {
          throw new Error(`商品 ${item.productId} 庫存記錄不存在`);
        }
        
        // 進行單位換算
        const customerUnit = item.unit || stockInfo.unit_hint || '每個';
        const inventoryUnit = stockInfo.unit_hint || '每個';
        const convertedQuantity = this.convertToInventoryUnit(item.quantity, customerUnit, inventoryUnit);
        
        console.log(`🔄 單位換算: ${item.quantity}${customerUnit} → ${convertedQuantity}${inventoryUnit}`);

        if (stockInfo.current_stock < convertedQuantity) {
          throw new Error(`商品 ${item.name} 庫存不足：需要 ${convertedQuantity}${inventoryUnit}，現有 ${stockInfo.current_stock}${inventoryUnit}`);
        }

        // 預留庫存
        const newStock = stockInfo.current_stock - convertedQuantity;
        
        if (!this.demoMode && this.pool) {
          await this.pool.query(`
            UPDATE inventory 
            SET current_stock = $1, last_updated = CURRENT_TIMESTAMP 
            WHERE product_id = $2
          `, [newStock, item.productId]);

          // 記錄庫存異動
          await this.pool.query(`
            INSERT INTO stock_movements 
            (product_id, movement_type, quantity, reason, operator_name, reference_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, CURRENT_TIMESTAMP)
          `, [item.productId, 'reserved', convertedQuantity, `訂單預留 #${orderId} (${item.quantity}${customerUnit}→${convertedQuantity}${inventoryUnit})`, 'OrderAgent', orderId]);
        }

        reservations.push({
          productId: item.productId,
          productName: item.name,
          reservedQuantity: convertedQuantity,
          originalQuantity: item.quantity,
          customerUnit: customerUnit,
          inventoryUnit: inventoryUnit,
          remainingStock: newStock
        });
      }

      if (!this.demoMode && this.pool) {
        await this.pool.query('COMMIT');
      }

      // 記錄預留資訊
      this.stockReservations.set(orderId, {
        reservations: reservations,
        timestamp: new Date()
      });

      console.log(`✅ 訂單 ${orderId} 庫存預留成功`);
      return {
        success: true,
        orderId: orderId,
        reservations: reservations
      };

    } catch (error) {
      if (!this.demoMode && this.pool) {
        await this.pool.query('ROLLBACK');
      }
      console.error(`❌ 預留庫存失敗:`, error);
      throw error;
    }
  }

  /**
   * 釋放庫存預留（取消訂單時）
   */
  async handleReleaseStock(data) {
    const { orderId, reason = '訂單取消' } = data;
    
    const reservation = this.stockReservations.get(orderId);
    if (!reservation) {
      console.warn(`⚠️ 未找到訂單 ${orderId} 的庫存預留記錄`);
      return { success: false, message: '未找到預留記錄' };
    }

    try {
      if (!this.demoMode && this.pool) {
        await this.pool.query('BEGIN');
      }

      for (const res of reservation.reservations) {
        await this.handleUpdateStock({
          productId: res.productId,
          quantity: res.reservedQuantity,
          type: 'in',
          reason: reason,
          operator: 'OrderAgent'
        });
      }

      if (!this.demoMode && this.pool) {
        await this.pool.query('COMMIT');
      }

      // 移除預留記錄
      this.stockReservations.delete(orderId);

      return {
        success: true,
        orderId: orderId,
        releasedItems: reservation.reservations
      };

    } catch (error) {
      if (!this.demoMode && this.pool) {
        await this.pool.query('ROLLBACK');
      }
      console.error('❌ 釋放庫存預留失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取低庫存商品
   */
  async handleGetLowStockItems(data = {}) {
    const { threshold } = data;
    const alertThreshold = threshold || this.lowStockThreshold;
    
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT p.id, p.name, i.current_stock, i.min_stock_alert, 
               i.supplier_name, i.unit_cost
        FROM products p
        JOIN inventory i ON p.id = i.product_id
        WHERE i.current_stock <= COALESCE(i.min_stock_alert, $1)
        ORDER BY i.current_stock ASC
      `, [alertThreshold]);
      
      return result.rows;
    } else {
      // 示範模式
      return [
        {
          id: 2,
          name: '🍅 新鮮番茄',
          current_stock: 8,
          min_stock_alert: 15,
          supplier_name: '陽光果園',
          unit_cost: 18.00
        }
      ];
    }
  }

  /**
   * 商品進貨
   */
  async handleRestockItem(data) {
    const { productId, quantity, unitCost, supplierName, reason = '進貨補充' } = data;
    
    try {
      // 更新庫存
      const updateResult = await this.handleUpdateStock({
        productId: productId,
        quantity: quantity,
        type: 'in',
        reason: reason,
        operator: 'InventoryAgent'
      });

      // 更新供應商資訊和單位成本
      if (!this.demoMode && this.pool && (unitCost || supplierName)) {
        const updates = [];
        const params = [];
        let paramIndex = 1;

        if (unitCost !== undefined) {
          updates.push(`unit_cost = $${paramIndex++}`);
          params.push(unitCost);
        }
        
        if (supplierName) {
          updates.push(`supplier_name = $${paramIndex++}`);
          params.push(supplierName);
        }
        
        updates.push(`last_updated = CURRENT_TIMESTAMP`);
        params.push(productId);

        if (updates.length > 1) {
          await this.pool.query(`
            UPDATE inventory 
            SET ${updates.join(', ')}
            WHERE product_id = $${paramIndex}
          `, params);
        }
      }

      return {
        ...updateResult,
        restockInfo: { quantity, unitCost, supplierName, reason }
      };

    } catch (error) {
      console.error('❌ 商品進貨失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取庫存異動記錄
   */
  async handleGetStockMovements(data) {
    const { productId, limit = 50, startDate, endDate } = data;
    
    if (!this.demoMode && this.pool) {
      let whereClause = '';
      const params = [];
      
      if (productId) {
        whereClause += ` WHERE sm.product_id = $${params.length + 1}`;
        params.push(productId);
      }
      
      if (startDate) {
        whereClause += `${whereClause ? ' AND' : ' WHERE'} sm.created_at >= $${params.length + 1}`;
        params.push(startDate);
      }
      
      if (endDate) {
        whereClause += `${whereClause ? ' AND' : ' WHERE'} sm.created_at <= $${params.length + 1}`;
        params.push(endDate);
      }
      
      params.push(limit);
      
      const result = await this.pool.query(`
        SELECT sm.*, p.name as product_name
        FROM stock_movements sm
        JOIN products p ON sm.product_id = p.id
        ${whereClause}
        ORDER BY sm.created_at DESC
        LIMIT $${params.length}
      `, params);
      
      return result.rows;
    } else {
      return [];
    }
  }

  /**
   * 計算庫存總值
   */
  async handleCalculateStockValue(data = {}) {
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT 
          SUM(i.current_stock * i.unit_cost) as total_value,
          COUNT(*) as total_items,
          SUM(i.current_stock) as total_quantity
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE i.current_stock > 0
      `);
      
      return result.rows[0] || { total_value: 0, total_items: 0, total_quantity: 0 };
    } else {
      return {
        total_value: 15000,
        total_items: 5,
        total_quantity: 120
      };
    }
  }

  /**
   * 需求預測（簡單版本）
   */
  async handleForecastDemand(data) {
    const { productId, days = 7 } = data;
    
    // 這是一個簡化的需求預測
    // 實際應用中可能需要更複雜的演算法
    
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT 
          DATE(sm.created_at) as date,
          SUM(CASE WHEN sm.movement_type = 'out' THEN sm.quantity ELSE 0 END) as daily_consumption
        FROM stock_movements sm
        WHERE sm.product_id = $1 
          AND sm.created_at >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY DATE(sm.created_at)
        ORDER BY date DESC
      `, [productId]);
      
      const dailyData = result.rows;
      if (dailyData.length === 0) {
        return { predictedDemand: 0, confidence: 'low' };
      }
      
      const avgDailyConsumption = dailyData.reduce((sum, day) => 
        sum + parseFloat(day.daily_consumption), 0
      ) / dailyData.length;
      
      const predictedDemand = Math.ceil(avgDailyConsumption * days);
      
      return {
        productId: productId,
        forecastDays: days,
        avgDailyConsumption: avgDailyConsumption,
        predictedDemand: predictedDemand,
        confidence: dailyData.length >= 7 ? 'high' : 'medium'
      };
    } else {
      return {
        productId: productId,
        predictedDemand: 20,
        confidence: 'demo'
      };
    }
  }

  /**
   * 自動補貨建議
   */
  async handleAutoReorder(data = {}) {
    const lowStockItems = await this.handleGetLowStockItems(data);
    const reorderSuggestions = [];
    
    for (const item of lowStockItems) {
      const forecast = await this.handleForecastDemand({
        productId: item.id,
        days: 14
      });
      
      const suggestedQuantity = Math.max(
        item.min_stock_alert * 2, // 至少補充到安全庫存的兩倍
        forecast.predictedDemand || 0
      );
      
      reorderSuggestions.push({
        productId: item.id,
        productName: item.name,
        currentStock: item.current_stock,
        suggestedQuantity: suggestedQuantity,
        estimatedCost: suggestedQuantity * (item.unit_cost || 0),
        supplierName: item.supplier_name,
        urgency: item.current_stock <= 5 ? 'high' : 'medium'
      });
    }
    
    return reorderSuggestions;
  }

  // ============ 輔助方法 ============

  async getStockByProductId(productId) {
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT i.*, p.name as product_name
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE i.product_id = $1
      `, [productId]);
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } else {
      // 示範模式
      return {
        product_id: productId,
        current_stock: 25,
        min_stock_alert: 10,
        product_name: `示範商品 ${productId}`
      };
    }
  }

  async getStockWithProductInfo(productId) {
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT 
          i.*,
          p.name as product_name,
          p.unit_hint,
          p.price,
          p.is_priced_item
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        WHERE i.product_id = $1
      `, [productId]);
      
      return result.rows.length > 0 ? result.rows[0] : null;
    } else {
      // 示範模式
      return {
        product_id: productId,
        current_stock: 25,
        min_stock_alert: 10,
        product_name: `示範商品 ${productId}`,
        unit_hint: '每個'
      };
    }
  }

  async getAllStock() {
    if (!this.demoMode && this.pool) {
      const result = await this.pool.query(`
        SELECT i.*, p.name as product_name
        FROM inventory i
        JOIN products p ON i.product_id = p.id
        ORDER BY p.name
      `);
      
      return result.rows;
    } else {
      return [
        { product_id: 1, current_stock: 25, product_name: '高麗菜' },
        { product_id: 2, current_stock: 8, product_name: '番茄' }
      ];
    }
  }

  async sendLowStockAlert(productId, currentStock, threshold) {
    try {
      await this.sendMessage('NotificationAgent', {
        type: 'low_stock_alert',
        data: {
          productId: productId,
          currentStock: currentStock,
          threshold: threshold,
          timestamp: new Date()
        }
      });
    } catch (error) {
      console.warn('⚠️ 無法發送低庫存警報:', error.message);
    }
  }

  startStockMonitoring() {
    // 每小時檢查一次低庫存商品
    this.stockMonitorInterval = setInterval(async () => {
      try {
        const lowStockItems = await this.handleGetLowStockItems();
        if (lowStockItems.length > 0) {
          console.log(`📦 發現 ${lowStockItems.length} 個低庫存商品`);
          
          // 發送彙總警報
          await this.sendMessage('NotificationAgent', {
            type: 'daily_stock_report',
            data: {
              lowStockItems: lowStockItems,
              timestamp: new Date()
            }
          });
        }
      } catch (error) {
        console.error('❌ 庫存監控錯誤:', error);
      }
    }, 60 * 60 * 1000); // 1小時

    console.log('📦 庫存監控已啟動');
  }
}

module.exports = InventoryAgent;