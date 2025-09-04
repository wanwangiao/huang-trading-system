// =====================================
// 智能路線服務
// 整合GoogleMapsService和RouteOptimizationService
// 提供完整的路線規劃和優化解決方案
// =====================================

const GoogleMapsService = require('./GoogleMapsService');
const RouteOptimizationService = require('./RouteOptimizationService');

class SmartRouteService {
  constructor(pool = null) {
    this.name = 'SmartRouteService';
    this.googleMapsService = new GoogleMapsService(pool);
    this.routeOptimizationService = new RouteOptimizationService();
    this.pool = pool;
    
    console.log('🧠 SmartRouteService 已初始化');
  }

  /**
   * 設定資料庫連線池
   */
  setDatabasePool(pool) {
    this.pool = pool;
    this.googleMapsService.setDatabasePool(pool);
    console.log('📊 SmartRouteService 已連接資料庫');
  }

  /**
   * 智能路線規劃主函數
   * @param {Array} orderIds - 訂單ID列表
   * @param {Object} options - 規劃選項
   */
  async planSmartRoute(orderIds, options = {}) {
    const {
      algorithm = 'tsp_2opt',
      useGoogleDirections = true,
      startPoint = null,
      returnToStart = false,
      optimizeForTime = false,
      maxWaypoints = 23 // Google Maps API限制
    } = options;

    console.log(`🚀 開始智能路線規劃：${orderIds.length} 個訂單`);
    
    if (!orderIds || orderIds.length === 0) {
      throw new Error('訂單列表不能為空');
    }

    try {
      const startTime = Date.now();
      
      // 步驟1：獲取訂單資料和確保地理編碼
      const orders = await this.prepareOrdersWithGeocoding(orderIds);
      
      // 步驟2：根據訂單數量選擇策略
      let routePlan;
      if (orders.length <= maxWaypoints && useGoogleDirections) {
        // 使用Google Directions API獲取精確路線
        routePlan = await this.planWithGoogleDirections(orders, options);
      } else {
        // 使用本地TSP演算法優化
        routePlan = await this.planWithLocalOptimization(orders, options);
      }

      // 步驟3：生成詳細的配送計劃
      const deliveryPlan = await this.generateDeliveryPlan(routePlan, orders);

      // 步驟4：保存路線計劃到資料庫
      if (this.pool) {
        await this.saveRoutePlan(deliveryPlan);
      }

      const totalTime = Date.now() - startTime;
      console.log(`✅ 智能路線規劃完成，耗時 ${totalTime}ms`);

      return {
        success: true,
        routePlan: deliveryPlan,
        metadata: {
          totalOrders: orders.length,
          algorithm: algorithm,
          useGoogleDirections: useGoogleDirections && orders.length <= maxWaypoints,
          planningTime: totalTime,
          estimatedSavings: this.calculateEstimatedSavings(deliveryPlan)
        }
      };

    } catch (error) {
      console.error('智能路線規劃失敗:', error);
      throw new Error(`智能路線規劃失敗: ${error.message}`);
    }
  }

