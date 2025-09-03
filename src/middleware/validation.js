// 輸入驗證中間件
const validator = require('validator');

// 驗證訂單數據
const validateOrderData = (req, res, next) => {
  const { name, phone, address, items } = req.body;
  const errors = [];

  // 驗證姓名
  if (!name || name.trim().length < 2) {
    errors.push('姓名至少需要2個字元');
  }

  // 驗證手機號碼
  if (!phone || !/^09\d{8}$/.test(phone)) {
    errors.push('請輸入有效的手機號碼（09xxxxxxxx）');
  }

  // 驗證地址
  if (!address || address.trim().length < 5) {
    errors.push('地址至少需要5個字元');
  }

  // 驗證商品項目
  if (!Array.isArray(items) || items.length === 0) {
    errors.push('購物車不能為空');
  } else {
    items.forEach((item, index) => {
      if (!item.productId || !Number.isInteger(item.productId)) {
        errors.push(`商品${index + 1}：商品ID無效`);
      }
      if (!item.quantity || item.quantity < 1 || item.quantity > 100) {
        errors.push(`商品${index + 1}：數量必須在1-100之間`);
      }
    });
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      message: '資料驗證失敗',
      errors
    });
  }

  next();
};

// 驗證管理員密碼
const validateAdminPassword = (req, res, next) => {
  const { password } = req.body;
  
  if (!password || password.length < 6) {
    return res.render('admin_login', { 
      error: '密碼長度至少需要6個字元' 
    });
  }
  
  next();
};

// 清理和標準化輸入
const sanitizeInput = (req, res, next) => {
  // 清理字符串欄位
  const stringFields = ['name', 'address', 'notes', 'invoice', 'phone', 'password'];
  
  stringFields.forEach(field => {
    if (req.body[field] && typeof req.body[field] === 'string') {
      // 移除潛在危險字符，但保留中文字符
      req.body[field] = req.body[field]
        .trim()
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // 移除 script 標籤
        .replace(/javascript:/gi, '') // 移除 javascript: 協議
        .replace(/on\w+\s*=/gi, ''); // 移除事件處理器
      
      // 限制長度
      if (req.body[field].length > 500) {
        req.body[field] = req.body[field].substring(0, 500);
      }
    }
  });
  
  // 清理數值欄位
  if (req.body.items && Array.isArray(req.body.items)) {
    req.body.items = req.body.items.map(item => ({
      ...item,
      productId: parseInt(item.productId) || 0,
      quantity: parseInt(item.quantity) || 0,
      price: parseFloat(item.price) || 0
    }));
  }
  
  next();
};

// 驗證外送員登入數據
const validateDriverLogin = (req, res, next) => {
  const { phone, password } = req.body;
  const errors = [];
  
  if (!phone || !/^09\d{8}$/.test(phone)) {
    errors.push('請輸入有效的手機號碼');
  }
  
  if (!password || password.length < 3) {
    errors.push('密碼長度至少需要3個字元');
  }
  
  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      error: '登入資料格式錯誤',
      details: errors
    });
  }
  
  next();
};

module.exports = {
  validateOrderData,
  validateAdminPassword,
  sanitizeInput,
  validateDriverLogin
};