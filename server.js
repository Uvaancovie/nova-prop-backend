const express = require('express');
const dotenv = require('dotenv');
// Load env vars early so modules that read process.env (e.g. Groq client) can initialize
dotenv.config();
const morgan = require('morgan');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const path = require('path');
const connectDB = require('./config/db');

const aiProps = require('./routes/aiProperties');
const aiChat = require('./routes/ai.chat');


// Connect to database
connectDB();

// Route files
const authRoutes = require('./routes/authRoutes');
const propertyRoutes = require('./routes/propertyRoutes');
const bookingRoutes = require('./routes/bookingRoutes');
const messageRoutes = require('./routes/messageRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const waitlistRoutes = require('./routes/waitlistRoutes');
const adminRoutes = require('./routes/adminRoutes');

const app = express();

// Security headers - allow cross-origin resource loading for uploads/images so the frontend can display avatars
app.use(helmet({
  crossOriginResourcePolicy: {
    policy: 'cross-origin'
  }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again after 10 minutes',
  skip: (req) => {
    try {
      const authHeader = req.headers.authorization || '';
      if (!authHeader.startsWith('Bearer ')) return false;

      const token = authHeader.slice(7);
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      return decoded?.role === 'realtor';
    } catch (err) {
      return false;
    }
  }
});
app.use('/api/', limiter);

// RAW BODY capture for PayFast ITN — must be before urlencoded() parser
app.use((req, res, next) => {
  const ct = (req.headers['content-type'] || '').toLowerCase();
  if (ct.includes('application/x-www-form-urlencoded')) {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => { req.rawBody = buf; next(); });
  } else next();
});

// Body parser
app.use(express.urlencoded({ extended: true }));
app.use(express.json({ limit: '10mb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent http param pollution
app.use(hpp());

// Response compression
app.use(compression());

// NOTE: AI routes mounted later with other API routers (see below)

// Enable CORS - Configure for your domain
// Accept a comma-separated list in process.env.CORS_ORIGIN, fall back to defaults
const corsOptions = (() => {
  const fromEnv = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

  const defaults = [
    'http://localhost:5173',
    'https://www.nova-prop.com',
    'https://nova-prop.com',
    'https://nova-prop-backend.onrender.com'
  ];

  const allowed = Array.from(new Set([...fromEnv, ...defaults]));

  const normalize = (u) => (typeof u === 'string' ? u.replace(/\/+$/, '') : u);

  return {
    origin: function(origin, callback) {
      // Allow server-to-server or non-browser requests with no origin
      if (!origin) return callback(null, true);

      const normalizedOrigin = normalize(origin);
      const normalizedAllowed = allowed.map(normalize);
      if (normalizedAllowed.indexOf(normalizedOrigin) !== -1) {
        return callback(null, true);
      }
      // Do NOT throw here - return false to let the CORS middleware handle it
      console.warn('CORS rejected origin:', origin);
      return callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
    optionsSuccessStatus: 200
  };
})();

app.use(cors(corsOptions));
// Explicitly handle preflight for all routes
app.options('*', cors(corsOptions));

// Reflect allowed origin header explicitly for allowed origins so
// responses include Access-Control-Allow-Origin and Access-Control-Allow-Credentials
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (!origin) return next();
  const normalize = (u) => (typeof u === 'string' ? u.replace(/\/+$/, '') : u);
  const allowedList = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .concat([
      'http://localhost:5173',
      'https://www.nova-prop.com',
      'https://nova-prop.com',
      'https://nova-prop-backend.onrender.com'
    ]);
  const normalizedAllowed = allowedList.map(normalize);
  if (normalizedAllowed.indexOf(normalize(origin)) !== -1) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Vary', 'Origin');
  }
  next();
});

// Set cache control headers
app.use((req, res, next) => {
  res.setHeader('Surrogate-Control', 'no-store');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Dev logging middleware
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  // Use a more concise logging format in production
  app.use(morgan('combined', {
    skip: (req, res) => res.statusCode < 400 // Only log errors
  }));
}

// Mount routers with versioning
app.use('/api/auth', authRoutes);
app.use('/api/properties', propertyRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/waitlist', waitlistRoutes);
app.use('/api/admin', adminRoutes);

// Mount me summary route
const meSummary = require('./routes/me.summary');
app.use('/api', meSummary);

// AI usage and admin metrics
const aiUsageRoutes = require('./routes/aiUsage');
const adminMetricsRoutes = require('./routes/adminMetrics');
app.use('/api', aiUsageRoutes);
app.use('/api', adminMetricsRoutes);

// Normalize accidental double /api/api paths (frontend sometimes prefixes twice)
app.use((req, res, next) => {
  if (req.originalUrl && req.originalUrl.startsWith('/api/api/')) {
    req.url = req.url.replace('/api/api/', '/api/');
  }
  next();
});

// AI and public routes
const aiChatRoutes = require('./routes/aiChatRoutes');
const publicBrowseRoutes = require('./routes/publicBrowseRoutes');
const aiGeneratorRoutes = require('./routes/aiGeneratorRoutes');
app.use('/api/ai', aiChatRoutes);
app.use('/api/public', publicBrowseRoutes);
app.use('/api/ai-generator', aiGeneratorRoutes);

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Billing / PayFast routes
const billingRoutes = require('./routes/billing');
const payfastItn = require('./routes/payfast.itn');
app.use('/api/billing', billingRoutes);
app.use(payfastItn);

// Newsletter routes
const newsletterRoutes = require('./routes/newsletterRoutes');
app.use('/api/newsletter', newsletterRoutes);

// Start trial expiry job (if configured)
try {
  const trialExpiryJob = require('./scripts/trialExpiryJob');
  trialExpiryJob.start();
} catch (err) {
  console.warn('No trialExpiryJob started:', err.message);
}

// Add a route for testing the API
app.get('/api', (req, res) => {
  res.json({ message: 'Welcome to PropStream API', status: 'running' });
});

// Error handling middleware
const errorHandler = require('./middleware/error');
app.use(errorHandler);

// Handle 404s
app.use((req, res) => {
  res.status(404).json({ success: false, error: 'Endpoint not found' });
});

const PORT = process.env.PORT || 4000;

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err, promise) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.log(`Error: ${err.message}`);
  // Close server & exit process
  server.close(() => process.exit(1));
});


// the server js will mount all of the routes and functionalities to make sure that we can use them