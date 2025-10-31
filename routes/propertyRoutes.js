const express = require('express');
const {
  getProperties,
  getPublicProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  saveGeneratedListing,
  getSavedListings
} = require('../controllers/propertyController');
const { protect, authorize } = require('../middleware/auth');
const checkSavedListingsLimit = require('../middleware/checkSavedListingsLimit');

const router = express.Router();

router.route('/public').get(getPublicProperties);

router
  .route('/')
  .get(protect, getProperties)
  .post(protect, authorize('realtor'), createProperty);

router
  .route('/save-generated')
  .post(protect, authorize('realtor'), checkSavedListingsLimit, saveGeneratedListing);

router
  .route('/saved')
  .get(protect, authorize('realtor'), getSavedListings);

router
  .route('/:id')
  .get(getProperty)
  .put(protect, authorize('realtor'), updateProperty)
  .delete(protect, authorize('realtor'), deleteProperty);

module.exports = router;
