const jwt = require('jsonwebtoken');
const config = require('../config/config');

const auth = (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    console.log('Auth middleware - Authorization header:', authHeader ? 'Present' : 'Missing');
    
    if (!authHeader) {
      console.log('Auth middleware - No Authorization header');
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.replace('Bearer ', '');
    console.log('Auth middleware - Token extracted:', token ? 'Present' : 'Missing');
    
    if (!token) {
      console.log('Auth middleware - No token after Bearer removal');
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Verify token
    console.log('Auth middleware - JWT_SECRET:', config.JWT_SECRET ? 'Present' : 'Missing');
    const decoded = jwt.verify(token, config.JWT_SECRET);
    console.log('Auth middleware - Token decoded successfully:', decoded);
    
    // Add user info to request
    req.user = { id: decoded.userId, role: decoded.role };
    console.log('Auth middleware - req.user set:', req.user);
    
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    console.error('Auth middleware error name:', error.name);
    console.error('Auth middleware error message:', error.message);
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please login again.' });
    }
    
    res.status(401).json({ error: 'Access denied. Invalid token.' });
  }
};

module.exports = auth; 