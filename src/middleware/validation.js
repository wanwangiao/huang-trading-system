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
  if (req.body.name) {
    req.body.name = validator.escape(req.body.name.trim());
  }
  if (req.body.address) {
    req.body.address = validator.escape(req.body.address.trim());
  }
  if (req.body.notes) {
    req.body.notes = validator.escape(req.body.notes.trim());
  }
  if (req.body.invoice) {
    req.body.invoice = validator.escape(req.body.invoice.trim());
  }
  
  next();
};

module.exports = {
  validateOrderData,
  validateAdminPassword,
  sanitizeInput
};