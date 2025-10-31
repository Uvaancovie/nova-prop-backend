const Property = require('../models/Property');
const User = require('../models/User');

// @desc    Get all properties
// @route   GET /api/properties
// @access  Private
exports.getProperties = async (req, res) => {
  try {
    let query;

    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ['select', 'sort', 'page', 'limit'];

    // Loop over removeFields and delete them from reqQuery
    removeFields.forEach(param => delete reqQuery[param]);

    // Create query string
    let queryStr = JSON.stringify(reqQuery);

    // Create operators ($gt, $gte, etc)
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);

    // If user is a realtor, only show their properties
    if (req.user.role === 'realtor') {
      query = Property.find({ realtor_id: req.user.id, ...JSON.parse(queryStr) });
    } else {
      query = Property.find(JSON.parse(queryStr));
    }

    // Select Fields
    if (req.query.select) {
      const fields = req.query.select.split(',').join(' ');
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(',').join(' ');
      query = query.sort(sortBy);
    } else {
      query = query.sort('-createdAt');
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Property.countDocuments();

    query = query.skip(startIndex).limit(limit);

    // Executing query
    const properties = await query;

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit
      };
    }

    res.json({
      success: true,
      count: properties.length,
      pagination,
      properties
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get public properties (no auth required)
// @route   GET /api/properties/public
// @access  Public
exports.getPublicProperties = async (req, res) => {
  try {
    // Similar to getProperties but without auth restrictions
    let query = Property.find({ is_available: true });

    // Apply filters, sorting, pagination as above
    const properties = await query;

    res.json({
      success: true,
      count: properties.length,
      properties
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get single property
// @route   GET /api/properties/:id
// @access  Public
exports.getProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    res.json({
      success: true,
      property
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Create new property
// @route   POST /api/properties
// @access  Private (Realtor only)
exports.createProperty = async (req, res) => {
  try {
    // Add user to req.body
    req.body.realtor_id = req.user.id;
    req.body.realtor_name = req.user.name;
    req.body.realtor_email = req.user.email;
    req.body.realtor_phone = req.user.phone || '';

    const property = await Property.create(req.body);

    res.status(201).json({
      success: true,
      property
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Update property
// @route   PUT /api/properties/:id
// @access  Private (Realtor only - owner)
exports.updateProperty = async (req, res) => {
  try {
    let property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Make sure user is property owner
    if (property.realtor_id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to update this property'
      });
    }

    property = await Property.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });

    res.json({
      success: true,
      property
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Save generated listing as draft
// @route   POST /api/properties/save-generated
// @access  Private (Realtor only)
exports.saveGeneratedListing = async (req, res) => {
  try {
    const { title, description, amenities, keywords, beds, baths, propertyType, suburb, province, price } = req.body;

    // Map to property fields
    const propertyData = {
      name: title,
      description,
      address: `${suburb}, ${province}`, // Combine suburb and province
      city: suburb,
      province,
      price_per_night: parseFloat(price) || 0, // Assuming price is per night, adjust if needed
      bedrooms: parseInt(beds) || 1,
      bathrooms: parseInt(baths) || 1,
      max_guests: (parseInt(beds) || 1) * 2, // Estimate guests
      amenities: amenities || [],
      is_available: false, // Draft, not available yet
      is_public: false, // Not public until published
      status: 'draft',
      realtor_id: req.user.id,
      realtor_name: req.user.name,
      realtor_email: req.user.email,
      realtor_phone: req.user.phone || ''
    };

    const property = await Property.create(propertyData);

    res.status(201).json({
      success: true,
      property
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Delete property
// @route   DELETE /api/properties/:id
// @access  Private (Realtor only - owner)
exports.deleteProperty = async (req, res) => {
  try {
    const property = await Property.findById(req.params.id);

    if (!property) {
      return res.status(404).json({
        success: false,
        error: 'Property not found'
      });
    }

    // Make sure user is property owner
    if (property.realtor_id.toString() !== req.user.id && req.user.role !== 'admin') {
      return res.status(401).json({
        success: false,
        error: 'Not authorized to delete this property'
      });
    }

    await property.deleteOne();

    res.json({
      success: true,
      data: {}
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
};

// @desc    Get saved listings for realtor
// @route   GET /api/properties/saved
// @access  Private (Realtor only)
exports.getSavedListings = async (req, res) => {
  try {
    console.log('Fetching saved listings for user:', req.user.id);
    const properties = await Property.find({
      realtor_id: req.user.id,
      status: { $in: ['draft', 'saved'] }
    }).sort('-createdAt');
    console.log('Found properties:', properties.length);
    res.json({
      success: true,
      data: properties
    });
  } catch (error) {
    console.error('Error in getSavedListings:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
