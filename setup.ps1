# PropStream Backend Setup Script for Windows
Write-Host "🚀 Setting up PropStream Backend Environment..." -ForegroundColor Cyan

# Install dependencies
Write-Host "📦 Installing dependencies..." -ForegroundColor Yellow
npm install

# Create environment file if not exists
if (-not (Test-Path .env)) {
  Write-Host "🔧 Creating .env file..." -ForegroundColor Yellow
  Set-Content -Path .env -Value @"
PORT=4000
MONGO_URI=mongodb+srv://way2flyagency:way2flymillionaire@mern.7txgf4m.mongodb.net/propstream
JWT_SECRET=propstream_secure_jwt_secret_key_2025
JWT_EXPIRE=30d
CORS_ORIGIN=http://localhost:5173
"@
  Write-Host "✅ Created .env file" -ForegroundColor Green
} else {
  Write-Host "ℹ️ .env file already exists" -ForegroundColor Blue
}

# Create uploads directory if not exists
if (-not (Test-Path uploads)) {
  Write-Host "📁 Creating uploads directory..." -ForegroundColor Yellow
  New-Item -ItemType Directory -Path uploads -Force | Out-Null
  New-Item -ItemType Directory -Path uploads\invoices -Force | Out-Null
  Write-Host "✅ Created uploads directory" -ForegroundColor Green
} else {
  Write-Host "ℹ️ uploads directory already exists" -ForegroundColor Blue
}

Write-Host "🎉 Setup complete! You can now start the server with:" -ForegroundColor Cyan
Write-Host "   npm run dev" -ForegroundColor Magenta
