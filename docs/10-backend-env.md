# Backend Environment (Render)

Render Service: nova-prop-backend (Node Web Service)

Required env vars:
- PAYFAST_MODE=<sandbox|live>
- PAYFAST_MERCHANT_ID=<set in Render>
- PAYFAST_MERCHANT_KEY=<set in Render>
- PAYFAST_PASSPHRASE=<set in Render>
- APP_BASE_URL=https://www.nova-prop.com
- API_BASE_URL=https://nova-prop-backend.onrender.com
- MONGO_URI=<mongo connection string>
- JWT_SECRET=<strong random secret>
- JWT_EXPIRE=30d

CORS:
- Allow origin https://www.nova-prop.com with credentials.
