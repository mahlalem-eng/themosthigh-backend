// server/index.ts
import express from "express";
import session from "express-session";

// server/routes.ts
import { createServer } from "http";

// server/storage.ts
import {
  users,
  products,
  cartItems,
  orders,
  orderItems,
  membershipApplications,
  sales
} from "@shared/schema";

// server/db.ts
import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "@shared/schema";
neonConfig.webSocketConstructor = ws;
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var pool = new Pool({ connectionString: process.env.DATABASE_URL });
var db = drizzle({ client: pool, schema });

// server/storage.ts
import { eq, and, sql } from "drizzle-orm";
var DatabaseStorage = class {
  guestCartItems = [];
  // User operations
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByUsername(username) {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }
  async createUser(insertUser) {
    const [user] = await db.insert(users).values(insertUser).returning();
    return user;
  }
  // Product operations
  async getAllProducts() {
    return await db.select().from(products);
  }
  async getProduct(id) {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }
  async createProduct(product) {
    const [newProduct] = await db.insert(products).values(product).returning();
    return newProduct;
  }
  async updateProduct(id, updates) {
    const [updatedProduct] = await db.update(products).set(updates).where(eq(products.id, id)).returning();
    return updatedProduct;
  }
  async deleteProduct(id) {
    await db.delete(products).where(eq(products.id, id));
  }
  // Cart operations
  async getCartItems(userId) {
    if (userId === "guest") {
      const cartWithProducts = await Promise.all(
        this.guestCartItems.map(async (item) => {
          const product = await this.getProduct(item.productId);
          if (!product) throw new Error("Product not found");
          return { ...item, product };
        })
      );
      return cartWithProducts;
    }
    return await db.select({
      id: cartItems.id,
      userId: cartItems.userId,
      productId: cartItems.productId,
      quantity: cartItems.quantity,
      createdAt: cartItems.createdAt,
      product: products
    }).from(cartItems).innerJoin(products, eq(cartItems.productId, products.id)).where(eq(cartItems.userId, userId));
  }
  async addToCart(item) {
    if (item.userId === "guest") {
      const existingItemIndex = this.guestCartItems.findIndex(
        (cartItem) => cartItem.productId === item.productId
      );
      if (existingItemIndex >= 0) {
        this.guestCartItems[existingItemIndex].quantity += item.quantity || 1;
        return this.guestCartItems[existingItemIndex];
      } else {
        const newItem = {
          id: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: "guest",
          productId: item.productId,
          quantity: item.quantity || 1,
          createdAt: /* @__PURE__ */ new Date()
        };
        this.guestCartItems.push(newItem);
        return newItem;
      }
    }
    const [existingItem] = await db.select().from(cartItems).where(and(
      eq(cartItems.userId, item.userId),
      eq(cartItems.productId, item.productId)
    ));
    if (existingItem) {
      const [updatedItem] = await db.update(cartItems).set({ quantity: existingItem.quantity + (item.quantity || 1) }).where(eq(cartItems.id, existingItem.id)).returning();
      return updatedItem;
    } else {
      const [newItem] = await db.insert(cartItems).values(item).returning();
      return newItem;
    }
  }
  async updateCartItem(id, quantity) {
    const guestItemIndex = this.guestCartItems.findIndex((item) => item.id === id);
    if (guestItemIndex >= 0) {
      this.guestCartItems[guestItemIndex].quantity = quantity;
      return this.guestCartItems[guestItemIndex];
    }
    const [updatedItem] = await db.update(cartItems).set({ quantity }).where(eq(cartItems.id, id)).returning();
    return updatedItem;
  }
  async removeFromCart(id) {
    const guestItemIndex = this.guestCartItems.findIndex((item) => item.id === id);
    if (guestItemIndex >= 0) {
      this.guestCartItems.splice(guestItemIndex, 1);
      return;
    }
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }
  async clearCart(userId) {
    if (userId === "guest") {
      this.guestCartItems = [];
      return;
    }
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }
  // Order operations
  async createOrder(order) {
    const [newOrder] = await db.insert(orders).values(order).returning();
    return newOrder;
  }
  async addOrderItem(item) {
    const [newItem] = await db.insert(orderItems).values(item).returning();
    return newItem;
  }
  async getUserOrders(userId) {
    return await db.select().from(orders).where(eq(orders.userId, userId));
  }
  async getOrder(id) {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }
  // Membership application operations
  async createMembershipApplication(application) {
    const applicationData = {
      ...application,
      id: `membership_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: "pending"
    };
    const [membershipApp] = await db.insert(membershipApplications).values(applicationData).returning();
    return membershipApp;
  }
  async getMembershipApplications() {
    return await db.select().from(membershipApplications);
  }
  async getMembershipApplication(id) {
    const [application] = await db.select().from(membershipApplications).where(eq(membershipApplications.id, id));
    return application;
  }
  async updateMembershipApplicationStatus(id, status) {
    let updateData = {
      status,
      reviewedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    if (status === "approved") {
      const year = (/* @__PURE__ */ new Date()).getFullYear();
      const memberCount = await db.select({ count: sql`count(*)` }).from(membershipApplications).where(eq(membershipApplications.status, "approved"));
      const memberNumber = `MS-${year}-${String((memberCount[0].count || 0) + 1).padStart(3, "0")}`;
      updateData = {
        ...updateData,
        memberNumber,
        membershipTier: "GOLD",
        memberSince: /* @__PURE__ */ new Date(),
        expiryDate: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1e3),
        // 6 months from now (6 * 30 days)
        cardGenerated: true,
        qrCodeData: JSON.stringify({
          memberId: memberNumber,
          issued: (/* @__PURE__ */ new Date()).toISOString(),
          tier: "GOLD"
        })
      };
    }
    const [application] = await db.update(membershipApplications).set(updateData).where(eq(membershipApplications.id, id)).returning();
    return application;
  }
  async deleteMembershipApplication(id) {
    await db.delete(membershipApplications).where(eq(membershipApplications.id, id));
  }
  // EFT order operations
  async createEFTOrder(orderData) {
    const orderToInsert = {
      id: `eft_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: null,
      // Allow null for guest orders to avoid foreign key constraint issues
      total: orderData.total.toString(),
      status: orderData.status || "pending_payment",
      customerInfo: {
        name: orderData.customerInfo?.name || "",
        email: orderData.customerInfo?.email || "",
        phone: orderData.customerInfo?.phone || "",
        address: orderData.customerInfo?.address || "",
        orderReference: orderData.orderReference
      }
    };
    const [newOrder] = await db.insert(orders).values(orderToInsert).returning();
    return newOrder;
  }
  async updateEFTOrderStatus(orderReference, status) {
    const [order] = await db.select().from(orders).where(sql`customer_info->>'orderReference' = ${orderReference}`);
    if (!order) throw new Error("EFT order not found");
    await db.update(orders).set({ status }).where(eq(orders.id, order.id));
  }
  async getEFTOrders() {
    const eftOrders = await db.select().from(orders).where(sql`status IN ('pending_payment', 'payment_submitted', 'payment_confirmed')`);
    return eftOrders;
  }
  async clearProducts() {
    await db.delete(products);
  }
};
var storage = new DatabaseStorage();