  /**
   * 準備訂單資料並確保地理編碼
   */
  async prepareOrdersWithGeocoding(orderIds) {
    console.log('📋 準備訂單資料...');

    if (!this.pool) {
      throw new Error('需要資料庫連接才能獲取訂單資料');
    }

    // 獲取訂單資料
    const ordersQuery = `
      SELECT id, address, lat, lng, contact_name, contact_phone, 
             total_amount, status, formatted_address, geocoded_at
      FROM orders 
      WHERE id = ANY($1) AND status IN ('paid', 'out_for_delivery')
      ORDER BY created_at ASC
    `;

    const result = await this.pool.query(ordersQuery, [orderIds]);
    const orders = result.rows;

    if (orders.length === 0) {
      throw new Error('未找到符合條件的訂單');
    }

    // 檢查並執行地理編碼
    const ungecodedOrders = orders.filter(order => 
      !order.lat || !order.lng || order.lat === null || order.lng === null
    );

    if (ungecodedOrders.length > 0) {
      console.log(`🗺️ 發現 ${ungecodedOrders.length} 個未地理編碼的訂單，正在處理...`);
      
      const geocodingResults = await this.googleMapsService.batchGeocode(ungecodedOrders);
      
      // 更新訂單列表中的地理座標
      const geocodedMap = new Map();
      geocodingResults.forEach(result => {
        if (result.success) {
          geocodedMap.set(result.orderId, {
            lat: result.lat,
            lng: result.lng,
            formatted_address: result.formatted_address
          });
        }
      });

      orders.forEach(order => {
        if (geocodedMap.has(order.id)) {
          const geocoded = geocodedMap.get(order.id);
          order.lat = geocoded.lat;
          order.lng = geocoded.lng;
          order.formatted_address = geocoded.formatted_address;
        }
      });
    }

    // 過濾掉仍然沒有座標的訂單
    const validOrders = orders.filter(order => 
      order.lat && order.lng && order.lat !== null && order.lng !== null
    );

    if (validOrders.length !== orders.length) {
      console.warn(`⚠️ ${orders.length - validOrders.length} 個訂單無法獲得地理座標，已從規劃中排除`);
    }

    console.log(`✅ 準備完成，共 ${validOrders.length} 個有效訂單`);
    return validOrders;
  }

  /**
   * 使用Google Directions API規劃路線
   */
  async planWithGoogleDirections(orders, options = {}) {
    console.log('🗺️ 使用Google Directions API規劃路線...');

    const { startPoint, returnToStart = false } = options;

    // 確定起點和終點
    const origin = startPoint || { lat: orders[0].lat, lng: orders[0].lng };
    const destination = returnToStart ? origin : { lat: orders[orders.length - 1].lat, lng: orders[orders.length - 1].lng };

    // 設定途徑點（排除起點和終點）
    const waypoints = orders.slice(startPoint ? 0 : 1, returnToStart ? orders.length : -1)
      .map(order => ({ lat: parseFloat(order.lat), lng: parseFloat(order.lng) }));

    // 呼叫Google Maps路線規劃
    const routeResult = await this.googleMapsService.planRoute(origin, destination, waypoints);

    if (!routeResult.success) {
      throw new Error(`Google路線規劃失敗: ${routeResult.error}`);
    }

    return {
      ...routeResult,
      orders: orders,
      method: 'google_directions'
    };
  }

  /**
   * 使用本地TSP演算法優化路線
   */
  async planWithLocalOptimization(orders, options = {}) {
    console.log('🧮 使用本地TSP演算法優化路線...');

    const { algorithm, startPoint } = options;

    // 為訂單添加座標資訊
    const ordersWithCoords = orders.map(order => ({
      ...order,
      lat: parseFloat(order.lat),
      lng: parseFloat(order.lng)
    }));

    // 執行路線優化
    const optimizationResult = await this.routeOptimizationService.optimizeRoute(
      ordersWithCoords,
      { algorithm, startPoint }
    );

    return {
      ...optimizationResult,
      orders: ordersWithCoords,
      method: 'local_optimization'
    };
  }

  /**
   * 生成詳細的配送計劃
   */
  async generateDeliveryPlan(routePlan, orders) {
    console.log('📋 生成配送計劃...');

    const plan = {
      id: this.generatePlanId(),
      createdAt: new Date(),
      status: 'planned',
      metadata: {
        totalOrders: orders.length,
        totalDistance: routePlan.totalDistance,
        totalDuration: routePlan.totalDuration,
        optimizationMethod: routePlan.method,
        estimatedCost: this.calculateEstimatedCost(routePlan),
        improvementPercentage: routePlan.improvementPercentage || 0
      },
      deliverySequence: [],
      summary: {}
    };

    // 建立配送順序
    if (routePlan.method === 'google_directions') {
      plan.deliverySequence = this.buildSequenceFromGoogleDirections(routePlan, orders);
    } else {
      plan.deliverySequence = this.buildSequenceFromOptimization(routePlan);
    }

    // 計算時間統計
    plan.summary = this.calculateRouteSummary(plan.deliverySequence, routePlan);

    // 生成駕駛指示（如果有Google路線資料）
    if (routePlan.legs) {
      plan.drivingInstructions = this.generateDrivingInstructions(routePlan.legs);
    }

    return plan;
  }

