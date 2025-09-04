// =====================================
// Google Maps API 安全代理服務
// 隱藏 API Key 並提供額外的安全控制
// =====================================

const axios = require('axios');
const crypto = require('crypto');

class GoogleMapsProxyService {
  constructor(pool = null) {
    this.name = 'GoogleMapsProxyService';
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY;
    this.baseUrl = 'https://maps.googleapis.com/maps/api';
    this.pool = pool;
    
    // 安全配置
    this.maxRequestsPerMinute = 100;
    this.maxRequestsPerHour = 2500;
    this.maxRequestsPerDay = 25000;
    this.allowedOrigins = ['localhost', 'yourdomain.com']; // 替換為實際域名
    
    // 請求計數器
    this.requestCounters = {
      minute: new Map(),
      hour: new Map(),
      day: new Map()
    };
    
    // 定期清理計數器
    this.setupCounterCleanup();
    
    if (!this.apiKey || this.apiKey === 'your_google_maps_key_here') {
      console.warn('⚠️ Google Maps API Key 未設定');
      this.useMockData = true;
    } else {
      this.useMockData = false;
      console.log('🔒 Google Maps 安全代理服務已啟動');
    }
  }
  
  /**
   * 設定資料庫連線池
   */
  setDatabasePool(pool) {
    this.pool = pool;
    console.log('📊 GoogleMapsProxyService 已連接資料庫');
  }
  
  /**
   * 驗證請求來源和權限
   */
  async validateRequest(req) {
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.get('User-Agent');
    const origin = req.get('Origin') || req.get('Referer');
    
    // 檢查請求來源
    if (origin) {
      const isAllowedOrigin = this.allowedOrigins.some(allowed => 
        origin.includes(allowed)
      );
      if (!isAllowedOrigin) {
        throw new Error('Unauthorized origin');
      }
    }
    
    // 檢查請求頻率限制
    await this.checkRateLimit(clientIP);
    
    // 記錄 API 使用情況
    await this.logApiUsage(clientIP, userAgent, 'validation_passed');
    
    return true;
  }
  
  /**
   * 檢查請求頻率限制
   */
  async checkRateLimit(clientIP) {
    const now = new Date();
    const minuteKey = `${clientIP}_${now.getMinutes()}`;
    const hourKey = `${clientIP}_${now.getHours()}`;
    const dayKey = `${clientIP}_${now.getDate()}`;
    
    // 檢查分鐘級限制
    const minuteCount = this.requestCounters.minute.get(minuteKey) || 0;
    if (minuteCount >= this.maxRequestsPerMinute) {
      await this.logApiUsage(clientIP, null, 'rate_limit_exceeded_minute');
      throw new Error('Rate limit exceeded: too many requests per minute');
    }
    
    // 檢查小時級限制
    const hourCount = this.requestCounters.hour.get(hourKey) || 0;
    if (hourCount >= this.maxRequestsPerHour) {
      await this.logApiUsage(clientIP, null, 'rate_limit_exceeded_hour');
      throw new Error('Rate limit exceeded: too many requests per hour');
    }
    
    // 檢查日級限制
    const dayCount = this.requestCounters.day.get(dayKey) || 0;
    if (dayCount >= this.maxRequestsPerDay) {
      await this.logApiUsage(clientIP, null, 'rate_limit_exceeded_day');
      throw new Error('Rate limit exceeded: too many requests per day');
    }
    
    // 更新計數器
    this.requestCounters.minute.set(minuteKey, minuteCount + 1);
    this.requestCounters.hour.set(hourKey, hourCount + 1);
    this.requestCounters.day.set(dayKey, dayCount + 1);
  }
  
