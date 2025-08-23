# The Most High - Railway Backend

Backend API for The Most High cannabis dispensary, ready for Railway deployment.

## 🚀 Railway Deployment Steps

### 1. Prepare Repository
```bash
# Push railway-backend/ contents to a new repository
cd railway-backend/
git init
git add .
git commit -m "Railway backend ready"
git branch -M main
git remote add origin https://github.com/yourusername/themosthigh-backend.git
git push -u origin main
```

### 2. Deploy to Railway
1. Go to [railway.app](https://railway.app)
2. Connect your GitHub account
3. Create new project → Deploy from GitHub repo
4. Select your backend repository
5. Railway will auto-detect Node.js and deploy

### 3. Configure Database
1. In Railway dashboard → Add PostgreSQL service
2. Copy the `DATABASE_URL` from PostgreSQL service
3. Add to your backend service environment variables:
   - `DATABASE_URL` = (PostgreSQL connection string)
   - `NODE_ENV` = production
   - `SESSION_SECRET` = (generate secure random string)

### 4. Initialize Database
```bash
# After deployment, run this once to create tables
npm run db:push
```

### 5. Update Frontend
Copy your Railway app URL (e.g., `https://yourapp.railway.app`) and update the frontend:
```javascript
const API_BASE_URL = 'https://yourapp.railway.app';
```

## 🔧 Configuration

### Environment Variables
- `DATABASE_URL` - PostgreSQL connection string (from Railway)
- `NODE_ENV` - Set to "production"
- `SESSION_SECRET` - Secure random string for sessions
- `PORT` - Automatically set by Railway

### CORS Origins
The backend allows requests from:
- `https://themosthigh.co.za`
- `http://themosthigh.co.za`
- `https://www.themosthigh.co.za`
- `http://www.themosthigh.co.za`

## 📁 Project Structure

```
railway-backend/
├── server/
│   ├── index.ts        # Main server file
│   ├── routes.ts       # API routes
│   ├── storage.ts      # Data storage layer
│   └── db.ts          # Database connection
├── shared/
│   └── schema.ts      # Database schema
├── package.json       # Dependencies
├── drizzle.config.ts  # Database config
└── railway.json       # Railway config
```

## 🌐 API Endpoints

- `GET /health` - Health check
- `GET /api/products` - Get all products
- `POST /api/cart/add` - Add item to cart
- `GET /api/cart` - Get cart items
- `POST /api/orders` - Create order
- `POST /api/members/apply` - Membership application

## 🛠 Development

```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Update database schema
npm run db:push
```

## 🎯 Next Steps After Deployment

1. ✅ Deploy backend to Railway
2. ✅ Configure database and environment variables
3. ✅ Update frontend with Railway URL
4. ✅ Upload frontend to cPanel
5. ✅ Test API connection
6. ✅ Verify all functionality works

## 🔗 Frontend Files

Use `railway-frontend-standalone.html` as your cPanel frontend - it's configured to work with this Railway backend.

## 📞 Support

This backend includes:
- Product management
- Shopping cart functionality
- Member portal
- Order processing
- WhatsApp integration
- EFT payment support
- POS system access

All configured for themosthigh.co.za domain with proper CORS settings.