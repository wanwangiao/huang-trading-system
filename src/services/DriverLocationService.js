/**
 * 外送員位置追蹤服務
 * 處理外送員位置更新、追蹤和路線優化
 */
class DriverLocationService {
  constructor(database, sseService) {
    this.db = database;
    this.sse = sseService;
    
    // 位置更新間隔配置
    this.locationUpdateInterval = 10000; // 10秒
    this.maxLocationHistory = 100; // 最多保留100個位置記錄
    this.locationAccuracyThreshold = 50; // GPS精度閾值(公尺)
    
    // 活躍的外送員位置更新計時器
    this.activeDriverTimers = new Map();
  }

  /**
   * 更新外送員位置
   * @param {number} driverId - 外送員ID
   * @param {Object} locationData - 位置資料
   */
  async updateDriverLocation(driverId, locationData) {
    try {
      const {
        lat,
        lng,
        accuracy = null,
        speed = null,
        heading = null,
        orderId = null,
        timestamp = new Date().toISOString()
      } = locationData;

      // 驗證位置資料
      if (!this.isValidCoordinate(lat, lng)) {
        throw new Error('無效的座標資料');
      }

      // 檢查GPS精度
      if (accuracy && accuracy > this.locationAccuracyThreshold) {
        console.warn(`外送員 ${driverId} GPS精度不佳: ${accuracy}m`);
      }

      // 使用資料庫函數更新位置
      await this.db.query(
        'SELECT update_driver_location($1, $2, $3, $4, $5, $6, $7)',
        [driverId, lat, lng, accuracy, speed, heading, orderId]
      );

      // 準備廣播資料
      const broadcastData = {
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        accuracy,
        speed,
        heading,
        orderId,
        timestamp
      };

      // 如果外送員正在執行訂單，廣播位置更新
      if (orderId) {
        // 廣播給訂閱該訂單的客戶
        this.sse.broadcastOrderUpdate(orderId, {
          type: 'driver_location_update',
          driverLocation: broadcastData,
          message: '外送員位置已更新'
        });
      }

      // 廣播給訂閱該外送員的所有連接
      this.sse.broadcastDriverLocation(driverId, broadcastData);

      // 廣播給管理員
      this.sse.broadcastSystemNotification(
        `外送員 ${driverId} 位置已更新`,
        'info',
        { userType: 'admin' }
      );

      console.log(`📍 外送員 ${driverId} 位置已更新: (${lat}, ${lng})`);
      return broadcastData;

    } catch (error) {
      console.error('更新外送員位置失敗:', error);
      throw error;
    }
  }

