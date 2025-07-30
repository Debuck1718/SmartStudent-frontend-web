const CACHE_NAME = 'smartstudent-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/app-icon.png',
  '/manifest.json',
  '/dashboard.html',
  '/dashboard.css',
  '/teachers.html',
  '/teachers.css',
  '/financial.html',
  '/financial.css',
  '/rewards.html',
  '/rewards.css',
  '/login.html',
  '/signup.html',
  '/signup.css'
];

// Install the service worker and cache all necessary files
self.addEventListener('install', event => {
  console.log('[ServiceWorker] Install');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[ServiceWorker] Caching app shell');
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate and clean up old caches
self.addEventListener('activate', event => {
  console.log('[ServiceWorker] Activate');
  event.waitUntil(
    caches.keys().then(cacheNames =>
      Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cache);
            return caches.delete(cache);
          }
        })
      )
    )
  );
});

// Fetch and serve cached content when offline
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request)
      .then(response => response || fetch(event.request))
      .catch(() => {
        // Optionally return fallback content (e.g., offline.html)
        if (event.request.destination === 'document') {
          return caches.match('/index.html');
        }
      })
  );
});

