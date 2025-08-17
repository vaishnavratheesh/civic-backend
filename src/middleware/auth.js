const jwt = require('jsonwebtoken');
const config = require('../config/config');

const auth = (req, res, next) => {
  try {
    // Get token from header
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);
    
    // Add user info to request
    req.user = { id: decoded.userId, role: decoded.role };
    
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired. Please login again.' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Invalid token. Please login again.' });
    }
    
    console.error('Auth middleware error:', error);
    res.status(401).json({ error: 'Access denied. Invalid token.' });
  }
};

module.exports = auth; 