  /**
   * 開始追蹤外送員位置
   * @param {number} driverId - 外送員ID
   * @param {number} orderId - 關聯的訂單ID
   */
  async startLocationTracking(driverId, orderId = null) {
    try {
      // 如果已經在追蹤，先停止
      if (this.activeDriverTimers.has(driverId)) {
        this.stopLocationTracking(driverId);
      }

      // 更新外送員狀態
      await this.db.query(`
        UPDATE drivers 
        SET status = 'delivering', updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [driverId]);

      // 記錄開始追蹤
      console.log(`🎯 開始追蹤外送員 ${driverId}${orderId ? ` (訂單: ${orderId})` : ''}`);

      // 發送通知給相關客戶
      if (orderId) {
        this.sse.broadcastOrderUpdate(orderId, {
          type: 'location_tracking_started',
          message: '外送員位置追蹤已開始',
          driverId,
          startedAt: new Date().toISOString()
        });
      }

      return true;

    } catch (error) {
      console.error('開始位置追蹤失敗:', error);
      throw error;
    }
  }

  /**
   * 停止追蹤外送員位置
   * @param {number} driverId - 外送員ID
   */
  async stopLocationTracking(driverId) {
    try {
      // 清除計時器
      if (this.activeDriverTimers.has(driverId)) {
        clearInterval(this.activeDriverTimers.get(driverId));
        this.activeDriverTimers.delete(driverId);
      }

      // 更新外送員狀態為在線
      await this.db.query(`
        UPDATE drivers 
        SET status = 'online', updated_at = CURRENT_TIMESTAMP 
        WHERE id = $1
      `, [driverId]);

      console.log(`⏹️ 停止追蹤外送員 ${driverId}`);
      return true;

    } catch (error) {
      console.error('停止位置追蹤失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取外送員當前位置
   * @param {number} driverId - 外送員ID
   */
  async getDriverCurrentLocation(driverId) {
    try {
      const result = await this.db.query(`
        SELECT 
          d.id,
          d.name,
          d.phone,
          d.status,
          d.current_lat,
          d.current_lng,
          d.last_location_update,
          d.vehicle_type
        FROM drivers d
        WHERE d.id = $1
      `, [driverId]);

      if (result.rows.length === 0) {
        throw new Error(`外送員 ${driverId} 不存在`);
      }

      const driver = result.rows[0];
      return {
        driverId: driver.id,
        name: driver.name,
        phone: driver.phone,
        status: driver.status,
        vehicleType: driver.vehicle_type,
        location: driver.current_lat && driver.current_lng ? {
          lat: parseFloat(driver.current_lat),
          lng: parseFloat(driver.current_lng),
          lastUpdated: driver.last_location_update
        } : null
      };

    } catch (error) {
      console.error('獲取外送員位置失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取外送員位置歷史
   * @param {number} driverId - 外送員ID
   * @param {Object} options - 查詢選項
   */
  async getDriverLocationHistory(driverId, options = {}) {
    try {
      const {
        orderId = null,
        startTime = null,
        endTime = null,
        limit = 50
      } = options;

      let query = `
        SELECT 
          dlh.id,
          dlh.lat,
          dlh.lng,
          dlh.accuracy,
          dlh.speed,
          dlh.heading,
          dlh.order_id,
          dlh.recorded_at
        FROM driver_location_history dlh
        WHERE dlh.driver_id = $1
      `;
      
      const params = [driverId];
      let paramIndex = 2;

      if (orderId) {
        query += ` AND dlh.order_id = $${paramIndex}`;
        params.push(orderId);
        paramIndex++;
      }

      if (startTime) {
        query += ` AND dlh.recorded_at >= $${paramIndex}`;
        params.push(startTime);
        paramIndex++;
      }

      if (endTime) {
        query += ` AND dlh.recorded_at <= $${paramIndex}`;
        params.push(endTime);
        paramIndex++;
      }

      query += ` ORDER BY dlh.recorded_at DESC LIMIT $${paramIndex}`;
      params.push(limit);

      const result = await this.db.query(query, params);

      return result.rows.map(row => ({
        id: row.id,
        lat: parseFloat(row.lat),
        lng: parseFloat(row.lng),
        accuracy: row.accuracy ? parseFloat(row.accuracy) : null,
        speed: row.speed ? parseFloat(row.speed) : null,
        heading: row.heading ? parseFloat(row.heading) : null,
        orderId: row.order_id,
        recordedAt: row.recorded_at
      }));

    } catch (error) {
      console.error('獲取位置歷史失敗:', error);
      throw error;
    }
  }

  /**
   * 計算外送員到目的地的距離和預計時間
   * @param {number} driverId - 外送員ID
   * @param {number} destinationLat - 目的地緯度
   * @param {number} destinationLng - 目的地經度
   */
  async calculateDeliveryEstimate(driverId, destinationLat, destinationLng) {
    try {
      const driverLocation = await this.getDriverCurrentLocation(driverId);
      
      if (!driverLocation.location) {
        throw new Error('外送員位置不明');
      }

      const { lat: driverLat, lng: driverLng } = driverLocation.location;
      
      // 計算直線距離 (公里)
      const distance = this.calculateDistance(
        driverLat, driverLng,
        destinationLat, destinationLng
      );

      // 根據交通工具類型估算速度
      const averageSpeed = this.getAverageSpeedByVehicle(driverLocation.vehicleType);
      
      // 估算時間 (分鐘)，加上20%的緩衝時間
      const estimatedMinutes = Math.ceil((distance / averageSpeed) * 60 * 1.2);
      
      // 預計到達時間
      const estimatedArrival = new Date();
      estimatedArrival.setMinutes(estimatedArrival.getMinutes() + estimatedMinutes);

      return {
        distance: Math.round(distance * 100) / 100, // 保留兩位小數
        estimatedMinutes,
        estimatedArrival: estimatedArrival.toISOString(),
        driverLocation: driverLocation.location
      };

    } catch (error) {
      console.error('計算配送預估失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取附近可用的外送員
   * @param {number} lat - 緯度
   * @param {number} lng - 經度
   * @param {number} radiusKm - 搜尋半徑(公里)
   */
  async getNearbyAvailableDrivers(lat, lng, radiusKm = 5) {
    try {
      const query = `
        SELECT 
          d.id,
          d.name,
          d.phone,
          d.vehicle_type,
          d.current_lat,
          d.current_lng,
          d.rating,
          d.last_location_update,
          SQRT(
            POWER((d.current_lat - $1) * 111.0, 2) + 
            POWER((d.current_lng - $2) * 111.0 * COS(RADIANS($1)), 2)
          ) as distance_km
        FROM drivers d
        WHERE 
          d.status IN ('online', 'available')
          AND d.current_lat IS NOT NULL 
          AND d.current_lng IS NOT NULL
          AND d.last_location_update > NOW() - INTERVAL '10 minutes'
        HAVING distance_km <= $3
        ORDER BY distance_km ASC, d.rating DESC
        LIMIT 10
      `;

      const result = await this.db.query(query, [lat, lng, radiusKm]);

      return result.rows.map(row => ({
        driverId: row.id,
        name: row.name,
        phone: row.phone,
        vehicleType: row.vehicle_type,
        rating: parseFloat(row.rating),
        location: {
          lat: parseFloat(row.current_lat),
          lng: parseFloat(row.current_lng),
          lastUpdated: row.last_location_update
        },
        distance: Math.round(parseFloat(row.distance_km) * 100) / 100
      }));

    } catch (error) {
      console.error('獲取附近外送員失敗:', error);
      throw error;
    }
  }

  /**
   * 清理舊的位置歷史記錄
   * @param {number} daysToKeep - 保留天數
   */
  async cleanupLocationHistory(daysToKeep = 30) {
    try {
      const result = await this.db.query(`
        DELETE FROM driver_location_history 
        WHERE recorded_at < NOW() - INTERVAL '${daysToKeep} days'
        RETURNING COUNT(*) as deleted_count
      `);

      const deletedCount = result.rows[0]?.deleted_count || 0;
      console.log(`🧹 清理了 ${deletedCount} 條舊的位置記錄`);
      return deletedCount;

    } catch (error) {
      console.error('清理位置歷史失敗:', error);
      throw error;
    }
  }

  /**
   * 驗證座標是否有效
   * @param {number} lat - 緯度
   * @param {number} lng - 經度
   */
  isValidCoordinate(lat, lng) {
    return (
      typeof lat === 'number' && 
      typeof lng === 'number' &&
      lat >= -90 && lat <= 90 &&
      lng >= -180 && lng <= 180 &&
      !isNaN(lat) && !isNaN(lng)
    );
  }

  /**
   * 計算兩點間的距離 (公里)
   * 使用 Haversine 公式
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
   * 根據交通工具類型獲取平均速度
   * @param {string} vehicleType - 交通工具類型
   */
  getAverageSpeedByVehicle(vehicleType) {
    const speedMap = {
      'bicycle': 15,    // 腳踏車 15km/h
      'scooter': 25,    // 機車 25km/h
      'car': 30,        // 汽車 30km/h
      'motorcycle': 25  // 摩托車 25km/h
    };
    
    return speedMap[vehicleType] || 20; // 預設 20km/h
  }

  /**
   * 獲取所有活躍外送員的統計資訊
   */
  async getActiveDriversStats() {
    try {
      const result = await this.db.query(`
        SELECT 
          COUNT(*) as total_drivers,
          COUNT(CASE WHEN status = 'online' THEN 1 END) as online_drivers,
          COUNT(CASE WHEN status = 'busy' THEN 1 END) as busy_drivers,
          COUNT(CASE WHEN status = 'delivering' THEN 1 END) as delivering_drivers,
          COUNT(CASE WHEN last_location_update > NOW() - INTERVAL '5 minutes' THEN 1 END) as recently_active
        FROM drivers
      `);

      return result.rows[0];

    } catch (error) {
      console.error('獲取外送員統計失敗:', error);
      throw error;
    }
  }
}

module.exports = DriverLocationService;