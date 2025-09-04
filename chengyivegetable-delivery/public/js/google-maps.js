// =====================================
// Google Maps 前端功能模組
// 提供地址自動完成、地理編碼、地圖顯示等功能
// =====================================

class GoogleMapsClient {
  constructor(apiKey, options = {}) {
    this.apiKey = apiKey;
    this.options = {
      language: 'zh-TW',
      region: 'tw',
      libraries: ['places', 'geometry'],
      ...options
    };
    
    this.map = null;
    this.markers = [];
    this.autocompleteService = null;
    this.placesService = null;
    this.directionsService = null;
    this.directionsRenderer = null;
    
    this.init();
  }

  /**
   * 初始化 Google Maps API
   */
  async init() {
    if (typeof google === 'undefined') {
      console.log('📍 正在載入 Google Maps API...');
      await this.loadGoogleMapsAPI();
    }
    
    // 初始化服務
    this.autocompleteService = new google.maps.places.AutocompleteService();
    this.directionsService = new google.maps.DirectionsService();
    this.directionsRenderer = new google.maps.DirectionsRenderer();
    
    console.log('✅ Google Maps 客戶端已初始化');
  }

  /**
   * 動態載入 Google Maps API
   */
  loadGoogleMapsAPI() {
    return new Promise((resolve, reject) => {
      // 檢查是否已載入
      if (window.google && window.google.maps) {
        resolve();
        return;
      }

      // 創建 callback 函數
      window.googleMapsCallback = resolve;

      const script = document.createElement('script');
      const libraries = this.options.libraries.join(',');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${this.apiKey}&libraries=${libraries}&language=${this.options.language}&region=${this.options.region}&callback=googleMapsCallback`;
      script.onerror = reject;
      
      document.head.appendChild(script);
    });
  }

  /**
   * 創建地圖
   */
  createMap(elementId, options = {}) {
    const defaultOptions = {
      center: { lat: 25.0330, lng: 121.5654 }, // 台北市中心
      zoom: 12,
      mapTypeControl: true,
      streetViewControl: true,
      fullscreenControl: true,
      zoomControl: true
    };

    this.map = new google.maps.Map(
      document.getElementById(elementId),
      { ...defaultOptions, ...options }
    );

    // 初始化 PlacesService
    this.placesService = new google.maps.places.PlacesService(this.map);
    
    return this.map;
  }

  /**
   * 地理編碼地址
   */
  async geocodeAddress(address) {
    return new Promise((resolve, reject) => {
      const geocoder = new google.maps.Geocoder();
      
      geocoder.geocode({
        address: address,
        region: 'tw',
        language: 'zh-TW'
      }, (results, status) => {
        if (status === 'OK' && results[0]) {
          const result = results[0];
          resolve({
            success: true,
            lat: result.geometry.location.lat(),
            lng: result.geometry.location.lng(),
            formatted_address: result.formatted_address,
            place_id: result.place_id,
            address_components: result.address_components,
            geometry_type: result.geometry.location_type,
            location_type: result.types
          });
        } else {
          reject(new Error(`地理編碼失敗: ${status}`));
        }
      });
    });
  }

  /**
   * 反向地理編碼（從座標取得地址）
   */
  async reverseGeocode(lat, lng) {
    return new Promise((resolve, reject) => {
      const geocoder = new google.maps.Geocoder();
      
      geocoder.geocode({
        location: { lat, lng },
        language: 'zh-TW'
      }, (results, status) => {
        if (status === 'OK' && results[0]) {
          resolve({
            success: true,
            formatted_address: results[0].formatted_address,
            address_components: results[0].address_components
          });
        } else {
          reject(new Error(`反向地理編碼失敗: ${status}`));
        }
      });
    });
  }

  /**
   * 添加標記
   */
  addMarker(position, options = {}) {
    const defaultOptions = {
      map: this.map,
      position: position,
      animation: google.maps.Animation.DROP
    };

    const marker = new google.maps.Marker({
      ...defaultOptions,
      ...options
    });

    this.markers.push(marker);
    return marker;
  }

  /**
   * 批量添加訂單標記
   */
  addOrderMarkers(orders, statusColors = {}) {
    const bounds = new google.maps.LatLngBounds();
    
    orders.forEach(order => {
      if (!order.lat || !order.lng) return;

      const position = { 
        lat: parseFloat(order.lat), 
        lng: parseFloat(order.lng) 
      };
      
      const color = statusColors[order.status] || '#888888';
      
      const marker = this.addMarker(position, {
        title: `訂單 #${order.id}`,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: color,
          fillOpacity: 0.8,
          strokeColor: '#ffffff',
          strokeWeight: 2
        }
      });

