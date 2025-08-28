/**
 * 基礎代理程式類別
 * 所有 Sub-Agent 都繼承此類別
 */
class BaseAgent {
  constructor(name, agentManager = null) {
    this.name = name;
    this.agentManager = agentManager;
    this.isActive = false;
    this.tasks = [];
    this.lastActivity = null;
    this.errorCount = 0;
    this.maxErrors = 5;
    
    // 事件監聽器
    this.eventListeners = new Map();
    
    console.log(`🤖 ${this.name} Agent 已初始化`);
  }

  /**
   * 啟動代理程式
   */
  async start() {
    try {
      this.isActive = true;
      this.lastActivity = new Date();
      await this.initialize();
      console.log(`✅ ${this.name} Agent 已啟動`);
      
      // 通知 AgentManager
      if (this.agentManager) {
        this.agentManager.notifyAgentStatus(this.name, 'started');
      }
    } catch (error) {
      console.error(`❌ ${this.name} Agent 啟動失敗:`, error);
      this.handleError(error);
    }
  }

  /**
   * 停止代理程式
   */
  async stop() {
    try {
      this.isActive = false;
      await this.cleanup();
      console.log(`🛑 ${this.name} Agent 已停止`);
      
      // 通知 AgentManager
      if (this.agentManager) {
        this.agentManager.notifyAgentStatus(this.name, 'stopped');
      }
    } catch (error) {
      console.error(`❌ ${this.name} Agent 停止時發生錯誤:`, error);
      this.handleError(error);
    }
  }

  /**
   * 子類別需要實作的初始化方法
   */
  async initialize() {
    // 子類別覆寫此方法
  }

  /**
   * 子類別需要實作的清理方法
   */
  async cleanup() {
    // 子類別覆寫此方法
  }

  /**
   * 執行任務
   */
  async executeTask(task) {
    if (!this.isActive) {
      throw new Error(`${this.name} Agent 未啟動`);
    }

    try {
      this.lastActivity = new Date();
      console.log(`🔄 ${this.name} 正在執行任務: ${task.type}`);
      
      const result = await this.processTask(task);
      this.tasks.push({
        ...task,
        completedAt: new Date(),
        result: result,
        status: 'completed'
      });

      console.log(`✅ ${this.name} 任務完成: ${task.type}`);
      return result;

    } catch (error) {
      console.error(`❌ ${this.name} 任務執行失敗:`, error);
      this.tasks.push({
        ...task,
        completedAt: new Date(),
        error: error.message,
        status: 'failed'
      });
      
      this.handleError(error);
      throw error;
    }
  }

  /**
   * 子類別需要實作的任務處理方法
   */
  async processTask(task) {
    throw new Error(`${this.name} Agent 必須實作 processTask 方法`);
  }

  /**
   * 發送訊息給其他 Agent
   */
  async sendMessage(targetAgent, message) {
    if (this.agentManager) {
      return await this.agentManager.routeMessage(this.name, targetAgent, message);
    } else {
      console.warn(`⚠️ ${this.name} 無法發送訊息 - 未連接 AgentManager`);
    }
  }

  /**
   * 接收來自其他 Agent 的訊息
   */
  async receiveMessage(fromAgent, message) {
    console.log(`📨 ${this.name} 收到來自 ${fromAgent} 的訊息:`, message);
    
    // 觸發訊息事件
    this.emit('message', { fromAgent, message });
    
    // 子類別可以覆寫此方法來處理特定訊息
    return await this.handleMessage(fromAgent, message);
  }

  /**
   * 處理接收到的訊息（子類別可覆寫）
   */
  async handleMessage(fromAgent, message) {
    // 預設行為：記錄訊息
    console.log(`📝 ${this.name} 處理來自 ${fromAgent} 的訊息: ${message.type}`);
    return { status: 'received', timestamp: new Date() };
  }

  /**
   * 事件監聽
   */
  on(event, callback) {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, []);
    }
    this.eventListeners.get(event).push(callback);
  }

  /**
   * 觸發事件
   */
  emit(event, data) {
    if (this.eventListeners.has(event)) {
      this.eventListeners.get(event).forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`❌ ${this.name} 事件回調錯誤:`, error);
        }
      });
    }
  }

  /**
   * 錯誤處理
   */
  handleError(error) {
    this.errorCount++;
    console.error(`❌ ${this.name} 錯誤 (${this.errorCount}/${this.maxErrors}):`, error);
    
    if (this.errorCount >= this.maxErrors) {
      console.error(`🚨 ${this.name} 錯誤次數過多，自動停止`);
      this.stop();
    }
    
    // 通知 AgentManager
    if (this.agentManager) {
      this.agentManager.notifyAgentError(this.name, error);
    }
  }

  /**
   * 重置錯誤計數
   */
  resetErrorCount() {
    this.errorCount = 0;
  }

  /**
   * 獲取代理程式狀態
   */
  getStatus() {
    return {
      name: this.name,
      isActive: this.isActive,
      lastActivity: this.lastActivity,
      taskCount: this.tasks.length,
      errorCount: this.errorCount,
      completedTasks: this.tasks.filter(t => t.status === 'completed').length,
      failedTasks: this.tasks.filter(t => t.status === 'failed').length
    };
  }

  /**
   * 獲取最近的任務歷史
   */
  getRecentTasks(limit = 10) {
    return this.tasks
      .slice(-limit)
      .reverse();
  }
}

module.exports = BaseAgent;