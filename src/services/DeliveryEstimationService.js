/**
 * 配送時間預估服務
 * 處理配送時間計算、路線優化和ETA預測
 */
class DeliveryEstimationService {
  constructor(database, googleMapsService = null) {
    this.db = database;
    this.googleMaps = googleMapsService;
    
    // 基礎配送時間設定
    this.baseConfig = {
      preparationTime: 20,        // 基礎準備時間(分鐘)
      averageSpeed: 25,          // 平均行駛速度(km/h)
      bufferPercentage: 20,      // 時間緩衝(%)
      maxDeliveryRadius: 15,     // 最大配送半徑(km)
      rushHourMultiplier: 1.5,   // 尖峰時間倍數
      trafficMultiplier: 1.3     // 交通壅塞倍數
    };
    
    // 車輛類型配置
    this.vehicleConfig = {
      bicycle: {
        averageSpeed: 15,
        fuelEfficiency: 0,
        weatherImpact: 2.0
      },
      scooter: {
        averageSpeed: 25,
        fuelEfficiency: 35,
        weatherImpact: 1.5
      },
      motorcycle: {
        averageSpeed: 28,
        fuelEfficiency: 30,
        weatherImpact: 1.3
      },
      car: {
        averageSpeed: 30,
        fuelEfficiency: 12,
        weatherImpact: 1.1
      }
    };
    
    // 時段配置
    this.timeSlots = {
      rush_morning: { start: 7, end: 9, multiplier: 1.5 },
      normal_morning: { start: 9, end: 11, multiplier: 1.0 },
      lunch: { start: 11, end: 14, multiplier: 1.3 },
      afternoon: { start: 14, end: 17, multiplier: 1.0 },
      rush_evening: { start: 17, end: 20, multiplier: 1.6 },
      night: { start: 20, end: 24, multiplier: 0.9 },
      early_morning: { start: 0, end: 7, multiplier: 0.8 }
    };
  }

  /**
   * 計算訂單的預計送達時間
   * @param {Object} orderData - 訂單資料
   * @param {Object} driverData - 外送員資料
   * @param {Object} options - 計算選項
   */
  async calculateDeliveryTime(orderData, driverData = null, options = {}) {
    try {
      const {
        considerTraffic = true,
        considerWeather = true,
        useGoogleMaps = false,
        bufferTime = true
      } = options;

      // 準備時間計算
      const preparationTime = await this.calculatePreparationTime(orderData);
      
      // 行駛時間計算
      let travelTime = 0;
      let distance = 0;
      
      if (driverData) {
        const travelData = await this.calculateTravelTime(
          driverData,
          orderData,
          { considerTraffic, useGoogleMaps }
        );
        travelTime = travelData.travelTime;
        distance = travelData.distance;
      } else {
        // 如果沒有指定外送員，使用平均配送時間
        travelTime = this.baseConfig.preparationTime;
        distance = 5; // 假設平均距離
      }

      // 時段調整
      const timeMultiplier = this.getTimeSlotMultiplier(new Date());
      
      // 天氣調整
      let weatherMultiplier = 1.0;
      if (considerWeather) {
        weatherMultiplier = await this.getWeatherMultiplier(driverData?.vehicle_type);
      }
      
      // 計算總時間
      let totalMinutes = preparationTime + (travelTime * timeMultiplier * weatherMultiplier);
      
      // 添加緩衝時間
      if (bufferTime) {
        totalMinutes *= (1 + this.baseConfig.bufferPercentage / 100);
      }
      
      // 計算預計送達時間
      const estimatedDeliveryTime = new Date();
      estimatedDeliveryTime.setMinutes(estimatedDeliveryTime.getMinutes() + Math.ceil(totalMinutes));
      
      // 計算信心度 (基於資料可靠性)
      const confidence = this.calculateConfidence(driverData, useGoogleMaps, considerTraffic);
      
      return {
        estimatedDeliveryTime: estimatedDeliveryTime.toISOString(),
        totalMinutes: Math.ceil(totalMinutes),
        breakdown: {
          preparationTime: Math.ceil(preparationTime),
          travelTime: Math.ceil(travelTime),
          timeMultiplier,
          weatherMultiplier,
          bufferTime: bufferTime ? Math.ceil(totalMinutes * this.baseConfig.bufferPercentage / 100) : 0
        },
        distance: Math.round(distance * 100) / 100,
        confidence: confidence,
        calculatedAt: new Date().toISOString()
      };

    } catch (error) {
      console.error('計算配送時間失敗:', error);
      throw error;
    }
  }

