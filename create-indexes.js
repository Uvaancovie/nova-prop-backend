// MongoDB Index Creation Script for Node.js
const mongoose = require('mongoose');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Connect to MongoDB
const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI);
    console.log(`MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error('MongoDB connection error:', error);
    process.exit(1);
  }
};

// Create the text index
const createIndexes = async () => {
  try {
    await connectDB();
    
    // Get the properties collection
    const db = mongoose.connection.db;
    const collection = db.collection('properties');
    
    // Create text index
    const result = await collection.createIndex({
      "name": "text",
      "description": "text", 
      "city": "text",
      "amenities": "text"
    }, {
      name: "property_text_search"
    });
    
    console.log('Text index created successfully:', result);
    
    // List all indexes to verify
    const indexes = await collection.indexes();
    console.log('All indexes on properties collection:');
    indexes.forEach(index => {
      console.log(' -', index.name, ':', Object.keys(index.key).join(', '));
    });
    
  } catch (error) {
    console.error('Error creating indexes:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
};

// Run the script
createIndexes();
