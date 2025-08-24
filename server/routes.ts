import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { db } from "./db";
import { sales, membershipApplications } from "../shared/schema";
import { and, sql, or, eq } from "drizzle-orm";
import { insertProductSchema, insertCartItemSchema, insertOrderSchema, insertMembershipApplicationSchema } from "../shared/schema";
//import { ObjectStorageService, ObjectNotFoundError } from "./objectStorage";
import Stripe from "stripe";

// Initialize Stripe with fallback for development
const stripe = process.env.STRIPE_SECRET_KEY 
  ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-07-30.basil" })
  : null;

export async function registerRoutes(app: Express): Promise<Server> {
  
  // Product routes
  app.get('/api/products', async (req, res) => {
    try {
      const products = await storage.getAllProducts();
      res.json(products);
    } catch (error) {
      console.error('Error fetching products:', error);
      res.status(500).json({ message: 'Failed to fetch products' });
    }
  });

  app.get('/api/products/:id', async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: 'Product not found' });
      }
      res.json(product);
    } catch (error) {
      console.error('Error fetching product:', error);
      res.status(500).json({ message: 'Failed to fetch product' });
    }
  });

  app.post('/api/products', async (req, res) => {
    try {
      const validatedData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validatedData);
      res.status(201).json(product);
    } catch (error) {
      console.error('Error creating product:', error);
      res.status(500).json({ message: 'Failed to create product' });
    }
  });

  // Cart routes
  app.get('/api/cart', async (req, res) => {
    try {
      const userId = 'guest'; // Use guest mode until user auth is implemented
      const cartItems = await storage.getCartItems(userId);
      res.json(cartItems);
    } catch (error) {
      console.error('Error fetching cart:', error);
      res.status(500).json({ message: 'Failed to fetch cart' });
    }
  });

  app.post('/api/cart', async (req, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      
      if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
      }

      const cartItem = await storage.addToCart({
        userId: 'guest',
        productId,
        quantity
      });
      
      res.status(201).json(cartItem);
    } catch (error) {
      console.error('Error adding to cart:', error);
      res.status(500).json({ message: 'Failed to add to cart' });
    }
  });

  app.put('/api/cart/:id', async (req, res) => {
    try {
      // Mock cart update until user auth is implemented
      const { quantity } = req.body;
      const cartItem = {
        id: req.params.id,
        quantity,
        userId: "guest",
        updatedAt: new Date()
      };
      res.json(cartItem);
    } catch (error) {
      console.error('Error updating cart item:', error);
      res.status(500).json({ message: 'Failed to update cart item' });
    }
  });

  app.delete('/api/cart/:id', async (req, res) => {
    try {
      // Mock cart item removal until user auth is implemented
      res.status(204).send();
    } catch (error) {
      console.error('Error removing from cart:', error);
      res.status(500).json({ message: 'Failed to remove from cart' });
    }
  });

  app.delete('/api/cart', async (req, res) => {
    try {
      const userId = 'guest';
      await storage.clearCart(userId);
      res.status(204).send();
    } catch (error) {
      console.error('Error clearing cart:', error);
      res.status(500).json({ message: 'Failed to clear cart' });
    }
  });

  // Order routes
  app.post('/api/orders', async (req, res) => {
    try {
      const userId = req.session.id || 'guest';
      const { customerInfo, items } = req.body;
      
      // Calculate total
      const total = items.reduce((sum: number, item: any) => sum + (parseFloat(item.price) * item.quantity), 0);
      
      // Create order
      const orderData = insertOrderSchema.parse({
        userId,
        total: total.toString(),
        customerInfo,
        status: 'pending'
      });
      
      const order = await storage.createOrder(orderData);
      
      // Add order items
      for (const item of items) {
        await storage.addOrderItem({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        });
      }
      
      // Clear cart after successful order
      await storage.clearCart(userId);
      
      res.status(201).json(order);
    } catch (error) {
      console.error('Error creating order:', error);
      res.status(500).json({ message: 'Failed to create order' });
    }
  });

  app.get('/api/orders', async (req, res) => {
    try {
      const userId = req.session.id || 'guest';
      const orders = await storage.getUserOrders(userId);
      res.json(orders);
    } catch (error) {
      console.error('Error fetching orders:', error);
      res.status(500).json({ message: 'Failed to fetch orders' });
    }
  });

  // Simple admin authentication middleware
  const requireAdmin = (req: any, res: any, next: any) => {
    const adminPassword = req.headers['admin-password'];
    if (adminPassword !== 'TMH2025!Admin') {
      return res.status(401).json({ message: 'Unauthorized: Admin access required' });
    }
    next();
  };

  // Membership application routes
  app.post('/api/membership-applications', async (req, res) => {
    try {
      const validatedData = insertMembershipApplicationSchema.parse(req.body);
      const application = await storage.createMembershipApplication(validatedData);
      res.status(201).json(application);
    } catch (error) {
      console.error('Error creating membership application:', error);
      res.status(500).json({ message: 'Failed to create membership application' });
    }
  });

  app.get('/api/membership-applications', requireAdmin, async (req, res) => {
    try {
      const applications = await storage.getMembershipApplications();
      res.json(applications);
    } catch (error) {
      console.error('Error fetching membership applications:', error);
      res.status(500).json({ message: 'Failed to fetch membership applications' });
    }
  });

  app.get('/api/membership-applications/:id', requireAdmin, async (req, res) => {
    try {
      const application = await storage.getMembershipApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ message: 'Membership application not found' });
      }
      res.json(application);
    } catch (error) {
      console.error('Error fetching membership application:', error);
      res.status(500).json({ message: 'Failed to fetch membership application' });
    }
  });

  app.patch('/api/membership-applications/:id/status', requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be pending, approved, or rejected' });
      }
      
      const application = await storage.updateMembershipApplicationStatus(req.params.id, status);
      res.json(application);
    } catch (error) {
      console.error('Error updating membership application status:', error);
      res.status(500).json({ message: 'Failed to update membership application status' });
    }
  });

  // Alternative PATCH route for direct application updates (matches frontend call)
  app.patch('/api/membership-applications/:id', requireAdmin, async (req, res) => {
    try {
      const { status, notes, reviewedBy, reviewedAt } = req.body;
      
      if (status && !['pending', 'approved', 'rejected'].includes(status)) {
        return res.status(400).json({ message: 'Invalid status. Must be pending, approved, or rejected' });
      }
      
      const application = await storage.updateMembershipApplicationStatus(req.params.id, status);
      
      // If application was approved, send member their info
      if (status === 'approved' && application.memberNumber) {
        console.log(`✅ MEMBER APPROVED: ${application.firstName} ${application.lastName}`);
        console.log(`📧 Member Number: ${application.memberNumber}`);
        console.log(`🎫 Portal Access: /member-portal`);
        console.log(`📩 Email: ${application.email}`);
        
        // TODO: Add email notification here
        // sendMemberApprovalEmail({
        //   email: application.email,
        //   firstName: application.firstName,
        //   lastName: application.lastName,
        //   memberNumber: application.memberNumber,
        //   portalUrl: `${process.env.DOMAIN || 'https://your-domain.com'}/member-portal`
        // });
      }
      
      res.json(application);
    } catch (error) {
      console.error('Error updating membership application:', error);
      res.status(500).json({ message: 'Failed to update membership application' });
    }
  });

  app.delete('/api/membership-applications/:id', requireAdmin, async (req, res) => {
    try {
      await storage.deleteMembershipApplication(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting membership application:', error);
      res.status(500).json({ message: 'Failed to delete membership application' });
    }
  });

  // Member portal lookup route
  app.get('/api/member-lookup', async (req, res) => {
    try {
      const query = req.query.q as string;
      if (!query) {
        return res.status(400).json({ message: 'Search query is required' });
      }

      // Search by member number or email
      const [member] = await db
        .select()
        .from(membershipApplications)
        .where(
          and(
            eq(membershipApplications.status, 'approved'),
            or(
              eq(membershipApplications.memberNumber, query),
              eq(membershipApplications.email, query.toLowerCase())
            )
          )
        )
        .limit(1);

      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }

      res.json(member);
    } catch (error) {
      console.error('Error looking up member:', error);
      res.status(500).json({ message: 'Failed to lookup member' });
    }
  });

  // Member verification route for staff
  app.get('/api/member-verify', async (req, res) => {
    try {
      const memberNumber = req.query.memberNumber as string;
      if (!memberNumber) {
        return res.status(400).json({ message: 'Member number is required' });
      }

      // Search by member number only
      const [member] = await db
        .select()
        .from(membershipApplications)
        .where(
          and(
            eq(membershipApplications.status, 'approved'),
            eq(membershipApplications.memberNumber, memberNumber)
          )
        )
        .limit(1);

      if (!member) {
        return res.status(404).json({ message: 'Member not found' });
      }

      res.json(member);
    } catch (error) {
      console.error('Error verifying member:', error);
      res.status(500).json({ message: 'Failed to verify member' });
    }
  });
