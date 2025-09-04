// Google Maps configuration
const GOOGLE_MAPS_CONFIG = {
    // Google Maps API Key
    ACCESS_TOKEN: process.env.GOOGLE_MAPS_API_KEY || 'AIzaSyBRwW-NMUDGMXaDhvl3oYJs_OqjfXWTTNE',
    
    // API 端點
    GEOCODING_URL: 'https://maps.googleapis.com/maps/api/geocode/json',
    DIRECTIONS_URL: 'https://maps.googleapis.com/maps/api/directions/json',
    STATIC_MAPS_URL: 'https://maps.googleapis.com/maps/api/staticmap',
    
    // JavaScript API 端點
    JS_API_URL: 'https://maps.googleapis.com/maps/api/js',
    
    // 預設設定
    DEFAULT_ZOOM: 12,
    DEFAULT_CENTER: {
        lat: 24.93,  // 三峽區中心
        lng: 121.37
    },
    
    // 地圖樣式選項
    MAP_TYPES: {
        ROADMAP: 'roadmap',
        SATELLITE: 'satellite',
        HYBRID: 'hybrid',
        TERRAIN: 'terrain'
    },
    
    // 標記顏色
    MARKER_COLORS: {
        RED: 'red',
        GREEN: 'green',
        BLUE: 'blue',
        YELLOW: 'yellow',
        PURPLE: 'purple',
        ORANGE: 'orange'
    },
    
    // 價格設定 (USD)
    PRICING: {
        STATIC_MAPS: 0.002,    // $2 per 1000 requests
        GEOCODING: 0.005,      // $5 per 1000 requests
        DIRECTIONS: 0.005,     // $5 per 1000 requests
        JS_API: 0.007,         // $7 per 1000 loads
        PLACES_API: 0.032      // $32 per 1000 requests
    },
    
    // 免費額度 (每月)
    FREE_CREDIT: 200,  // $200 USD
    
    // 語言和地區設定
    DEFAULT_LANGUAGE: 'zh-TW',
    DEFAULT_REGION: 'TW'
};

// 驗證配置
function validateConfig() {
    if (!GOOGLE_MAPS_CONFIG.ACCESS_TOKEN || GOOGLE_MAPS_CONFIG.ACCESS_TOKEN === 'your_google_maps_key_here') {
        console.warn('⚠️ Google Maps API Key 未設定，請在 .env 文件中設定 GOOGLE_MAPS_API_KEY');
        return false;
    }
    return true;
}

// 取得完整的 JavaScript API URL
function getJavaScriptApiUrl(options = {}) {
    const {
        libraries = [],
        language = GOOGLE_MAPS_CONFIG.DEFAULT_LANGUAGE,
        region = GOOGLE_MAPS_CONFIG.DEFAULT_REGION,
        callback = 'initMap'
    } = options;
    
    const params = new URLSearchParams({
        key: GOOGLE_MAPS_CONFIG.ACCESS_TOKEN,
        callback: callback,
        language: language,
        region: region
    });
    
    if (libraries.length > 0) {
        params.append('libraries', libraries.join(','));
    }
    
    return `${GOOGLE_MAPS_CONFIG.JS_API_URL}?${params.toString()}`;
}

// 取得靜態地圖 URL
function getStaticMapUrl(options = {}) {
    const {
        center,
        zoom = GOOGLE_MAPS_CONFIG.DEFAULT_ZOOM,
        size = '600x400',
        maptype = GOOGLE_MAPS_CONFIG.MAP_TYPES.ROADMAP,
        markers = [],
        path = null
    } = options;
    
    const params = new URLSearchParams({
        key: GOOGLE_MAPS_CONFIG.ACCESS_TOKEN,
        size: size,
        maptype: maptype,
        zoom: zoom.toString()
    });
    
    if (center) {
        params.append('center', `${center.lat},${center.lng}`);
    }
    
    // 添加標記
    markers.forEach((marker, index) => {
        const markerStr = `color:${marker.color || 'red'}|label:${marker.label || (index + 1)}|${marker.lat},${marker.lng}`;
        params.append('markers', markerStr);
    });
    
    // 添加路徑
    if (path) {
        params.append('path', path);
    }
    
    return `${GOOGLE_MAPS_CONFIG.STATIC_MAPS_URL}?${params.toString()}`;
}

module.exports = {
    GOOGLE_MAPS_CONFIG,
    validateConfig,
    getJavaScriptApiUrl,
    getStaticMapUrl
};