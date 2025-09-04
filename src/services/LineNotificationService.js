/**
 * LINE通知服務
 * 負責發送訂單狀態更新通知和付款連結
 */

class LineNotificationService {
  constructor() {
    // LINE Bot設定（需要在環境變數中配置）
    this.channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    this.channelSecret = process.env.LINE_CHANNEL_SECRET;
    this.enabled = !!(this.channelAccessToken && this.channelSecret);
    
    // 付款連結配置
    this.paymentLinks = {
      cash: null, // 現金付款無需連結
      linepay: process.env.LINE_PAY_LINK || 'https://pay.line.me/payments/request/link/your-payment-link',
      bank_transfer: process.env.BANK_TRANSFER_INFO || '匯款帳號：123-456-789 (XX銀行) 戶名：誠憶鮮蔬'
    };
    
    console.log('🔔 LINE通知服務初始化:', this.enabled ? '已啟用' : '未啟用（缺少設定）');
  }

  /**
   * 發送包裝完成通知
   * @param {Object} order - 訂單資訊
   * @param {string} order.id - 訂單ID
   * @param {string} order.contact_name - 客戶姓名
   * @param {string} order.contact_phone - 客戶電話
   * @param {string} order.payment_method - 付款方式
   * @param {number} order.total_amount - 訂單金額
   * @param {Array} order.items - 訂單商品清單
   * @param {string} customMessage - 自訂通知訊息 (可選)
   */
  async sendPackagingCompleteNotification(order, customMessage = null) {
    try {
      console.log(`📦 準備發送包裝完成通知 - 訂單 #${order.id}`);
      
      if (!this.enabled) {
        console.log('⚠️ LINE通知服務未啟用，將使用模擬通知');
        return this.simulateNotification(order);
      }
      
      // 取得自訂通知訊息
      const customMsg = await this.getCustomNotificationMessage('packaging_complete', order);
      const finalMessage = customMessage || customMsg;
      
      // 構建通知訊息
      const message = this.buildPackagingCompleteMessage(order, finalMessage);
      
      // 發送LINE訊息（需要客戶的LINE User ID）
      // 注意：需要客戶先加入LINE Bot好友並提供User ID
      const lineUserId = await this.getCustomerLineUserId(order.contact_phone);
      
      if (lineUserId) {
        await this.sendLineMessage(lineUserId, message);
        console.log(`✅ LINE通知已發送 - 訂單 #${order.id}`);
      } else {
        console.log(`📱 改用簡訊通知 - 訂單 #${order.id}`);
        await this.sendSMSNotification(order, message.text);
      }
      
      return { success: true, method: lineUserId ? 'LINE' : 'SMS' };
      
    } catch (error) {
      console.error('❌ 發送通知失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 發送配送中通知
   * @param {Object} order - 訂單資訊
   * @param {string} customMessage - 自訂通知訊息 (可選)
   */
  async sendDeliveringNotification(order, customMessage = null) {
    try {
      console.log(`🚚 準備發送配送中通知 - 訂單 #${order.id}`);
      
      if (!this.enabled) {
        console.log('⚠️ LINE通知服務未啟用，將使用模擬通知');
        return this.simulateDeliveringNotification(order);
      }
      
      // 取得自訂通知訊息
      const customMsg = await this.getCustomNotificationMessage('delivering', order);
      const finalMessage = customMessage || customMsg;
      
      // 構建通知訊息
      const message = this.buildDeliveringMessage(order, finalMessage);
      
      // 發送LINE訊息（需要客戶的LINE User ID）
      const lineUserId = await this.getCustomerLineUserId(order.contact_phone);
      
      if (lineUserId) {
        await this.sendLineMessage(lineUserId, message);
        console.log(`✅ LINE配送中通知已發送 - 訂單 #${order.id}`);
      } else {
        console.log(`📱 改用簡訊配送中通知 - 訂單 #${order.id}`);
        await this.sendSMSNotification(order, message.text);
      }
      
      return { success: true, method: lineUserId ? 'LINE' : 'SMS' };
      
    } catch (error) {
      console.error('❌ 發送配送中通知失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 發送已送達通知
   * @param {Object} order - 訂單資訊
   * @param {string} customMessage - 自訂通知訊息 (可選)
   */
  async sendDeliveredNotification(order, customMessage = null) {
    try {
      console.log(`🎉 準備發送已送達通知 - 訂單 #${order.id}`);
      
      if (!this.enabled) {
        console.log('⚠️ LINE通知服務未啟用，將使用模擬通知');
        return this.simulateDeliveredNotification(order);
      }
      
      // 取得自訂通知訊息
      const customMsg = await this.getCustomNotificationMessage('delivered', order);
      const finalMessage = customMessage || customMsg;
      
      // 構建通知訊息
      const message = this.buildDeliveredMessage(order, finalMessage);
      
      // 發送LINE訊息（需要客戶的LINE User ID）
      const lineUserId = await this.getCustomerLineUserId(order.contact_phone);
      
      if (lineUserId) {
        await this.sendLineMessage(lineUserId, message);
        console.log(`✅ LINE已送達通知已發送 - 訂單 #${order.id}`);
      } else {
        console.log(`📱 改用簡訊已送達通知 - 訂單 #${order.id}`);
        await this.sendSMSNotification(order, message.text);
      }
      
      return { success: true, method: lineUserId ? 'LINE' : 'SMS' };
      
    } catch (error) {
      console.error('❌ 發送已送達通知失敗:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * 構建包裝完成訊息
   * @param {Object} order - 訂單資訊
   * @param {string} customMessage - 自訂通知訊息 (可選)
   */
  buildPackagingCompleteMessage(order, customMessage = null) {
    const paymentInfo = this.getPaymentInfo(order.payment_method, order.total_amount);
    
    let messageText = customMessage || `🎉 ${order.contact_name} 您好！\n\n`;
    if (!customMessage) {
      messageText += `📦 您的訂單已完成包裝，即將出貨！\n`;
      messageText += `🔢 訂單編號：#${order.id}\n`;
      messageText += `💰 訂單金額：$${order.total_amount}\n\n`;
    }
    
    // 商品清單
    if (order.items && order.items.length > 0) {
      messageText += `🛍️ 訂購商品：\n`;
      order.items.forEach(item => {
        messageText += `• ${item.name} x${item.quantity}\n`;
      });
      messageText += `\n`;
    }
    
    // 付款資訊
    messageText += paymentInfo.message;
    messageText += `\n⏰ 預計30分鐘內送達\n`;
    messageText += `📞 如有問題請來電：0912-345-678\n\n`;
    messageText += `🙏 謝謝您選擇誠憶鮮蔬！`;

    // LINE Rich Menu格式
    const flexMessage = {
      type: 'flex',
      altText: `訂單 #${order.id} 已完成包裝`,
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: 'https://example.com/packaging-complete.jpg',
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '✅ 包裝完成通知',
              weight: 'bold',
              size: 'xl',
              color: '#27ae60'
            },
            {
              type: 'text',
              text: `訂單 #${order.id}`,
              size: 'md',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'text',
              text: `金額：$${order.total_amount}`,
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            }
          ]
        },
        footer: paymentInfo.actions ? {
          type: 'box',
          layout: 'vertical',
          contents: paymentInfo.actions
        } : undefined
      }
    };

    return {
      text: messageText,
      flex: flexMessage
    };
  }

  /**
   * 根據付款方式獲取付款資訊和動作按鈕
   */
  getPaymentInfo(paymentMethod, amount) {
    switch (paymentMethod) {
      case 'cash':
        return {
          message: '💰 付款方式：現金付款\n✅ 送達時請準備現金',
          actions: null
        };
        
      case 'linepay':
        return {
          message: '📱 付款方式：LINE Pay\n👆 請點擊下方按鈕完成付款',
          actions: [
            {
              type: 'button',
              action: {
                type: 'uri',
                label: '💳 立即付款',
                uri: this.paymentLinks.linepay
              },
              style: 'primary',
              color: '#00C851'
            }
          ]
        };
        
      case 'bank_transfer':
        return {
          message: `🏦 付款方式：銀行轉帳\n💰 請轉帳 $${amount} 至以下帳戶：\n${this.paymentLinks.bank_transfer}`,
          actions: [
            {
              type: 'button',
              action: {
                type: 'message',
                label: '✅ 已完成轉帳',
                text: `已完成轉帳 訂單#${amount}`
              },
              style: 'secondary'
            }
          ]
        };
        
      default:
        return {
          message: '💳 請依照訂單確認時選擇的付款方式付款',
          actions: null
        };
    }
  }

  /**
   * 根據手機號碼查詢客戶LINE User ID
   * @param {string} phone - 客戶電話號碼
   */
  async getCustomerLineUserId(phone) {
    try {
      // 使用 LineUserService 查詢 LINE User ID
      const LineUserService = require('./LineUserService');
      const lineUserService = new LineUserService();
      
      const userId = await lineUserService.getLineUserIdByPhone(phone);
      return userId;
      
    } catch (error) {
      console.error('查詢LINE User ID失敗:', error);
      return null;
    }
  }

  /**
   * 獲取自訂通知訊息模板
   * @param {string} type - 通知類型 (packaging_complete, delivering, delivered)
   * @param {Object} order - 訂單資料
   */
  async getCustomNotificationMessage(type, order) {
    try {
      // 從設定中讀取自訂訊息模板
      const settingsKey = `notification_${type}`;
      
      // 這裡可以從資料庫或環境變數讀取設定
      // 暫時返回預設模板，實際部署時可以連接設定 API
      const templates = {
        notification_packaging_complete: '🎉 您好！\n\n📦 您的訂單已完成包裝，即將出貨！\n🔢 訂單編號：#{orderId}\n💰 訂單金額：${totalAmount}\n\n⏰ 預計30分鐘內送達\n📞 如有問題請來電：0912-345-678\n\n🙏 謝謝您選擇誠憶鮮蔬！',
        notification_delivering: '🚚 您好！\n\n🛵 您的訂單正在配送中！\n🔢 訂單編號：#{orderId}\n📍 預計很快送達您的地址\n\n📞 如有問題請來電：0912-345-678\n\n🙏 謝謝您選擇誠憶鮮蔬！',
        notification_delivered: '🎉 您好！\n\n✅ 您的訂單已成功送達！\n🔢 訂單編號：#{orderId}\n💰 訂單金額：${totalAmount}\n\n🌟 感謝您選擇誠憶鮮蔬！\n❤️ 期待您的下次訂購\n\n📞 如有任何問題請來電：0912-345-678'
      };

      let template = templates[settingsKey] || '';
      
      // 替換變數
      template = template.replace(/\{orderId\}/g, order.id);
      template = template.replace(/\{totalAmount\}/g, order.total_amount || order.total);
      template = template.replace(/#\{orderId\}/g, order.id);
      template = template.replace(/\$\{totalAmount\}/g, order.total_amount || order.total);
      
      return template;

    } catch (error) {
      console.error('獲取自訂通知訊息失敗:', error);
      return null;
    }
  }

  /**
   * 發送LINE訊息
   */
  async sendLineMessage(userId, message) {
    if (!this.enabled) {
      throw new Error('LINE Bot未設定');
    }

    const url = 'https://api.line.me/v2/bot/message/push';
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.channelAccessToken}`
    };

    const body = {
      to: userId,
      messages: [
        {
          type: 'text',
          text: message.text
        }
      ]
    };

    // 如果有Flex Message，優先使用
    if (message.flex) {
      body.messages = [message.flex];
    }

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body)
    });

    if (!response.ok) {
      throw new Error(`LINE API錯誤: ${response.status}`);
    }

    return await response.json();
  }

  /**
   * 發送簡訊通知（備用方案）
   */
  async sendSMSNotification(order, message) {
    console.log(`📱 模擬簡訊發送到 ${order.contact_phone}:`);
    console.log(message);
    
    // 實際實作時可以接入簡訊服務商API
    // 例如：亞太電信、中華電信簡訊API
    
    return { success: true, method: 'SMS' };
  }

  /**
   * 模擬通知（開發環境使用）
   */
  simulateNotification(order) {
    console.log('🔔 ===== 模擬LINE通知 =====');
    console.log(`收件人: ${order.contact_name} (${order.contact_phone})`);
    console.log(`訂單編號: #${order.id}`);
    console.log(`訂單金額: $${order.total_amount}`);
    console.log(`付款方式: ${this.getPaymentMethodName(order.payment_method)}`);
    
    const paymentInfo = this.getPaymentInfo(order.payment_method, order.total_amount);
    console.log(`通知內容: ${paymentInfo.message}`);
    console.log('============================');
    
    return { success: true, method: 'SIMULATION' };
  }

  /**
   * 獲取付款方式中文名稱
   */
  getPaymentMethodName(method) {
    const names = {
      cash: '現金付款',
      linepay: 'LINE Pay',
      bank_transfer: '銀行轉帳'
    };
    return names[method] || method;
  }

  /**
   * 構建配送中訊息
   * @param {Object} order - 訂單資訊
   * @param {string} customMessage - 自訂通知訊息 (可選)
   */
  buildDeliveringMessage(order, customMessage = null) {
    let messageText = customMessage || `🚚 ${order.contact_name} 您好！\n\n`;
    if (!customMessage) {
      messageText += `🛵 您的訂單正在配送中！\n`;
      messageText += `🔢 訂單編號：#${order.id}\n`;
      messageText += `📍 預計很快送達您的地址\n\n`;
      messageText += `📞 如有問題請來電：0912-345-678\n\n`;
      messageText += `🙏 謝謝您選擇誠憶鮮蔬！`;
    }

    // LINE Rich Menu格式
    const flexMessage = {
      type: 'flex',
      altText: `訂單 #${order.id} 配送中`,
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: 'https://example.com/delivering.jpg',
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🚚 配送中通知',
              weight: 'bold',
              size: 'xl',
              color: '#f39c12'
            },
            {
              type: 'text',
              text: `訂單 #${order.id}`,
              size: 'md',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'text',
              text: '外送員正在路上',
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            }
          ]
        }
      }
    };

    return {
      text: messageText,
      flex: flexMessage
    };
  }

  /**
   * 構建已送達訊息
   * @param {Object} order - 訂單資訊
   * @param {string} customMessage - 自訂通知訊息 (可選)
   */
  buildDeliveredMessage(order, customMessage = null) {
    let messageText = customMessage || `🎉 ${order.contact_name} 您好！\n\n`;
    if (!customMessage) {
      messageText += `✅ 您的訂單已成功送達！\n`;
      messageText += `🔢 訂單編號：#${order.id}\n`;
      messageText += `💰 訂單金額：$${order.total_amount}\n\n`;
      messageText += `🌟 感謝您選擇誠憶鮮蔬！\n`;
      messageText += `❤️ 期待您的下次訂購\n\n`;
      messageText += `📞 如有任何問題請來電：0912-345-678`;
    }

    // LINE Rich Menu格式
    const flexMessage = {
      type: 'flex',
      altText: `訂單 #${order.id} 已送達`,
      contents: {
        type: 'bubble',
        hero: {
          type: 'image',
          url: 'https://example.com/delivered.jpg',
          size: 'full',
          aspectRatio: '20:13',
          aspectMode: 'cover'
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'text',
              text: '🎉 已送達通知',
              weight: 'bold',
              size: 'xl',
              color: '#27ae60'
            },
            {
              type: 'text',
              text: `訂單 #${order.id}`,
              size: 'md',
              color: '#666666',
              margin: 'sm'
            },
            {
              type: 'text',
              text: '感謝您的訂購！',
              size: 'lg',
              weight: 'bold',
              margin: 'md'
            }
          ]
        }
      }
    };

    return {
      text: messageText,
      flex: flexMessage
    };
  }

  /**
   * 模擬配送中通知（開發環境使用）
   */
  simulateDeliveringNotification(order) {
    console.log('🔔 ===== 模擬LINE配送中通知 =====');
    console.log(`收件人: ${order.contact_name} (${order.contact_phone})`);
    console.log(`訂單編號: #${order.id}`);
    console.log(`通知內容: 您的訂單正在配送中，請耐心等候`);
    console.log('============================');
    
    return { success: true, method: 'SIMULATION' };
  }

  /**
   * 模擬已送達通知（開發環境使用）
   */
  simulateDeliveredNotification(order) {
    console.log('🔔 ===== 模擬LINE已送達通知 =====');
    console.log(`收件人: ${order.contact_name} (${order.contact_phone})`);
    console.log(`訂單編號: #${order.id}`);
    console.log(`訂單金額: $${order.total_amount}`);
    console.log(`通知內容: 您的訂單已成功送達，感謝您的訂購！`);
    console.log('============================');
    
    return { success: true, method: 'SIMULATION' };
  }
}

module.exports = LineNotificationService;