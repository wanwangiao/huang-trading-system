/**
 * 地理聚類服務
 * 使用K-means演算法將訂單按地理位置分組
 */

class GeoClustering {
  constructor() {
    this.maxIterations = 100;
    this.convergenceThreshold = 0.0001; // 收斂閾值
  }

  /**
   * 計算兩點間的直線距離 (公里)
   * 使用 Haversine 公式
   */
  calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // 地球半徑（公里）
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
   * K-means 聚類主函數
   * @param {Array} orders - 訂單列表，每個訂單包含 {id, lat, lng, ...}
   * @param {number} k - 聚類數量
   * @return {Object} 聚類結果
   */
  kMeansCluster(orders, k) {
    if (!orders || orders.length === 0) {
      return { clusters: [], centroids: [], stats: {} };
    }

    // 自動確定最適合的 k 值
    if (!k || k <= 0) {
      k = this.determineOptimalK(orders);
    }

    // 確保 k 不超過訂單數量
    k = Math.min(k, orders.length);

    console.log(`🎯 開始 K-means 聚類: ${orders.length} 個訂單分為 ${k} 組`);

    // 初始化聚類中心
    let centroids = this.initializeCentroids(orders, k);
    let clusters = [];
    let iteration = 0;

    while (iteration < this.maxIterations) {
      // 分配訂單到最近的聚類中心
      clusters = this.assignOrdersToClusters(orders, centroids);
      
      // 計算新的聚類中心
      const newCentroids = this.calculateNewCentroids(clusters);
      
      // 檢查收斂
      if (this.hasConverged(centroids, newCentroids)) {
        console.log(`✅ K-means 在第 ${iteration + 1} 次迭代後收斂`);
        break;
      }
      
      centroids = newCentroids;
      iteration++;
    }

    // 計算聚類統計資訊
    const stats = this.calculateClusterStats(clusters, centroids);
    
    console.log(`📊 聚類完成: ${stats.totalClusters} 組, 平均每組 ${stats.averageClusterSize} 個訂單`);

    return {
      clusters,
      centroids,
      stats,
      iterations: iteration + 1
    };
  }

  /**
   * 確定最適合的 K 值
   * 使用經驗法則：每組不超過8個訂單，最少2組
   */
  determineOptimalK(orders) {
    const maxOrdersPerCluster = 8;
    const minClusters = 2;
    
    let k = Math.ceil(orders.length / maxOrdersPerCluster);
    k = Math.max(k, minClusters);
    k = Math.min(k, orders.length);
    
    return k;
  }

  /**
   * 初始化聚類中心
   * 使用 K-means++ 演算法選擇較好的初始點
   */
  initializeCentroids(orders, k) {
    const centroids = [];
    
    // 第一個中心點隨機選擇
    const firstIndex = Math.floor(Math.random() * orders.length);
    centroids.push({
      lat: orders[firstIndex].lat,
      lng: orders[firstIndex].lng
    });

    // 其餘中心點使用 K-means++ 選擇
    for (let i = 1; i < k; i++) {
      const distances = orders.map(order => {
        // 計算到最近中心點的距離
        const minDistance = Math.min(...centroids.map(centroid =>
          this.calculateDistance(order.lat, order.lng, centroid.lat, centroid.lng)
        ));
        return minDistance * minDistance; // 平方距離作為權重
      });

      // 基於距離權重隨機選擇
      const totalWeight = distances.reduce((sum, d) => sum + d, 0);
      let random = Math.random() * totalWeight;
      
      for (let j = 0; j < orders.length; j++) {
        random -= distances[j];
        if (random <= 0) {
          centroids.push({
            lat: orders[j].lat,
            lng: orders[j].lng
          });
          break;
        }
      }
    }

    return centroids;
  }

  /**
   * 將訂單分配到最近的聚類中心
   */
  assignOrdersToClusters(orders, centroids) {
    const clusters = centroids.map(() => []);

    orders.forEach(order => {
      let minDistance = Infinity;
      let closestCluster = 0;

      centroids.forEach((centroid, index) => {
        const distance = this.calculateDistance(
          order.lat, order.lng,
          centroid.lat, centroid.lng
        );

        if (distance < minDistance) {
          minDistance = distance;
          closestCluster = index;
        }
      });

      // 添加距離資訊到訂單
      clusters[closestCluster].push({
        ...order,
        distanceToCenter: minDistance
      });
    });

    return clusters;
  }

