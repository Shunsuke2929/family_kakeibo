// Service Worker — うちの家計簿 v6.32
// Network First 戦略: 常に最新ファイルを優先し、オフライン時のみキャッシュ使用
const CACHE_NAME = 'kakeibo-v6.32';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/src/js/config.js',
  '/src/js/core/domain-constants.js',
  '/src/js/core/money-utils.js',
  '/src/js/core/date-utils.js',
  '/src/js/features/auth.js',
  '/src/js/features/shared-bootstrap.js',
  '/src/js/features/receipt.js',
  '/src/js/features/shared-sync.js',
  '/src/js/features/expense-list.js',
  '/src/js/features/expenses.js',
  '/src/js/features/search.js',
  '/src/js/features/monthly-close.js',
  '/src/js/features/expense-groups.js',
  '/src/js/features/tabs-navigation.js',
  '/src/js/features/summary-detail.js',
  '/src/js/features/home-dashboard.js',
  '/src/js/features/settings-masters.js',
  '/src/js/features/monthly-fixed.js',
  '/src/js/features/update-history.js',
  '/src/js/features/settings.js',
  '/src/js/features/settlement.js',
  '/src/js/app.js',
  '/src/css/styles.css',
  '/src/assets/favicon-192.png',
];

// インストール時にコアアセットをキャッシュ
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// 古いキャッシュを削除
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

// フェッチ戦略: Network First（常に最新を取得、失敗時のみキャッシュ使用）
self.addEventListener('fetch', (event) => {
  // APIリクエストはキャッシュしない
  if (event.request.url.includes('/api/')) {
    return;
  }
  // GETリクエストのみ対象
  if (event.request.method !== 'GET') {
    return;
  }
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // ネットワーク失敗時のみキャッシュから返す（オフライン対応）
        return caches.match(event.request);
      })
  );
});

self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch (error) {
      return {};
    }
  })();
  const title = payload.title || '家計簿通知';
  const options = {
    body: payload.body || '新しい家計簿の更新があります。',
    tag: payload.tag || 'kakeibo-notification',
    data: payload.data || { url: '/' },
    badge: '/src/assets/favicon-192.png',
    icon: '/src/assets/favicon-192.png',
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const destinationUrl = event.notification?.data?.url || '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ('focus' in client) {
          client.navigate?.(destinationUrl);
          return client.focus();
        }
      }
      return clients.openWindow(destinationUrl);
    })
  );
});