  /**
   * 從Google Directions結果建立配送順序
   */
  buildSequenceFromGoogleDirections(routeResult, orders) {
    const sequence = [];
    const startTime = new Date();
    let cumulativeTime = 0;

    // 根據Google的優化順序重新排列訂單
    const optimizedOrders = routeResult.optimizedOrder && routeResult.optimizedOrder.length > 0
      ? routeResult.optimizedOrder.map(index => orders[index])
      : orders;

    optimizedOrders.forEach((order, index) => {
      const leg = routeResult.legs[index];
      
      if (leg) {
        cumulativeTime += leg.duration; // Google提供的行駛時間（分鐘）
        cumulativeTime += 8; // 配送停留時間（8分鐘）

        sequence.push({
          orderId: order.id,
          customerName: order.contact_name,
          customerPhone: order.contact_phone,
          address: order.address,
          formattedAddress: order.formatted_address,
          lat: parseFloat(order.lat),
          lng: parseFloat(order.lng),
          sequence: index + 1,
          estimatedArrival: new Date(startTime.getTime() + (cumulativeTime - 8) * 60 * 1000),
          estimatedDeparture: new Date(startTime.getTime() + cumulativeTime * 60 * 1000),
          distanceToNext: leg.distance,
          durationToNext: leg.duration,
          orderValue: parseFloat(order.total_amount || 0),
          status: order.status
        });
      }
    });

    return sequence;
  }

  /**
   * 從優化結果建立配送順序
   */
  buildSequenceFromOptimization(routeResult) {
    return routeResult.sequence.map(item => ({
      orderId: item.orderId,
      sequence: item.sequence,
      estimatedArrival: item.estimatedArrival,
      distanceToNext: item.distanceToNext,
      durationToNext: item.durationToNext,
      status: 'planned'
    }));
  }

  /**
   * 計算路線摘要統計
   */
  calculateRouteSummary(sequence, routePlan) {
    const totalValue = sequence.reduce((sum, stop) => sum + (stop.orderValue || 0), 0);
    const averageStopTime = 8; // 分鐘
    
    const startTime = sequence.length > 0 ? sequence[0].estimatedArrival : new Date();
    const endTime = sequence.length > 0 
      ? new Date(sequence[sequence.length - 1].estimatedDeparture)
      : new Date();

    return {
      totalStops: sequence.length,
      totalValue: Math.round(totalValue * 100) / 100,
      totalDistance: routePlan.totalDistance,
      totalDuration: routePlan.totalDuration,
      averageStopTime: averageStopTime,
      estimatedStartTime: startTime,
      estimatedEndTime: endTime,
      estimatedFuelCost: this.calculateFuelCost(routePlan.totalDistance),
      estimatedDeliveryCost: this.calculateDeliveryCost(routePlan.totalDistance, sequence.length)
    };
  }

  /**
   * 生成駕駛指示
   */
  generateDrivingInstructions(legs) {
    const instructions = [];
    
    legs.forEach((leg, index) => {
      if (leg.steps) {
        leg.steps.forEach((step, stepIndex) => {
          instructions.push({
            sequence: index + 1,
            stepSequence: stepIndex + 1,
            instruction: step.html_instructions ? 
              step.html_instructions.replace(/<[^>]*>/g, '') : // 移除HTML標籤
              step.instructions,
            distance: step.distance.text,
            duration: step.duration.text,
            maneuver: step.maneuver
          });
        });
      }
    });

    return instructions;
  }

