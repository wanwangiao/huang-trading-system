// =====================================
// 地理聚類服務
// 實現K-means演算法進行訂單地理分組
// =====================================

class GeographicClusteringService {
  constructor() {
    this.name = 'GeographicClusteringService';
  }

  /**
   * 對訂單進行地理聚類分組
   * @param {Array} orders - 訂單列表
   * @param {Object} options - 聚類選項
   */
  async clusterOrders(orders, options = {}) {
    const {
      maxGroupSize = 8,
      maxDistanceKm = 5,
      algorithm = 'kmeans',
      minGroupSize = 2
    } = options;

    console.log(`🔍 使用 ${algorithm} 演算法對 ${orders.length} 個訂單進行聚類分組...`);

    // 驗證輸入
    if (!orders || orders.length === 0) {
      throw new Error('訂單列表不能為空');
    }

    // 過濾有效的地理位置
    const validOrders = orders.filter(order => 
      order.lat && order.lng && 
      !isNaN(order.lat) && !isNaN(order.lng)
    );

    if (validOrders.length === 0) {
      throw new Error('沒有找到有效的地理位置資訊');
    }

    try {
      let clusters;
      
      switch (algorithm) {
        case 'kmeans':
          clusters = await this.kMeansCluster(validOrders, maxGroupSize, maxDistanceKm);
          break;
        case 'dbscan':
          clusters = await this.dbscanCluster(validOrders, maxDistanceKm);
          break;
        case 'hierarchical':
          clusters = await this.hierarchicalCluster(validOrders, maxGroupSize);
          break;
        default:
          clusters = await this.kMeansCluster(validOrders, maxGroupSize, maxDistanceKm);
      }

      // 後處理：確保群組大小合理
      clusters = this.postProcessClusters(clusters, minGroupSize, maxGroupSize);

      // 計算每個群組的統計資訊
      const processedClusters = await this.calculateClusterStats(clusters);

      console.log(`✅ 聚類完成，建立了 ${processedClusters.length} 個群組`);
      return processedClusters;

    } catch (error) {
      console.error('聚類分組失敗:', error);
      throw new Error(`聚類分組失敗: ${error.message}`);
    }
  }

  /**
   * K-means 聚類演算法實現
   */
  async kMeansCluster(orders, maxGroupSize, maxDistanceKm) {
    // 計算初始聚類數量
    const optimalK = Math.min(
      Math.ceil(orders.length / maxGroupSize),
      Math.max(2, Math.ceil(orders.length / 3))
    );

    console.log(`📊 使用 K-means，K=${optimalK}`);

    // 初始化聚類中心
    let centroids = this.initializeCentroids(orders, optimalK);
    let clusters = [];
    let iterations = 0;
    const maxIterations = 100;

    while (iterations < maxIterations) {
      // 分配訂單到最近的聚類中心
      clusters = this.assignOrdersToCentroids(orders, centroids, maxDistanceKm);
      
      // 計算新的聚類中心
      const newCentroids = this.updateCentroids(clusters);
      
      // 檢查收斂性
      if (this.hasConverged(centroids, newCentroids, 0.001)) {
        console.log(`🎯 K-means 在第 ${iterations + 1} 次迭代後收斂`);
        break;
      }
      
      centroids = newCentroids;
      iterations++;
    }

    return clusters;
  }

