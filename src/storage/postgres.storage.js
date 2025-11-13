/**
 * PostgreSQL Storage Implementation
 * Replaces in-memory storage with persistent database
 */

const db = require('../database/db');

class PostgresStorage {
  // ============================================
  // USER OPERATIONS
  // ============================================

  async createUser(userData) {
    const query = `
      INSERT INTO users (id, username, wallet_address, wallet_private_key, balance)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `;
    const values = [
      userData.id,
      userData.username || userData.id,
      userData.wallet_address,
      userData.wallet_private_key,
      userData.balance || 0
    ];
    
    const result = await db.query(query, values);
    return result.rows[0];
  }

  async getUser(userId) {
    const query = 'SELECT * FROM users WHERE id = $1';
    const result = await db.query(query, [userId]);
    return result.rows[0] || null;
  }

  async getAllUsers() {
    const query = 'SELECT * FROM users ORDER BY created_at DESC';
    const result = await db.query(query);
    return result.rows;
  }

  async updateUser(userId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      fields.push(`${key} = $${paramCount}`);
      values.push(updates[key]);
      paramCount++;
    });

    if (fields.length === 0) return null;

    values.push(userId);
    const query = `
      UPDATE users 
      SET ${fields.join(', ')}
      WHERE id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  // ============================================
  // WALLET OPERATIONS
  // ============================================

  async createWallet(address, secretKey) {
    const query = `
      INSERT INTO wallets (address, secret_key)
      VALUES ($1, $2)
      RETURNING *
    `;
    const result = await db.query(query, [address, secretKey]);
    return result.rows[0];
  }

  async getWallet(address) {
    const query = 'SELECT * FROM wallets WHERE address = $1';
    const result = await db.query(query, [address]);
    return result.rows[0] || null;
  }

  async getAllWallets() {
    const query = 'SELECT * FROM wallets ORDER BY created_at DESC';
    const result = await db.query(query);
    return result.rows;
  }

  // ============================================
  // TRANSACTION OPERATIONS
  // ============================================

  async createTransaction(txData) {
    const query = `
      INSERT INTO transactions 
      (id, user_id, wallet_address, type, amount, token, chain, status, signature, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      RETURNING *
    `;
    const values = [
      txData.id,
      txData.userId || null,
      txData.walletAddress,
      txData.type,
      txData.amount || 0,
      txData.token || 'USDC',
      txData.chain || 'solana-devnet',
      txData.status || 'completed',
      txData.signature || null,
      JSON.stringify(txData.metadata || {})
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  async getTransaction(id) {
    const query = 'SELECT * FROM transactions WHERE id = $1';
    const result = await db.query(query, [id]);
    return result.rows[0] || null;
  }

  async getTransactionsByWallet(walletAddress) {
    const query = `
      SELECT * FROM transactions 
      WHERE wallet_address = $1 
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [walletAddress]);
    return result.rows;
  }

  async getAllTransactions() {
    const query = 'SELECT * FROM transactions ORDER BY created_at DESC';
    const result = await db.query(query);
    return result.rows;
  }

  // ============================================
  // GENERATION OPERATIONS
  // ============================================

  async createGeneration(genData) {
    const query = `
      INSERT INTO generations 
      (job_id, user_id, wallet_address, prompt, model_name, status, image_url, payment_reference, metadata)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    const values = [
      genData.jobId,
      genData.userId || null,
      genData.walletAddress,
      genData.prompt,
      genData.modelName || 'flux-schnell',
      genData.status || 'running',
      genData.imageUrl || null,
      genData.paymentReference || null,
      JSON.stringify(genData.metadata || {})
    ];

    const result = await db.query(query, values);
    return result.rows[0];
  }

  async updateGeneration(jobId, updates) {
    const fields = [];
    const values = [];
    let paramCount = 1;

    Object.keys(updates).forEach(key => {
      if (key === 'metadata') {
        fields.push(`${key} = $${paramCount}`);
        values.push(JSON.stringify(updates[key]));
      } else {
        fields.push(`${key} = $${paramCount}`);
        values.push(updates[key]);
      }
      paramCount++;
    });

    if (fields.length === 0) return null;

    values.push(jobId);
    const query = `
      UPDATE generations 
      SET ${fields.join(', ')}
      WHERE job_id = $${paramCount}
      RETURNING *
    `;

    const result = await db.query(query, values);
    return result.rows[0] || null;
  }

  async getGeneration(jobId) {
    const query = 'SELECT * FROM generations WHERE job_id = $1';
    const result = await db.query(query, [jobId]);
    return result.rows[0] || null;
  }

  async getGenerationsByWallet(walletAddress) {
    const query = `
      SELECT * FROM generations 
      WHERE wallet_address = $1 
      ORDER BY created_at DESC
    `;
    const result = await db.query(query, [walletAddress]);
    return result.rows;
  }

  // ============================================
  // CONVERSATION OPERATIONS
  // ============================================

  async addConversation(userId, message) {
    const query = `
      INSERT INTO conversations (user_id, role, content)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const values = [userId, message.role, message.content];
    const result = await db.query(query, values);

    // Keep only last 20 messages per user
    await db.query(`
      DELETE FROM conversations
      WHERE user_id = $1
      AND id NOT IN (
        SELECT id FROM conversations
        WHERE user_id = $1
        ORDER BY timestamp DESC
        LIMIT 20
      )
    `, [userId]);

    return result.rows[0];
  }

  async getConversation(userId) {
    const query = `
      SELECT * FROM conversations 
      WHERE user_id = $1 
      ORDER BY timestamp ASC
      LIMIT 20
    `;
    const result = await db.query(query, [userId]);
    return result.rows;
  }

  async clearConversation(userId) {
    const query = 'DELETE FROM conversations WHERE user_id = $1';
    await db.query(query, [userId]);
  }

  // ============================================
  // USER DATA OPERATIONS
  // ============================================

  async setUserData(userId, key, value) {
    const query = `
      INSERT INTO user_data (user_id, key, value)
      VALUES ($1, $2, $3)
      ON CONFLICT (user_id, key)
      DO UPDATE SET value = $3, updated_at = CURRENT_TIMESTAMP
      RETURNING *
    `;
    const values = [userId, key, JSON.stringify(value)];
    const result = await db.query(query, values);
    return result.rows[0];
  }

  async getUserData(userId, key) {
    if (key) {
      const query = 'SELECT value FROM user_data WHERE user_id = $1 AND key = $2';
      const result = await db.query(query, [userId, key]);
      return result.rows[0] ? result.rows[0].value : null;
    } else {
      const query = 'SELECT key, value FROM user_data WHERE user_id = $1';
      const result = await db.query(query, [userId]);
      const data = {};
      result.rows.forEach(row => {
        data[row.key] = row.value;
      });
      return data;
    }
  }

  async clearUserData(userId, key) {
    if (key) {
      const query = 'DELETE FROM user_data WHERE user_id = $1 AND key = $2';
      await db.query(query, [userId, key]);
    } else {
      const query = 'DELETE FROM user_data WHERE user_id = $1';
      await db.query(query, [userId]);
    }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  async getUserTransactions(userId) {
    const user = await this.getUser(userId);
    if (!user) return [];
    return await this.getTransactionsByWallet(user.wallet_address);
  }

  async getUserGenerations(userId) {
    const user = await this.getUser(userId);
    if (!user) return [];
    return await this.getGenerationsByWallet(user.wallet_address);
  }

  // For backward compatibility (if needed)
  async addImageGeneration(jobId, data) {
    return await this.createGeneration({
      jobId,
      walletAddress: data.walletAddress,
      prompt: data.prompt,
      modelName: data.modelName,
      imageUrl: data.imageUrl,
      metadata: data.metadata
    });
  }

  async clear() {
    // Careful! This deletes all data
    await db.query('TRUNCATE users, wallets, transactions, generations, conversations, user_data CASCADE');
    console.log('⚠️  All data cleared from database');
  }
}

// Export singleton instance
const storage = new PostgresStorage();
module.exports = storage;

