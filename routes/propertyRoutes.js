const express = require('express');
const {
  getProperties,
  getPublicProperties,
  getProperty,
  createProperty,
  updateProperty,
  deleteProperty,
  saveGeneratedListing,
  getSavedListings,
  scrapePropertyUrl
} = require('../controllers/propertyController');
const { protect, authorize } = require('../middleware/auth');

const router = express.Router();

router.route('/public').get(getPublicProperties);

router
  .route('/')
  .get(protect, getProperties)
  .post(protect, authorize('realtor'), createProperty);

router
  .route('/save-generated')
  .post(protect, authorize('realtor'), saveGeneratedListing);

router
  .route('/scrape')
  .post(protect, authorize('realtor'), scrapePropertyUrl);

router
  .route('/saved')
  .get(protect, authorize('realtor'), getSavedListings);

router
  .route('/:id')
  .get(getProperty)
  .put(protect, authorize('realtor'), updateProperty)
  .delete(protect, authorize('realtor'), deleteProperty);

module.exports = router;
