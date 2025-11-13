/**
 * Storage Loader
 * Dynamically loads storage implementation based on configuration
 */

const { config } = require('../config/env.config');

let storage;

// Use memory storage if configured, otherwise use PostgreSQL
if (config.database.useMemory) {
  console.log('📦 Using in-memory storage');
  storage = require('./memory.storage');
} else {
  console.log('🐘 Using PostgreSQL storage');
  storage = require('./postgres.storage');
}

module.exports = storage;

