import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";

console.log("🔄 Starting server initialization...");

const app = express();
const PORT = process.env.PORT || 3000;

console.log(`📍 Port configured: ${PORT}`);
console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);

// CORS Configuration for Railway + cPanel setup
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://themosthigh.co.za',
    'http://themosthigh.co.za',
    'https://www.themosthigh.co.za',
    'http://www.themosthigh.co.za',
    'http://localhost:3000',
    'http://127.0.0.1:3000'
  ];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, admin-password, Cookie');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: false }));

console.log("✅ Express middleware configured");

// Health check endpoint for Railway
app.get('/health', (req, res) => {
  console.log("💓 Health check requested");
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

console.log("✅ Health check endpoint configured");

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'railway-secret-key',
  resave: false,
  saveUninitialized: false,
  name: 'tmh.session',
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
    maxAge: 24 * 60 * 60 * 1000 // 24 hours
  }
}));

console.log("✅ Session middleware configured");

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse).slice(0, 100)}...`;
      }
      console.log(`[express] ${logLine}`);
    }
  });

  next();
});

console.log("✅ Logging middleware configured");

// Fallback route registration in case registerRoutes fails
app.get('/', (req, res) => {
  res.json({ 
    status: 'Server is running',
    message: 'The Most High API',
    timestamp: new Date().toISOString()
  });
});

async function startServer() {
  try {
    console.log("🔄 Attempting to register routes...");
    
    // Try to import and register routes
    let server = app;
    try {
      const { registerRoutes } = await import("./routes");
      console.log("✅ Routes module imported successfully");
      server = await registerRoutes(app);
      console.log("✅ Routes registered successfully");
    } catch (routeError) {
      console.error("⚠️  Routes registration failed:", routeError);
      console.log("🔄 Continuing with basic server setup...");
      
      // Add a basic API route as fallback
      app.get('/api/status', (req, res) => {
        res.json({ 
          status: 'API running in fallback mode',
          error: 'Routes not loaded',
          timestamp: new Date().toISOString()
        });
      });
    }
    
    console.log(`🔄 Starting server on port ${PORT}...`);
    
    const httpServer = server.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📡 Health check: http://localhost:${PORT}/health`);
      console.log(`🌐 Server accessible at: http://0.0.0.0:${PORT}`);
      console.log(`🌿 API ready for The Most High dispensary`);
    });

    // Handle server errors
    httpServer.on('error', (error: any) => {
      console.error("❌ Server error:", error);
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      }
      process.exit(1);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('📴 SIGTERM received. Shutting down gracefully...');
      httpServer.close(() => {
        console.log('✅ Server closed.');
        process.exit(0);
      });
    });

  } catch (error) {
    console.error("❌ Failed to start server:", error);
    console.error("❌ Stack trace:", error instanceof Error ? error.stack : 'Unknown error');
    process.exit(1);
  }
}

console.log("🔄 Calling startServer...");
startServer();
