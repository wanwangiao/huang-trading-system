// 統一錯誤處理中間件

// API錯誤處理
const apiErrorHandler = (err, req, res, next) => {
  console.error('API Error:', err);

  // 資料庫連線錯誤
  if (err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
    return res.status(503).json({
      success: false,
      message: '資料庫連線失敗，請稍後再試',
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }

  // PostgreSQL 錯誤
  if (err.code && err.code.startsWith('23')) {
    return res.status(400).json({
      success: false,
      message: '資料格式錯誤',
      error: process.env.NODE_ENV === 'development' ? err.detail : undefined
    });
  }

  // URL 解碼錯誤 - 特別處理外送員 API
  if (err.message && err.message.includes('Failed to decode param') && req.originalUrl.includes('/api/driver/area-orders/')) {
    console.log('🔧 捕獲URL解碼錯誤，嘗試修復:', err.message);
    
    // 提取原始參數
    const urlParts = req.originalUrl.split('/area-orders/');
    if (urlParts.length > 1) {
      const rawArea = urlParts[1].split('?')[0];
      
      // 映射常見錯誤編碼
      const areaMapping = {
        '%a4T%ael%b0%cf': '三峽區',
        '%be%f0%aaL%b0%cf': '樹林區', 
        '%c5a%baq%b0%cf': '鶯歌區'
      };
      
      const mappedArea = areaMapping[rawArea];
      if (mappedArea) {
        console.log('🎯 成功映射區域:', rawArea, '->', mappedArea);
        // 重定向到正確的URL
        const newUrl = req.originalUrl.replace(rawArea, encodeURIComponent(mappedArea));
        return res.redirect(302, newUrl);
      }
    }
    
    return res.status(400).json({
      success: false,
      message: '區域參數格式錯誤',
      error: '請使用正確的區域名稱'
    });
  }

  // 驗證錯誤
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: '輸入資料不符合要求',
      errors: err.errors
    });
  }

  // 預設錯誤
  res.status(err.status || 500).json({
    success: false,
    message: err.message || '伺服器內部錯誤',
    error: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
};

// 頁面錯誤處理
const pageErrorHandler = (err, req, res, next) => {
  console.error('Page Error:', err);

  res.status(err.status || 500).render('error', {
    message: err.message || '發生未知錯誤',
    error: process.env.NODE_ENV === 'development' ? err : {}
  });
};

// 404處理
const notFoundHandler = (req, res) => {
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      success: false,
      message: '找不到請求的API端點'
    });
  } else {
    res.status(404).render('404', {
      url: req.originalUrl
    });
  }
};

// 非同步錯誤包裝器
const asyncWrapper = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = {
  apiErrorHandler,
  pageErrorHandler,
  notFoundHandler,
  asyncWrapper
};