// Configuration file for the Civic+ backend
// In production, these should be set via environment variables

// Load environment variables
require('dotenv').config();

const config = {
  // Server Configuration
  PORT: process.env.PORT || 3002,
  NODE_ENV: process.env.NODE_ENV || 'development',

  // MongoDB Configuration
  MONGO_URI: process.env.MONGO_URI || 'mongodb+srv://vaishnavratheesh2026:mayaratheesh@cluster0.p06gw.mongodb.net/civic?retryWrites=true&w=majority',

  // JWT Configuration
  JWT_SECRET: process.env.JWT_SECRET || 'your_jwt_secret_here',

  // Google OAuth Configuration
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID || '289773391020-da1s5ueqalq5v2ppe01ujm9m0ordiomg.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET || 'your_google_client_secret_here',

  // Email Configuration (Gmail)
  EMAIL_USER: process.env.EMAIL_USER || 'vaishnavratheesh2026@mca.ajce.in',
  EMAIL_PASS: process.env.EMAIL_PASS || 'vset afhc yyqn zhdi',
  EMAIL_FROM: process.env.EMAIL_FROM || 'vaishnavratheesh2026@mca.ajce.in',

  // Cloudinary Configuration
  CLOUDINARY_CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || 'dmxtgfaq2',
  CLOUDINARY_API_KEY: process.env.CLOUDINARY_API_KEY || '519116425418852',
  CLOUDINARY_API_SECRET: process.env.CLOUDINARY_API_SECRET || '_DQYVVaHTBDWQ8L0u9R_MA_0iXU',

  // Frontend URL for password reset
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',

  // CORS Origins
  CORS_ORIGINS: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : ['http://localhost:5173', 'http://localhost:5174'],

  // Development overrides
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production'
};

module.exports = config; 