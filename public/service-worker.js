const CACHE_NAME = 'college-erp-shell-v1';
const SHELL = [
    '/offline.html',
    '/login.html',
    '/home.html',
    '/notices.html',
    '/config.js',
    '/ui-feedback.js',
    '/erp-app.js',
    '/home.js',
    '/notices.js',
    '/erp-ui.css',
    '/home.css',
    '/manifest.webmanifest',
    '/favicon.svg'
];
const SHELL_PATHS = new Set(SHELL);
const NAVIGATION_PATHS = new Set(['/', '/index.html', '/login.html', '/home.html', '/notices.html']);

self.addEventListener('install', event => {
    event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
    event.waitUntil(caches.keys().then(names => Promise.all(names.filter(name => name.startsWith('college-erp-shell-') && name !== CACHE_NAME).map(name => caches.delete(name)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io/')) return;

    if (request.mode === 'navigate' && NAVIGATION_PATHS.has(url.pathname)) {
        event.respondWith(fetch(request).catch(async () => (await caches.match(request)) || caches.match('/offline.html')));
        return;
    }

    if (SHELL_PATHS.has(url.pathname)) {
        event.respondWith(caches.open(CACHE_NAME).then(async cache => {
            const cached = await cache.match(request);
            try {
                const response = await fetch(request);
                if (response.ok) await cache.put(request, response.clone());
                return response;
            } catch (error) {
                if (cached) return cached;
                throw error;
            }
        }));
    }
});