  /**
   * DBSCAN 聚類演算法實現
   */
  async dbscanCluster(orders, maxDistanceKm) {
    console.log(`📊 使用 DBSCAN，eps=${maxDistanceKm}km`);
    
    const eps = maxDistanceKm; // 鄰域半徑
    const minPts = 2; // 最小點數
    const clusters = [];
    const visited = new Set();
    const clustered = new Set();

    for (let i = 0; i < orders.length; i++) {
      const order = orders[i];
      
      if (visited.has(i)) continue;
      visited.add(i);

      // 找到鄰域內的所有點
      const neighbors = this.getNeighbors(order, orders, eps);
      
      if (neighbors.length < minPts) {
        // 標記為噪音點，後續單獨處理
        continue;
      }

      // 建立新的聚類
      const cluster = [];
      const neighborQueue = [...neighbors];
      
      while (neighborQueue.length > 0) {
        const neighborIdx = neighborQueue.shift();
        const neighborOrder = orders[neighborIdx];
        
        if (!visited.has(neighborIdx)) {
          visited.add(neighborIdx);
          const subNeighbors = this.getNeighbors(neighborOrder, orders, eps);
          
          if (subNeighbors.length >= minPts) {
            neighborQueue.push(...subNeighbors);
          }
        }
        
        if (!clustered.has(neighborIdx)) {
          cluster.push(neighborOrder);
          clustered.add(neighborIdx);
        }
      }
      
      if (cluster.length > 0) {
        clusters.push(cluster);
      }
    }

    // 處理未分群的訂單
    const unclusteredOrders = orders.filter((_, idx) => !clustered.has(idx));
    if (unclusteredOrders.length > 0) {
      clusters.push(...this.handleUnclusteredOrders(unclusteredOrders));
    }

    return clusters;
  }

  /**
   * 階層式聚類演算法實現
   */
  async hierarchicalCluster(orders, maxGroupSize) {
    console.log(`📊 使用階層式聚類`);
    
    // 每個訂單開始時都是一個獨立的聚類
    let clusters = orders.map(order => [order]);
    
    // 計算所有聚類對之間的距離矩陣
    while (clusters.length > Math.ceil(orders.length / maxGroupSize)) {
      let minDistance = Infinity;
      let mergeIndices = [-1, -1];
      
      // 找到距離最近的兩個聚類
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const distance = this.calculateClusterDistance(clusters[i], clusters[j]);
          
          if (distance < minDistance && 
              clusters[i].length + clusters[j].length <= maxGroupSize) {
            minDistance = distance;
            mergeIndices = [i, j];
          }
        }
      }
      
      // 如果找不到可以合併的聚類，停止
      if (mergeIndices[0] === -1) break;
      
