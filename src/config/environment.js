// Environment configuration helper
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

const config = {
  // Environment flags
  isDevelopment,
  isProduction,
  
  // Port configuration
  port: process.env.PORT || 3002,
  
  // Database configuration
  mongoUri: process.env.MONGO_URI,
  
  // JWT configuration
  jwtSecret: process.env.JWT_SECRET,
  
  // Frontend URL based on environment
  frontendUrl: isDevelopment 
    ? process.env.FRONTEND_URL_DEVELOPMENT || 'http://localhost:5173'
    : process.env.FRONTEND_URL_PRODUCTION || 'https://civic27.netlify.app',
  
  // CORS origins
  corsOrigins: process.env.CORS_ORIGIN ? 
    process.env.CORS_ORIGIN.split(',').map(origin => origin.trim()) : 
    ['http://localhost:5173', 'http://localhost:3000', 'https://civic27.netlify.app'],
  
  // Email configuration
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
    from: process.env.EMAIL_FROM
  },
  
  // Google OAuth
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET
  },
  
  // SendGrid
  sendgrid: {
    apiKey: process.env.SENDGRID_API_KEY,
    fromEmail: process.env.SENDGRID_FROM_EMAIL
  },
  
  // Gemini AI
  gemini: {
    apiKey: process.env.GEMINI_API_KEY
  }
};

module.exports = config;