  /**
   * 計算預估節省
   */
  calculateEstimatedSavings(deliveryPlan) {
    const totalDistance = deliveryPlan.metadata.totalDistance;
    const totalOrders = deliveryPlan.metadata.totalOrders;
    
    // 假設沒有優化的情況下，平均每個訂單來回距離為10公里
    const unoptimizedDistance = totalOrders * 10;
    const savedDistance = Math.max(0, unoptimizedDistance - totalDistance);
    
    const fuelSavings = savedDistance * 0.15; // 每公里0.15元油費
    const timeSavings = Math.round(savedDistance * 3); // 每公里3分鐘時間節省

    return {
      distanceSaved: Math.round(savedDistance * 100) / 100,
      fuelSaved: Math.round(fuelSavings * 100) / 100,
      timeSaved: timeSavings,
      costSaved: Math.round((fuelSavings + timeSavings * 0.5) * 100) / 100 // 時間價值每分鐘0.5元
    };
  }

  /**
   * 計算預估成本
   */
  calculateEstimatedCost(routePlan) {
    const distance = routePlan.totalDistance || 0;
    const duration = routePlan.totalDuration || 0;
    
    return {
      fuelCost: this.calculateFuelCost(distance),
      laborCost: this.calculateLaborCost(duration),
      vehicleCost: this.calculateVehicleCost(distance),
      total: this.calculateTotalCost(distance, duration)
    };
  }

  /**
   * 計算油費
   */
  calculateFuelCost(distance) {
    const fuelPricePerKm = 0.15; // 每公里油費
    return Math.round(distance * fuelPricePerKm * 100) / 100;
  }

  /**
   * 計算人工成本
   */
  calculateLaborCost(duration) {
    const hourlyRate = 200; // 每小時人工成本
    return Math.round((duration / 60) * hourlyRate * 100) / 100;
  }

  /**
   * 計算車輛成本
   */
  calculateVehicleCost(distance) {
    const vehicleCostPerKm = 0.05; // 每公里車輛折舊和維護
    return Math.round(distance * vehicleCostPerKm * 100) / 100;
  }

  /**
   * 計算總成本
   */
  calculateTotalCost(distance, duration) {
    const fuel = this.calculateFuelCost(distance);
    const labor = this.calculateLaborCost(duration);
    const vehicle = this.calculateVehicleCost(distance);
    return fuel + labor + vehicle;
  }

  /**
   * 計算配送成本
   */
  calculateDeliveryCost(distance, stops) {
    const baseCost = stops * 20; // 每個停靠點基本成本
    const distanceCost = this.calculateTotalCost(distance, distance * 3); // 假設每公里3分鐘
    return baseCost + distanceCost;
  }

  /**
   * 生成計劃ID
   */
  generatePlanId() {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    return `ROUTE_${timestamp}_${random}`;
  }

  /**
   * 保存路線計劃到資料庫
   */
  async saveRoutePlan(deliveryPlan) {
    if (!this.pool) {
      console.warn('無資料庫連接，跳過保存路線計劃');
      return;
    }

    try {
      console.log('💾 保存路線計劃到資料庫...');

      // 檢查是否存在route_plans表
      await this.ensureRouteTablesExist();

      // 保存主要計劃
      const insertPlanQuery = `
        INSERT INTO route_plans (
          id, status, total_orders, total_distance, total_duration, 
          optimization_method, estimated_cost, improvement_percentage,
          created_at, plan_data
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      `;

      await this.pool.query(insertPlanQuery, [
        deliveryPlan.id,
        deliveryPlan.status,
        deliveryPlan.metadata.totalOrders,
        deliveryPlan.metadata.totalDistance,
        deliveryPlan.metadata.totalDuration,
        deliveryPlan.metadata.optimizationMethod,
        deliveryPlan.metadata.estimatedCost.total,
        deliveryPlan.metadata.improvementPercentage,
        deliveryPlan.createdAt,
        JSON.stringify(deliveryPlan)
      ]);

      // 保存配送順序
      const insertStopQuery = `
        INSERT INTO route_stops (
          route_plan_id, order_id, sequence, estimated_arrival, 
          estimated_departure, distance_to_next, duration_to_next
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `;

      for (const stop of deliveryPlan.deliverySequence) {
        await this.pool.query(insertStopQuery, [
          deliveryPlan.id,
          stop.orderId,
          stop.sequence,
          stop.estimatedArrival,
          stop.estimatedDeparture,
          stop.distanceToNext,
          stop.durationToNext
        ]);
      }

      console.log(`✅ 路線計劃 ${deliveryPlan.id} 已保存到資料庫`);

    } catch (error) {
      console.error('保存路線計劃失敗:', error);
      // 不拋出錯誤，避免影響主要流程
    }
  }

