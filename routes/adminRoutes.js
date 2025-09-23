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

// Apply protection to all routes
router.use(protect);
router.use(authorize('admin'));

router.get('/users', getUsers);
router.get('/stats', getStats);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);
router.put('/waitlist/:id/approve', approveWaitlist);

module.exports = router;
