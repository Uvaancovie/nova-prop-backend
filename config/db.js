const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // Performance optimizations
      maxPoolSize: 100,
      minPoolSize: 5,
      socketTimeoutMS: 45000,
      // Cache optimizations
      readPreference: 'nearest'
    });
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