// server/routes.ts
import { sales as sales2, membershipApplications as membershipApplications2 } from "@shared/schema";
import { and as and2, sql as sql2, or, eq as eq2 } from "drizzle-orm";
import { insertProductSchema, insertOrderSchema, insertMembershipApplicationSchema } from "@shared/schema";
import Stripe from "stripe";
var stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: "2025-07-30.basil" }) : null;
async function registerRoutes(app2) {
  app2.get("/api/products", async (req, res) => {
    try {
      const products2 = await storage.getAllProducts();
      res.json(products2);
    } catch (error) {
      console.error("Error fetching products:", error);
      res.status(500).json({ message: "Failed to fetch products" });
    }
  });
  app2.get("/api/products/:id", async (req, res) => {
    try {
      const product = await storage.getProduct(req.params.id);
      if (!product) {
        return res.status(404).json({ message: "Product not found" });
      }
      res.json(product);
    } catch (error) {
      console.error("Error fetching product:", error);
      res.status(500).json({ message: "Failed to fetch product" });
    }
  });
  app2.post("/api/products", async (req, res) => {
    try {
      const validatedData = insertProductSchema.parse(req.body);
      const product = await storage.createProduct(validatedData);
      res.status(201).json(product);
    } catch (error) {
      console.error("Error creating product:", error);
      res.status(500).json({ message: "Failed to create product" });
    }
  });
  app2.get("/api/cart", async (req, res) => {
    try {
      const userId = "guest";
      const cartItems2 = await storage.getCartItems(userId);
      res.json(cartItems2);
    } catch (error) {
      console.error("Error fetching cart:", error);
      res.status(500).json({ message: "Failed to fetch cart" });
    }
  });
  app2.post("/api/cart", async (req, res) => {
    try {
      const { productId, quantity = 1 } = req.body;
      if (!productId) {
        return res.status(400).json({ message: "Product ID is required" });
      }
      const cartItem = await storage.addToCart({
        userId: "guest",
        productId,
        quantity
      });
      res.status(201).json(cartItem);
    } catch (error) {
      console.error("Error adding to cart:", error);
      res.status(500).json({ message: "Failed to add to cart" });
    }
  });
  app2.put("/api/cart/:id", async (req, res) => {
    try {
      const { quantity } = req.body;
      const cartItem = {
        id: req.params.id,
        quantity,
        userId: "guest",
        updatedAt: /* @__PURE__ */ new Date()
      };
      res.json(cartItem);
    } catch (error) {
      console.error("Error updating cart item:", error);
      res.status(500).json({ message: "Failed to update cart item" });
    }
  });
  app2.delete("/api/cart/:id", async (req, res) => {
    try {
      res.status(204).send();
    } catch (error) {
      console.error("Error removing from cart:", error);
      res.status(500).json({ message: "Failed to remove from cart" });
    }
  });
  app2.delete("/api/cart", async (req, res) => {
    try {
      const userId = "guest";
      await storage.clearCart(userId);
      res.status(204).send();
    } catch (error) {
      console.error("Error clearing cart:", error);
      res.status(500).json({ message: "Failed to clear cart" });
    }
  });
  app2.post("/api/orders", async (req, res) => {
    try {
      const userId = req.session.id || "guest";
      const { customerInfo, items } = req.body;
      const total = items.reduce((sum, item) => sum + parseFloat(item.price) * item.quantity, 0);
      const orderData = insertOrderSchema.parse({
        userId,
        total: total.toString(),
        customerInfo,
        status: "pending"
      });
      const order = await storage.createOrder(orderData);
      for (const item of items) {
        await storage.addOrderItem({
          orderId: order.id,
          productId: item.productId,
          quantity: item.quantity,
          price: item.price
        });
      }
      await storage.clearCart(userId);
      res.status(201).json(order);
    } catch (error) {
      console.error("Error creating order:", error);
      res.status(500).json({ message: "Failed to create order" });
    }
  });
  app2.get("/api/orders", async (req, res) => {
    try {
      const userId = req.session.id || "guest";
      const orders2 = await storage.getUserOrders(userId);
      res.json(orders2);
    } catch (error) {
      console.error("Error fetching orders:", error);
      res.status(500).json({ message: "Failed to fetch orders" });
    }
  });
  const requireAdmin = (req, res, next) => {
    const adminPassword = req.headers["admin-password"];
    if (adminPassword !== "TMH2025!Admin") {
      return res.status(401).json({ message: "Unauthorized: Admin access required" });
    }
    next();
  };
  app2.post("/api/membership-applications", async (req, res) => {
    try {
      const validatedData = insertMembershipApplicationSchema.parse(req.body);
      const application = await storage.createMembershipApplication(validatedData);
      res.status(201).json(application);
    } catch (error) {
      console.error("Error creating membership application:", error);
      res.status(500).json({ message: "Failed to create membership application" });
    }
  });
  app2.get("/api/membership-applications", requireAdmin, async (req, res) => {
    try {
      const applications = await storage.getMembershipApplications();
      res.json(applications);
    } catch (error) {
      console.error("Error fetching membership applications:", error);
      res.status(500).json({ message: "Failed to fetch membership applications" });
    }
  });
  app2.get("/api/membership-applications/:id", requireAdmin, async (req, res) => {
    try {
      const application = await storage.getMembershipApplication(req.params.id);
      if (!application) {
        return res.status(404).json({ message: "Membership application not found" });
      }
      res.json(application);
    } catch (error) {
      console.error("Error fetching membership application:", error);
      res.status(500).json({ message: "Failed to fetch membership application" });
    }
  });
  app2.patch("/api/membership-applications/:id/status", requireAdmin, async (req, res) => {
    try {
      const { status } = req.body;
      if (!["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be pending, approved, or rejected" });
      }
      const application = await storage.updateMembershipApplicationStatus(req.params.id, status);
      res.json(application);
    } catch (error) {
      console.error("Error updating membership application status:", error);
      res.status(500).json({ message: "Failed to update membership application status" });
    }
  });
  app2.patch("/api/membership-applications/:id", requireAdmin, async (req, res) => {
    try {
      const { status, notes, reviewedBy, reviewedAt } = req.body;
      if (status && !["pending", "approved", "rejected"].includes(status)) {
        return res.status(400).json({ message: "Invalid status. Must be pending, approved, or rejected" });
      }
      const application = await storage.updateMembershipApplicationStatus(req.params.id, status);
      if (status === "approved" && application.memberNumber) {
        console.log(`\u2705 MEMBER APPROVED: ${application.firstName} ${application.lastName}`);
        console.log(`\u{1F4E7} Member Number: ${application.memberNumber}`);
        console.log(`\u{1F3AB} Portal Access: /member-portal`);
        console.log(`\u{1F4E9} Email: ${application.email}`);
      }
      res.json(application);
    } catch (error) {
      console.error("Error updating membership application:", error);
      res.status(500).json({ message: "Failed to update membership application" });
    }
  });
  app2.delete("/api/membership-applications/:id", requireAdmin, async (req, res) => {
    try {
      await storage.deleteMembershipApplication(req.params.id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting membership application:", error);
      res.status(500).json({ message: "Failed to delete membership application" });
    }
  });
  app2.get("/api/member-lookup", async (req, res) => {
    try {
      const query = req.query.q;
      if (!query) {
        return res.status(400).json({ message: "Search query is required" });
      }
      const [member] = await db.select().from(membershipApplications2).where(
        and2(
          eq2(membershipApplications2.status, "approved"),
          or(
            eq2(membershipApplications2.memberNumber, query),
            eq2(membershipApplications2.email, query.toLowerCase())
          )
        )
      ).limit(1);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      res.json(member);
    } catch (error) {
      console.error("Error looking up member:", error);
      res.status(500).json({ message: "Failed to lookup member" });
    }
  });
  app2.get("/api/member-verify", async (req, res) => {
    try {
      const memberNumber = req.query.memberNumber;
      if (!memberNumber) {
        return res.status(400).json({ message: "Member number is required" });
      }
      const [member] = await db.select().from(membershipApplications2).where(
        and2(
          eq2(membershipApplications2.status, "approved"),
          eq2(membershipApplications2.memberNumber, memberNumber)
        )
      ).limit(1);
      if (!member) {
        return res.status(404).json({ message: "Member not found" });
      }
      res.json(member);
    } catch (error) {
      console.error("Error verifying member:", error);
      res.status(500).json({ message: "Failed to verify member" });
    }
  });
  app2.post("/api/pos/sales", async (req, res) => {
    try {
      const saleData = req.body;
      console.log("POS Sale processed:", {
        total: saleData.total,
        items: saleData.items.length,
        customer: saleData.customerName,
        payment: saleData.paymentMethod,
        timestamp: saleData.timestamp
      });
      const saleItems = saleData.items.map((cartItem) => ({
        productId: cartItem.item.id,
        quantity: cartItem.quantity,
        price: parseFloat(cartItem.item.price),
        name: cartItem.item.name
      }));
      const [sale] = await db.insert(sales2).values({
        total: saleData.total.toString(),
        customerName: saleData.customerName || null,
        paymentMethod: saleData.paymentMethod,
        items: saleItems,
        timestamp: /* @__PURE__ */ new Date()
      }).returning();
      for (const cartItem of saleData.items) {
        const productId = cartItem.item.id;
        const quantitySold = cartItem.quantity;
        try {
          const product = await storage.getProduct(productId);
          if (product) {
            const currentStock = product.stock || 0;
            const newStock = Math.max(0, currentStock - quantitySold);
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
        message: "Sale processed successfully and inventory updated"
      });
    } catch (error) {
      console.error("Error processing POS sale:", error);
      res.status(500).json({ error: "Failed to process sale" });
    }
  });
  app2.get("/api/pos/sales", async (req, res) => {
    try {
      const today = /* @__PURE__ */ new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const todaySales = await db.select().from(sales2).where(
        and2(
          sql2`${sales2.timestamp} >= ${today.toISOString()}`,
          sql2`${sales2.timestamp} < ${tomorrow.toISOString()}`
        )
      );
      const todayTotal = todaySales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
      const todayCount = todaySales.length;
      const averageSale = todayCount > 0 ? todayTotal / todayCount : 0;
      res.json({
        todayTotal,
        todayCount,
        averageSale
      });
    } catch (error) {
      console.error("Error fetching POS sales stats:", error);
      res.status(500).json({ error: "Failed to fetch sales stats" });
    }
  });
  app2.patch("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const updates = req.body;
      const updatedProduct = await storage.updateProduct(id, updates);
      res.json(updatedProduct);
    } catch (error) {
      console.error("Error updating product:", error);
      res.status(500).json({ error: "Failed to update product" });
    }
  });
  app2.delete("/api/products/:id", async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteProduct(id);
      res.status(204).send();
    } catch (error) {
      console.error("Error deleting product:", error);
      res.status(500).json({ error: "Failed to delete product" });
    }
  });
  app2.post("/api/create-payment-intent", async (req, res) => {
    if (!stripe) {
      return res.status(500).json({
        message: "Payment processing not available. Stripe keys not configured."
      });
    }
    try {
      const { amount } = req.body;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount * 100),
        // Convert to cents
        currency: "zar",
        // South African Rand
        metadata: {
          source: "most_high_dispensary"
        }
      });
      res.json({ clientSecret: paymentIntent.client_secret });
    } catch (error) {
      console.error("Error creating payment intent:", error);
      res.status(500).json({
        message: "Error creating payment intent: " + error.message
      });
    }
  });
  app2.post("/api/eft-orders", async (req, res) => {
    try {
      const userId = req.session.id || "guest";
      const { orderReference, customerInfo, items, totalAmount, paymentMethod } = req.body;
      const orderData = {
        userId,
        total: totalAmount.toString(),
        customerInfo: JSON.stringify(customerInfo),
        status: "pending_payment",
        paymentMethod: "EFT",
        orderReference,
        createdAt: (/* @__PURE__ */ new Date()).toISOString()
      };
      const order = await storage.createEFTOrder(orderData);
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
      console.error("Error creating EFT order:", error);
      res.status(500).json({ message: "Failed to create EFT order" });
    }
  });
  app2.post("/api/eft-orders/confirm-payment", async (req, res) => {
    try {
      const { orderReference, paymentProof } = req.body;
      await storage.updateEFTOrderStatus(orderReference, "payment_submitted");
      res.json({
        success: true,
        message: "Payment proof submitted. Order will be verified within 2-4 hours."
      });
    } catch (error) {
      console.error("Error confirming EFT payment:", error);
      res.status(500).json({ message: "Failed to confirm payment" });
    }
  });
  app2.get("/api/eft-orders", async (req, res) => {
    try {
      const orders2 = await storage.getEFTOrders();
      res.json(orders2);
    } catch (error) {
      console.error("Error fetching EFT orders:", error);
      res.status(500).json({ message: "Failed to fetch EFT orders" });
    }
  });
  app2.put("/api/eft-orders/:reference/status", async (req, res) => {
    try {
      const { reference } = req.params;
      const { status } = req.body;
      await storage.updateEFTOrderStatus(reference, status);
      res.json({ success: true, message: `Order ${reference} status updated to ${status}` });
    } catch (error) {
      console.error("Error updating EFT order status:", error);
      res.status(500).json({ message: "Failed to update order status" });
    }
  });
  app2.post("/api/admin/force-refresh-products", async (req, res) => {
    try {
      await storage.clearProducts();
      const { forceSeedProducts } = await import("./seed");
      await forceSeedProducts();
      res.json({ message: "Products force refreshed successfully" });
    } catch (error) {
      console.error("Error force refreshing products:", error);
      res.status(500).json({ error: "Failed to force refresh products" });
    }
  });
  const httpServer = createServer(app2);
  return httpServer;
}