  /**
   * 安全的地理編碼代理
   */
  async proxyGeocode(req, res) {
    try {
      await this.validateRequest(req);
      
      const { address } = req.body;
      if (!address || typeof address !== 'string') {
        return res.status(400).json({ 
          success: false, 
          error: '無效的地址參數' 
        });
      }
      
      // 檢查快取
      const cachedResult = await this.getCachedGeocode(address);
      if (cachedResult) {
        await this.updateCacheHitCount(address);
        await this.logApiUsage(req.ip, req.get('User-Agent'), 'cache_hit');
        return res.json({ success: true, ...cachedResult, cached: true });
      }
      
      if (this.useMockData) {
        const mockResult = this.mockGeocode(address);
        return res.json(mockResult);
      }
      
      // 呼叫 Google Maps API
      const response = await axios.get(`${this.baseUrl}/geocode/json`, {
        params: {
          address: address,
          key: this.apiKey,
          language: 'zh-TW',
          region: 'tw'
        },
        timeout: 10000
      });
      
      const data = response.data;
      
      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const location = result.geometry.location;
        
        const geocodeResult = {
          lat: location.lat,
          lng: location.lng,
          coordinates: [location.lng, location.lat],
          formatted_address: result.formatted_address,
          place_id: result.place_id,
          address_components: result.address_components,
          geometry_type: result.geometry.location_type,
          location_type: result.types
        };
        
        // 儲存到快取
        await this.cacheGeocodeResult(address, geocodeResult);
        await this.logApiUsage(req.ip, req.get('User-Agent'), 'api_call_success');
        
        return res.json({ success: true, ...geocodeResult, cached: false });
      } else {
        const error = `地理編碼失敗: ${data.status}`;
        await this.logApiUsage(req.ip, req.get('User-Agent'), 'api_call_failed');
        return res.status(400).json({ success: false, error });
      }
      
    } catch (error) {
      console.error('代理地理編碼錯誤:', error);
      await this.logApiUsage(req.ip, req.get('User-Agent'), 'error');
      
      if (error.message.includes('Rate limit exceeded')) {
        return res.status(429).json({ 
          success: false, 
          error: error.message 
        });
      }
      
      return res.status(500).json({ 
        success: false, 
        error: '內部伺服器錯誤' 
      });
    }
  }
  
  /**
   * 安全的距離矩陣代理
   */
  async proxyDistanceMatrix(req, res) {
    try {
      await this.validateRequest(req);
      
      const { origins, destinations } = req.body;
      
      if (!origins || !destinations || !Array.isArray(origins) || !Array.isArray(destinations)) {
        return res.status(400).json({ 
          success: false, 
          error: '無效的起點或終點參數' 
        });
      }
      
      // 限制批次大小以控制成本
      if (origins.length > 10 || destinations.length > 10) {
        return res.status(400).json({ 
          success: false, 
          error: '批次大小超過限制（最多10個起點和10個終點）' 
        });
      }
      
      if (this.useMockData) {
        const mockResult = this.mockDistanceMatrix(origins, destinations);
        return res.json({ success: true, ...mockResult });
      }
      
      const originsStr = origins.map(o => `${o.lat},${o.lng}`).join('|');
      const destinationsStr = destinations.map(d => `${d.lat},${d.lng}`).join('|');
      
      const response = await axios.get(`${this.baseUrl}/distancematrix/json`, {
        params: {
          origins: originsStr,
          destinations: destinationsStr,
          key: this.apiKey,
          units: 'metric',
          mode: 'driving',
          language: 'zh-TW',
          avoid: 'tolls'
        },
        timeout: 15000
      });
      
      const data = response.data;
      
      if (data.status === 'OK') {
        await this.logApiUsage(req.ip, req.get('User-Agent'), 'distance_matrix_success');
        return res.json({ success: true, ...data });
      } else {
        await this.logApiUsage(req.ip, req.get('User-Agent'), 'distance_matrix_failed');
        return res.status(400).json({ 
          success: false, 
          error: `Distance Matrix API 錯誤: ${data.status}` 
        });
      }
      
    } catch (error) {
      console.error('代理距離矩陣錯誤:', error);
      await this.logApiUsage(req.ip, req.get('User-Agent'), 'error');
      return res.status(500).json({ 
        success: false, 
        error: '內部伺服器錯誤' 
      });
    }
  }
  
  /**
   * 獲取 API 使用統計
   */
  async getUsageStats(req, res) {
    try {
      if (!this.pool) {
        return res.status(500).json({ error: '資料庫未連接' });
      }
      
      const stats = await this.pool.query(`
        SELECT 
          operation_type,
          COUNT(*) as request_count,
          DATE(created_at) as date
        FROM google_maps_usage_log 
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY operation_type, DATE(created_at)
        ORDER BY date DESC, operation_type
      `);
      
      const costEstimate = await this.calculateCostEstimate();
      
      return res.json({
        success: true,
        dailyStats: stats.rows,
        costEstimate,
        rateLimits: {
          perMinute: this.maxRequestsPerMinute,
          perHour: this.maxRequestsPerHour,
          perDay: this.maxRequestsPerDay
        }
      });
      
    } catch (error) {
      console.error('獲取使用統計錯誤:', error);
      return res.status(500).json({ 
        success: false, 
        error: '無法獲取使用統計' 
      });
    }
  }
  
  /**
   * 記錄 API 使用情況
   */
  async logApiUsage(clientIP, userAgent, operationType) {
    try {
      if (!this.pool) {
        return;
      }
      
      await this.pool.query(`
        INSERT INTO google_maps_usage_log (
          client_ip, user_agent, operation_type, created_at
        ) VALUES ($1, $2, $3, NOW())
      `, [clientIP, userAgent, operationType]);
      
    } catch (error) {
      console.error('記錄 API 使用情況錯誤:', error);
    }
  }
  
  /**
   * 計算成本估算
   */
  async calculateCostEstimate() {
    try {
      if (!this.pool) {
        return { error: '資料庫未連接' };
      }
      
      const result = await this.pool.query(`
        SELECT 
          operation_type,
          COUNT(*) as count
        FROM google_maps_usage_log 
        WHERE created_at >= DATE_TRUNC('month', NOW())
        GROUP BY operation_type
      `);
      
      const costs = {
        geocoding: 0.005, // $5 per 1000 requests
        distance_matrix: 0.005,
        directions: 0.005,
        js_api_load: 0.007
      };
      
      let totalCost = 0;
      const breakdown = {};
      
      result.rows.forEach(row => {
        let costPerRequest = 0;
        if (row.operation_type.includes('geocod') || row.operation_type === 'api_call_success') {
          costPerRequest = costs.geocoding;
        } else if (row.operation_type.includes('distance')) {
          costPerRequest = costs.distance_matrix;
        } else if (row.operation_type.includes('direction')) {
          costPerRequest = costs.directions;
        }
        
        const cost = (row.count * costPerRequest);
        breakdown[row.operation_type] = {
          requests: row.count,
          cost: cost.toFixed(4)
        };
        totalCost += cost;
      });
      
      return {
        monthlyTotal: totalCost.toFixed(2),
        breakdown,
        freeCredit: 200,
        remainingCredit: Math.max(0, 200 - totalCost).toFixed(2)
      };
      
    } catch (error) {
      console.error('計算成本估算錯誤:', error);
      return { error: '無法計算成本' };
    }
  }
  
  /**
   * 設定定期清理計數器
   */
  setupCounterCleanup() {
    // 每分鐘清理分鐘級計數器
    setInterval(() => {
      const cutoff = new Date();
      cutoff.setMinutes(cutoff.getMinutes() - 2);
      
      for (const [key] of this.requestCounters.minute) {
        const keyTime = parseInt(key.split('_')[1]);
        if (keyTime < cutoff.getMinutes()) {
          this.requestCounters.minute.delete(key);
        }
      }
    }, 60000);
    
    // 每小時清理小時級計數器
    setInterval(() => {
      const cutoff = new Date();
      cutoff.setHours(cutoff.getHours() - 2);
      
      for (const [key] of this.requestCounters.hour) {
        const keyTime = parseInt(key.split('_')[1]);
        if (keyTime < cutoff.getHours()) {
          this.requestCounters.hour.delete(key);
        }
      }
    }, 3600000);
    
    // 每天清理日級計數器
    setInterval(() => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 2);
      
      for (const [key] of this.requestCounters.day) {
        const keyTime = parseInt(key.split('_')[1]);
        if (keyTime < cutoff.getDate()) {
          this.requestCounters.day.delete(key);
        }
      }
    }, 86400000);
  }
  
  // 以下方法從原 GoogleMapsService 中繼承
  async getCachedGeocode(address) {
    try {
      if (!this.pool) {
        return null;
      }
      
      const result = await this.pool.query(
        'SELECT * FROM geocoding_cache WHERE address = $1 AND expires_at > NOW()',
        [address]
      );
      
      if (result.rows.length > 0) {
        const cached = result.rows[0];
        return {
          lat: parseFloat(cached.lat),
          lng: parseFloat(cached.lng),
          formatted_address: cached.formatted_address,
          place_id: cached.place_id,
          address_components: JSON.parse(cached.address_components || '[]'),
          geometry_type: cached.geometry_type,
          location_type: JSON.parse(cached.location_type || '[]')
        };
      }
      
      return null;
    } catch (error) {
      console.error('獲取地理編碼快取錯誤:', error);
      return null;
    }
  }
  
  async cacheGeocodeResult(address, result) {
    try {
      if (!this.pool) {
        return;
      }
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);
      
      await this.pool.query(`
        INSERT INTO geocoding_cache (
          address, lat, lng, formatted_address, place_id, 
          address_components, geometry_type, location_type, 
          expires_at, hit_count, last_used_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        ON CONFLICT (address) DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          formatted_address = EXCLUDED.formatted_address,
          place_id = EXCLUDED.place_id,
          address_components = EXCLUDED.address_components,
          geometry_type = EXCLUDED.geometry_type,
          location_type = EXCLUDED.location_type,
          expires_at = EXCLUDED.expires_at,
          updated_at = CURRENT_TIMESTAMP
      `, [
        address, result.lat, result.lng, result.formatted_address,
        result.place_id, JSON.stringify(result.address_components || []),
        result.geometry_type, JSON.stringify(result.location_type || []),
        expiresAt, 0, new Date()
      ]);
      
    } catch (error) {
      console.error('快取地理編碼結果錯誤:', error);
    }
  }
  
  async updateCacheHitCount(address) {
    try {
      if (!this.pool) {
        return;
      }
      
      await this.pool.query(
        'UPDATE geocoding_cache SET hit_count = hit_count + 1, last_used_at = CURRENT_TIMESTAMP WHERE address = $1',
        [address]
      );
    } catch (error) {
      console.error('更新快取使用次數錯誤:', error);
    }
  }
  
  mockGeocode(address) {
    const mockCoordinates = {
      '台北': { lat: 25.0330, lng: 121.5654 },
      '新北': { lat: 25.0173, lng: 121.4467 },
      '三峽': { lat: 24.9347, lng: 121.3681 },
      '樹林': { lat: 24.9939, lng: 121.4208 },
      '鶯歌': { lat: 24.9542, lng: 121.3508 }
    };
    
    for (const [area, coords] of Object.entries(mockCoordinates)) {
      if (address.includes(area)) {
        const offset = 0.01;
        return {
          success: true,
          lat: coords.lat + (Math.random() - 0.5) * offset,
          lng: coords.lng + (Math.random() - 0.5) * offset,
          formatted_address: `模擬地址: ${address}`,
          place_id: `mock_${Date.now()}_${Math.random()}`,
          address_components: [],
          geometry_type: 'APPROXIMATE',
          location_type: ['establishment']
        };
      }
    }
    
    return {
      success: true,
      lat: 25.0330 + (Math.random() - 0.5) * 0.1,
      lng: 121.5654 + (Math.random() - 0.5) * 0.1,
      formatted_address: `模擬地址: ${address}`,
      place_id: `mock_${Date.now()}_${Math.random()}`,
      address_components: [],
      geometry_type: 'APPROXIMATE',
      location_type: ['establishment']
    };
  }
  
  mockDistanceMatrix(origins, destinations) {
    const elements = [];
    
    for (const origin of origins) {
      const row = [];
      for (const destination of destinations) {
        const R = 6371;
        const dLat = (destination.lat - origin.lat) * Math.PI / 180;
        const dLon = (destination.lng - origin.lng) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(origin.lat * Math.PI / 180) * Math.cos(destination.lat * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        const distance = R * c;
        
        const drivingDistance = distance * (1.2 + Math.random() * 0.4);
        const duration = drivingDistance * (2 + Math.random() * 2);
        
        row.push({
          distance: {
            text: `${drivingDistance.toFixed(1)} 公里`,
            value: Math.round(drivingDistance * 1000)
          },
          duration: {
            text: `${Math.round(duration)} 分鐘`,
            value: Math.round(duration * 60)
          },
          status: 'OK'
        });
      }
      elements.push(row);
    }
    
    return {
      status: 'OK',
      origin_addresses: origins.map(o => `${o.lat},${o.lng}`),
      destination_addresses: destinations.map(d => `${d.lat},${d.lng}`),
      rows: elements.map(row => ({ elements: row }))
    };
  }
}

module.exports = GoogleMapsProxyService;