      // 添加資訊窗
      const infoWindow = new google.maps.InfoWindow({
        content: this.createOrderInfoContent(order)
      });

      marker.addListener('click', () => {
        // 關閉其他資訊窗
        this.markers.forEach(m => {
          if (m.infoWindow) {
            m.infoWindow.close();
          }
        });
        infoWindow.open(this.map, marker);
      });

      marker.infoWindow = infoWindow;
      bounds.extend(position);
    });

    // 調整地圖視角
    if (orders.length > 0) {
      this.map.fitBounds(bounds);
      
      // 防止過度放大
      google.maps.event.addListenerOnce(this.map, 'bounds_changed', () => {
        if (this.map.getZoom() > 16) {
          this.map.setZoom(16);
        }
      });
    }
  }

  /**
   * 創建訂單資訊內容
   */
  createOrderInfoContent(order) {
    const statusNames = {
      placed: '已下單',
      quoted: '已報價',
      paid: '已付款',
      out_for_delivery: '配送中',
      delivered: '已送達',
      canceled: '已取消'
    };

    return `
      <div style="max-width: 300px; font-family: Arial, sans-serif;">
        <h4 style="margin: 0 0 10px 0; color: #333;">訂單 #${order.id}</h4>
        <div style="margin-bottom: 8px;"><strong>客戶：</strong>${order.contact_name || order.customer_name || ''}</div>
        <div style="margin-bottom: 8px;"><strong>電話：</strong>${order.contact_phone || order.customer_phone || ''}</div>
        <div style="margin-bottom: 8px;"><strong>狀態：</strong>${statusNames[order.status] || order.status}</div>
        <div style="margin-bottom: 8px;"><strong>金額：</strong>$${order.total || 0}</div>
        <div style="margin-bottom: 8px;"><strong>地址：</strong>${order.address || ''}</div>
        ${order.formatted_address ? `<div style="margin-bottom: 8px;"><strong>格式化地址：</strong>${order.formatted_address}</div>` : ''}
        <div style="font-size: 12px; color: #666; margin-top: 10px;">
          建立時間：${order.created_at ? new Date(order.created_at).toLocaleString('zh-TW') : ''}
        </div>
      </div>
    `;
  }

  /**
   * 清除所有標記
   */
  clearMarkers() {
    this.markers.forEach(marker => {
      marker.setMap(null);
    });
    this.markers = [];
  }

  /**
   * 規劃路線
   */
  async planRoute(origin, destination, waypoints = [], optimize = true) {
    return new Promise((resolve, reject) => {
      const request = {
        origin: origin,
        destination: destination,
        waypoints: waypoints.map(wp => ({ 
          location: wp, 
          stopover: true 
        })),
        optimizeWaypoints: optimize,
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.METRIC,
        avoidHighways: false,
        avoidTolls: true
      };

      this.directionsService.route(request, (result, status) => {
        if (status === 'OK') {
          const route = result.routes[0];
          
          // 計算總距離和時間
          let totalDistance = 0;
          let totalDuration = 0;
          
          route.legs.forEach(leg => {
            totalDistance += leg.distance.value;
            totalDuration += leg.duration.value;
          });

          resolve({
            success: true,
            result: result,
            totalDistance: (totalDistance / 1000).toFixed(2), // 轉換為公里
            totalDuration: Math.round(totalDuration / 60), // 轉換為分鐘
            optimizedOrder: route.waypoint_order || [],
            polyline: route.overview_polyline,
            legs: route.legs
          });
        } else {
          reject(new Error(`路線規劃失敗: ${status}`));
        }
      });
    });
  }

  /**
   * 顯示路線
   */
  displayRoute(routeResult, options = {}) {
    const defaultOptions = {
      suppressMarkers: false,
      polylineOptions: {
        strokeColor: '#4285f4',
        strokeWeight: 4,
        strokeOpacity: 0.8
      }
    };

    this.directionsRenderer.setOptions({
      ...defaultOptions,
      ...options
    });

    this.directionsRenderer.setMap(this.map);
    this.directionsRenderer.setDirections(routeResult.result);

    return this.directionsRenderer;
  }

  /**
   * 清除路線
   */
  clearRoute() {
    if (this.directionsRenderer) {
      this.directionsRenderer.setMap(null);
    }
  }

  /**
   * 地址自動完成
   */
  async getPlacePredictions(input, options = {}) {
    return new Promise((resolve, reject) => {
      const defaultOptions = {
        input: input,
        componentRestrictions: { country: 'tw' },
        language: 'zh-TW'
      };

      this.autocompleteService.getPlacePredictions({
        ...defaultOptions,
        ...options
      }, (predictions, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          resolve(predictions || []);
        } else {
          reject(new Error(`自動完成失敗: ${status}`));
        }
      });
    });
  }

  /**
   * 取得地點詳細資訊
   */
  async getPlaceDetails(placeId) {
    return new Promise((resolve, reject) => {
      this.placesService.getDetails({
        placeId: placeId,
        fields: ['formatted_address', 'geometry', 'name', 'place_id']
      }, (place, status) => {
        if (status === google.maps.places.PlacesServiceStatus.OK) {
          resolve({
            success: true,
            formatted_address: place.formatted_address,
            lat: place.geometry.location.lat(),
            lng: place.geometry.location.lng(),
            name: place.name,
            place_id: place.place_id
          });
        } else {
          reject(new Error(`取得地點詳情失敗: ${status}`));
        }
      });
    });
  }

  /**
   * 計算兩點間距離
   */
  calculateDistance(point1, point2) {
    const R = 6371; // 地球半徑（公里）
    const dLat = this.toRad(point2.lat - point1.lat);
    const dLon = this.toRad(point2.lng - point1.lng);
    
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(point1.lat)) * Math.cos(this.toRad(point2.lat)) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * 角度轉弧度
   */
  toRad(degrees) {
    return degrees * (Math.PI / 180);
  }

  /**
   * 設定地圖中心
   */
  setCenter(lat, lng, zoom = null) {
    const center = new google.maps.LatLng(lat, lng);
    this.map.setCenter(center);
    if (zoom !== null) {
      this.map.setZoom(zoom);
    }
  }

  /**
   * 獲取地圖邊界
   */
  getBounds() {
    return this.map.getBounds();
  }

  /**
   * 適配所有標記
   */
  fitBounds() {
    if (this.markers.length === 0) return;
    
    const bounds = new google.maps.LatLngBounds();
    this.markers.forEach(marker => {
      bounds.extend(marker.getPosition());
    });
    
    this.map.fitBounds(bounds);
  }

  /**
   * 錯誤處理
   */
  handleError(error, context = '地圖操作') {
    console.error(`${context}錯誤:`, error);
    
    // 可以在這裡添加用戶友好的錯誤提示
    if (typeof window.showNotification === 'function') {
      window.showNotification(`${context}失敗: ${error.message}`, 'error');
    }
  }

  /**
   * 銷毀地圖實例
   */
  destroy() {
    this.clearMarkers();
    this.clearRoute();
    
    if (this.map) {
      this.map = null;
    }
    
    console.log('🗑️ Google Maps 客戶端已銷毀');
  }
}

