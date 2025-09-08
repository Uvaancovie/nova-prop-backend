#!/bin/bash

# PropStream Backend Setup Script
echo "🚀 Setting up PropStream Backend Environment..."

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create environment file if not exists
if [ ! -f .env ]; then
  echo "🔧 Creating .env file..."
  echo "PORT=4000
MONGO_URI=mongodb+srv://way2flyagency:way2flymillionaire@mern.7txgf4m.mongodb.net/propstream
JWT_SECRET=propstream_secure_jwt_secret_key_2025
JWT_EXPIRE=30d
CORS_ORIGIN=http://localhost:5173" > .env
  echo "✅ Created .env file"
else
  echo "ℹ️ .env file already exists"
fi

# Create uploads directory if not exists
if [ ! -d uploads ]; then
  echo "📁 Creating uploads directory..."
  mkdir -p uploads/invoices
  echo "✅ Created uploads directory"
else
  echo "ℹ️ uploads directory already exists"
fi

echo "🎉 Setup complete! You can now start the server with:"
echo "   npm run dev"
