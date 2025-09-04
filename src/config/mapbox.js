// Mapbox configuration
const MAPBOX_CONFIG = {
    // 免費版 Mapbox access token (需要從 Mapbox 帳戶獲取)
    ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN || 'pk.eyJ1IjoiY2hlbmd5aXZlZ2V0YWJsZSIsImEiOiJjbWV4bGZjNmYxMmxjMmxvYTFhNzQ4ZWFnIn0.SdmzkXZK95R5kUgX6-22LA',
    
    // API 端點
    GEOCODING_URL: 'https://api.mapbox.com/geocoding/v5/mapbox.places',
    DIRECTIONS_URL: 'https://api.mapbox.com/directions/v5/mapbox/driving',
    
    // 默認地圖設置
    DEFAULT_ZOOM: 12,
    DEFAULT_CENTER: [121.3706, 24.9342], // 新北市三峽區座標
    
    // 地圖樣式
    STYLE: 'mapbox://styles/mapbox/streets-v11',
    
    // 配送區域邊界 (新北市周邊)
    BOUNDS: [
        [121.2, 24.8], // Southwest coordinates
        [121.5, 25.1]  // Northeast coordinates
    ],
    
    // 費率限制 (免費版限制)
    RATE_LIMITS: {
        GEOCODING: 100000, // 每月100,000次geocoding請求
        DIRECTIONS: 300000, // 每月300,000次directions請求
        MAP_LOADS: 50000    // 每月50,000次地圖載入
    }
};

module.exports = MAPBOX_CONFIG;