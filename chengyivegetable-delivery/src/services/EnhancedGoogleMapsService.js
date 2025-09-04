// =====================================
// 增強版 Google Maps 服務
// 整合安全代理、監控和優化快取功能
// =====================================

const GoogleMapsProxyService = require('./GoogleMapsProxyService');
const GoogleMapsMonitoringService = require('./GoogleMapsMonitoringService');

class EnhancedGoogleMapsService extends GoogleMapsProxyService {
  constructor(pool = null) {
    super(pool);
    this.name = 'EnhancedGoogleMapsService';
    this.monitoringService = new GoogleMapsMonitoringService(pool);
    
    // 增強的快取配置
    this.cacheConfig = {
      defaultTTL: 30,                    // 預設30天過期
      highUsageTTL: 90,                  // 高使用頻率地址90天過期
      maxCacheSize: 100000,              // 最大快取條目數
      cleanupInterval: 24 * 60 * 60 * 1000, // 24小時清理一次
      preloadCommonAddresses: true,       // 預載常用地址
      compressionEnabled: true,           // 啟用資料壓縮
      batchSize: 50                      // 批次處理大小
    };
    
    // 智慧快取統計
    this.cacheStats = {
      hits: 0,
      misses: 0,
      writes: 0,
      evictions: 0,
      compressionSavings: 0
    };
    
    // 地址標準化規則
    this.addressNormalizationRules = [
      { pattern: /台灣省/g, replacement: '' },
      { pattern: /臺灣省/g, replacement: '' },
      { pattern: /（.*?）/g, replacement: '' },
      { pattern: /\(.*?\)/g, replacement: '' },
      { pattern: /\s+/g, replacement: ' ' },
      { pattern: /^(.+?市)(.+?區)(.+?)$/, format: '$1$2$3' }
    ];
    
    console.log('🚀 Enhanced Google Maps Service 已啟動');
    this.initializeEnhancedFeatures();
  }
  
  /**
   * 初始化增強功能
   */
  async initializeEnhancedFeatures() {
    try {
      // 預載常用地址
      if (this.cacheConfig.preloadCommonAddresses) {
        await this.preloadCommonAddresses();
      }
      
      // 啟動快取維護任務
      this.startCacheMaintenanceTasks();
      
      // 初始化地址正規化
      await this.initializeAddressNormalization();
      
    } catch (error) {
      console.error('初始化增強功能錯誤:', error);
    }
  }
  
  /**
   * 標準化地址格式
   */
  normalizeAddress(address) {
    if (!address || typeof address !== 'string') {
      return address;
    }
    
    let normalized = address.trim();
    
    // 應用標準化規則
    this.addressNormalizationRules.forEach(rule => {
      if (rule.pattern && rule.replacement !== undefined) {
        normalized = normalized.replace(rule.pattern, rule.replacement);
      } else if (rule.pattern && rule.format) {
        const match = normalized.match(rule.pattern);
        if (match) {
          normalized = rule.format.replace(/\$(\d+)/g, (_, n) => match[n] || '');
        }
      }
    });
    
    return normalized.trim();
  }
  
