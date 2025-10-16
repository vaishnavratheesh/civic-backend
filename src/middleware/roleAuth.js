const jwt = require('jsonwebtoken');
const User = require('../models/User');
const config = require('../config/config');

// Middleware to require specific role
const requireRole = (allowedRoles) => {
  return async (req, res, next) => {
    try {
      const token = req.header('Authorization')?.replace('Bearer ', '');
      
      if (!token) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. No token provided.'
        });
      }

      // Verify token
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Find user and check if active
      const user = await User.findById(decoded.userId).select('role ward active tokenVersion');
      
      console.log('Auth middleware - User found:', user ? `${user.role} (active: ${user.active})` : 'null');
      
      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User not found.'
        });
      }
      
      if (user.active === false) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. User account is inactive.'
        });
      }

      // Check token version (for token invalidation)
      const userTokenVersion = user.tokenVersion || 0;
      const decodedTokenVersion = decoded.tokenVersion || 0;
      
      if (decodedTokenVersion !== userTokenVersion) {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Token has been revoked.'
        });
      }

      // Check if user has required role
      if (!allowedRoles.includes(user.role)) {
        return res.status(403).json({
          success: false,
          message: `Access denied. Required role: ${allowedRoles.join(' or ')}`
        });
      }

      // Add user info to request
      req.user = {
        userId: user._id,
        role: user.role,
        wardNumber: user.ward,
        tokenVersion: user.tokenVersion
      };

      next();
    } catch (error) {
      if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Invalid token.'
        });
      }
      
      if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Access denied. Token expired.'
        });
      }

      console.error('Role auth middleware error:', error);
      res.status(500).json({
        success: false,
        message: 'Internal server error'
      });
    }
  };
};

// Middleware to require admin role
const requireAdmin = (req, res, next) => {
  console.log('requireAdmin middleware called');
  return requireRole(['admin'])(req, res, next);
};

// Middleware to require councillor role
const requireCouncillor = requireRole(['councillor']);

// Middleware to require president role
const requirePresident = requireRole(['president']);

// Middleware to require councillor and check ward access
const requireCouncillorWardAccess = (req, res, next) => {
  const requestedWard = parseInt(req.params.wardNumber || req.body.wardNumber || req.query.wardNumber);
  
  if (req.user.role !== 'councillor') {
    return res.status(403).json({
      success: false,
      message: 'Access denied. Councillor role required.'
    });
  }

  if (requestedWard && req.user.wardNumber !== requestedWard) {
    return res.status(403).json({
      success: false,
      message: `Access denied. You can only access Ward ${req.user.wardNumber} data.`
    });
  }

  next();
};

// Middleware for multiple roles
const requireAnyRole = (allowedRoles) => requireRole(allowedRoles);

// Middleware to check if user can access ward data
const checkWardAccess = (req, res, next) => {
  const requestedWard = parseInt(req.params.wardNumber || req.body.wardNumber || req.query.wardNumber);
  
  // Admin and President can access all wards
  if (['admin', 'president'].includes(req.user.role)) {
    return next();
  }

  // Councillors can only access their own ward
  if (req.user.role === 'councillor') {
    if (requestedWard && req.user.wardNumber !== requestedWard) {
      return res.status(403).json({
        success: false,
        message: `Access denied. You can only access Ward ${req.user.wardNumber} data.`
      });
    }
    return next();
  }

  // Citizens can only access their own ward (for viewing purposes)
  if (req.user.role === 'citizen') {
    if (requestedWard && req.user.wardNumber !== requestedWard) {
      return res.status(403).json({
        success: false,
        message: `Access denied. You can only access Ward ${req.user.wardNumber} data.`
      });
    }
    return next();
  }

  // Officers can access all wards (if needed)
  if (req.user.role === 'officer') {
    return next();
  }

  return res.status(403).json({
    success: false,
    message: 'Access denied. Insufficient permissions.'
  });
};

module.exports = {
  requireRole,
  requireAdmin,
  requireCouncillor,
  requirePresident,
  requireCouncillorWardAccess,
  requireAnyRole,
  checkWardAccess
};