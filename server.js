const express = require('express');
const cors = require('cors');
const rateLimit = require("express-rate-limit");
const morgan = require("morgan");
const path = require("path");
require('dotenv').config();
require('events').EventEmitter.defaultMaxListeners = 20;

/* ---------------- ENV CHECK / DB INIT ---------------- */

try {
  require("./config/db").validateRuntimeConfig();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

const db = require("./config/db");

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
  // Integration tests exercise dozens of endpoints in one minute; production limits stay unchanged.
  max: process.env.NODE_ENV === "test" ? 100000 : 40,
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

const academicRoutes = require('./routes/academicRoutes');
app.use('/api/academics', academicRoutes);

const timetableRoutes = require('./routes/timetableRoutes');
app.use('/api/timetable', timetableRoutes);

const classAttendanceRoutes = require('./routes/classAttendanceRoutes');
app.use('/api/class-attendance', classAttendanceRoutes);

const facultyAttendanceRoutes = require('./routes/facultyAttendanceRoutes');
app.use('/api/faculty-attendance', facultyAttendanceRoutes);

const learningRoutes = require('./routes/learningRoutes');
app.use('/api/learning', learningRoutes);

const examinationRoutes = require('./routes/examinationRoutes');
app.use('/api/examinations', examinationRoutes);

const financeRoutes = require('./routes/financeRoutes');
app.use('/api/finance', financeRoutes);

const libraryRoutes = require('./routes/libraryRoutes');
app.use('/api/library', libraryRoutes);

const profileRoutes = require('./routes/profileRoutes');
app.use('/api/profile', profileRoutes);

const attendanceSummaryRoutes = require('./routes/attendanceSummaryRoutes');
app.use('/api/attendance', attendanceSummaryRoutes);

const communityRoutes = require('./routes/communityRoutes');
app.use('/api/community', communityRoutes);

const messageRoutes = require('./routes/messageRoutes');
app.use('/api/messages', messageRoutes);

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

const jwt = require('jsonwebtoken');
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('Authentication required'));
  jwt.verify(token, process.env.JWT_SECRET, (error, decoded) => {
    if (error) return next(new Error('Invalid token'));
    socket.user = decoded;
    next();
  });
});
io.on('connection', (socket) => {
  socket.on('conversation:join', async (conversationId) => {
    if (!Number.isInteger(Number(conversationId)) || Number(conversationId) < 1) return;
    const [rows] = await db.query('SELECT 1 FROM erp_message_conversation_members WHERE conversation_id=? AND user_id=? LIMIT 1', [conversationId, socket.user.id]);
    if (rows.length) socket.join(`conversation:${conversationId}`);
  });
  socket.on('conversation:leave', (conversationId) => socket.leave(`conversation:${conversationId}`));
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