  /**
   * 計算準備時間
   * @param {Object} orderData - 訂單資料
   */
  async calculatePreparationTime(orderData) {
    try {
      let preparationTime = this.baseConfig.preparationTime;
      
      // 根據訂單商品數量調整
      const itemCount = await this.getOrderItemCount(orderData.id);
      if (itemCount > 5) {
        preparationTime += Math.ceil((itemCount - 5) * 2); // 每多5個商品增加2分鐘
      }
      
      // 根據訂單金額調整 (大額訂單需要更多準備時間)
      if (orderData.total > 1000) {
        preparationTime += 10;
      } else if (orderData.total > 500) {
        preparationTime += 5;
      }
      
      // 檢查是否為特殊商品 (需要額外處理)
      const hasSpecialItems = await this.checkSpecialItems(orderData.id);
      if (hasSpecialItems) {
        preparationTime += 15;
      }
      
      return preparationTime;

    } catch (error) {
      console.error('計算準備時間失敗:', error);
      return this.baseConfig.preparationTime;
    }
  }

  /**
   * 計算行駛時間
   * @param {Object} driverData - 外送員資料
   * @param {Object} orderData - 訂單資料
   * @param {Object} options - 選項
   */
  async calculateTravelTime(driverData, orderData, options = {}) {
    try {
      const { considerTraffic = true, useGoogleMaps = false } = options;
      
      // 獲取起始位置 (外送員當前位置或店鋪位置)
      let originLat, originLng;
      if (driverData.current_lat && driverData.current_lng) {
        originLat = driverData.current_lat;
        originLng = driverData.current_lng;
      } else {
        // 使用店鋪位置作為起始點
        const storeLocation = await this.getStoreLocation();
        originLat = storeLocation.lat;
        originLng = storeLocation.lng;
      }
      
      // 目的地位置
      const destLat = orderData.lat;
      const destLng = orderData.lng;
      
      if (!destLat || !destLng) {
        throw new Error('訂單地址座標不完整');
      }
      
      // 使用 Google Maps API 計算精確時間
      if (useGoogleMaps && this.googleMaps) {
        return await this.calculateWithGoogleMaps(
          originLat, originLng,
          destLat, destLng,
          driverData.vehicle_type,
          considerTraffic
        );
      }
      
      // 使用簡單距離計算
      const distance = this.calculateDistance(originLat, originLng, destLat, destLng);
      
      // 根據車輛類型獲取平均速度
      const vehicleConfig = this.vehicleConfig[driverData.vehicle_type] || this.vehicleConfig.scooter;
      const averageSpeed = vehicleConfig.averageSpeed;
      
      // 計算基礎行駛時間 (分鐘)
      let travelTime = (distance / averageSpeed) * 60;
      
      // 交通狀況調整
      if (considerTraffic) {
        const trafficMultiplier = this.getTrafficMultiplier();
        travelTime *= trafficMultiplier;
      }
      
      return {
        travelTime: travelTime,
        distance: distance
      };

    } catch (error) {
      console.error('計算行駛時間失敗:', error);
      // 返回預設值
      return {
        travelTime: 30,
        distance: 5
      };
    }
  }

  /**
   * 使用 Google Maps API 計算行駛時間
   */
  async calculateWithGoogleMaps(originLat, originLng, destLat, destLng, vehicleType, considerTraffic) {
    try {
      // 根據車輛類型選擇行駛模式
      let travelMode = 'DRIVING';
      if (vehicleType === 'bicycle') {
        travelMode = 'BICYCLING';
      }
      
      const result = await this.googleMaps.calculateRoute({
        origin: { lat: originLat, lng: originLng },
        destination: { lat: destLat, lng: destLng },
        travelMode,
        considerTraffic,
        departureTime: new Date()
      });
      
      return {
        travelTime: result.duration / 60, // 轉換為分鐘
        distance: result.distance / 1000   // 轉換為公里
      };

    } catch (error) {
      console.error('Google Maps 計算失敗:', error);
      // 回退到簡單計算
      const distance = this.calculateDistance(originLat, originLng, destLat, destLng);
      const vehicleConfig = this.vehicleConfig[vehicleType] || this.vehicleConfig.scooter;
      const travelTime = (distance / vehicleConfig.averageSpeed) * 60;
      
      return { travelTime, distance };
    }
  }

