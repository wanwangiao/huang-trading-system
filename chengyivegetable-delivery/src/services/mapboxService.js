const axios = require('axios');
const MAPBOX_CONFIG = require('../config/mapbox');

class MapboxService {
    constructor() {
        this.accessToken = MAPBOX_CONFIG.ACCESS_TOKEN;
        this.baseGeocodeUrl = MAPBOX_CONFIG.GEOCODING_URL;
        this.baseDirectionsUrl = MAPBOX_CONFIG.DIRECTIONS_URL;
    }

    /**
     * 地址轉座標 (Geocoding)
     * @param {string} address - 地址
     * @returns {Promise<Object>} 座標資訊
     */
    async geocode(address) {
        try {
            const url = `${this.baseGeocodeUrl}/${encodeURIComponent(address)}.json`;
            const response = await axios.get(url, {
                params: {
                    access_token: this.accessToken,
                    country: 'tw', // 限制在台灣
                    proximity: '121.3706,24.9342', // 偏好三峽區附近
                    limit: 1
                }
            });

            if (response.data.features && response.data.features.length > 0) {
                const feature = response.data.features[0];
                return {
                    success: true,
                    coordinates: feature.center,
                    formattedAddress: feature.place_name
                };
            } else {
                return {
                    success: false,
                    message: '找不到該地址'
                };
            }
        } catch (error) {
            console.error('Mapbox geocoding error:', error);
            return {
                success: false,
                message: '地址解析失敗'
            };
        }
    }

    /**
     * 座標轉地址 (Reverse Geocoding)
     * @param {number} lng - 經度
     * @param {number} lat - 緯度
     * @returns {Promise<Object>} 地址資訊
     */
    async reverseGeocode(lng, lat) {
        try {
            const url = `${this.baseGeocodeUrl}/${lng},${lat}.json`;
            const response = await axios.get(url, {
                params: {
                    access_token: this.accessToken,
                    country: 'tw',
                    types: 'address'
                }
            });

            if (response.data.features && response.data.features.length > 0) {
                return {
                    success: true,
                    address: response.data.features[0].place_name
                };
            } else {
                return {
                    success: false,
                    message: '找不到該座標對應的地址'
                };
            }
        } catch (error) {
            console.error('Mapbox reverse geocoding error:', error);
            return {
                success: false,
                message: '座標解析失敗'
            };
        }
    }

    /**
     * 獲取路線規劃
     * @param {Array} waypoints - 途經點座標陣列 [[lng, lat], ...]
     * @returns {Promise<Object>} 路線資訊
     */
    async getDirections(waypoints) {
        try {
            if (waypoints.length < 2) {
                throw new Error('至少需要2個途經點');
            }

            // 格式化座標字串
            const coordinates = waypoints.map(point => `${point[0]},${point[1]}`).join(';');
            const url = `${this.baseDirectionsUrl}/${coordinates}`;

            const response = await axios.get(url, {
                params: {
                    access_token: this.accessToken,
                    overview: 'full',
                    geometries: 'geojson',
                    steps: true
                }
            });

            if (response.data.routes && response.data.routes.length > 0) {
                const route = response.data.routes[0];
                return {
                    success: true,
                    distance: Math.round(route.distance / 1000 * 10) / 10, // 公里，保留一位小數
                    duration: Math.round(route.duration / 60), // 分鐘
                    geometry: route.geometry,
                    waypoints: response.data.waypoints,
                    legs: route.legs
                };
            } else {
                return {
                    success: false,
                    message: '無法計算路線'
                };
            }
        } catch (error) {
            console.error('Mapbox directions error:', error);
            return {
                success: false,
                message: '路線計算失敗'
            };
        }
    }

    /**
     * 最佳化多點路線 (TSP - Traveling Salesman Problem)
     * @param {Array} addresses - 地址陣列
     * @returns {Promise<Object>} 優化後的路線
     */
    async optimizeRoute(addresses) {
        try {
            // 第一步：將所有地址轉換為座標
            const geocodePromises = addresses.map(address => this.geocode(address));
            const geocodeResults = await Promise.all(geocodePromises);
            
            // 檢查是否所有地址都成功轉換
            const validCoordinates = [];
            const addressMapping = [];
            
            for (let i = 0; i < geocodeResults.length; i++) {
                if (geocodeResults[i].success) {
                    validCoordinates.push(geocodeResults[i].coordinates);
                    addressMapping.push({
                        originalIndex: i,
                        address: addresses[i],
                        coordinates: geocodeResults[i].coordinates
                    });
                }
            }

            if (validCoordinates.length < 2) {
                return {
                    success: false,
                    message: '可用地址數量不足，無法計算路線'
                };
            }

            // 第二步：使用Mapbox Directions API進行路線優化
            const directionsResult = await this.getDirections(validCoordinates);
            
            if (directionsResult.success) {
                return {
                    success: true,
                    optimizedAddresses: addressMapping,
                    totalDistance: directionsResult.distance,
                    totalDuration: directionsResult.duration,
                    routeGeometry: directionsResult.geometry,
                    mapboxUrl: this.generateMapboxUrl(validCoordinates)
                };
            } else {
                return directionsResult;
            }
        } catch (error) {
            console.error('Route optimization error:', error);
            return {
                success: false,
                message: '路線優化失敗'
            };
        }
    }

    /**
     * 生成Mapbox地圖URL
     * @param {Array} coordinates - 座標陣列
     * @returns {string} Mapbox地圖URL
     */
    generateMapboxUrl(coordinates) {
        if (coordinates.length === 0) return null;
        
        const pins = coordinates.map((coord, index) => {
            const label = String.fromCharCode(65 + index); // A, B, C...
            return `pin-l-${label.toLowerCase()}+ff0000(${coord[0]},${coord[1]})`;
        }).join(',');
        
        return `https://api.mapbox.com/styles/v1/mapbox/streets-v11/static/${pins}/auto/800x600@2x?access_token=${this.accessToken}`;
    }

    /**
     * 生成可互動的地圖URL
     * @param {Array} coordinates - 座標陣列
     * @returns {string} 互動式地圖URL
     */
    generateInteractiveMapUrl(coordinates) {
        if (coordinates.length === 0) return null;
        
        const center = coordinates[0];
        const markers = coordinates.map(coord => `${coord[0]},${coord[1]}`).join('|');
        
        return `https://www.mapbox.com/directions/?waypoints=${markers}#12/${center[1]}/${center[0]}`;
    }
}

module.exports = new MapboxService();