  /**
   * 增強的地理編碼方法
   */
  async enhancedGeocode(address, options = {}) {
    const startTime = Date.now();
    
    try {
      // 地址標準化
      const normalizedAddress = this.normalizeAddress(address);
      
      // 檢查智慧快取
      const cachedResult = await this.getEnhancedCache(normalizedAddress);
      if (cachedResult) {
        this.cacheStats.hits++;
        await this.monitoringService.logApiUsage(
          options.clientIP, 
          options.userAgent, 
          'cache_hit',
          { address: normalizedAddress },
          Date.now() - startTime
        );
        
        return { 
          success: true, 
          ...cachedResult, 
          cached: true,
          responseTime: Date.now() - startTime 
        };
      }
      
      this.cacheStats.misses++;
      
      // 如果使用模擬資料
      if (this.useMockData) {
        const mockResult = this.enhancedMockGeocode(normalizedAddress);
        await this.setEnhancedCache(normalizedAddress, mockResult);
        return mockResult;
      }
      
      // 呼叫實際 API
      const result = await this.callGoogleMapsAPI(normalizedAddress, options);
      
      if (result.success) {
        // 儲存到增強快取
        await this.setEnhancedCache(normalizedAddress, result);
        this.cacheStats.writes++;
      }
      
      // 記錄監控資料
      await this.monitoringService.logApiUsage(
        options.clientIP, 
        options.userAgent, 
        result.success ? 'api_call_success' : 'api_call_failed',
        { address: normalizedAddress },
        Date.now() - startTime
      );
      
      return {
        ...result,
        cached: false,
        responseTime: Date.now() - startTime
      };
      
    } catch (error) {
      console.error('增強地理編碼錯誤:', error);
      
      await this.monitoringService.logApiUsage(
        options.clientIP, 
        options.userAgent, 
        'error',
        { address, error: error.message },
        Date.now() - startTime
      );
      
      return { 
        success: false, 
        error: error.message,
        responseTime: Date.now() - startTime
      };
    }
  }
  
  /**
   * 呼叫 Google Maps API
   */
  async callGoogleMapsAPI(address, options = {}) {
    try {
      const axios = require('axios');
      
      const response = await axios.get(`${this.baseUrl}/geocode/json`, {
        params: {
          address: address,
          key: this.apiKey,
          language: options.language || 'zh-TW',
          region: options.region || 'tw',
          components: options.components || 'country:TW'
        },
        timeout: options.timeout || 10000
      });
      
      const data = response.data;
      
      if (data.status === 'OK' && data.results.length > 0) {
        const result = data.results[0];
        const location = result.geometry.location;
        
        return {
          success: true,
          lat: location.lat,
          lng: location.lng,
          coordinates: [location.lng, location.lat],
          formatted_address: result.formatted_address,
          place_id: result.place_id,
          address_components: result.address_components,
          geometry_type: result.geometry.location_type,
          location_type: result.types,
          accuracy_score: this.calculateAccuracyScore(result),
          confidence: result.geometry.location_type
        };
      } else {
        return { 
          success: false, 
          error: `地理編碼失敗: ${data.status}`,
          status: data.status
        };
      }
      
    } catch (error) {
      return { 
        success: false, 
        error: error.message 
      };
    }
  }
  
  /**
   * 計算地理編碼準確度分數
   */
  calculateAccuracyScore(result) {
    let score = 50; // 基礎分數
    
    // 根據 location_type 調整分數
    switch (result.geometry.location_type) {
      case 'ROOFTOP': score += 40; break;
      case 'RANGE_INTERPOLATED': score += 30; break;
      case 'GEOMETRIC_CENTER': score += 20; break;
      case 'APPROXIMATE': score += 10; break;
    }
    
    // 根據地址組件完整性調整分數
    const components = result.address_components || [];
    const hasStreetNumber = components.some(c => c.types.includes('street_number'));
    const hasRoute = components.some(c => c.types.includes('route'));
    const hasLocality = components.some(c => c.types.includes('locality'));
    
    if (hasStreetNumber) score += 5;
    if (hasRoute) score += 3;
    if (hasLocality) score += 2;
    
    return Math.min(100, score);
  }
  
  /**
   * 增強的快取獲取
   */
  async getEnhancedCache(address) {
    try {
      if (!this.pool) {
        return null;
      }
      
      const result = await this.pool.query(`
        SELECT 
          *,
          EXTRACT(days FROM (expires_at - NOW())) as days_until_expiry,
          (hit_count * 1.0 / GREATEST(EXTRACT(days FROM (NOW() - created_at)), 1)) as daily_usage_rate
        FROM geocoding_cache 
        WHERE address = $1 AND expires_at > NOW()
      `, [address]);
      
      if (result.rows.length > 0) {
        const cached = result.rows[0];
        
        // 動態延長高使用頻率地址的過期時間
        if (cached.daily_usage_rate > 1 && cached.days_until_expiry < 7) {
          await this.extendCacheExpiry(address, this.cacheConfig.highUsageTTL);
        }
        
        // 更新使用統計
        await this.updateCacheHitCount(address);
        
        return this.decompressCacheData({
          lat: parseFloat(cached.lat),
          lng: parseFloat(cached.lng),
          coordinates: [parseFloat(cached.lng), parseFloat(cached.lat)],
          formatted_address: cached.formatted_address,
          place_id: cached.place_id,
          address_components: JSON.parse(cached.address_components || '[]'),
          geometry_type: cached.geometry_type,
          location_type: JSON.parse(cached.location_type || '[]'),
          accuracy_score: cached.accuracy_score || 85,
          hit_count: cached.hit_count
        });
      }
      
      return null;
    } catch (error) {
      console.error('獲取增強快取錯誤:', error);
      return null;
    }
  }
  
