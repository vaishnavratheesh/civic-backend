const User = require('../models/User');
const CouncillorProfile = require('../models/CouncillorProfile');

// Middleware factory to require a specific role
function requireRole(requiredRole) {
  return async (req, res, next) => {
    try {
      if (!req.user || req.user.role !== requiredRole) {
        return res.status(403).json({ error: 'Forbidden: insufficient role' });
      }

      // Hydrate convenience info for councillors
      if (requiredRole === 'councillor') {
        let ward = null;
        // Councillors are stored in CouncillorProfile
        const councillor = await CouncillorProfile.findById(req.user.id).lean();
        if (councillor) {
          ward = councillor.ward;
          req.user.ward = councillor.ward;
          req.user.panchayath = councillor.panchayath;
        } else {
          // Fallback: in case councillor is in users collection
          const user = await User.findById(req.user.id).lean();
          if (user) {
            ward = user.ward;
            req.user.ward = user.ward;
            req.user.panchayath = user.panchayath;
          }
        }

        if (ward == null) {
          return res.status(403).json({ error: 'Councillor ward not found' });
        }
      }

      next();
    } catch (err) {
      console.error('requireRole error:', err);
      return res.status(500).json({ error: 'Authorization check failed' });
    }
  };
}

module.exports = requireRole;

