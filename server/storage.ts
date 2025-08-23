import {
  users,
  products,
  cartItems,
  orders,
  orderItems,
  membershipApplications,
  sales,
  type User,
  type InsertUser,
  type Product,
  type InsertProduct,
  type CartItem,
  type InsertCartItem,
  type Order,
  type InsertOrder,
  type OrderItem,
  type InsertOrderItem,
  type MembershipApplication,
  type InsertMembershipApplication,
  type Sale,
  type InsertSale,
} from "@shared/schema";
import { db } from "./db";
import { eq, and, sql } from "drizzle-orm";

export interface IStorage {
  // User operations
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;

  // Product operations
  getAllProducts(): Promise<Product[]>;
  getProduct(id: string): Promise<Product | undefined>;
  createProduct(product: InsertProduct): Promise<Product>;
  updateProduct(id: string, updates: Partial<Product>): Promise<Product>;
  deleteProduct(id: string): Promise<void>;

  // Cart operations
  getCartItems(userId: string): Promise<(CartItem & { product: Product })[]>;
  addToCart(item: InsertCartItem): Promise<CartItem>;
  updateCartItem(id: string, quantity: number): Promise<CartItem>;
  removeFromCart(id: string): Promise<void>;
  clearCart(userId: string): Promise<void>;

  // Order operations
  createOrder(order: InsertOrder): Promise<Order>;
  addOrderItem(item: InsertOrderItem): Promise<OrderItem>;
  getUserOrders(userId: string): Promise<Order[]>;
  getOrder(id: string): Promise<Order | undefined>;

  // Membership application operations
  createMembershipApplication(application: InsertMembershipApplication): Promise<MembershipApplication>;
  getMembershipApplications(): Promise<MembershipApplication[]>;
  getMembershipApplication(id: string): Promise<MembershipApplication | undefined>;
  updateMembershipApplicationStatus(id: string, status: string): Promise<MembershipApplication>;
  deleteMembershipApplication(id: string): Promise<void>;
  
  // Product management
  clearProducts(): Promise<void>;

  // EFT order operations
  createEFTOrder(order: any): Promise<any>;
  updateEFTOrderStatus(orderReference: string, status: string): Promise<void>;
  getEFTOrders(): Promise<any[]>;