/*
  // Object storage routes for ID document upload
  app.post("/api/objects/upload", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const uploadURL = await objectStorageService.getObjectEntityUploadURL();
      res.json({ uploadURL });
    } catch (error) {
      console.error("Error getting upload URL:", error);
      res.status(500).json({ error: "Failed to get upload URL" });
    }
  });

  app.get("/objects/:objectPath(*)", async (req, res) => {
    const objectStorageService = new ObjectStorageService();
    try {
      const objectFile = await objectStorageService.getObjectEntityFile(
        req.path,
      );
      objectStorageService.downloadObject(objectFile, res);
    } catch (error) {
      console.error("Error accessing object:", error);
      if (error instanceof ObjectNotFoundError) {
        return res.status(404).json({ error: "Object not found" });
      }
      return res.status(500).json({ error: "Internal server error" });
    }
  });
*/
  // POS System routes
  app.post('/api/pos/sales', async (req, res) => {
    try {
      const saleData = req.body;
      
      console.log('POS Sale processed:', {
        total: saleData.total,
        items: saleData.items.length,
        customer: saleData.customerName,
        payment: saleData.paymentMethod,
        timestamp: saleData.timestamp
      });

      // Save sale to database - Direct DB insert to bypass storage method issues
      const saleItems = saleData.items.map((cartItem: any) => ({
        productId: cartItem.item.id,
        quantity: cartItem.quantity,
        price: parseFloat(cartItem.item.price),
        name: cartItem.item.name
      }));

      // Direct database insert
      const [sale] = await db.insert(sales).values({
        total: saleData.total.toString(),
        customerName: saleData.customerName || null,
        paymentMethod: saleData.paymentMethod,
        items: saleItems,
        timestamp: new Date()
      }).returning();

      // Process each item and reduce stock
      for (const cartItem of saleData.items) {
        const productId = cartItem.item.id;
        const quantitySold = cartItem.quantity;
        
        try {
          // Get current product
          const product = await storage.getProduct(productId);
          if (product) {
            // Calculate new stock (ensure it doesn't go below 0)
            const currentStock = product.stock || 0;
            const newStock = Math.max(0, currentStock - quantitySold);
            
            // Update product stock in database
            await storage.updateProduct(productId, { stock: newStock });
            
            console.log(`Updated product ${product.name}: stock ${currentStock} -> ${newStock} (sold ${quantitySold})`);
          }
        } catch (error) {
          console.error(`Failed to update stock for product ${productId}:`, error);
        }
      }

      res.json({ 
        success: true, 
        saleId: sale.id,
        message: 'Sale processed successfully and inventory updated' 
      });
    } catch (error) {
      console.error('Error processing POS sale:', error);
      res.status(500).json({ error: 'Failed to process sale' });
    }
  });

  app.get('/api/pos/sales', async (req, res) => {
    try {
      // Direct database query for sales stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const todaySales = await db
        .select()
        .from(sales)
        .where(
          and(
            sql`${sales.timestamp} >= ${today.toISOString()}`,
            sql`${sales.timestamp} < ${tomorrow.toISOString()}`
          )
        );
        
      const todayTotal = todaySales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
      const todayCount = todaySales.length;
      const averageSale = todayCount > 0 ? todayTotal / todayCount : 0;
      
      res.json({
        todayTotal,
        todayCount,
        averageSale,
      });
    } catch (error) {
      console.error('Error fetching POS sales stats:', error);
      res.status(500).json({ error: 'Failed to fetch sales stats' });
    }
  });

  // Inventory management routes
  app.patch('/api/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      
      const updatedProduct = await storage.updateProduct(id, updates);
      res.json(updatedProduct);
    } catch (error) {
      console.error('Error updating product:', error);
      res.status(500).json({ error: 'Failed to update product' });
    }
  });

  app.delete('/api/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      
      await storage.deleteProduct(id);
      res.status(204).send();
    } catch (error) {
      console.error('Error deleting product:', error);
      res.status(500).json({ error: 'Failed to delete product' });
    }
  });

  // Stripe payment routes
  app.post("/api/create-payment-intent", async (req, res) => {
    if (!stripe) {
      return res.status(500).json({ 
        message: "Payment processing not available. Stripe keys not configured." 
      });
    }

    try {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100), // Convert to cents
        currency: "zar", // South African Rand
        metadata: {
          source: "most_high_dispensary"
        }
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error: any) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({ 
        message: "Error creating payment intent: " + error.message 
      });
    }
  });

  // EFT Payment routes
  app.post('/api/eft-orders', async (req, res) => {
    try {
      const userId = req.session.id || 'guest';
      const { orderReference, customerInfo, items, totalAmount, paymentMethod } = req.body;
      
      // Create EFT order with pending status
      const orderData = {
        userId,
        total: totalAmount.toString(),
        customerInfo: JSON.stringify(customerInfo),
        status: 'pending_payment',
        paymentMethod: 'EFT',
        orderReference,
        createdAt: new Date().toISOString()
      };
      
      const order = await storage.createEFTOrder(orderData);
      
      // Add order items
      for (const item of items) {
        await storage.addOrderItem({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        });
      }
      
      res.status(201).json({ 
        success: true, 
        orderId: order.id, 
        orderReference,
        message: "Order created successfully. Please complete EFT payment." 
      });
    } catch (error) {
      console.error('Error creating EFT order:', error);
      res.status(500).json({ message: 'Failed to create EFT order' });
    }
  });

  app.post('/api/eft-orders/confirm-payment', async (req, res) => {
    try {
      const { orderReference, paymentProof } = req.body;
      
      // Update order status to payment_submitted
      await storage.updateEFTOrderStatus(orderReference, 'payment_submitted');
      
      // In a real implementation, you might:
      // - Store the payment proof file
      // - Send notification to admin
      // - Log the payment submission
      
      res.json({ 
        success: true, 
        message: "Payment proof submitted. Order will be verified within 2-4 hours." 
      });
    } catch (error) {
      console.error('Error confirming EFT payment:', error);
      res.status(500).json({ message: 'Failed to confirm payment' });
    }
  });

  app.get('/api/eft-orders', async (req, res) => {
    try {
      const orders = await storage.getEFTOrders();
      res.json(orders);
    } catch (error) {
      console.error('Error fetching EFT orders:', error);
      res.status(500).json({ message: 'Failed to fetch EFT orders' });
    }
  });

  app.put('/api/eft-orders/:reference/status', async (req, res) => {
    try {
      const { reference } = req.params;
      const { status } = req.body;
      
      await storage.updateEFTOrderStatus(reference, status);
      res.json({ success: true, message: `Order ${reference} status updated to ${status}` });
    } catch (error) {
      console.error('Error updating EFT order status:', error);
      res.status(500).json({ message: 'Failed to update order status' });
    }
  });

  // Remove duplicate routes - admin authentication handled in first set of routes

  // Admin route to force refresh products
  app.post('/api/admin/force-refresh-products', async (req, res) => {
    try {
      await storage.clearProducts();
      // Import and run force seed
      const { forceSeedProducts } = await import('./seed');
      await forceSeedProducts();
      res.json({ message: 'Products force refreshed successfully' });
    } catch (error) {
      console.error('Error force refreshing products:', error);
      res.status(500).json({ error: 'Failed to force refresh products' });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
