/* --------------------------------------------------------------
   SmartStudent – Advanced Service Worker
   -------------------------------------------------------------- */
const CACHE = 'smartstudent-cache-v2';
const ASSETS = [
  '/', '/index.html', '/style.css', '/script.js',
  '/manifest.json', '/app-icon.png', '/bg.png',
  '/dashboard.html', '/dashboard.css',
  '/teachers.html',  '/teachers.css',
  '/financial.html', '/financial.css',
  '/rewards.html',   '/rewards.css',
  '/login.html', '/signup.html', '/signup.css'  // ← Added signup.css here
];

// Install event – cache essential assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

// Activate event – clean up old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(key => {
        if (key !== CACHE) return caches.delete(key);
      }))
    )
  );
});

// Fetch event – serve from cache, then network
self.addEventListener('fetch', event => {
  event.respondWith(
    caches.match(event.request).then(cached =>
      cached || fetch(event.request)
    )
  );
});


/* 🗃️ install + cache ----------------------------------------------------- */
self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS))
  );
  self.skipWaiting();
});

/* 🔄 activate – clean old caches ----------------------------------------- */
self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.map(k => k !== CACHE && caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* 🌐 fetch – offline first ----------------------------------------------- */
self.addEventListener('fetch', evt => {
  evt.respondWith(
    caches.match(evt.request).then(res => res || fetch(evt.request))
  );
});

/* ================================================================
   BACKGROUND SYNC – retry any queued POST requests (e.g. feedback)
   ================================================================ */
self.addEventListener('sync', evt => {
  if (evt.tag === 'smartstudent-sync') {
    evt.waitUntil(replayQueuedRequests());
  }
});

async function replayQueuedRequests () {
  const store = await openQueue();
  const tx = store.transaction('outbox', 'readwrite');
  const outbox = tx.objectStore('outbox');

  const all = await outbox.getAll();
  await Promise.all(all.map(async req => {
    try {
      await fetch(req.url, req.init);
      await outbox.delete(req.id);
    } catch (err) {
      /* still offline */
    }
  }));
}

function openQueue () {
  return new Promise((res, rej) => {
    const req = indexedDB.open('smartstudent-bg', 1);
    req.onupgradeneeded = () =>
      req.result.createObjectStore('outbox', { keyPath: 'id', autoIncrement: true });
    req.onsuccess = () => res(req.result);
    req.onerror   = () => rej(req.error);
  });
}

/* ================================================================
   PERIODIC SYNC – refresh dashboard data every 6 hours
   ================================================================ */
self.addEventListener('periodicsync', evt => {
  if (evt.tag === 'smartstudent-refresh') {
    evt.waitUntil(refreshFromServer());
  }
});

async function refreshFromServer () {
  try {
    await fetch('/api/periodic-refresh', { credentials: 'include' });
    notifyAllClients({ type: 'REFRESH' });
  } catch (err) {
    /* ignore if offline */
  }
}

/* Attempt to register periodic‑sync during activation */
self.addEventListener('activate', async () => {
  if ('periodicSync' in registration) {
    try {
      await registration.periodicSync.register('smartstudent-refresh', {
        minInterval: 6 * 60 * 60 * 1000   // 6 h
      });
    } catch (err) {
      // browser denied – ignore
    }
  }
});

/* ================================================================
   PUSH – incoming notifications (FCM/APNS)
   ================================================================ */
self.addEventListener('push', evt => {
  if (!evt.data) return;
  const payload = evt.data.json();

  switch (payload.type) {
    case 'reminder':
      showNotification(`⏰ Task Reminder: ${payload.title}`, payload.body, `rem-${payload.id}`);
      break;
    case 'goal':
      showNotification('🎯 Goal Completed!', payload.body, `goal-${payload.id}`);
      break;
    default:
      showNotification('📢 Announcement', payload.body, `ann-${Date.now()}`);
  }
});

function showNotification (title, body, tag) {
  const options = {
    body, tag,
    icon : '/app-icon.png',
    badge: '/app-icon.png',
    data : { url: '/dashboard.html' }
  };
  self.registration.showNotification(title, options);

  /* Forward to Capacitor local‑notifications if available */
  forwardToNative(title, body, tag);
}

/* ================================================================
   MESSAGE – short‑lived timers (while SW is alive)
   ================================================================ */
self.addEventListener('message', evt => {
  const { type } = evt.data || {};
  if (type === 'REMINDER') scheduleTempReminder(evt.data);
  if (type === 'QUEUE_REQUEST') queueRequest(evt.data.payload);
  if (type === 'GOAL_COMPLETE')
    showNotification('🎯 Goal Completed!', `Great job on "${evt.data.goalTitle}"`, `goal-${evt.data.goalTitle}`);

});

/* simple postMessage to all clients */
function notifyAllClients (msg) {
  self.clients.matchAll({ includeUncontrolled: true, type: 'window' })
    .then(clients => clients.forEach(c => c.postMessage(msg)));
}

/* Soft timer (not persisted) */
function scheduleTempReminder ({ title, body, delayMs = 60000 }) {
  setTimeout(() => showNotification(`⏰ ${title}`, body, `temp-${title}`), delayMs);
}

/* Queue failed POSTs while offline */
async function queueRequest (payload) {
  const db = await openQueue();
  const tx = db.transaction('outbox', 'readwrite');
  tx.objectStore('outbox').add(payload);
}

/* ================================================================
   Forward to native (Capacitor Android / iOS)
   ================================================================ */
function forwardToNative (title, body, tag) {
  if (!('capacitorNative' in self)) return;      // injected by Capacitor SW bridge

  // Avoid duplicates – let native layer decide
  self.capacitorNative.postMessage({
    type : 'LOCAL_NOTIFICATION',
    title, body, tag,
    schedule: { at: Date.now() }   // fire immediately
  });
}