  // Sales operations
  createSale(sale: InsertSale): Promise<Sale>;
  getAllSales(): Promise<Sale[]>;
  getSalesToday(): Promise<Sale[]>;
  getSalesStats(): Promise<{
    todayTotal: number;
    todayCount: number;
    averageSale: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  private guestCartItems: any[] = [];
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.username, username));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db
      .insert(users)
      .values(insertUser)
      .returning();
    return user;
  }

  // Product operations
  async getAllProducts(): Promise<Product[]> {
    return await db.select().from(products);
  }

  async getProduct(id: string): Promise<Product | undefined> {
    const [product] = await db.select().from(products).where(eq(products.id, id));
    return product;
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const [newProduct] = await db
      .insert(products)
      .values(product)
      .returning();
    return newProduct;
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const [updatedProduct] = await db
      .update(products)
      .set(updates)
      .where(eq(products.id, id))
      .returning();
    return updatedProduct;
  }

  async deleteProduct(id: string): Promise<void> {
    await db.delete(products).where(eq(products.id, id));
  }

  // Cart operations
  async getCartItems(userId: string): Promise<(CartItem & { product: Product })[]> {
    if (userId === 'guest') {
      // Return guest cart items with product details
      const cartWithProducts = await Promise.all(
        this.guestCartItems.map(async (item) => {
          const product = await this.getProduct(item.productId);
          if (!product) throw new Error('Product not found');
          return { ...item, product };
        })
      );
      return cartWithProducts;
    }
    
    return await db
      .select({
        id: cartItems.id,
        userId: cartItems.userId,
        productId: cartItems.productId,
        quantity: cartItems.quantity,
        createdAt: cartItems.createdAt,
        product: products,
      })
      .from(cartItems)
      .innerJoin(products, eq(cartItems.productId, products.id))
      .where(eq(cartItems.userId, userId));
  }

  async addToCart(item: InsertCartItem): Promise<CartItem> {
    if (item.userId === 'guest') {
      // Handle guest cart items in memory
      const existingItemIndex = this.guestCartItems.findIndex(
        cartItem => cartItem.productId === item.productId
      );
      
      if (existingItemIndex >= 0) {
        // Update quantity
        this.guestCartItems[existingItemIndex].quantity += item.quantity || 1;
        return this.guestCartItems[existingItemIndex];
      } else {
        // Add new item
        const newItem = {
          id: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          userId: 'guest',
          productId: item.productId!,
          quantity: item.quantity || 1,
          createdAt: new Date()
        };
        this.guestCartItems.push(newItem);
        return newItem;
      }
    }
    
    // Check if item already exists for authenticated users
    const [existingItem] = await db
      .select()
      .from(cartItems)
      .where(and(
        eq(cartItems.userId, item.userId!),
        eq(cartItems.productId, item.productId!)
      ));

    if (existingItem) {
      // Update quantity
      const [updatedItem] = await db
        .update(cartItems)
        .set({ quantity: existingItem.quantity + (item.quantity || 1) })
        .where(eq(cartItems.id, existingItem.id))
        .returning();
      return updatedItem;
    } else {
      // Create new cart item
      const [newItem] = await db
        .insert(cartItems)
        .values(item)
        .returning();
      return newItem;
    }
  }

  async updateCartItem(id: string, quantity: number): Promise<CartItem> {
    // Check if it's a guest cart item
    const guestItemIndex = this.guestCartItems.findIndex(item => item.id === id);
    if (guestItemIndex >= 0) {
      this.guestCartItems[guestItemIndex].quantity = quantity;
      return this.guestCartItems[guestItemIndex];
    }
    
    const [updatedItem] = await db
      .update(cartItems)
      .set({ quantity })
      .where(eq(cartItems.id, id))
      .returning();
    return updatedItem;
  }

  async removeFromCart(id: string): Promise<void> {
    // Check if it's a guest cart item
    const guestItemIndex = this.guestCartItems.findIndex(item => item.id === id);
    if (guestItemIndex >= 0) {
      this.guestCartItems.splice(guestItemIndex, 1);
      return;
    }
    
    await db.delete(cartItems).where(eq(cartItems.id, id));
  }

  async clearCart(userId: string): Promise<void> {
    if (userId === 'guest') {
      this.guestCartItems = [];
      return;
    }
    await db.delete(cartItems).where(eq(cartItems.userId, userId));
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const [newOrder] = await db
      .insert(orders)
      .values(order)
      .returning();
    return newOrder;
  }

  async addOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const [newItem] = await db
      .insert(orderItems)
      .values(item)
      .returning();
    return newItem;
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return await db.select().from(orders).where(eq(orders.userId, userId));
  }

  async getOrder(id: string): Promise<Order | undefined> {
    const [order] = await db.select().from(orders).where(eq(orders.id, id));
    return order;
  }

  // Membership application operations
  async createMembershipApplication(application: InsertMembershipApplication): Promise<MembershipApplication> {
    const applicationData = {
      ...application,
      id: `membership_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      status: 'pending'
    };
    const [membershipApp] = await db.insert(membershipApplications).values(applicationData).returning();
    return membershipApp;
  }

  async getMembershipApplications(): Promise<MembershipApplication[]> {
    return await db.select().from(membershipApplications);
  }

  async getMembershipApplication(id: string): Promise<MembershipApplication | undefined> {
    const [application] = await db.select().from(membershipApplications).where(eq(membershipApplications.id, id));
    return application;
  }

  async updateMembershipApplicationStatus(id: string, status: string): Promise<MembershipApplication> {
    let updateData: any = { 
      status, 
      reviewedAt: new Date(), 
      updatedAt: new Date() 
    };

    // Generate member card data when approved
    if (status === 'approved') {
      // Generate unique member number
      const year = new Date().getFullYear();
      const memberCount = await db.select({ count: sql<number>`count(*)` })
        .from(membershipApplications)
        .where(eq(membershipApplications.status, 'approved'));
      
      const memberNumber = `MS-${year}-${String((memberCount[0].count || 0) + 1).padStart(3, '0')}`;
      
      // Set card data
      updateData = {
        ...updateData,
        memberNumber,
        membershipTier: 'GOLD',
        memberSince: new Date(),
        expiryDate: new Date(Date.now() + 6 * 30 * 24 * 60 * 60 * 1000), // 6 months from now (6 * 30 days)
        cardGenerated: true,
        qrCodeData: JSON.stringify({
          memberId: memberNumber,
          issued: new Date().toISOString(),
          tier: 'GOLD'
        })
      };
    }

    const [application] = await db
      .update(membershipApplications)
      .set(updateData)
      .where(eq(membershipApplications.id, id))
      .returning();
    return application;
  }

  async deleteMembershipApplication(id: string): Promise<void> {
    await db.delete(membershipApplications).where(eq(membershipApplications.id, id));
  }

  // EFT order operations
  async createEFTOrder(orderData: any): Promise<any> {
    // Create EFT orders in the regular orders table for proper foreign key relationships
    const orderToInsert = {
      id: `eft_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: null, // Allow null for guest orders to avoid foreign key constraint issues
      total: orderData.total.toString(),
      status: orderData.status || 'pending_payment',
      customerInfo: {
        name: orderData.customerInfo?.name || '',
        email: orderData.customerInfo?.email || '',
        phone: orderData.customerInfo?.phone || '',
        address: orderData.customerInfo?.address || '',
        orderReference: orderData.orderReference
      }
    };

    const [newOrder] = await db
      .insert(orders)
      .values(orderToInsert)
      .returning();
    
    return newOrder;
  }

  async updateEFTOrderStatus(orderReference: string, status: string): Promise<void> {
    // Find order by customerInfo containing the orderReference
    const [order] = await db
      .select()
      .from(orders)
      .where(sql`customer_info->>'orderReference' = ${orderReference}`);
    
    if (!order) throw new Error('EFT order not found');
    
    await db
      .update(orders)
      .set({ status })
      .where(eq(orders.id, order.id));
  }

  async getEFTOrders(): Promise<any[]> {
    // Get orders where status indicates EFT payment
    const eftOrders = await db
      .select()
      .from(orders)
      .where(sql`status IN ('pending_payment', 'payment_submitted', 'payment_confirmed')`);
    
    return eftOrders;
  }

  async clearProducts(): Promise<void> {
    await db.delete(products);
  }
}

