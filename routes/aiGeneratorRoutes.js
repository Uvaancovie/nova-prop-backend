const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth'); // Assuming you have role middleware
const checkListingLimit = require('../middleware/checkListingLimit');
const { generateListing } = require('../services/aiGenerator.service');

// Controller logic directly in the route file for simplicity
router.post('/generate', protect, authorize('realtor'), checkListingLimit, async (req, res) => {
  const { beds, baths, suburb, price, amenities } = req.body;

  if (!beds || !baths || !suburb || !price || !amenities) {
    return res.status(400).json({ message: 'Please provide all required fields.' });
  }

  try {
    const inputData = { beds, baths, suburb, price, amenities };
    const generatedContent = await generateListing(inputData);

    // Save the generation record to the database for quota tracking
    const newListing = new (require('../models/GeneratedListing'))({
      realtorId: req.user._id,
      input: inputData,
      output: generatedContent,
    });
    await newListing.save();

    res.json({
      message: 'Listing content generated successfully!',
      data: generatedContent,
      usage: req.usage,
    });
  } catch (error) {
    console.error('Error generating AI content:', error);
    res.status(500).json({ message: 'Failed to generate AI content.' });
  }
});

module.exports = router;

// GET /ai-generator/history - Get user's generation history
router.get('/history', protect, authorize('realtor'), async (req, res) => {
  try {
    const GeneratedListing = require('../models/GeneratedListing');
    const history = await GeneratedListing.find({ realtorId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50); // Limit to last 50 generations

    res.json({
      success: true,
      data: history
    });
  } catch (error) {
    console.error('Error fetching generation history:', error);
    res.status(500).json({ message: 'Failed to fetch generation history.' });
  }
});