  /**
   * 計算新的聚類中心
   */
  calculateNewCentroids(clusters) {
    return clusters.map(cluster => {
      if (cluster.length === 0) {
        return { lat: 0, lng: 0 }; // 空聚類的默認中心
      }

      const avgLat = cluster.reduce((sum, order) => sum + order.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((sum, order) => sum + order.lng, 0) / cluster.length;

      return { lat: avgLat, lng: avgLng };
    });
  }

  /**
   * 檢查是否收斂
   */
  hasConverged(oldCentroids, newCentroids) {
    for (let i = 0; i < oldCentroids.length; i++) {
      const distance = this.calculateDistance(
        oldCentroids[i].lat, oldCentroids[i].lng,
        newCentroids[i].lat, newCentroids[i].lng
      );

      if (distance > this.convergenceThreshold) {
        return false;
      }
    }
    return true;
  }

  /**
   * 計算聚類統計資訊
   */
  calculateClusterStats(clusters, centroids) {
    const nonEmptyClusters = clusters.filter(cluster => cluster.length > 0);
    
    const stats = {
      totalClusters: nonEmptyClusters.length,
      totalOrders: clusters.reduce((sum, cluster) => sum + cluster.length, 0),
      averageClusterSize: 0,
      clusterSizes: [],
      averageDistanceFromCenter: 0,
      clusterDetails: []
    };

    if (nonEmptyClusters.length > 0) {
      stats.averageClusterSize = Math.round(stats.totalOrders / nonEmptyClusters.length);
      
      let totalDistanceSum = 0;
      let totalOrderCount = 0;

      nonEmptyClusters.forEach((cluster, index) => {
        const clusterSize = cluster.length;
        const avgDistance = cluster.reduce((sum, order) => sum + order.distanceToCenter, 0) / clusterSize;
        
        totalDistanceSum += cluster.reduce((sum, order) => sum + order.distanceToCenter, 0);
        totalOrderCount += clusterSize;

        stats.clusterSizes.push(clusterSize);
        stats.clusterDetails.push({
          clusterId: index,
          size: clusterSize,
          center: centroids[index],
          averageDistance: avgDistance,
          orderIds: cluster.map(order => order.id)
        });
      });

      stats.averageDistanceFromCenter = totalOrderCount > 0 ? totalDistanceSum / totalOrderCount : 0;
    }

    return stats;
  }

  /**
   * 基於地理密度的智能聚類
   * 自動檢測密集區域並調整聚類
   */
  adaptiveCluster(orders, maxDistance = 5) {
    console.log(`🧠 執行自適應聚類 (最大距離: ${maxDistance}km)`);
    
    if (!orders || orders.length === 0) {
      return { clusters: [], centroids: [], stats: {} };
    }

    const clusters = [];
    const visited = new Set();

    orders.forEach((order, index) => {
      if (visited.has(index)) return;

      // 建立新聚類
      const cluster = [order];
      visited.add(index);

      // 尋找鄰近的訂單
      for (let i = index + 1; i < orders.length; i++) {
        if (visited.has(i)) continue;

        const distance = this.calculateDistance(
          order.lat, order.lng,
          orders[i].lat, orders[i].lng
        );

        if (distance <= maxDistance) {
          cluster.push(orders[i]);
          visited.add(i);
        }
      }

      clusters.push(cluster);
    });

    // 計算聚類中心
    const centroids = clusters.map(cluster => {
      const avgLat = cluster.reduce((sum, order) => sum + order.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((sum, order) => sum + order.lng, 0) / cluster.length;
      return { lat: avgLat, lng: avgLng };
    });

    const stats = this.calculateClusterStats(clusters, centroids);
    
    console.log(`📊 自適應聚類完成: ${stats.totalClusters} 組`);

    return {
      clusters,
      centroids,
      stats,
      method: 'adaptive'
    };
  }

  /**
   * 聚類結果評估
   * 計算輪廓係數來評估聚類品質
   */
  evaluateClusterQuality(clusters) {
    if (clusters.length <= 1) return 0;

    let totalSilhouette = 0;
    let totalOrders = 0;

    clusters.forEach((cluster, clusterIndex) => {
      cluster.forEach(order => {
        if (cluster.length === 1) {
          // 單點聚類的輪廓係數為0
          return;
        }

        // 計算 a(i): 與同聚類內其他點的平均距離
        const intraClusterDistance = cluster
          .filter(other => other.id !== order.id)
          .reduce((sum, other) => {
            return sum + this.calculateDistance(order.lat, order.lng, other.lat, other.lng);
          }, 0) / (cluster.length - 1);

        // 計算 b(i): 與最近鄰聚類的平均距離
        let minInterClusterDistance = Infinity;
        
        clusters.forEach((otherCluster, otherIndex) => {
          if (otherIndex === clusterIndex || otherCluster.length === 0) return;

          const avgDistance = otherCluster.reduce((sum, other) => {
            return sum + this.calculateDistance(order.lat, order.lng, other.lat, other.lng);
          }, 0) / otherCluster.length;

          minInterClusterDistance = Math.min(minInterClusterDistance, avgDistance);
        });

        // 計算輪廓係數
        const silhouette = (minInterClusterDistance - intraClusterDistance) / 
                          Math.max(intraClusterDistance, minInterClusterDistance);
        
        totalSilhouette += silhouette;
        totalOrders++;
      });
    });

    return totalOrders > 0 ? totalSilhouette / totalOrders : 0;
  }
}

module.exports = GeoClustering;