// 地址輸入框自動完成功能
class AddressAutocomplete {
  constructor(inputElement, options = {}) {
    this.input = inputElement;
    this.options = {
      componentRestrictions: { country: 'tw' },
      types: ['address'],
      language: 'zh-TW',
      ...options
    };
    
    this.autocomplete = null;
    this.onPlaceChanged = options.onPlaceChanged || null;
    
    this.init();
  }

  async init() {
    // 確保 Google Maps API 已載入
    if (typeof google === 'undefined') {
      console.warn('Google Maps API 尚未載入，無法初始化地址自動完成');
      return;
    }

    this.autocomplete = new google.maps.places.Autocomplete(
      this.input,
      this.options
    );

    this.autocomplete.addListener('place_changed', () => {
      const place = this.autocomplete.getPlace();
      
      if (place.geometry) {
        const result = {
          formatted_address: place.formatted_address,
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng(),
          place_id: place.place_id,
          address_components: place.address_components
        };

        if (this.onPlaceChanged) {
          this.onPlaceChanged(result);
        }
      }
    });
  }

  getPlace() {
    return this.autocomplete ? this.autocomplete.getPlace() : null;
  }

  setBounds(bounds) {
    if (this.autocomplete) {
      this.autocomplete.setBounds(bounds);
    }
  }

  setCountry(country) {
    if (this.autocomplete) {
      this.autocomplete.setComponentRestrictions({ country: country });
    }
  }
}

// 導出到全域
if (typeof window !== 'undefined') {
  window.GoogleMapsClient = GoogleMapsClient;
  window.AddressAutocomplete = AddressAutocomplete;
}

// 如果在 Node.js 環境中
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    GoogleMapsClient,
    AddressAutocomplete
  };
}