  /**
   * 增強的快取設定
   */
  async setEnhancedCache(address, result, ttlDays = null) {
    try {
      if (!this.pool || !result.success) {
        return;
      }
      
      // 檢查快取大小限制
      await this.enforceCacheSizeLimit();
      
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + (ttlDays || this.cacheConfig.defaultTTL));
      
      // 壓縮數據
      const compressedData = this.compressCacheData(result);
      
      await this.pool.query(`
        INSERT INTO geocoding_cache (
          address, lat, lng, formatted_address, place_id, 
          address_components, geometry_type, location_type, 
          expires_at, hit_count, last_used_at, accuracy_score,
          compressed_data, compression_ratio
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (address) DO UPDATE SET
          lat = EXCLUDED.lat,
          lng = EXCLUDED.lng,
          formatted_address = EXCLUDED.formatted_address,
          place_id = EXCLUDED.place_id,
          address_components = EXCLUDED.address_components,
          geometry_type = EXCLUDED.geometry_type,
          location_type = EXCLUDED.location_type,
          expires_at = EXCLUDED.expires_at,
          accuracy_score = EXCLUDED.accuracy_score,
          compressed_data = EXCLUDED.compressed_data,
          compression_ratio = EXCLUDED.compression_ratio,
          updated_at = CURRENT_TIMESTAMP
      `, [
        address, result.lat, result.lng, result.formatted_address,
        result.place_id, JSON.stringify(result.address_components || []),
        result.geometry_type, JSON.stringify(result.location_type || []),
        expiresAt, 0, new Date(), result.accuracy_score || 85,
        compressedData.data, compressedData.ratio
      ]);
      
    } catch (error) {
      console.error('設定增強快取錯誤:', error);
    }
  }
  
  /**
   * 壓縮快取數據
   */
  compressCacheData(data) {
    try {
      const originalSize = JSON.stringify(data).length;
      
      // 簡化數據結構以節省空間
      const compressed = {
        lt: Number(data.lat.toFixed(6)),  // lat 縮減精度
        lg: Number(data.lng.toFixed(6)),  // lng 縮減精度
        fa: data.formatted_address?.substring(0, 100), // 限制長度
        pi: data.place_id,
        gt: data.geometry_type,
        as: data.accuracy_score
      };
      
      const compressedSize = JSON.stringify(compressed).length;
      const ratio = ((originalSize - compressedSize) / originalSize * 100).toFixed(2);
      
      this.cacheStats.compressionSavings += (originalSize - compressedSize);
      
      return {
        data: JSON.stringify(compressed),
        ratio: parseFloat(ratio)
      };
    } catch (error) {
      return {
        data: JSON.stringify(data),
        ratio: 0
      };
    }
  }
  
  /**
   * 解壓縮快取數據
   */
  decompressCacheData(data) {
    try {
      if (data.compressed_data) {
        const compressed = JSON.parse(data.compressed_data);
        return {
          ...data,
          lat: compressed.lt,
          lng: compressed.lg,
          formatted_address: compressed.fa,
          place_id: compressed.pi,
          geometry_type: compressed.gt,
          accuracy_score: compressed.as
        };
      }
      return data;
    } catch (error) {
      return data;
    }
  }
  
  /**
   * 延長快取過期時間
   */
  async extendCacheExpiry(address, additionalDays) {
    try {
      if (!this.pool) {
        return;
      }
      
      await this.pool.query(`
        UPDATE geocoding_cache 
        SET expires_at = expires_at + INTERVAL '${additionalDays} days',
            updated_at = CURRENT_TIMESTAMP
        WHERE address = $1
      `, [address]);
      
    } catch (error) {
      console.error('延長快取過期時間錯誤:', error);
    }
  }
  
  /**
   * 強制執行快取大小限制
   */
  async enforceCacheSizeLimit() {
    try {
      if (!this.pool) {
        return;
      }
      
      const sizeCheck = await this.pool.query(`
        SELECT COUNT(*) as total_count 
        FROM geocoding_cache
      `);
      
      const totalCount = parseInt(sizeCheck.rows[0].total_count);
      
      if (totalCount >= this.cacheConfig.maxCacheSize) {
        // 刪除最少使用的項目
        const deleteCount = Math.floor(this.cacheConfig.maxCacheSize * 0.1); // 刪除10%
        
        await this.pool.query(`
          DELETE FROM geocoding_cache 
          WHERE id IN (
            SELECT id FROM geocoding_cache 
            ORDER BY hit_count ASC, last_used_at ASC 
            LIMIT $1
          )
        `, [deleteCount]);
        
        this.cacheStats.evictions += deleteCount;
        console.log(`🧹 清理了 ${deleteCount} 個低使用率快取項目`);
      }
      
    } catch (error) {
      console.error('強制執行快取大小限制錯誤:', error);
    }
  }
  
  /**
   * 預載常用地址
   */
  async preloadCommonAddresses() {
    try {
      if (!this.pool) {
        return;
      }
      
      // 獲取最近30天內最常被查詢的地址
      const commonAddresses = await this.pool.query(`
        SELECT address, COUNT(*) as usage_count
        FROM google_maps_usage_log 
        WHERE operation_type = 'api_call_success'
        AND created_at >= NOW() - INTERVAL '30 days'
        GROUP BY address
        HAVING COUNT(*) >= 3
        ORDER BY usage_count DESC
        LIMIT 100
      `);
      
      console.log(`📚 預載 ${commonAddresses.rows.length} 個常用地址到快取`);
      
      // 批次處理預載
      for (let i = 0; i < commonAddresses.rows.length; i += this.cacheConfig.batchSize) {
        const batch = commonAddresses.rows.slice(i, i + this.cacheConfig.batchSize);
        
        await Promise.all(batch.map(async (row) => {
          const cached = await this.getCachedGeocode(row.address);
          if (!cached) {
            // 如果快取中沒有，則進行地理編碼
            await this.enhancedGeocode(row.address, { preload: true });
          }
        }));
        
        // 批次間延遲，避免 API 限制
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
    } catch (error) {
      console.error('預載常用地址錯誤:', error);
    }
  }
  
  /**
   * 啟動快取維護任務
   */
  startCacheMaintenanceTasks() {
    // 定期清理過期快取
    setInterval(async () => {
      try {
        const result = await this.pool.query(`
          SELECT cleanup_expired_geocoding_cache()
        `);
        
        const deletedCount = result.rows[0]?.cleanup_expired_geocoding_cache || 0;
        if (deletedCount > 0) {
          console.log(`🧹 清理了 ${deletedCount} 個過期快取項目`);
        }
      } catch (error) {
        console.error('定期清理快取錯誤:', error);
      }
    }, this.cacheConfig.cleanupInterval);
    
    // 定期優化快取
    setInterval(async () => {
      try {
        await this.optimizeCache();
      } catch (error) {
        console.error('定期優化快取錯誤:', error);
      }
    }, 24 * 60 * 60 * 1000); // 每天執行一次
    
    console.log('🔧 快取維護任務已啟動');
  }
  
  /**
   * 快取優化
   */
  async optimizeCache() {
    try {
      if (!this.pool) {
        return;
      }
      
      // 分析快取使用模式
      const analysis = await this.pool.query(`
        SELECT 
          AVG(hit_count) as avg_hits,
          PERCENTILE_CONT(0.8) WITHIN GROUP (ORDER BY hit_count) as hit_80th_percentile,
          COUNT(*) FILTER (WHERE hit_count = 0) as unused_count,
          COUNT(*) as total_count
        FROM geocoding_cache
        WHERE expires_at > NOW()
      `);
      
      const stats = analysis.rows[0];
      
      // 清理從未使用的快取項目（超過7天）
      if (stats.unused_count > 0) {
        await this.pool.query(`
          DELETE FROM geocoding_cache 
          WHERE hit_count = 0 
          AND created_at < NOW() - INTERVAL '7 days'
        `);
      }
      
      console.log('📊 快取優化完成', {
        avgHits: parseFloat(stats.avg_hits || 0).toFixed(2),
        unusedItems: stats.unused_count,
        totalItems: stats.total_count
      });
      
    } catch (error) {
      console.error('快取優化錯誤:', error);
    }
  }
  
  /**
   * 初始化地址正規化
   */
  async initializeAddressNormalization() {
    // 可以從資料庫載入自定義正規化規則
    try {
      if (this.pool) {
        const customRules = await this.pool.query(`
          SELECT * FROM address_normalization_rules 
          WHERE is_active = true
          ORDER BY priority ASC
        `);
        
        if (customRules.rows.length > 0) {
          customRules.rows.forEach(rule => {
            this.addressNormalizationRules.push({
              pattern: new RegExp(rule.pattern, rule.flags || 'g'),
              replacement: rule.replacement,
              description: rule.description
            });
          });
          
          console.log(`📝 載入了 ${customRules.rows.length} 個自定義地址正規化規則`);
        }
      }
    } catch (error) {
      console.log('地址正規化規則使用預設設定');
    }
  }
  
  /**
   * 增強的模擬地理編碼
   */
  enhancedMockGeocode(address) {
    const mockResult = this.mockGeocode(address);
    
    return {
      ...mockResult,
      accuracy_score: Math.floor(Math.random() * 20) + 70, // 70-90分
      confidence: 'APPROXIMATE',
      source: 'mock'
    };
  }
  
  /**
   * 獲取快取統計資訊
   */
  getCacheStatistics() {
    return {
      ...this.cacheStats,
      hitRate: this.cacheStats.hits + this.cacheStats.misses > 0 ? 
        (this.cacheStats.hits / (this.cacheStats.hits + this.cacheStats.misses) * 100).toFixed(2) : 0,
      compressionSavingsKB: (this.cacheStats.compressionSavings / 1024).toFixed(2)
    };
  }
  
  /**
   * 批量地理編碼（優化版）
   */
  async enhancedBatchGeocode(addresses, options = {}) {
    console.log(`📍 開始增強批量地理編碼 ${addresses.length} 個地址...`);
    
    const results = [];
    const batchSize = options.batchSize || 25;
    const clientIP = options.clientIP || 'batch_process';
    
    try {
      for (let i = 0; i < addresses.length; i += batchSize) {
        const batch = addresses.slice(i, i + batchSize);
        
        // 並行處理批次內的地址
        const batchPromises = batch.map(address => 
          this.enhancedGeocode(address, { 
            clientIP, 
            userAgent: 'batch_process',
            timeout: options.timeout || 10000
          })
        );
        
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
        
        // 避免超過 API 配額限制
        if (i + batchSize < addresses.length) {
          await this.delay(options.delay || 200); // 預設200ms延遲
        }
      }
      
      const successful = results.filter(r => r.success).length;
      console.log(`✅ 增強批量地理編碼完成，成功 ${successful}/${results.length}`);
      
      return {
        success: true,
        results,
        summary: {
          total: results.length,
          successful,
          failed: results.length - successful,
          cacheHits: results.filter(r => r.cached).length,
          avgResponseTime: results.reduce((sum, r) => sum + (r.responseTime || 0), 0) / results.length
        }
      };
      
    } catch (error) {
      console.error('增強批量地理編碼錯誤:', error);
      throw new Error(`增強批量地理編碼失敗: ${error.message}`);
    }
  }
}

module.exports = EnhancedGoogleMapsService;