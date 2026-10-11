if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('/service-worker.js').catch(error => {
        console.error('Offline shell registration failed:', error);
    });
}
