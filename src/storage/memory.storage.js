/**
 * Simple In-Memory Storage
 * For production, replace with a proper database
 */

class MemoryStorage {
  constructor() {
    // Store wallets: { walletAddress: { address, secretKey, createdAt } }
    this.wallets = new Map();
    
    // Store transactions: { txId: { id, walletAddress, type, amount, status, metadata, createdAt } }
    this.transactions = new Map();
    
    // Store generations: { jobId: { jobId, walletAddress, prompt, status, imageUrl, createdAt } }
    this.generations = new Map();
    
    // Store users: { userId: { id, username, wallet_address, wallet_private_key, balance, createdAt } }
    this.users = new Map();
    
    // Store conversations: { userId: [ { role, content, timestamp } ] }
    this.conversations = new Map();
    
    // Store user data: { userId: { key: value } }
    this.userData = new Map();
  }

  // Wallet operations
  createWallet(address, secretKey) {
    const wallet = {
      address,
      secretKey,
      createdAt: new Date().toISOString()
    };
    this.wallets.set(address, wallet);
    return wallet;
  }

  getWallet(address) {
    return this.wallets.get(address);
  }

  getAllWallets() {
    return Array.from(this.wallets.values());
  }

  // Transaction operations
  createTransaction(txData) {
    const transaction = {
      id: txData.id,
      walletAddress: txData.walletAddress,
      type: txData.type, // 'GENERATION', 'PAYMENT', etc.
      amount: txData.amount,
      token: txData.token || 'USDC',
      chain: txData.chain || 'solana-devnet',
      status: txData.status || 'completed',
      signature: txData.signature,
      metadata: txData.metadata || {},
      createdAt: new Date().toISOString()
    };
    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  getTransaction(id) {
    return this.transactions.get(id);
  }

  getTransactionsByWallet(walletAddress) {
    return Array.from(this.transactions.values())
      .filter(tx => tx.walletAddress === walletAddress)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  getAllTransactions() {
    return Array.from(this.transactions.values());
  }

  // Generation operations
  createGeneration(genData) {
    const generation = {
      jobId: genData.jobId,
      walletAddress: genData.walletAddress,
      prompt: genData.prompt,
      modelName: genData.modelName || 'flux-schnell',
      status: genData.status || 'running',
      imageUrl: genData.imageUrl || null,
      paymentReference: genData.paymentReference || null,
      metadata: genData.metadata || {},
      createdAt: new Date().toISOString()
    };
    this.generations.set(generation.jobId, generation);
    return generation;
  }

  updateGeneration(jobId, updates) {
    const generation = this.generations.get(jobId);
    if (!generation) return null;
    
    Object.assign(generation, updates);
    this.generations.set(jobId, generation);
    return generation;
  }

  getGeneration(jobId) {
    return this.generations.get(jobId);
  }

  getGenerationsByWallet(walletAddress) {
    return Array.from(this.generations.values())
      .filter(gen => gen.walletAddress === walletAddress)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // User operations
  createUser(userData) {
    const user = {
      id: userData.id,
      username: userData.username || userData.id,
      wallet_address: userData.wallet_address,
      wallet_private_key: userData.wallet_private_key,
      balance: userData.balance || 0,
      createdAt: new Date().toISOString()
    };
    this.users.set(user.id, user);
    return user;
  }

  getUser(userId) {
    return this.users.get(userId);
  }

  getAllUsers() {
    return Array.from(this.users.values());
  }

  updateUser(userId, updates) {
    const user = this.users.get(userId);
    if (!user) return null;
    Object.assign(user, updates);
    this.users.set(userId, user);
    return user;
  }

  // Conversation operations
  addConversation(userId, message) {
    if (!this.conversations.has(userId)) {
      this.conversations.set(userId, []);
    }
    const conversation = this.conversations.get(userId);
    conversation.push({
      ...message,
      timestamp: new Date().toISOString()
    });
    // Keep only last 20 messages
    if (conversation.length > 20) {
      conversation.shift();
    }
    return conversation;
  }

  getConversation(userId) {
    return this.conversations.get(userId) || [];
  }

  clearConversation(userId) {
    this.conversations.delete(userId);
  }

  // User data operations (for storing temporary data like suggestions)
  setUserData(userId, key, value) {
    if (!this.userData.has(userId)) {
      this.userData.set(userId, {});
    }
    const data = this.userData.get(userId);
    data[key] = value;
    return data;
  }

  getUserData(userId, key) {
    const data = this.userData.get(userId);
    if (!data) return null;
    return key ? data[key] : data;
  }

  clearUserData(userId, key) {
    if (key) {
      const data = this.userData.get(userId);
      if (data) {
        delete data[key];
      }
    } else {
      this.userData.delete(userId);
    }
  }

  // Helper methods for user's transactions and generations
  getUserTransactions(userId) {
    const user = this.getUser(userId);
    if (!user) return [];
    return this.getTransactionsByWallet(user.wallet_address);
  }

  getUserGenerations(userId) {
    const user = this.getUser(userId);
    if (!user) return [];
    return this.getGenerationsByWallet(user.wallet_address);
  }

  // Clear all data (for testing)
  clear() {
    this.wallets.clear();
    this.transactions.clear();
    this.generations.clear();
    this.users.clear();
    this.conversations.clear();
    this.userData.clear();
  }
}

// Export singleton instance
const storage = new MemoryStorage();
module.exports = storage;

