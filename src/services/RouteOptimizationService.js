/**
 * 路線優化管理服務
 * 整合地理聚類和TSP優化，提供完整的配送路線解決方案
 */

const GeoClustering = require('./GeoClustering');
const TSPOptimizer = require('./TSPOptimizer');

class RouteOptimizationService {
  constructor(pool) {
    this.pool = pool;
    this.geoClustering = new GeoClustering();
    this.tspOptimizer = new TSPOptimizer();
    
    // 配送中心預設位置 (可從設定檔或資料庫載入)
    this.defaultDepot = {
      lat: 25.0330,
      lng: 121.5654,
      name: '承億蔬菜配送中心',
      address: '台北市信義區'
    };
  }

  /**
   * 為準備配送的訂單生成優化路線
   */
  async generateOptimizedRoutes(options = {}) {
    const {
      includeStatuses = ['ready'],
      maxClusters = null,
      optimizationMethod = 'hybrid',
      clusteringMethod = 'kmeans',
      depot = null
    } = options;

    console.log('🚀 開始生成優化配送路線...');

    try {
      // 1. 載入需要配送的訂單
      const orders = await this.loadOrdersForDelivery(includeStatuses);
      
      if (orders.length === 0) {
        return {
          success: true,
          message: '沒有需要配送的訂單',
          routes: [],
          stats: { totalOrders: 0, totalClusters: 0 }
        };
      }

      console.log(`📦 載入了 ${orders.length} 筆待配送訂單`);

      // 2. 地理聚類分組
      const clusterResult = await this.performClustering(orders, clusteringMethod, maxClusters);
      
      // 3. 為每個聚類優化路線
      const optimizedRoutes = await this.optimizeClusterRoutes(
        clusterResult.clusters, 
        optimizationMethod, 
        depot || this.defaultDepot
      );

      // 4. 計算總體統計
      const overallStats = this.calculateOverallStats(clusterResult, optimizedRoutes);

      console.log('✅ 路線優化完成');

      return {
        success: true,
        routes: optimizedRoutes,
        clusterStats: clusterResult.stats,
        overallStats,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('❌ 路線優化失敗:', error);
      return {
        success: false,
        error: error.message,
        routes: []
      };
    }
  }

  /**
   * 載入需要配送的訂單
   */
  async loadOrdersForDelivery(includeStatuses) {
    const statusPlaceholders = includeStatuses.map((_, index) => `$${index + 1}`).join(',');
    
    const query = `
      SELECT 
        o.id, o.contact_name, o.contact_phone, o.address,
        o.total_amount, o.status, o.created_at, o.notes,
        o.lat, o.lng
      FROM orders o
      WHERE o.status IN (${statusPlaceholders})
        AND o.lat IS NOT NULL 
        AND o.lng IS NOT NULL
      ORDER BY o.created_at ASC
    `;

    const result = await this.pool.query(query, includeStatuses);
    return result.rows.map(order => ({
      ...order,
      lat: parseFloat(order.lat),
      lng: parseFloat(order.lng)
    }));
  }

  /**
   * 執行聚類分析
   */
  async performClustering(orders, method, maxClusters) {
    console.log(`🎯 執行${method}聚類分析...`);

    switch (method) {
      case 'adaptive':
        return this.geoClustering.adaptiveCluster(orders, 5); // 5km範圍內為一組
        
      case 'density':
        return this.geoClustering.adaptiveCluster(orders, 3); // 3km範圍內為一組
        
      case 'kmeans':
      default:
        const k = maxClusters || this.geoClustering.determineOptimalK(orders);
        return this.geoClustering.kMeansCluster(orders, k);
    }
  }

  /**
   * 為每個聚類優化路線
   */
  async optimizeClusterRoutes(clusters, optimizationMethod, depot) {
    console.log(`🔧 為 ${clusters.length} 個聚類優化路線...`);

    const optimizedRoutes = [];

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      
      if (cluster.length === 0) continue;

      console.log(`  處理聚類 ${i + 1}: ${cluster.length} 個訂單`);

      // TSP優化
      const optimizationResult = this.tspOptimizer.optimizeRoute(
        cluster, 
        depot, 
        optimizationMethod
      );

      const route = {
        routeId: `route_${Date.now()}_${i}`,
        clusterId: i,
        orders: optimizationResult.route,
        totalDistance: optimizationResult.totalDistance,
        estimatedTime: this.estimateDeliveryTime(optimizationResult.totalDistance, cluster.length),
        optimizationMethod: optimizationResult.method,
        routeDetails: optimizationResult.routeDetails,
        depot: depot,
        googleMapsUrl: '',
        stats: {
          orderCount: cluster.length,
          totalValue: cluster.reduce((sum, order) => sum + parseFloat(order.total_amount), 0),
          averageDistance: optimizationResult.totalDistance / cluster.length,
          createdAt: new Date().toISOString()
        }
      };

      // 生成Google Maps URL
      route.googleMapsUrl = this.generateGoogleMapsUrl(route);

      optimizedRoutes.push(route);
    }

    return optimizedRoutes;
  }

