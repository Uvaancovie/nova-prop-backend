const mongoose = require('mongoose');
const User = require('../models/User');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function makeAdmin(email) {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    
    if (!mongoUri) {
      console.error('❌ MONGO_URI not found in environment variables');
      console.log('Make sure .env file exists in backend directory');
      process.exit(1);
    }
    
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');
    
    const user = await User.findOneAndUpdate(
      { email },
      { role: 'owner' },
      { new: true }
    );
    
    if (!user) {
      console.log('❌ User not found with email:', email);
    } else {
      console.log('✅ User updated successfully:');
      console.log('   Email:', user.email);
      console.log('   Name:', user.name);
      console.log('   Role:', user.role);
    }
    
    await mongoose.connection.close();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

const email = process.argv[2];

if (!email) {
  console.log('Usage: node makeAdmin.js your-email@example.com');
  process.exit(1);
}

makeAdmin(email);