  /**
   * 確保路線相關資料表存在
   */
  async ensureRouteTablesExist() {
    const createTablesQuery = `
      -- 路線計劃表
      CREATE TABLE IF NOT EXISTS route_plans (
        id VARCHAR(50) PRIMARY KEY,
        status VARCHAR(20) DEFAULT 'planned',
        total_orders INTEGER NOT NULL,
        total_distance DECIMAL(10,2),
        total_duration INTEGER, -- 分鐘
        optimization_method VARCHAR(50),
        estimated_cost DECIMAL(10,2),
        improvement_percentage DECIMAL(5,2),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        plan_data JSONB
      );

      -- 路線停靠點表
      CREATE TABLE IF NOT EXISTS route_stops (
        id SERIAL PRIMARY KEY,
        route_plan_id VARCHAR(50) REFERENCES route_plans(id) ON DELETE CASCADE,
        order_id INTEGER REFERENCES orders(id),
        sequence INTEGER NOT NULL,
        estimated_arrival TIMESTAMP,
        estimated_departure TIMESTAMP,
        distance_to_next DECIMAL(8,2),
        duration_to_next INTEGER, -- 分鐘
        actual_arrival TIMESTAMP,
        actual_departure TIMESTAMP,
        status VARCHAR(20) DEFAULT 'planned'
      );

      -- 建立索引
      CREATE INDEX IF NOT EXISTS idx_route_plans_status ON route_plans(status);
      CREATE INDEX IF NOT EXISTS idx_route_plans_created_at ON route_plans(created_at);
      CREATE INDEX IF NOT EXISTS idx_route_stops_route_plan ON route_stops(route_plan_id);
      CREATE INDEX IF NOT EXISTS idx_route_stops_sequence ON route_stops(route_plan_id, sequence);
    `;

    await this.pool.query(createTablesQuery);
  }

  /**
   * 獲取歷史路線計劃
   */
  async getRoutePlans(options = {}) {
    if (!this.pool) {
      throw new Error('需要資料庫連接');
    }

    const { 
      status, 
      limit = 50, 
      offset = 0, 
      startDate, 
      endDate 
    } = options;

    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (startDate) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(endDate);
      paramIndex++;
    }

    const query = `
      SELECT * FROM route_plans 
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;
    
    params.push(limit, offset);

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * 獲取特定路線計劃詳情
   */
  async getRoutePlanDetails(planId) {
    if (!this.pool) {
      throw new Error('需要資料庫連接');
    }

    const planQuery = 'SELECT * FROM route_plans WHERE id = $1';
    const planResult = await this.pool.query(planQuery, [planId]);

    if (planResult.rows.length === 0) {
      throw new Error('找不到指定的路線計劃');
    }

    const plan = planResult.rows[0];

    const stopsQuery = `
      SELECT rs.*, o.contact_name, o.address, o.total_amount
      FROM route_stops rs
      LEFT JOIN orders o ON rs.order_id = o.id
      WHERE rs.route_plan_id = $1
      ORDER BY rs.sequence
    `;
    
    const stopsResult = await this.pool.query(stopsQuery, [planId]);

    return {
      ...plan,
      deliverySequence: stopsResult.rows
    };
  }
}

module.exports = SmartRouteService;