  /**
   * 估算配送時間
   */
  estimateDeliveryTime(totalDistance, orderCount) {
    const drivingTime = (totalDistance / 30) * 60; // 假設30km/h
    const stopTime = orderCount * 5; // 每個訂單5分鐘
    const totalMinutes = drivingTime + stopTime + 15; // 加緩衝時間

    return {
      totalMinutes: Math.round(totalMinutes),
      drivingMinutes: Math.round(drivingTime),
      stopMinutes: stopTime,
      estimatedHours: Math.round(totalMinutes / 60 * 10) / 10
    };
  }

  /**
   * 計算總體統計
   */
  calculateOverallStats(clusterResult, optimizedRoutes) {
    const totalOrders = optimizedRoutes.reduce((sum, route) => sum + route.orders.length, 0);
    const totalDistance = optimizedRoutes.reduce((sum, route) => sum + route.totalDistance, 0);
    const totalValue = optimizedRoutes.reduce((sum, route) => sum + route.stats.totalValue, 0);
    const totalTime = optimizedRoutes.reduce((sum, route) => sum + route.estimatedTime.totalMinutes, 0);

    return {
      totalOrders,
      totalRoutes: optimizedRoutes.length,
      totalDistance: Math.round(totalDistance * 100) / 100,
      totalValue: Math.round(totalValue * 100) / 100,
      averageOrdersPerRoute: totalOrders > 0 ? Math.round(totalOrders / optimizedRoutes.length * 10) / 10 : 0,
      averageDistancePerRoute: optimizedRoutes.length > 0 ? Math.round(totalDistance / optimizedRoutes.length * 100) / 100 : 0,
      estimatedTotalTime: Math.round(totalTime),
      clusterQuality: this.geoClustering.evaluateClusterQuality(clusterResult.clusters),
      efficiency: {
        ordersPerKm: totalDistance > 0 ? Math.round(totalOrders / totalDistance * 100) / 100 : 0,
        valuePerKm: totalDistance > 0 ? Math.round(totalValue / totalDistance * 100) / 100 : 0,
        timePerOrder: totalOrders > 0 ? Math.round(totalTime / totalOrders * 100) / 100 : 0
      }
    };
  }

  /**
   * 生成Google Maps路線URL
   */
  generateGoogleMapsUrl(route) {
    if (!route.orders || route.orders.length === 0) return '';

    const baseUrl = 'https://www.google.com/maps/dir/';
    const depot = route.depot;
    
    let url = baseUrl + `${depot.lat},${depot.lng}/`;
    
    // 添加途經點 (Google Maps限制最多23個途經點)
    const waypoints = route.orders.slice(0, Math.min(23, route.orders.length)).map(order => 
      `${order.lat},${order.lng}`
    ).join('/');
    
    url += waypoints + `/${depot.lat},${depot.lng}`;

    return url;
  }

  /**
   * 獲取服務狀態
   */
  getServiceStatus() {
    return {
      initialized: true,
      depot: this.defaultDepot,
      algorithms: {
        clustering: ['kmeans', 'adaptive', 'density'],
        tsp: ['nearest', '2opt', 'annealing', 'genetic', 'hybrid']
      },
      capabilities: {
        maxOrdersPerRoute: 25,
        maxClusters: 10,
        supportedStatuses: ['ready', 'delivering']
      }
    };
  }
}

module.exports = RouteOptimizationService;