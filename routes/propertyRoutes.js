const express = require('express');
const {
  getProperties,
  getPublicProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty
} = require('../controllers/propertyController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.route('/public').get(getPublicProperties);

router
  .route('/')
  .get(protect, getProperties)
  .post(protect, authorize('realtor'), createProperty);

router
  .route('/:id')
  .get(getProperty)
  .put(protect, authorize('realtor'), updateProperty)
  .delete(protect, authorize('realtor'), deleteProperty);

module.exports = router;
