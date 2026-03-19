//const API_BASE = "https://institution-od-platform-production.up.railway.app";

//console.log("🌐 API_BASE:", API_BASE); 

// ✅ FIXED - Auto-detect environment
const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000'  // Local development
    : 'https://institution-od-platform-production.up.railway.app';  // Production

console.log("🌐 API_BASE:", API_BASE);