// server/index.ts
var app = express();
var PORT = process.env.PORT || 3e3;
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    "https://themosthigh.co.za",
    "http://themosthigh.co.za",
    "https://www.themosthigh.co.za",
    "http://www.themosthigh.co.za",
    "http://localhost:3000",
    "http://127.0.0.1:3000"
  ];
  if (origin && allowedOrigins.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
  } else {
    res.header("Access-Control-Allow-Origin", "*");
  }
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization, admin-password, Cookie");
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: (/* @__PURE__ */ new Date()).toISOString() });
});
app.use(session({
  secret: process.env.SESSION_SECRET || "railway-secret-key",
  resave: false,
  saveUninitialized: false,
  name: "tmh.session",
  cookie: {
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
    maxAge: 24 * 60 * 60 * 1e3
    // 24 hours
  }
}));
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse = void 0;
  const originalResJson = res.json;
  res.json = function(bodyJson, ...args) {
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
async function startServer() {
  try {
    const server = await registerRoutes(app);
    server.listen(PORT, "0.0.0.0", () => {
      console.log(`\u{1F680} Server running on port ${PORT}`);
      console.log(`\u{1F4E1} Health check: http://localhost:${PORT}/health`);
      console.log(`\u{1F33F} API ready for The Most High dispensary`);
    });
  } catch (error) {
    console.error("\u274C Failed to start server:", error);
    process.exit(1);
  }
}
startServer();