  /**
   * 計算兩點間距離 (公里)
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球半徑(公里)
    const dLat = this.toRadians(lat2 - lat1);
    const dLng = this.toRadians(lng2 - lng1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLng / 2) * Math.sin(dLng / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * 角度轉弧度
   */
  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * 獲取時段調整倍數
   */
  getTimeSlotMultiplier(date) {
    const hour = date.getHours();
    
    for (const [slot, config] of Object.entries(this.timeSlots)) {
      if ((config.start <= config.end && hour >= config.start && hour < config.end) ||
          (config.start > config.end && (hour >= config.start || hour < config.end))) {
        return config.multiplier;
      }
    }
    
    return 1.0;
  }

  /**
   * 獲取交通狀況倍數
   */
  getTrafficMultiplier() {
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    
    // 週末交通較順暢
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 1.1;
    }
    
    // 平日尖峰時間
    if ((hour >= 7 && hour <= 9) || (hour >= 17 && hour <= 19)) {
      return this.baseConfig.rushHourMultiplier;
    }
    
    // 午餐時間
    if (hour >= 11 && hour <= 14) {
      return this.baseConfig.trafficMultiplier;
    }
    
    return 1.0;
  }

  /**
   * 獲取天氣調整倍數
   */
  async getWeatherMultiplier(vehicleType = 'scooter') {
    try {
      // 這裡可以整合氣象API獲取實時天氣
      // 暫時使用固定值
      const vehicleConfig = this.vehicleConfig[vehicleType] || this.vehicleConfig.scooter;
      
      // 模擬天氣狀況 (實際應用中應該從氣象API獲取)
      const weatherCondition = 'clear'; // clear, rain, heavy_rain, storm
      
      switch (weatherCondition) {
        case 'rain':
          return vehicleConfig.weatherImpact * 0.3;
        case 'heavy_rain':
          return vehicleConfig.weatherImpact * 0.5;
        case 'storm':
          return vehicleConfig.weatherImpact * 0.8;
        default:
          return 1.0;
      }
      
    } catch (error) {
      console.error('獲取天氣調整失敗:', error);
      return 1.0;
    }
  }

  /**
   * 計算預估信心度
   */
  calculateConfidence(driverData, useGoogleMaps, considerTraffic) {
    let confidence = 0.5; // 基礎信心度
    
    // 有外送員位置資料
    if (driverData && driverData.current_lat && driverData.current_lng) {
      confidence += 0.2;
    }
    
    // 使用 Google Maps API
    if (useGoogleMaps) {
      confidence += 0.2;
    }
    
    // 考慮交通狀況
    if (considerTraffic) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  /**
   * 獲取訂單商品數量
   */
  async getOrderItemCount(orderId) {
    try {
      const result = await this.db.query(
        'SELECT COUNT(*) as item_count FROM order_items WHERE order_id = $1',
        [orderId]
      );
      return parseInt(result.rows[0].item_count) || 0;
    } catch (error) {
      console.error('獲取訂單商品數量失敗:', error);
      return 0;
    }
  }

  /**
   * 檢查是否有特殊商品
   */
  async checkSpecialItems(orderId) {
    try {
      // 檢查是否有需要特殊處理的商品 (例如冷凍商品、易碎商品等)
      const result = await this.db.query(`
        SELECT oi.*, p.name 
        FROM order_items oi 
        JOIN products p ON oi.product_id = p.id 
        WHERE oi.order_id = $1 
          AND (p.name ILIKE '%冷凍%' OR p.name ILIKE '%易碎%' OR p.name ILIKE '%特殊%')
      `, [orderId]);
      
      return result.rows.length > 0;
    } catch (error) {
      console.error('檢查特殊商品失敗:', error);
      return false;
    }
  }

  /**
   * 獲取店鋪位置
   */
  async getStoreLocation() {
    try {
      // 從設定表或硬編碼獲取店鋪位置
      const result = await this.db.query(`
        SELECT setting_value 
        FROM system_settings 
        WHERE setting_key = 'store_location'
      `);
      
      if (result.rows.length > 0) {
        return JSON.parse(result.rows[0].setting_value);
      }
      
      // 預設台中市區位置
      return { lat: 24.1477, lng: 120.6736 };
      
    } catch (error) {
      console.error('獲取店鋪位置失敗:', error);
      return { lat: 24.1477, lng: 120.6736 };
    }
  }

  /**
   * 批量計算多個訂單的配送時間
   */
  async batchCalculateDeliveryTimes(orders, availableDrivers = []) {
    const results = [];
    
    for (const order of orders) {
      try {
        // 為每個訂單找最適合的外送員
        const bestDriver = this.findBestDriverForOrder(order, availableDrivers);
        
        const estimation = await this.calculateDeliveryTime(order, bestDriver);
        
        results.push({
          orderId: order.id,
          estimation,
          recommendedDriver: bestDriver ? bestDriver.id : null
        });
        
      } catch (error) {
        console.error(`計算訂單 ${order.id} 配送時間失敗:`, error);
        results.push({
          orderId: order.id,
          error: error.message
        });
      }
    }
    
    return results;
  }

  /**
   * 為訂單找最適合的外送員
   */
  findBestDriverForOrder(order, availableDrivers) {
    if (!availableDrivers || availableDrivers.length === 0) {
      return null;
    }
    
    // 根據距離、評分、車輛類型等因素評分
    const scoredDrivers = availableDrivers.map(driver => {
      let score = 0;
      
      // 距離評分 (距離越近分數越高)
      if (driver.current_lat && driver.current_lng && order.lat && order.lng) {
        const distance = this.calculateDistance(
          driver.current_lat, driver.current_lng,
          order.lat, order.lng
        );
        score += Math.max(0, 100 - distance * 10); // 每公里減10分
      }
      
      // 評分評分
      score += (driver.rating || 5) * 10;
      
      // 車輛類型評分 (機車最適合一般配送)
      if (driver.vehicle_type === 'scooter') {
        score += 20;
      } else if (driver.vehicle_type === 'motorcycle') {
        score += 15;
      } else if (driver.vehicle_type === 'car') {
        score += 10;
      }
      
      return { ...driver, score };
    });
    
    // 選擇分數最高的外送員
    scoredDrivers.sort((a, b) => b.score - a.score);
    return scoredDrivers[0];
  }

  /**
   * 更新配送時間預估的準確性 (機器學習反饋)
   */
  async updateEstimationAccuracy(orderId, actualDeliveryTime) {
    try {
      // 獲取原始預估時間
      const result = await this.db.query(`
        SELECT estimated_delivery_time, created_at 
        FROM orders 
        WHERE id = $1
      `, [orderId]);
      
      if (result.rows.length === 0) {
        return;
      }
      
      const originalEstimate = new Date(result.rows[0].estimated_delivery_time);
      const orderTime = new Date(result.rows[0].created_at);
      const actualTime = new Date(actualDeliveryTime);
      
      // 計算預估誤差
      const estimatedMinutes = (originalEstimate - orderTime) / 1000 / 60;
      const actualMinutes = (actualTime - orderTime) / 1000 / 60;
      const errorMinutes = Math.abs(estimatedMinutes - actualMinutes);
      const errorPercentage = (errorMinutes / actualMinutes) * 100;
      
      // 記錄預估準確性
      await this.db.query(`
        INSERT INTO delivery_estimation_feedback 
        (order_id, estimated_minutes, actual_minutes, error_minutes, error_percentage)
        VALUES ($1, $2, $3, $4, $5)
      `, [orderId, estimatedMinutes, actualMinutes, errorMinutes, errorPercentage]);
      
      console.log(`📊 訂單 ${orderId} 配送時間預估反饋已記錄 (誤差: ${errorMinutes.toFixed(1)}分鐘)`);
      
    } catch (error) {
      console.error('更新預估準確性失敗:', error);
    }
  }
}

module.exports = DeliveryEstimationService;