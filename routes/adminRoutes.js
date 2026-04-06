const express = require('express');
const {
  getUsers,
  getStats,
  updateUserRole,
  deleteUser,
  approveWaitlist
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();
const ALLOWED_REALTOR_ADMIN_EMAIL = 'way2fdlyagency@gmail.com';

const restrictRealtorAdmin = (req, res, next) => {
  if (req.user?.role !== 'realtor') return next();

  const email = (req.user?.email || '').toLowerCase();
  if (email !== ALLOWED_REALTOR_ADMIN_EMAIL) {
    return res.status(403).json({
      success: false,
      error: 'Realtor is not authorized to access admin routes'
    });
  }

  next();
};

// Apply protection to all routes
router.use(protect);
router.use(authorize('admin', 'owner', 'realtor'));
router.use(restrictRealtorAdmin);

router.get('/users', getUsers);
router.get('/stats', getStats);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.put('/waitlist/:id/approve', approveWaitlist);

module.exports = router;