// Memory storage implementation for immediate functionality
export class MemStorage implements IStorage {
  private users: User[] = [];
  private productsData: Product[] = [];
  private cartItemsData: CartItem[] = [];
  private ordersData: Order[] = [];
  private orderItemsData: OrderItem[] = [];
  private membershipApplicationsData: MembershipApplication[] = [];
  private eftOrdersData: any[] = [];

  // User operations
  async getUser(id: string): Promise<User | undefined> {
    return this.users.find(u => u.id === id);
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    return this.users.find(u => u.username === username);
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const user: User = {
      id: `user_${Date.now()}`,
      username: insertUser.username,
      password: insertUser.password,
      email: insertUser.email || null,
      firstName: insertUser.firstName || null,
      lastName: insertUser.lastName || null,
      createdAt: new Date(),
    };
    this.users.push(user);
    return user;
  }

  // Product operations
  async getAllProducts(): Promise<Product[]> {
    return this.productsData;
  }

  async getProduct(id: string): Promise<Product | undefined> {
    return this.productsData.find(p => p.id === id);
  }

  async createProduct(product: InsertProduct): Promise<Product> {
    const newProduct: Product = {
      id: `product_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: product.name,
      description: product.description,
      price: product.price,
      category: product.category,
      image: product.image,
      thc: product.thc || null,
      effects: product.effects ? [...product.effects] : null,
      featured: product.featured || false,
      in_stock: product.in_stock || true,
      stock: product.stock || 0,
      createdAt: new Date(),
    };
    this.productsData.push(newProduct);
    return newProduct;
  }

  async updateProduct(id: string, updates: Partial<Product>): Promise<Product> {
    const index = this.productsData.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');
    this.productsData[index] = { ...this.productsData[index], ...updates };
    return this.productsData[index];
  }

  async deleteProduct(id: string): Promise<void> {
    const index = this.productsData.findIndex(p => p.id === id);
    if (index === -1) throw new Error('Product not found');
    this.productsData.splice(index, 1);
  }

  // Cart operations
  async getCartItems(userId: string): Promise<(CartItem & { product: Product })[]> {
    const userCartItems = this.cartItemsData.filter(item => item.userId === userId);
    const cartWithProducts = [];
    
    for (const item of userCartItems) {
      const product = this.productsData.find(p => p.id === item.productId);
      if (product) {
        cartWithProducts.push({ ...item, product });
      }
    }
    
    return cartWithProducts;
  }

  async addToCart(item: InsertCartItem): Promise<CartItem> {
    const existingItem = this.cartItemsData.find(
      ci => ci.userId === item.userId && ci.productId === item.productId
    );
    
    if (existingItem) {
      existingItem.quantity += item.quantity || 1;
      return existingItem;
    } else {
      const newItem: CartItem = {
        id: `cart_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        userId: item.userId || 'guest',
        productId: item.productId || '',
        quantity: item.quantity || 1,
        createdAt: new Date(),
      };
      this.cartItemsData.push(newItem);
      return newItem;
    }
  }

  async updateCartItem(id: string, quantity: number): Promise<CartItem> {
    const item = this.cartItemsData.find(ci => ci.id === id);
    if (!item) throw new Error('Cart item not found');
    item.quantity = quantity;
    return item;
  }

  async removeFromCart(id: string): Promise<void> {
    const index = this.cartItemsData.findIndex(ci => ci.id === id);
    if (index === -1) throw new Error('Cart item not found');
    this.cartItemsData.splice(index, 1);
  }

  async clearCart(userId: string): Promise<void> {
    this.cartItemsData = this.cartItemsData.filter(item => item.userId !== userId);
  }

  // Order operations
  async createOrder(order: InsertOrder): Promise<Order> {
    const newOrder: Order = {
      id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId: order.userId || null,
      total: order.total,
      status: order.status || 'pending',
      customerInfo: order.customerInfo || null,
      createdAt: new Date(),
    };
    this.ordersData.push(newOrder);
    return newOrder;
  }

  async addOrderItem(item: InsertOrderItem): Promise<OrderItem> {
    const orderItem: OrderItem = {
      id: `orderitem_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      orderId: item.orderId || null,
      productId: item.productId || null,
      quantity: item.quantity,
      price: item.price,
    };
    this.orderItemsData.push(orderItem);
    return orderItem;
  }

  async getUserOrders(userId: string): Promise<Order[]> {
    return this.ordersData.filter(order => order.userId === userId);
  }

  async getOrder(id: string): Promise<Order | undefined> {
    return this.ordersData.find(order => order.id === id);
  }

  // Membership application operations
  async createMembershipApplication(application: InsertMembershipApplication): Promise<MembershipApplication> {
    const newApplication: MembershipApplication = {
      id: `membership_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...application,
      address: application.address || null,
      emergencyContact: application.emergencyContact || null,
      emergencyPhone: application.emergencyPhone || null,
      medicalConditions: application.medicalConditions || null,
      preferredProducts: application.preferredProducts || null,
      idDocumentUrl: application.idDocumentUrl || null,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
      reviewedAt: null,
      reviewedBy: null,
      notes: null,
    };
    this.membershipApplicationsData.push(newApplication);
    return newApplication;
  }

  async getMembershipApplications(): Promise<MembershipApplication[]> {
    return this.membershipApplicationsData;
  }

  async getMembershipApplication(id: string): Promise<MembershipApplication | undefined> {
    return this.membershipApplicationsData.find(app => app.id === id);
  }

  async updateMembershipApplicationStatus(id: string, status: string): Promise<MembershipApplication> {
    const application = this.membershipApplicationsData.find(app => app.id === id);
    if (!application) throw new Error('Membership application not found');
    application.status = status;
    application.reviewedAt = new Date();
    return application;
  }

  async deleteMembershipApplication(id: string): Promise<void> {
    const index = this.membershipApplicationsData.findIndex(app => app.id === id);
    if (index === -1) throw new Error('Membership application not found');
    this.membershipApplicationsData.splice(index, 1);
  }

  // EFT order operations
  async createEFTOrder(orderData: any): Promise<any> {
    const newOrder = {
      id: `eft_order_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...orderData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    this.eftOrdersData.push(newOrder);
    return newOrder;
  }

  async updateEFTOrderStatus(orderReference: string, status: string): Promise<void> {
    const order = this.eftOrdersData.find(o => o.orderReference === orderReference);
    if (!order) throw new Error('EFT order not found');
    order.status = status;
    order.updatedAt = new Date().toISOString();
  }

  async getEFTOrders(): Promise<any[]> {
    return this.eftOrdersData;
  }

  async clearProducts(): Promise<void> {
    await db.delete(products);
  }

  // Sales operations
  async createSale(sale: InsertSale): Promise<Sale> {
    const saleData = {
      total: sale.total,
      customerName: sale.customerName || null,
      paymentMethod: sale.paymentMethod,
      items: sale.items as any,
      timestamp: sale.timestamp || new Date(),
    };
    const [newSale] = await db
      .insert(sales)
      .values(saleData)
      .returning();
    return newSale;
  }

  async getAllSales(): Promise<Sale[]> {
    return await db.select().from(sales);
  }

  async getSalesToday(): Promise<Sale[]> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    return await db
      .select()
      .from(sales)
      .where(
        and(
          sql`${sales.timestamp} >= ${today.toISOString()}`,
          sql`${sales.timestamp} < ${tomorrow.toISOString()}`
        )
      );
  }

  async getSalesStats(): Promise<{
    todayTotal: number;
    todayCount: number;
    averageSale: number;
  }> {
    const todaySales = await this.getSalesToday();
    const todayTotal = todaySales.reduce((sum, sale) => sum + parseFloat(sale.total), 0);
    const todayCount = todaySales.length;
    const averageSale = todayCount > 0 ? todayTotal / todayCount : 0;
    
    return {
      todayTotal,
      todayCount,
      averageSale,
    };
  }
}

export const storage = new DatabaseStorage();