      // 合併兩個聚類
      const [i, j] = mergeIndices;
      clusters[i] = [...clusters[i], ...clusters[j]];
      clusters.splice(j, 1);
    }
    
    return clusters;
  }

  /**
   * 初始化K-means聚類中心
   */
  initializeCentroids(orders, k) {
    const centroids = [];
    
    // 使用K-means++初始化方法
    // 第一個中心隨機選擇
    const firstCenter = orders[Math.floor(Math.random() * orders.length)];
    centroids.push({ lat: firstCenter.lat, lng: firstCenter.lng });
    
    for (let i = 1; i < k; i++) {
      const distances = orders.map(order => {
        // 計算到最近聚類中心的距離
        const minDist = Math.min(...centroids.map(centroid =>
          this.calculateDistance(order, centroid)
        ));
        return minDist * minDist; // 距離平方
      });
      
      // 按距離平方比例選擇下一個中心
      const totalWeight = distances.reduce((sum, dist) => sum + dist, 0);
      const randomValue = Math.random() * totalWeight;
      
      let cumulativeWeight = 0;
      for (let j = 0; j < orders.length; j++) {
        cumulativeWeight += distances[j];
        if (cumulativeWeight >= randomValue) {
          centroids.push({ lat: orders[j].lat, lng: orders[j].lng });
          break;
        }
      }
    }
    
    return centroids;
  }

  /**
   * 將訂單分配到最近的聚類中心
   */
  assignOrdersToCentroids(orders, centroids, maxDistanceKm) {
    const clusters = centroids.map(() => []);
    
    orders.forEach(order => {
      let minDistance = Infinity;
      let closestCluster = 0;
      
      centroids.forEach((centroid, idx) => {
        const distance = this.calculateDistance(order, centroid);
        if (distance < minDistance) {
          minDistance = distance;
          closestCluster = idx;
        }
      });
      
      // 只有在距離在允許範圍內才加入聚類
      if (minDistance <= maxDistanceKm) {
        clusters[closestCluster].push(order);
      }
    });
    
    // 移除空的聚類
    return clusters.filter(cluster => cluster.length > 0);
  }

  /**
   * 更新聚類中心
   */
  updateCentroids(clusters) {
    return clusters.map(cluster => {
      if (cluster.length === 0) return null;
      
      const avgLat = cluster.reduce((sum, order) => sum + order.lat, 0) / cluster.length;
      const avgLng = cluster.reduce((sum, order) => sum + order.lng, 0) / cluster.length;
      
      return { lat: avgLat, lng: avgLng };
    }).filter(centroid => centroid !== null);
  }

  /**
   * 檢查聚類中心是否收斂
   */
  hasConverged(oldCentroids, newCentroids, threshold = 0.001) {
    if (oldCentroids.length !== newCentroids.length) return false;
    
    for (let i = 0; i < oldCentroids.length; i++) {
      const distance = this.calculateDistance(oldCentroids[i], newCentroids[i]);
      if (distance > threshold) return false;
    }
    
    return true;
  }

  /**
   * 獲取鄰域內的所有點（DBSCAN用）
   */
  getNeighbors(centerOrder, allOrders, eps) {
    const neighbors = [];
    
    allOrders.forEach((order, idx) => {
      const distance = this.calculateDistance(centerOrder, order);
      if (distance <= eps) {
        neighbors.push(idx);
      }
    });
    
    return neighbors;
  }

  /**
   * 處理未分群的訂單
   */
  handleUnclusteredOrders(unclusteredOrders) {
    // 將未分群的訂單各自成為一個群組，或嘗試合併鄰近的
    const clusters = [];
    const remaining = [...unclusteredOrders];
    
    while (remaining.length > 0) {
      const current = remaining.shift();
      const cluster = [current];
      
      // 找到距離較近的其他未分群訂單
      for (let i = remaining.length - 1; i >= 0; i--) {
        if (this.calculateDistance(current, remaining[i]) <= 3) { // 3km內
          cluster.push(remaining.splice(i, 1)[0]);
        }
      }
      
      clusters.push(cluster);
    }
    
    return clusters;
  }

  /**
   * 計算聚類間距離（階層式聚類用）
   */
  calculateClusterDistance(cluster1, cluster2) {
    // 使用最小距離（單連鎖）
    let minDistance = Infinity;
    
    cluster1.forEach(order1 => {
      cluster2.forEach(order2 => {
        const distance = this.calculateDistance(order1, order2);
        if (distance < minDistance) {
          minDistance = distance;
        }
      });
    });
    
    return minDistance;
  }

  /**
   * 後處理聚類結果
   */
  postProcessClusters(clusters, minGroupSize, maxGroupSize) {
    console.log(`🔧 後處理聚類：最小群組 ${minGroupSize}，最大群組 ${maxGroupSize}`);
    
    let processedClusters = [...clusters];
    
    // 處理過大的群組
    for (let i = 0; i < processedClusters.length; i++) {
      if (processedClusters[i].length > maxGroupSize) {
        const largeCluster = processedClusters.splice(i, 1)[0];
        
        // 將大群組拆分成較小的群組
        const splitClusters = this.splitLargeCluster(largeCluster, maxGroupSize);
        processedClusters.push(...splitClusters);
        i--; // 重新檢查當前位置
      }
    }
    
    // 處理過小的群組
    const smallClusters = [];
    for (let i = processedClusters.length - 1; i >= 0; i--) {
      if (processedClusters[i].length < minGroupSize) {
        smallClusters.push(...processedClusters.splice(i, 1)[0]);
      }
    }
    
    if (smallClusters.length > 0) {
      const mergedClusters = this.mergeSmallClusters(smallClusters, maxGroupSize);
      processedClusters.push(...mergedClusters);
    }
    
    return processedClusters.filter(cluster => cluster.length > 0);
  }

  /**
   * 拆分大群組
   */
  splitLargeCluster(cluster, maxGroupSize) {
    console.log(`✂️ 拆分大群組：${cluster.length} → 多個小群組`);
    
    const subClusters = [];
    let remaining = [...cluster];
    
    while (remaining.length > 0) {
      const subCluster = remaining.splice(0, maxGroupSize);
      subClusters.push(subCluster);
    }
    
    return subClusters;
  }

  /**
   * 合併小群組
   */
  mergeSmallClusters(orders, maxGroupSize) {
    console.log(`🔗 合併小群組：${orders.length} 個訂單`);
    
    const mergedClusters = [];
    let remaining = [...orders];
    
    while (remaining.length > 0) {
      const cluster = remaining.splice(0, maxGroupSize);
      mergedClusters.push(cluster);
    }
    
    return mergedClusters;
  }

  /**
   * 計算聚類統計資訊
   */
  async calculateClusterStats(clusters) {
    const processedClusters = [];
    
    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      
      if (cluster.length === 0) continue;
      
      // 計算地理中心
      const centerLat = cluster.reduce((sum, order) => sum + order.lat, 0) / cluster.length;
      const centerLng = cluster.reduce((sum, order) => sum + order.lng, 0) / cluster.length;
      
      // 估算總配送距離
      const estimatedDistance = await this.estimateClusterDistance(cluster, { lat: centerLat, lng: centerLng });
      
      // 估算配送時間（分鐘）
      const estimatedDuration = Math.round(estimatedDistance * 3 + cluster.length * 8); // 每公里3分鐘 + 每單8分鐘
      
      // 生成群組名稱
      const groupName = this.generateGroupName(cluster, i);
      
      processedClusters.push({
        name: groupName,
        orders: cluster,
        centerLat,
        centerLng,
        estimatedDistance: Math.round(estimatedDistance * 100) / 100, // 保留兩位小數
        estimatedDuration,
        orderCount: cluster.length
      });
    }
    
    return processedClusters;
  }

  /**
   * 估算聚類配送距離
   */
  async estimateClusterDistance(cluster, center) {
    if (cluster.length <= 1) return 0;
    
    // 簡化計算：中心點到每個訂單的距離總和
    let totalDistance = 0;
    
    cluster.forEach(order => {
      totalDistance += this.calculateDistance(center, order);
    });
    
    // 加上訂單間的估算距離
    totalDistance += cluster.length * 0.5; // 每個訂單間平均0.5公里
    
    return totalDistance;
  }

  /**
   * 生成群組名稱
   */
  generateGroupName(cluster, index) {
    const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const letter = letters[index % letters.length];
    
    // 嘗試從地址中提取地區名稱
    const addresses = cluster.map(order => order.address || '');
    const commonArea = this.extractCommonArea(addresses);
    
    if (commonArea) {
      return `群組 ${letter} - ${commonArea}`;
    }
    
    return `群組 ${letter}`;
  }

  /**
   * 提取共同地區名稱
   */
  extractCommonArea(addresses) {
    if (addresses.length === 0) return null;
    
    // 提取台灣地址中的區域資訊
    const areaPattern = /([\u4e00-\u9fff]+[區市鎮鄉])/g;
    const areaCount = {};
    
    addresses.forEach(address => {
      const matches = address.match(areaPattern);
      if (matches) {
        matches.forEach(area => {
          areaCount[area] = (areaCount[area] || 0) + 1;
        });
      }
    });
    
    // 找到出現最多次的區域
    let maxCount = 0;
    let mostCommonArea = null;
    
    Object.entries(areaCount).forEach(([area, count]) => {
      if (count > maxCount && count >= addresses.length * 0.5) { // 至少50%的地址包含
        maxCount = count;
        mostCommonArea = area;
      }
    });
    
    return mostCommonArea;
  }

  /**
   * 計算兩點間距離（公里）
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
}

module.exports = GeographicClusteringService;