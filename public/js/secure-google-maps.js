// =====================================
// 安全的 Google Maps 前端客戶端
// 透過後端代理服務調用 Google Maps API，不暴露 API Key
// =====================================

class SecureGoogleMapsClient {
  constructor(options = {}) {
    this.options = {
      baseUrl: '/api/secure-maps', // 後端代理 API 端點
      language: 'zh-TW',
      region: 'tw',
      retryAttempts: 3,
      retryDelay: 1000,
      cacheEnabled: true,
      ...options
    };
    
    this.cache = new Map();
    this.requestQueue = new Map();
    this.statistics = {
      totalRequests: 0,
      cacheHits: 0,
      errors: 0,
      avgResponseTime: 0
    };
    
    // API Key（僅用於前端地圖顯示，由環境變數提供）
    this.frontendApiKey = options.frontendApiKey || window.GOOGLE_MAPS_FRONTEND_KEY || null;
    
    console.log('🔒 Secure Google Maps Client 已初始化');
  }
  
  /**
   * 安全的地理編碼請求
   */
  async geocodeAddress(address, options = {}) {
    const startTime = Date.now();
    
    try {
      this.statistics.totalRequests++;
      
      // 檢查本地快取
      if (this.options.cacheEnabled) {
        const cacheKey = `geocode:${address}`;
        const cached = this.cache.get(cacheKey);
        
        if (cached && Date.now() - cached.timestamp < 30 * 60 * 1000) { // 30分鐘快取
          this.statistics.cacheHits++;
          return { ...cached.data, fromCache: true };
        }
      }
      
      // 檢查是否有相同請求正在進行中
      const requestKey = `geocode:${address}`;
      if (this.requestQueue.has(requestKey)) {
        return await this.requestQueue.get(requestKey);
      }
      
      // 創建請求
      const requestPromise = this.makeSecureRequest('/geocode', {
        address: address,
        language: options.language || this.options.language,
        region: options.region || this.options.region
      });
      
      this.requestQueue.set(requestKey, requestPromise);
      
      const result = await requestPromise;
      
      // 清除請求佇列
      this.requestQueue.delete(requestKey);
      
      // 快取結果
      if (this.options.cacheEnabled && result.success) {
        this.cache.set(`geocode:${address}`, {
          data: result,
          timestamp: Date.now()
        });
        
        // 限制快取大小
        if (this.cache.size > 500) {
          const firstKey = this.cache.keys().next().value;
          this.cache.delete(firstKey);
        }
      }
      
      // 更新統計
      this.updateResponseTimeStats(Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      this.statistics.errors++;
      this.requestQueue.delete(`geocode:${address}`);
      
      console.error('安全地理編碼請求失敗:', error);
      return {
        success: false,
        error: error.message,
        fallback: this.generateFallbackGeocode(address)
      };
    }
  }
  
  /**
   * 批量地理編碼請求
   */
  async batchGeocodeAddresses(addresses, options = {}) {
    const startTime = Date.now();
    
    try {
      if (!Array.isArray(addresses) || addresses.length === 0) {
        throw new Error('addresses 必須是非空陣列');
      }
      
      if (addresses.length > 50) {
        throw new Error('批量限制: 最多50個地址');
      }
      
      this.statistics.totalRequests++;
      
      const result = await this.makeSecureRequest('/batch-geocode', {
        addresses: addresses,
        batchSize: options.batchSize || 25,
        delay: options.delay || 200,
        timeout: options.timeout || 30000
      });
      
      this.updateResponseTimeStats(Date.now() - startTime);
      
      // 快取個別結果
      if (result.success && result.results && this.options.cacheEnabled) {
        result.results.forEach((geocodeResult, index) => {
          if (geocodeResult.success) {
            this.cache.set(`geocode:${addresses[index]}`, {
              data: geocodeResult,
              timestamp: Date.now()
            });
          }
        });
      }
      
      return result;
      
    } catch (error) {
      this.statistics.errors++;
      console.error('批量地理編碼請求失敗:', error);
      
      return {
        success: false,
        error: error.message,
        fallback: addresses.map(addr => this.generateFallbackGeocode(addr))
      };
    }
  }
  
  /**
   * 距離矩陣請求
   */
  async getDistanceMatrix(origins, destinations, options = {}) {
    const startTime = Date.now();
    
    try {
      if (!Array.isArray(origins) || !Array.isArray(destinations)) {
        throw new Error('origins 和 destinations 必須是陣列');
      }
      
      if (origins.length > 10 || destinations.length > 10) {
        throw new Error('批量限制: 最多10個起點和10個終點');
      }
      
      this.statistics.totalRequests++;
      
      const result = await this.makeSecureRequest('/distance-matrix', {
        origins: origins,
        destinations: destinations,
        units: options.units || 'metric',
        mode: options.mode || 'driving',
        avoid: options.avoid || 'tolls'
      });
      
      this.updateResponseTimeStats(Date.now() - startTime);
      
      return result;
      
    } catch (error) {
      this.statistics.errors++;
      console.error('距離矩陣請求失敗:', error);
      
      return {
        success: false,
        error: error.message,
        fallback: this.generateFallbackDistanceMatrix(origins, destinations)
      };
    }
  }
  
  /**
   * 發送安全請求到後端代理
   */
  async makeSecureRequest(endpoint, data, retryCount = 0) {
    try {
      const response = await fetch(`${this.options.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.options.apiKey || '', // 內部 API Key（如果需要）
          'X-Client-Version': '1.0.0',
          'X-Request-ID': this.generateRequestId()
        },
        body: JSON.stringify(data)
      });
      
      if (!response.ok) {
        if (response.status === 429) {
          throw new Error('請求頻率過高，請稍後再試');
        } else if (response.status === 401) {
          throw new Error('API 授權失敗');
        } else if (response.status >= 500) {
          throw new Error('伺服器內部錯誤');
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
      }
      
      const result = await response.json();
      
      if (!result.success && result.error) {
        // 如果是頻率限制或成本限制錯誤，嘗試重試
        if (retryCount < this.options.retryAttempts && 
            (result.error.includes('rate limit') || result.error.includes('成本'))) {
          console.warn(`請求失敗，${this.options.retryDelay}ms 後重試...`);
          await this.delay(this.options.retryDelay * (retryCount + 1));
          return this.makeSecureRequest(endpoint, data, retryCount + 1);
        }
        
        throw new Error(result.error);
      }
      
      return result;
      
    } catch (error) {
      // 網路錯誤重試機制
      if (retryCount < this.options.retryAttempts && 
          (error.name === 'TypeError' || error.message.includes('fetch'))) {
        console.warn(`網路錯誤，${this.options.retryDelay}ms 後重試...`);
        await this.delay(this.options.retryDelay * (retryCount + 1));
        return this.makeSecureRequest(endpoint, data, retryCount + 1);
      }
      
      throw error;
    }
  }
  
  /**
   * 生成請求 ID
   */
  generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * 延遲函數
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * 更新回應時間統計
   */
  updateResponseTimeStats(responseTime) {
    const currentAvg = this.statistics.avgResponseTime;
    const totalRequests = this.statistics.totalRequests;
    
    this.statistics.avgResponseTime = 
      ((currentAvg * (totalRequests - 1)) + responseTime) / totalRequests;
  }
  
  /**
   * 生成備用地理編碼結果
   */
  generateFallbackGeocode(address) {
    // 基於地址字串的簡單備用邏輯
    const fallbackCoordinates = {
      '台北': { lat: 25.0330, lng: 121.5654 },
      '新北': { lat: 25.0173, lng: 121.4467 },
      '三峽': { lat: 24.9347, lng: 121.3681 },
      '桃園': { lat: 24.9937, lng: 121.2958 },
      '新竹': { lat: 24.8015, lng: 120.9685 },
      '台中': { lat: 24.1477, lng: 120.6736 }
    };
    
    for (const [area, coords] of Object.entries(fallbackCoordinates)) {
      if (address.includes(area)) {
        return {
          success: true,
          lat: coords.lat,
          lng: coords.lng,
          formatted_address: `備用地址: ${address}`,
          fallback: true,
          accuracy_score: 30
        };
      }
    }
    
    // 預設台北
    return {
      success: true,
      lat: 25.0330,
      lng: 121.5654,
      formatted_address: `備用地址: ${address}`,
      fallback: true,
      accuracy_score: 20
    };
  }
  
  /**
   * 生成備用距離矩陣結果
   */
  generateFallbackDistanceMatrix(origins, destinations) {
    const elements = [];
    
    for (const origin of origins) {
      const row = [];
      for (const destination of destinations) {
        // 計算直線距離
        const distance = this.calculateHaversineDistance(origin, destination);
        const drivingDistance = distance * 1.3; // 估計道路距離
        const duration = drivingDistance * 3; // 估計行駛時間
        
        row.push({
          distance: {
            text: `${drivingDistance.toFixed(1)} 公里`,
            value: Math.round(drivingDistance * 1000)
          },
          duration: {
            text: `${Math.round(duration)} 分鐘`,
            value: Math.round(duration * 60)
          },
          status: 'OK',
          fallback: true
        });
      }
      elements.push(row);
    }
    
    return {
      success: true,
      status: 'OK',
      rows: elements.map(row => ({ elements: row })),
      fallback: true
    };
  }
  
  /**
   * 計算兩點間直線距離（公里）
   */
  calculateHaversineDistance(point1, point2) {
    const R = 6371; // 地球半徑（公里）
    const dLat = (point2.lat - point1.lat) * Math.PI / 180;
    const dLon = (point2.lng - point1.lng) * Math.PI / 180;
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(point1.lat * Math.PI / 180) * Math.cos(point2.lat * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }
  
  /**
   * 獲取統計資訊
   */
  getStatistics() {
    return {
      ...this.statistics,
      cacheSize: this.cache.size,
      cacheHitRate: this.statistics.totalRequests > 0 ? 
        (this.statistics.cacheHits / this.statistics.totalRequests * 100).toFixed(2) + '%' : '0%',
      errorRate: this.statistics.totalRequests > 0 ? 
        (this.statistics.errors / this.statistics.totalRequests * 100).toFixed(2) + '%' : '0%'
    };
  }
  
  /**
   * 清除快取
   */
  clearCache() {
    this.cache.clear();
    console.log('🧹 客戶端快取已清除');
  }
  
  /**
   * 重置統計
   */
  resetStatistics() {
    this.statistics = {
      totalRequests: 0,
      cacheHits: 0,
      errors: 0,
      avgResponseTime: 0
    };
    console.log('📊 統計資料已重置');
  }
}

// 增強的地圖客戶端（整合安全 API 調用）
class SecureGoogleMapsView extends GoogleMapsClient {
  constructor(frontendApiKey, options = {}) {
    super(frontendApiKey, options);
    
    // 整合安全 API 客戶端
    this.secureClient = new SecureGoogleMapsClient({
      ...options,
      frontendApiKey: frontendApiKey
    });
    
    this.useSecureGeocoding = options.useSecureGeocoding !== false; // 預設使用安全模式
  }
  
  /**
   * 覆蓋原始的地理編碼方法，使用安全代理
   */
  async geocodeAddress(address) {
    if (this.useSecureGeocoding) {
      try {
        const result = await this.secureClient.geocodeAddress(address);
        return result;
      } catch (error) {
        console.warn('安全地理編碼失敗，嘗試前端直接調用...', error);
        // 備用：使用前端直接調用
        return await super.geocodeAddress(address);
      }
    } else {
      // 使用前端直接調用
      return await super.geocodeAddress(address);
    }
  }
  
  /**
   * 批量地理編碼（僅安全模式可用）
   */
  async batchGeocodeAddresses(addresses, options = {}) {
    if (!this.useSecureGeocoding) {
      throw new Error('批量地理編碼僅在安全模式下可用');
    }
    
    return await this.secureClient.batchGeocodeAddresses(addresses, options);
  }
  
  /**
   * 獲取安全客戶端統計
   */
  getSecureClientStats() {
    return this.secureClient.getStatistics();
  }
  
  /**
   * 切換安全模式
   */
  setSecureMode(enabled) {
    this.useSecureGeocoding = enabled;
    console.log(`🔒 安全模式 ${enabled ? '已啟用' : '已停用'}`);
  }
}

// 智慧地址輸入元件
class SmartAddressInput {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      useSecureApi: true,
      debounceDelay: 300,
      minQueryLength: 2,
      maxSuggestions: 8,
      ...options
    };
    
    this.secureClient = options.useSecureApi ? 
      new SecureGoogleMapsClient() : null;
    
    this.suggestions = [];
    this.selectedIndex = -1;
    this.debounceTimer = null;
    this.suggestionsContainer = null;
    
    this.init();
  }
  
  init() {
    this.createSuggestionsContainer();
    this.attachEventListeners();
    console.log('🔍 智慧地址輸入已初始化');
  }
  
  createSuggestionsContainer() {
    this.suggestionsContainer = document.createElement('div');
    this.suggestionsContainer.className = 'address-suggestions';
    this.suggestionsContainer.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 4px 4px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
      max-height: 200px;
      overflow-y: auto;
      z-index: 1000;
      display: none;
    `;
    
    // 確保輸入框的父元素有相對定位
    if (getComputedStyle(this.input.parentElement).position === 'static') {
      this.input.parentElement.style.position = 'relative';
    }
    
    this.input.parentElement.appendChild(this.suggestionsContainer);
  }
  
  attachEventListeners() {
    // 輸入事件
    this.input.addEventListener('input', (e) => {
      const query = e.target.value.trim();
      this.handleInput(query);
    });
    
    // 鍵盤導航
    this.input.addEventListener('keydown', (e) => {
      this.handleKeyDown(e);
    });
    
    // 失去焦點時隱藏建議
    this.input.addEventListener('blur', (e) => {
      setTimeout(() => {
        this.hideSuggestions();
      }, 150); // 延遲以允許點擊建議項
    });
    
    // 點擊建議項
    this.suggestionsContainer.addEventListener('click', (e) => {
      const item = e.target.closest('.suggestion-item');
      if (item) {
        const index = parseInt(item.dataset.index);
        this.selectSuggestion(index);
      }
    });
  }
  
  async handleInput(query) {
    clearTimeout(this.debounceTimer);
    
    if (query.length < this.options.minQueryLength) {
      this.hideSuggestions();
      return;
    }
    
    this.debounceTimer = setTimeout(async () => {
      try {
        await this.fetchSuggestions(query);
      } catch (error) {
        console.error('取得地址建議失敗:', error);
        this.hideSuggestions();
      }
    }, this.options.debounceDelay);
  }
  
  async fetchSuggestions(query) {
    if (this.secureClient) {
      // 使用安全 API（這裡需要實作建議端點）
      // 暫時使用地理編碼作為建議
      try {
        const result = await this.secureClient.geocodeAddress(query);
        if (result.success) {
          this.suggestions = [{
            description: result.formatted_address,
            place_id: result.place_id,
            lat: result.lat,
            lng: result.lng
          }];
        } else {
          this.suggestions = [];
        }
      } catch (error) {
        this.suggestions = [];
      }
    } else {
      // 使用前端 Google Places API
      if (typeof google !== 'undefined' && google.maps.places) {
        const service = new google.maps.places.AutocompleteService();
        
        service.getPlacePredictions({
          input: query,
          componentRestrictions: { country: 'tw' },
          language: 'zh-TW'
        }, (predictions, status) => {
          if (status === google.maps.places.PlacesServiceStatus.OK) {
            this.suggestions = predictions.slice(0, this.options.maxSuggestions);
          } else {
            this.suggestions = [];
          }
          this.renderSuggestions();
        });
        return; // 避免重複渲染
      } else {
        this.suggestions = [];
      }
    }
    
    this.renderSuggestions();
  }
  
  renderSuggestions() {
    if (this.suggestions.length === 0) {
      this.hideSuggestions();
      return;
    }
    
    const html = this.suggestions.map((suggestion, index) => `
      <div class="suggestion-item" data-index="${index}" style="
        padding: 12px;
        cursor: pointer;
        border-bottom: 1px solid #eee;
        font-size: 14px;
        color: #333;
      ">
        <div style="font-weight: 500;">${suggestion.structured_formatting?.main_text || suggestion.description}</div>
        ${suggestion.structured_formatting?.secondary_text ? 
          `<div style="font-size: 12px; color: #666;">${suggestion.structured_formatting.secondary_text}</div>` : 
          ''
        }
      </div>
    `).join('');
    
    this.suggestionsContainer.innerHTML = html;
    this.showSuggestions();
    this.selectedIndex = -1;
  }
  
  showSuggestions() {
    this.suggestionsContainer.style.display = 'block';
  }
  
  hideSuggestions() {
    this.suggestionsContainer.style.display = 'none';
    this.selectedIndex = -1;
  }
  
  handleKeyDown(e) {
    const items = this.suggestionsContainer.querySelectorAll('.suggestion-item');
    
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        this.selectedIndex = Math.min(this.selectedIndex + 1, items.length - 1);
        this.updateSelection(items);
        break;
        
      case 'ArrowUp':
        e.preventDefault();
        this.selectedIndex = Math.max(this.selectedIndex - 1, -1);
        this.updateSelection(items);
        break;
        
      case 'Enter':
        e.preventDefault();
        if (this.selectedIndex >= 0) {
          this.selectSuggestion(this.selectedIndex);
        }
        break;
        
      case 'Escape':
        this.hideSuggestions();
        break;
    }
  }
  
  updateSelection(items) {
    items.forEach((item, index) => {
      if (index === this.selectedIndex) {
        item.style.backgroundColor = '#f0f0f0';
      } else {
        item.style.backgroundColor = 'white';
      }
    });
  }
  
  async selectSuggestion(index) {
    const suggestion = this.suggestions[index];
    if (!suggestion) return;
    
    // 設定輸入框值
    this.input.value = suggestion.description;
    this.hideSuggestions();
    
    // 如果有回調函數，執行它
    if (this.options.onSelect) {
      let details = suggestion;
      
      // 如果需要更多詳細資訊，獲取地點詳情
      if (suggestion.place_id && !suggestion.lat) {
        try {
          if (this.secureClient) {
            const geocodeResult = await this.secureClient.geocodeAddress(suggestion.description);
            if (geocodeResult.success) {
              details = { ...suggestion, ...geocodeResult };
            }
          } else if (typeof google !== 'undefined') {
            // 使用前端 Places API 獲取詳情
            details = await this.getPlaceDetails(suggestion.place_id);
          }
        } catch (error) {
          console.error('獲取地點詳情失敗:', error);
        }
      }
      
      this.options.onSelect(details);
    }
  }
  
  async getPlaceDetails(placeId) {
    return new Promise((resolve, reject) => {
      if (!google.maps.places) {
        reject(new Error('Places API 未載入'));
        return;
      }
      
      const service = new google.maps.places.PlacesService(document.createElement('div'));
      
      service.getDetails({
        placeId: placeId,
        fields: ['formatted_address', 'geometry', 'name', 'place_id']
      }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          resolve({
            formatted_address: place.formatted_address,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            name: place.name,
            place_id: place.place_id
          });
        } else {
          reject(new Error(`獲取地點詳情失敗: ${status}`));
        }
      });
    });
  }
  
  destroy() {
    if (this.suggestionsContainer) {
      this.suggestionsContainer.remove();
    }
    
    clearTimeout(this.debounceTimer);
    console.log('🗑️ 智慧地址輸入已銷毀');
  }
}

// 導出到全域
if (typeof window !== 'undefined') {
  window.SecureGoogleMapsClient = SecureGoogleMapsClient;
  window.SecureGoogleMapsView = SecureGoogleMapsView;
  window.SmartAddressInput = SmartAddressInput;
}

// Node.js 環境
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SecureGoogleMapsClient,
    SecureGoogleMapsView,
    SmartAddressInput
  };
}