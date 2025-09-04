const CACHE_NAME = 'chengyiveg-driver-v1.1.0';
const urlsToCache = [
  '/driver',
  '/driver/login',
  '/css/driver-portal.css',
  '/js/driver-app.js',
  '/manifest.json',
  '/images/icon-192x192.png',
  '/images/icon-512x512.png'
];

// 安裝 Service Worker
self.addEventListener('install', function(event) {
  console.log('🔧 Service Worker 安裝中...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        console.log('📦 開始快取重要檔案');
        return cache.addAll(urlsToCache);
      })
      .then(function() {
        console.log('✅ Service Worker 安裝完成');
        self.skipWaiting(); // 立即激活新版本
      })
  );
});

// 激活 Service Worker
self.addEventListener('activate', function(event) {
  console.log('🚀 Service Worker 激活中...');
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(cacheName) {
          // 清除舊版本快取
          if (cacheName !== CACHE_NAME) {
            console.log('🗑️ 清除舊快取:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(function() {
      console.log('✅ Service Worker 激活完成');
      return self.clients.claim(); // 立即控制所有頁面
    })
  );
});

// 攔截網路請求
self.addEventListener('fetch', function(event) {
  // 只快取 GET 請求
  if (event.request.method !== 'GET') {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(function(response) {
        // 快取命中，返回快取版本
        if (response) {
          return response;
        }

        // 快取未命中，發送網路請求
        return fetch(event.request).then(function(response) {
          // 檢查是否為有效回應
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // 克隆回應以便快取
          var responseToCache = response.clone();

          caches.open(CACHE_NAME)
            .then(function(cache) {
              // 動態快取新資源
              if (event.request.url.includes('/driver') || 
                  event.request.url.includes('/api/driver')) {
                cache.put(event.request, responseToCache);
              }
            });

          return response;
        }).catch(function() {
          // 網路失敗時的備援方案
          if (event.request.url.includes('/driver')) {
            return caches.match('/driver');
          }
        });
      })
  );
});

// 推播通知處理
self.addEventListener('push', function(event) {
  console.log('📬 收到推播通知');
  
  const options = {
    body: event.data ? event.data.text() : '您有新的配送任務',
    icon: '/images/icon-192x192.png',
    badge: '/images/icon-72x72.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    },
    actions: [
      {
        action: 'explore',
        title: '查看訂單',
        icon: '/images/checkmark.png'
      },
      {
        action: 'close',
        title: '稍後處理',
        icon: '/images/xmark.png'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification('承億蔬菜外送', options)
  );
});

// 通知點擊處理
self.addEventListener('notificationclick', function(event) {
  console.log('📱 通知被點擊');
  event.notification.close();

  if (event.action === 'explore') {
    // 開啟外送員頁面
    event.waitUntil(
      clients.openWindow('/driver')
    );
  }
});

// 背景同步 (離線時的操作會在網路恢復後執行)
self.addEventListener('sync', function(event) {
  if (event.tag === 'driver-sync') {
    console.log('🔄 執行背景同步');
    event.waitUntil(
      // 同步離線期間的配送狀態更新
      syncDriverData()
    );
  }
});

async function syncDriverData() {
  try {
    // 獲取離線期間儲存的數據
    const cache = await caches.open(CACHE_NAME);
    // 這裡可以實作離線數據同步邏輯
    console.log('📤 同步配送數據完成');
  } catch (error) {
    console.error('❌ 同步失敗:', error);
  }
}