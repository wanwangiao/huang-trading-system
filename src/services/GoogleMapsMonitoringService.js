// =====================================
// Google Maps API 監控服務
// 提供使用量監控、成本預警和報告功能
// =====================================

const nodemailer = require('nodemailer');

class GoogleMapsMonitoringService {
  constructor(pool = null) {
    this.name = 'GoogleMapsMonitoringService';
    this.pool = pool;
    this.alertThresholds = {
      daily: 10.00,    // 每日 $10 USD
      monthly: 150.00  // 每月 $150 USD
    };
    
    // 設定郵件發送器（可選）
    this.emailTransporter = null;
    this.setupEmailNotifications();
    
    // 啟動定期任務
    this.startPeriodicTasks();
    
    console.log('📊 Google Maps 監控服務已啟動');
  }
  
  /**
   * 設定資料庫連線池
   */
  setDatabasePool(pool) {
    this.pool = pool;
    console.log('📊 GoogleMapsMonitoringService 已連接資料庫');
  }
  
  /**
   * 設定郵件通知功能
   */
  setupEmailNotifications() {
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
      this.emailTransporter = nodemailer.createTransporter({
        host: process.env.SMTP_HOST,
        port: process.env.SMTP_PORT || 587,
        secure: false,
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      });
      console.log('📧 郵件通知功能已啟用');
    } else {
      console.log('⚠️ 郵件通知功能未設定（缺少 SMTP 設定）');
    }
  }
  
  /**
   * 記錄 API 使用情況
   */
  async logApiUsage(clientIP, userAgent, operationType, requestData = null, responseTime = null) {
    try {
      if (!this.pool) {
        return;
      }
      
      await this.pool.query(`
        INSERT INTO google_maps_usage_log (
          client_ip, user_agent, operation_type, request_data, response_time_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, NOW())
      `, [
        clientIP, 
        userAgent, 
        operationType, 
        requestData ? JSON.stringify(requestData) : null,
        responseTime
      ]);
      
    } catch (error) {
      console.error('記錄 API 使用情況錯誤:', error);
    }
  }
  
  /**
   * 獲取即時使用統計
   */
  async getRealTimeStats() {
    try {
      if (!this.pool) {
        throw new Error('資料庫未連接');
      }
      
      // 今日統計
      const todayStats = await this.pool.query(`
        SELECT 
          operation_type,
          COUNT(*) as count,
          AVG(response_time_ms) as avg_response_time,
          SUM(api_cost) as total_cost
        FROM google_maps_usage_log 
        WHERE created_at >= CURRENT_DATE
        GROUP BY operation_type
        ORDER BY count DESC
      `);
      
      // 本月統計
      const monthStats = await this.pool.query(`
        SELECT 
          SUM(total_requests) as total_requests,
          SUM(cache_hits) as cache_hits,
          SUM(total_cost_usd) as total_cost,
          AVG(avg_response_time_ms) as avg_response_time
        FROM google_maps_performance_stats 
        WHERE date >= DATE_TRUNC('month', CURRENT_DATE)
      `);
      
      // 快取效能
      const cacheStats = await this.pool.query(`
        SELECT 
          COUNT(*) as total_entries,
          COUNT(*) FILTER (WHERE expires_at > NOW()) as active_entries,
          SUM(hit_count) as total_hits,
          AVG(hit_count) as avg_hits
        FROM geocoding_cache
      `);
      
      // 計算快取命中率
      const cacheHitRate = todayStats.rows.reduce((acc, row) => {
        if (row.operation_type === 'cache_hit') acc.hits += parseInt(row.count);
        if (row.operation_type === 'api_call_success') acc.calls += parseInt(row.count);
        return acc;
      }, { hits: 0, calls: 0 });
      
      const hitRate = cacheHitRate.calls > 0 ? 
        (cacheHitRate.hits / (cacheHitRate.hits + cacheHitRate.calls) * 100).toFixed(2) : 0;
      
      return {
        today: {
          operations: todayStats.rows,
          totalCost: todayStats.rows.reduce((sum, row) => sum + parseFloat(row.total_cost || 0), 0),
          cacheHitRate: `${hitRate}%`
        },
        month: monthStats.rows[0] || {},
        cache: cacheStats.rows[0] || {},
        timestamp: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('獲取即時統計錯誤:', error);
      throw error;
    }
  }
  
  /**
   * 獲取歷史使用趨勢
   */
  async getUsageTrends(days = 30) {
    try {
      if (!this.pool) {
        throw new Error('資料庫未連接');
      }
      
      const trends = await this.pool.query(`
        SELECT 
          date,
          api_type,
          total_requests,
          successful_requests,
          cache_hits,
          total_cost_usd
        FROM google_maps_performance_stats 
        WHERE date >= CURRENT_DATE - INTERVAL '${days} days'
        ORDER BY date DESC, api_type
      `);
      
      // 按日期分組
      const groupedData = trends.rows.reduce((acc, row) => {
        const date = row.date.toISOString().split('T')[0];
        if (!acc[date]) {
          acc[date] = {
            date,
            totalRequests: 0,
            totalCost: 0,
            cacheHits: 0,
            apis: []
          };
        }
        
        acc[date].totalRequests += parseInt(row.total_requests);
        acc[date].totalCost += parseFloat(row.total_cost_usd);
        acc[date].cacheHits += parseInt(row.cache_hits);
        acc[date].apis.push({
          type: row.api_type,
          requests: row.total_requests,
          successful: row.successful_requests,
          cacheHits: row.cache_hits,
          cost: row.total_cost_usd
        });
        
        return acc;
      }, {});
      
      return Object.values(groupedData);
      
    } catch (error) {
      console.error('獲取使用趨勢錯誤:', error);
      throw error;
    }
  }
  
  /**
   * 檢查成本預警
   */
  async checkCostAlerts() {
    try {
      if (!this.pool) {
        return [];
      }
      
      const alerts = await this.pool.query(`
        SELECT * FROM check_google_maps_cost_alerts()
      `);
      
      // 處理觸發的預警
      for (const alert of alerts.rows) {
        await this.triggerCostAlert(alert);
      }
      
      return alerts.rows;
      
    } catch (error) {
      console.error('檢查成本預警錯誤:', error);
      return [];
    }
  }
  
  /**
   * 觸發成本預警
   */
  async triggerCostAlert(alert) {
    try {
      console.warn(`💰 成本預警觸發: ${alert.alert_type} 限額 $${alert.threshold_usd}, 當前 $${alert.current_amount}`);
      
      // 更新預警觸發時間
      await this.pool.query(`
        UPDATE google_maps_cost_alerts 
        SET last_triggered = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [alert.alert_id]);
      
      // 發送郵件通知
      if (this.emailTransporter) {
        await this.sendCostAlertEmail(alert);
      }
      
      // 記錄日誌
      await this.pool.query(`
        INSERT INTO system_logs (operation, message, created_at)
        VALUES ('cost_alert', $1, NOW())
      `, [`Cost alert triggered: ${alert.alert_type} $${alert.current_amount}/$${alert.threshold_usd}`]);
      
    } catch (error) {
      console.error('觸發成本預警錯誤:', error);
    }
  }
  
  /**
   * 發送成本預警郵件
   */
  async sendCostAlertEmail(alert) {
    try {
      if (!this.emailTransporter) {
        return;
      }
      
      const subject = `🚨 Google Maps API 成本預警 - ${alert.alert_type}`;
      const html = `
        <h2>Google Maps API 成本預警</h2>
        <p><strong>預警類型:</strong> ${alert.alert_type}</p>
        <p><strong>設定閾值:</strong> $${alert.threshold_usd} USD</p>
        <p><strong>當前金額:</strong> $${alert.current_amount} USD</p>
        <p><strong>觸發時間:</strong> ${new Date().toLocaleString()}</p>
        
        <h3>建議措施:</h3>
        <ul>
          <li>檢查 API 使用量是否異常</li>
          <li>優化地理編碼快取使用</li>
          <li>考慮調整 API 呼叫頻率限制</li>
          <li>檢查是否有不當的批量請求</li>
        </ul>
        
        <p>請盡快登入系統檢查詳細的使用情況。</p>
      `;
      
      // 獲取通知郵件列表
      const emailList = await this.pool.query(`
        SELECT notification_emails FROM google_maps_cost_alerts WHERE id = $1
      `, [alert.alert_id]);
      
      if (emailList.rows[0]?.notification_emails) {
        await this.emailTransporter.sendMail({
          from: process.env.SMTP_FROM || process.env.SMTP_USER,
          to: emailList.rows[0].notification_emails.join(','),
          subject,
          html
        });
        
        console.log('📧 成本預警郵件已發送');
      }
      
    } catch (error) {
      console.error('發送成本預警郵件錯誤:', error);
    }
  }
  
  /**
   * 生成使用報告
   */
  async generateUsageReport(startDate, endDate) {
    try {
      if (!this.pool) {
        throw new Error('資料庫未連接');
      }
      
      // 使用統計
      const usageStats = await this.pool.query(`
        SELECT 
          api_type,
          SUM(total_requests) as total_requests,
          SUM(successful_requests) as successful_requests,
          SUM(failed_requests) as failed_requests,
          SUM(cache_hits) as cache_hits,
          AVG(avg_response_time_ms) as avg_response_time,
          SUM(total_cost_usd) as total_cost
        FROM google_maps_performance_stats 
        WHERE date BETWEEN $1 AND $2
        GROUP BY api_type
        ORDER BY total_requests DESC
      `, [startDate, endDate]);
      
      // 成本分析
      const costAnalysis = await this.pool.query(`
        SELECT * FROM google_maps_cost_analysis
        WHERE month >= DATE_TRUNC('month', $1::date)
        AND month <= DATE_TRUNC('month', $2::date)
        ORDER BY month DESC, api_type
      `, [startDate, endDate]);
      
      // 快取效能
      const cachePerformance = await this.pool.query(`
        SELECT 
          COUNT(*) as total_addresses,
          SUM(hit_count) as total_cache_hits,
          AVG(hit_count) as avg_hits_per_address,
          SUM(saved_cost_usd) as total_saved_cost
        FROM geocoding_cache_performance
      `);
      
      // 錯誤分析
      const errorAnalysis = await this.pool.query(`
        SELECT 
          operation_type,
          response_status,
          COUNT(*) as count
        FROM google_maps_usage_log
        WHERE created_at BETWEEN $1 AND $2
        AND response_status != 'OK'
        GROUP BY operation_type, response_status
        ORDER BY count DESC
      `, [startDate, endDate]);
      
      return {
        period: { startDate, endDate },
        usage: usageStats.rows,
        cost: costAnalysis.rows,
        cache: cachePerformance.rows[0] || {},
        errors: errorAnalysis.rows,
        summary: {
          totalRequests: usageStats.rows.reduce((sum, row) => sum + parseInt(row.total_requests), 0),
          totalCost: usageStats.rows.reduce((sum, row) => sum + parseFloat(row.total_cost), 0),
          cacheHitRate: this.calculateOverallCacheHitRate(usageStats.rows)
        },
        generatedAt: new Date().toISOString()
      };
      
    } catch (error) {
      console.error('生成使用報告錯誤:', error);
      throw error;
    }
  }
  
  /**
   * 計算整體快取命中率
   */
  calculateOverallCacheHitRate(usageStats) {
    const totalRequests = usageStats.reduce((sum, row) => sum + parseInt(row.total_requests), 0);
    const totalCacheHits = usageStats.reduce((sum, row) => sum + parseInt(row.cache_hits), 0);
    
    if (totalRequests === 0) return 0;
    return ((totalCacheHits / totalRequests) * 100).toFixed(2);
  }
  
  /**
   * 執行資料清理
   */
  async performDataCleanup() {
    try {
      if (!this.pool) {
        return 0;
      }
      
      const result = await this.pool.query('SELECT cleanup_google_maps_old_data()');
      const deletedCount = result.rows[0]?.cleanup_google_maps_old_data || 0;
      
      console.log(`🧹 清理了 ${deletedCount} 筆過期數據`);
      return deletedCount;
      
    } catch (error) {
      console.error('執行資料清理錯誤:', error);
      return 0;
    }
  }
  
  /**
   * 更新每日統計
   */
  async updateDailyStats() {
    try {
      if (!this.pool) {
        return;
      }
      
      await this.pool.query('SELECT update_google_maps_daily_stats()');
      console.log('📊 每日統計已更新');
      
    } catch (error) {
      console.error('更新每日統計錯誤:', error);
    }
  }
  
  /**
   * 啟動定期任務
   */
  startPeriodicTasks() {
    // 每小時檢查成本預警
    setInterval(async () => {
      try {
        await this.checkCostAlerts();
      } catch (error) {
        console.error('定期成本預警檢查錯誤:', error);
      }
    }, 60 * 60 * 1000); // 1小時
    
    // 每天凌晨 2 點更新統計和清理數據
    setInterval(async () => {
      const now = new Date();
      if (now.getHours() === 2 && now.getMinutes() === 0) {
        try {
          await this.updateDailyStats();
          await this.performDataCleanup();
        } catch (error) {
          console.error('定期任務執行錯誤:', error);
        }
      }
    }, 60 * 1000); // 每分鐘檢查一次時間
    
    console.log('⏰ 定期監控任務已啟動');
  }
  
  /**
   * 獲取快取統計
   */
  async getCacheStats() {
    try {
      if (!this.pool) {
        throw new Error('資料庫未連接');
      }
      
      const stats = await this.pool.query(`
        SELECT * FROM geocoding_cache_stats
      `);
      
      const topAddresses = await this.pool.query(`
        SELECT 
          address,
          hit_count,
          saved_cost_usd,
          created_at,
          last_used_at
        FROM geocoding_cache_performance
        WHERE cache_status = '有效'
        ORDER BY hit_count DESC
        LIMIT 20
      `);
      
      return {
        overview: stats.rows[0] || {},
        topAddresses: topAddresses.rows,
        recommendations: this.generateCacheRecommendations(stats.rows[0])
      };
      
    } catch (error) {
      console.error('獲取快取統計錯誤:', error);
      throw error;
    }
  }
  
  /**
   * 生成快取優化建議
   */
  generateCacheRecommendations(stats) {
    const recommendations = [];
    
    if (!stats) {
      recommendations.push('無法獲取快取統計數據');
      return recommendations;
    }
    
    const hitRate = stats.total_entries > 0 ? 
      (stats.active_entries / stats.total_entries * 100).toFixed(2) : 0;
    
    if (hitRate < 80) {
      recommendations.push('快取有效率較低，建議增加快取過期時間');
    }
    
    if (stats.expired_entries > stats.active_entries) {
      recommendations.push('過期快取項目過多，建議執行清理作業');
    }
    
    if (stats.avg_hits_per_entry < 2) {
      recommendations.push('快取使用效率不高，建議檢查地址標準化流程');
    }
    
    if (recommendations.length === 0) {
      recommendations.push('快取系統運行良好，無需特別優化');
    }
    
    return recommendations;
  }
}

module.exports = GoogleMapsMonitoringService;