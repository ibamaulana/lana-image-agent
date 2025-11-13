/**
 * PostgreSQL Database Connection
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { config } = require('../config/env.config');

class Database {
  constructor() {
    this.pool = null;
  }

  /**
   * Initialize database connection
   */
  async connect() {
    try {
      // Create connection pool
      this.pool = new Pool({
        host: config.database.host,
        port: config.database.port,
        database: config.database.name,
        user: config.database.user,
        password: config.database.password,
        max: 20, // Maximum number of clients in the pool
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 2000,
      });

      // Test connection
      const client = await this.pool.connect();
      console.log('✅ PostgreSQL connected successfully');
      client.release();

      // Initialize schema
      await this.initSchema();

      return true;
    } catch (error) {
      console.error('❌ PostgreSQL connection failed:', error.message);
      throw error;
    }
  }

  /**
   * Initialize database schema
   */
  async initSchema() {
    try {
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf8');
      
      await this.pool.query(schema);
      console.log('✅ Database schema initialized');
    } catch (error) {
      console.error('❌ Schema initialization failed:', error.message);
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query(text, params) {
    const start = Date.now();
    try {
      const res = await this.pool.query(text, params);
      const duration = Date.now() - start;
      
      if (duration > 1000) {
        console.warn(`⚠️  Slow query (${duration}ms): ${text.substring(0, 50)}...`);
      }
      
      return res;
    } catch (error) {
      console.error('Query error:', error.message);
      console.error('Query:', text);
      console.error('Params:', params);
      throw error;
    }
  }

  /**
   * Get a client from the pool
   */
  async getClient() {
    return await this.pool.connect();
  }

  /**
   * Close database connection
   */
  async close() {
    if (this.pool) {
      await this.pool.end();
      console.log('PostgreSQL connection closed');
    }
  }

  /**
   * Check if database is connected
   */
  isConnected() {
    return this.pool !== null;
  }
}

// Export singleton instance
const db = new Database();
module.exports = db;

