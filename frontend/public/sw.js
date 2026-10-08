self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  return self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  // Simple pass-through for now. For a real offline PWA, you'd cache assets here.
  e.respondWith(fetch(e.request).catch(() => new Response('Offline')));
});
