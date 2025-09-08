const express = require('express');
const dotenv = require('dotenv');
const morgan = require('morgan');
const cors = require('cors');
const compression = require('compression');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const path = require('path');
const connectDB = require('./config/db');

// Load env vars
dotenv.config();

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

// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 500, // limit each IP to 500 requests per windowMs
  message: 'Too many requests from this IP, please try again after 10 minutes'
});
app.use('/api/', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));

// Data sanitization against NoSQL query injection
app.use(mongoSanitize());

// Data sanitization against XSS
app.use(xss());

// Prevent http param pollution
app.use(hpp());

// Response compression
app.use(compression());

// Enable CORS - Configure for your domain
app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (like mobile apps, curl requests)
    if(!origin) return callback(null, true);
    
    // List of allowed origins
    const allowedOrigins = [
      'http://localhost:5173',
      'https://www.nova-prop.com',
      'https://nova-prop.com'
    ];
    
    if(allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

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

// Serve uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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
