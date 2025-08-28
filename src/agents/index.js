/**
 * Agent 系統入口點
 * 負責初始化和管理所有 Sub-Agents
 */

const AgentManager = require('./AgentManager');
const OrderAgent = require('./OrderAgent');
const InventoryAgent = require('./InventoryAgent');

class AgentSystem {
  constructor(databasePool = null) {
    this.pool = databasePool;
    this.agentManager = new AgentManager();
    this.agents = {};
    this.isInitialized = false;
  }

  /**
   * 初始化 Agent 系統
   */
  async initialize() {
    if (this.isInitialized) {
      console.log('⚠️ Agent 系統已經初始化');
      return;
    }

    try {
      console.log('🚀 正在初始化 Agent 系統...');

      // 創建並註冊所有 Sub-Agents
      await this.createAgents();
      
      // 啟動所有 Agent
      await this.agentManager.startAllAgents();
      
      // 設置 Agent 間的通訊規則
      this.setupCommunicationRules();
      
      this.isInitialized = true;
      console.log('✅ Agent 系統初始化完成');
      
      // 顯示系統狀態
      this.logSystemStatus();

    } catch (error) {
      console.error('❌ Agent 系統初始化失敗:', error);
      throw error;
    }
  }

  /**
   * 創建並註冊所有 Sub-Agents
   */
  async createAgents() {
    try {
      // 1. OrderAgent - 訂單處理
      console.log('📋 創建 OrderAgent...');
      this.agents.orderAgent = new OrderAgent(this.agentManager, this.pool);
      this.agentManager.registerAgent(this.agents.orderAgent);

      // 2. InventoryAgent - 庫存管理
      console.log('📦 創建 InventoryAgent...');
      this.agents.inventoryAgent = new InventoryAgent(this.agentManager, this.pool);
      this.agentManager.registerAgent(this.agents.inventoryAgent);

      // 3. 未來可以加入更多 Agent
      // this.agents.deliveryAgent = new DeliveryAgent(this.agentManager, this.pool);
      // this.agents.notificationAgent = new NotificationAgent(this.agentManager);
      // this.agents.analyticsAgent = new AnalyticsAgent(this.agentManager, this.pool);

      console.log(`✅ 已創建 ${Object.keys(this.agents).length} 個 Sub-Agent`);

    } catch (error) {
      console.error('❌ 創建 Agent 失敗:', error);
      throw error;
    }
  }

  /**
   * 設置 Agent 間的通訊規則
   */
  setupCommunicationRules() {
    console.log('🔗 設置 Agent 通訊規則...');

    // OrderAgent 事件處理
    if (this.agents.orderAgent) {
      this.agents.orderAgent.on('order_created', async (data) => {
        console.log('📋 訂單建立事件觸發:', data.orderId);
      });

      this.agents.orderAgent.on('order_cancelled', async (data) => {
        console.log('❌ 訂單取消事件觸發:', data.orderId);
      });
    }

    // InventoryAgent 事件處理
    if (this.agents.inventoryAgent) {
      this.agents.inventoryAgent.on('low_stock_detected', async (data) => {
        console.log('⚠️ 低庫存警報:', data.productId);
      });
    }

    console.log('✅ 通訊規則設置完成');
  }

  /**
   * 關閉 Agent 系統
   */
  async shutdown() {
    if (!this.isInitialized) {
      console.log('⚠️ Agent 系統未初始化');
      return;
    }

    try {
      console.log('🛑 正在關閉 Agent 系統...');
      
      await this.agentManager.stopAllAgents();
      
      this.isInitialized = false;
      console.log('✅ Agent 系統已關閉');

    } catch (error) {
      console.error('❌ 關閉 Agent 系統失敗:', error);
      throw error;
    }
  }

  /**
   * 獲取特定 Agent
   */
  getAgent(agentName) {
    return this.agentManager.getAgent(agentName) || this.agents[agentName];
  }

