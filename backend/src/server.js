'use strict';

const path = require('path');

// Load environment variables if dotenv is available
try {
  require('dotenv').config({ path: path.join(__dirname, '../.env') });
} catch (e) {
  // dotenv is optional — env vars may be set externally
}

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { initDb } = require('./db/database');
const { initScheduler } = require('./services/scheduler/scheduler');
const authRoutes = require('./routes/auth');
const instanceRoutes = require('./routes/instances');
const tablespaceRoutes = require('./routes/tablespace');
const jobsRoutes = require('./routes/jobs');
const locksRoutes = require('./routes/locks');
const updatesRoutes = require('./routes/updates');
const settingsRoutes = require('./routes/settings');
const { errorHandler } = require('./middleware/errorHandler');

const app = express();
const PORT = process.env.PORT || 3001;

// Security middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  })
);

// Body parsing
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// Rate limiting
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 200,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, please try again later' },
  })
);

// Health check (no auth required)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    mockMode: process.env.SAP_MOCK_MODE === 'true',
  });
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/instances', instanceRoutes);
app.use('/api/tablespace', tablespaceRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/locks', locksRoutes);
app.use('/api/updates', updatesRoutes);
app.use('/api/settings', settingsRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});

// Global error handler (must be last)
app.use(errorHandler);

async function start() {
  try {
    // Validate required secrets before starting
    if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters — set it in your .env file');
    }
    if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length < 32) {
      throw new Error('ENCRYPTION_KEY must be at least 32 characters — set it in your .env file');
    }

    await initDb();
    console.log('Database initialized');

    initScheduler().catch((err) => {
      console.error('Scheduler initialization error:', err.message);
    });

    app.listen(PORT, () => {
      console.log(`SAP Dashboard API running on port ${PORT}`);
      console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`SAP Mock Mode: ${process.env.SAP_MOCK_MODE === 'true' ? 'ENABLED' : 'DISABLED'}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
}

// Only start if this is the main module (not imported by tests)
if (require.main === module) {
  start();
}

module.exports = app;
