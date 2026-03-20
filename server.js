const express = require('express');
const cors = require('cors');
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const path = require("path");
require('dotenv').config();
require('events').EventEmitter.defaultMaxListeners = 20;

/* ---------------- ENV CHECK ---------------- */

if (!process.env.JWT_SECRET) {
  console.error("JWT_SECRET missing!");
  process.exit(1);
}

/* ---------------- DB INIT ---------------- */

require("./config/db");

/* ---------------- SERVICES ---------------- */

const startTokenCleanup = require('./services/tokenCleanupService');

/* ---------------- APP INIT ---------------- */

const app = express();
app.set("trust proxy", 1);

console.log("🚀 Server file loaded");

/* ---------------- MIDDLEWARE ---------------- */

app.use(cors({
  origin: [
    "https://od-platform.vercel.app",
    "https://institution-od-platform-production.up.railway.app",
    "http://localhost:3000",
    "http://127.0.0.1:5500"
  ],
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

if (process.env.NODE_ENV !== "production") {
  app.use(morgan("dev"));
}

/* ---------------- RATE LIMITERS ---------------- */

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 40,
  message: "Too many requests, please slow down"
});
app.use(limiter);

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15
});
app.use("/api/auth/login", loginLimiter);

const qrLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 15
});
app.use("/api/qr/scan", qrLimiter);

/* ---------------- ROOT ---------------- */

app.get('/', (req, res) => {
  res.send('Institution OD Platform API Running 🚀');
});

/* ---------------- HEALTH ---------------- */

app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    service: "OD Platform",
    time: new Date()
  });
});

/* ---------------- ROUTES ---------------- */

const departmentRoutes = require('./routes/departmentRoutes');
app.use('/api/departments', departmentRoutes);

const authRoutes = require('./routes/authRoutes');
app.use('/api/auth', authRoutes);

const eventRoutes = require('./routes/eventRoutes');
app.use('/api/events', eventRoutes);

const hodRoutes = require('./routes/hodRoutes');
app.use('/api/hod', hodRoutes);

const studentRoutes = require('./routes/studentRoutes');
app.use('/api/student', studentRoutes);

const participantRoutes = require('./routes/participantRoutes');
app.use('/api/participants', participantRoutes);

const notificationRoutes = require('./routes/notificationRoutes');
app.use('/api/notifications', notificationRoutes);

const qrRoutes = require('./routes/qrRoutes');
app.use('/api/qr', qrRoutes);

const analyticsRoutes = require('./routes/analyticsRoutes');
app.use('/api/analytics', analyticsRoutes);

const adminRoutes = require('./routes/adminRoutes');
app.use('/api/admin', adminRoutes);

const organizerRoutes = require('./routes/organizerRoutes');
app.use('/api/organizers', organizerRoutes);

/* ---------------- ADMIN TEST ---------------- */

const { verifyToken, allowRoles } = require('./middleware/authMiddleware');

app.get(
  '/api/admin/test',
  verifyToken,
  allowRoles('super_admin'),
  (req, res) => {
    res.json({ message: "Super Admin Access Granted" });
  }
);

/* ---------------- ERROR HANDLER ---------------- */

const errorHandler = require('./middleware/errorMiddleware');
app.use(errorHandler);

/* ---------------- 404 HANDLER ---------------- */

app.use((req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

/* ---------------- SOCKET.IO ---------------- */

const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: [
      "https://od-platform.vercel.app",
      "https://institution-od-platform-production.up.railway.app",
      "http://localhost:3000",
      "http://127.0.0.1:5500"
    ],
    credentials: true
  }
});

app.set("io", io);

/* ---------------- START SERVICES ---------------- */

startTokenCleanup();

/* ---------------- GLOBAL ERROR HANDLING ---------------- */

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err);
});

process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});

/* ---------------- GRACEFUL SHUTDOWN ---------------- */

process.on("SIGTERM", () => {
  console.log("SIGTERM received. Shutting down...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});

/* ---------------- START SERVER ---------------- */

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});