  /**
   * 執行任務
   */
  async executeTask(agentName, taskType, taskData) {
    const agent = this.getAgent(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} 不存在`);
    }

    return await agent.executeTask({
      type: taskType,
      data: taskData,
      timestamp: new Date()
    });
  }

  /**
   * 廣播訊息給所有 Agent
   */
  async broadcast(message, fromAgent = 'System') {
    return await this.agentManager.broadcastMessage(fromAgent, message);
  }

  /**
   * 獲取系統狀態
   */
  getSystemStatus() {
    if (!this.isInitialized) {
      return { status: 'not_initialized' };
    }

    return {
      status: 'running',
      initialized: this.isInitialized,
      agentCount: Object.keys(this.agents).length,
      agents: this.agentManager.getAllAgentStatus(),
      systemStats: this.agentManager.getSystemStats()
    };
  }

  /**
   * 記錄系統狀態
   */
  logSystemStatus() {
    const status = this.getSystemStatus();
    console.log('\n🎛️ ===== Agent 系統狀態 =====');
    console.log(`狀態: ${status.status}`);
    console.log(`Agent 數量: ${status.agentCount}`);
    
    if (status.agents) {
      Object.entries(status.agents).forEach(([name, agentStatus]) => {
        console.log(`  ${agentStatus.isActive ? '✅' : '❌'} ${name}: ${agentStatus.taskCount} 個任務`);
      });
    }
    
    if (status.systemStats) {
      console.log(`活躍 Agent: ${status.systemStats.activeAgents}/${status.systemStats.totalAgents}`);
      console.log(`完成任務: ${status.systemStats.completedTasks}`);
      console.log(`失敗任務: ${status.systemStats.failedTasks}`);
    }
    
    console.log('=============================\n');
  }

  /**
   * 重啟特定 Agent
   */
  async restartAgent(agentName) {
    const agent = this.getAgent(agentName);
    if (!agent) {
      throw new Error(`Agent ${agentName} 不存在`);
    }

    console.log(`🔄 重啟 ${agentName}...`);
    
    await agent.stop();
    await new Promise(resolve => setTimeout(resolve, 1000)); // 等待1秒
    await agent.start();
    
    console.log(`✅ ${agentName} 重啟完成`);
  }

  /**
   * 重啟所有 Agent
   */
  async restartAllAgents() {
    console.log('🔄 重啟所有 Agent...');
    
    await this.agentManager.stopAllAgents();
    await new Promise(resolve => setTimeout(resolve, 2000)); // 等待2秒
    await this.agentManager.startAllAgents();
    
    console.log('✅ 所有 Agent 重啟完成');
  }

  /**
   * 健康檢查
   */
  async healthCheck() {
    const status = this.getSystemStatus();
    const healthReport = {
      systemHealthy: true,
      timestamp: new Date(),
      issues: [],
      agents: {}
    };

    if (!this.isInitialized) {
      healthReport.systemHealthy = false;
      healthReport.issues.push('系統未初始化');
      return healthReport;
    }

    // 檢查每個 Agent 的健康狀態
    for (const [name, agent] of Object.entries(this.agents)) {
      const agentStatus = agent.getStatus();
      
      healthReport.agents[name] = {
        healthy: agentStatus.isActive && agentStatus.errorCount < agent.maxErrors,
        isActive: agentStatus.isActive,
        errorCount: agentStatus.errorCount,
        lastActivity: agentStatus.lastActivity
      };

      if (!healthReport.agents[name].healthy) {
        healthReport.systemHealthy = false;
        healthReport.issues.push(`${name} 狀態異常`);
      }
    }

    return healthReport;
  }
}

// 工廠函數：創建 Agent 系統實例
function createAgentSystem(databasePool) {
  return new AgentSystem(databasePool);
}

module.exports = {
  AgentSystem,
  createAgentSystem,
  AgentManager,
  OrderAgent,
  InventoryAgent
};