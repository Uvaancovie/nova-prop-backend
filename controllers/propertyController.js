const Property = require('../models/Property');
const User = require('../models/User');
const fs = require('fs');
const path = require('path');

// Helper function to handle base64 PDF upload
const handlePdfUpload = (base64Data, userId) => {
  // Check if it's a base64 PDF
  if (!base64Data || !base64Data.startsWith('data:application/pdf;base64,')) {
    return base64Data; // Return as-is if it's a URL or empty
  }

  // Extract base64 content
  const pdfData = base64Data.split(',')[1];
  
  // Validate file size (10MB limit)
  const fileSizeBytes = Buffer.from(pdfData, 'base64').length;
  const maxSize = 10 * 1024 * 1024; // 10MB
  if (fileSizeBytes > maxSize) {
    throw new Error('PDF file size exceeds 10MB limit');
  }

  // Ensure uploads directory exists
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'rental-agreements');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  // Generate unique filename
  const filename = `${userId}_${Date.now()}.pdf`;
  const filePath = path.join(uploadsDir, filename);

  // Write file
  fs.writeFileSync(filePath, Buffer.from(pdfData, 'base64'));

  // Return the URL path
  return `/uploads/rental-agreements/${filename}`;
};

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

    // Handle PDF upload for rental agreement
    if (req.body.rental_agreement) {
      try {
        req.body.rental_agreement = handlePdfUpload(req.body.rental_agreement, req.user.id);
      } catch (pdfError) {
        return res.status(400).json({
          success: false,
          error: pdfError.message
        });
      }
    }

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

    // Handle PDF upload for rental agreement
    if (req.body.rental_agreement) {
      try {
        req.body.rental_agreement = handlePdfUpload(req.body.rental_agreement, req.user.id);
      } catch (pdfError) {
        return res.status(400).json({
          success: false,
          error: pdfError.message
        });
      }
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

// @desc    Scrape Airbnb or other property URL for details using AI
// @route   POST /api/properties/scrape
// @access  Private (Realtor only)
exports.scrapePropertyUrl = async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ success: false, error: 'URL is required' });
    }

    const axios = require('axios');
    const cheerio = require('cheerio');
    const { chatJSON } = require('../lib/groq');

    // Fetch the URL
    let html = '';
    try {
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5'
        },
        timeout: 10000
      });
      html = response.data;
    } catch (fetchErr) {
      console.error('Fetch error for scrape:', fetchErr.message);
      return res.status(400).json({ success: false, error: 'Could not fetch the provided URL. Please verify it is correct and accessible.' });
    }

    // Extract useful text and meta details
    const $ = cheerio.load(html);
    const title = $('title').text() || $('meta[property="og:title"]').attr('content') || '';
    const description = $('meta[property="og:description"]').attr('content') || $('meta[name="description"]').attr('content') || '';
    const image = $('meta[property="og:image"]').attr('content') || '';
    
    // We try to grab the structured JSON-LD data if present (common in Airbnb/Booking)
    let structuredData = '';
    $('script[type="application/ld+json"]').each((i, el) => {
      structuredData += $(el).html() + '\n';
    });

    // Also get all text from the body, limit to ~10,000 chars to save tokens
    // We remove scripts, styles, etc.
    $('script, style, noscript, svg, iframe').remove();
    let bodyText = $('body').text().replace(/\s+/g, ' ').trim().substring(0, 10000);

    // AI prompt to extract data
    const messages = [
      {
        role: 'system',
        content: `You are a real estate data extraction assistant. Extract property details from the provided webpage text, meta tags, and structured JSON data.
        Return only a JSON object containing the exact fields requested, properly formatted. Do not include any explanation or prose.`
      },
      {
        role: 'user',
        content: `Extract the following details and format as JSON:
        - name (string: The property title/name)
        - description (string: Detailed description of the property)
        - price_per_night (number: Estimated price per night from context, numeric only. Or 0 if unknown)
        - bedrooms (number: Number of bedrooms, numeric only. Or 1 if unknown)
        - bathrooms (number: Number of bathrooms, numeric only. Or 1 if unknown)
        - max_guests (number: Maximum guests allowed. Or 2 if unknown)
        - amenities (string: A comma-separated list of top 5-10 amenities, e.g. "WiFi, Pool, Kitchen")
        - city (string: The city where the property is located)
        - province (string: The province/state where the property is located)
        - property_type (string: Must be one of: apartment, house, condo, villa, cabin, other. Guess best. Default 'apartment')
        - houseRules (string: A short summary of house rules. e.g. "No smoking, No pets")
        
        Here is the webpage data:
        Title: ${title}
        Meta Description: ${description}
        Structured Data: ${structuredData}
        Body Content (truncated): ${bodyText}`
      }
    ];

    const aiResult = await chatJSON(messages);

    if (aiResult && !aiResult.error && !aiResult.raw) {
      // AI returns JSON object, prep the initial object with the scraped image
      const resultObj = {
        ...aiResult,
        imageInputs: [image, '', '']
      };
      
      return res.json({ success: true, data: resultObj });
    } else {
      // Fallback if AI fails:
      console.warn("AI parsing failed or returned raw. Using fallback parsing.");
      const fallbackData = {
        name: title.replace(/ - Airbnb$/, '').trim(),
        description: description,
        price_per_night: 0,
        bedrooms: 1,
        bathrooms: 1,
        max_guests: 2,
        amenities: '',
        city: '',
        province: '',
        property_type: 'apartment',
        houseRules: '',
        imageInputs: [image, '', '']
      };
      return res.json({ success: true, data: fallbackData });
    }
  } catch (err) {
    console.error('Error in scrapePropertyUrl:', err);
    res.status(500).json({ success: false, error: 'Failed to scrape URL' });
  }
};
