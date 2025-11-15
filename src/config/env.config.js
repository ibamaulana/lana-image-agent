/**
 * Environment Configuration
 * Centralized configuration management
 */

require('dotenv').config();

const config = {
  // Server Configuration
  server: {
    port: process.env.PORT || 3001,
    env: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000'
  },

  // Database Configuration
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'lana',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    useMemory: process.env.USE_MEMORY_STORAGE === 'true' // Fallback to in-memory
  },

  // Gemini Configuration
  gemini: {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
    temperature: 0.7,
    maxOutputTokens: 2048
  },

  // Replicate Configuration
  replicate: {
    apiToken: process.env.REPLICATE_API_TOKEN
  },

  // Solana Configuration
  solana: {
    network: process.env.X402_SOLANA_NETWORK || 'solana',
    rpcUrl: process.env.SOLANA_RPC_URL || (
      process.env.X402_SOLANA_NETWORK === 'solana'
        ? 'https://api.mainnet-beta.solana.com'
        : 'https://api.devnet.solana.com'
    )
  },

  // x402 Payment Configuration
  x402: {
    enabled: process.env.X402_ENABLED !== 'false',
    receivingAddress: process.env.X402_SOLANA_RECEIVING_ADDRESS,
    network: process.env.X402_SOLANA_NETWORK || 'solana',
    priceUsd: process.env.X402_PRICE_USD || '0.06',
    facilitatorUrl: process.env.X402_FACILITATOR_URL || 'https://x402.org/facilitator',
    cdpApiKeyId: process.env.CDP_API_KEY_ID,
    cdpApiKeySecret: process.env.CDP_API_KEY_SECRET
  },

  // Feature Flags
  features: {
    orchestratorEnabled: !!process.env.GEMINI_API_KEY,
    paymentsEnabled: !!process.env.X402_SOLANA_RECEIVING_ADDRESS,
    imageGenerationEnabled: !!process.env.REPLICATE_API_TOKEN
  }
};

// Validation
function validateConfig() {
  const warnings = [];
  const errors = [];

  if (!config.replicate.apiToken) {
    warnings.push('REPLICATE_API_TOKEN not set - image generation will fail');
  }

  if (!config.gemini.apiKey) {
    warnings.push('GEMINI_API_KEY not set - orchestrator disabled');
  }

  if (!config.x402.receivingAddress) {
    warnings.push('X402_SOLANA_RECEIVING_ADDRESS not set - payments disabled');
  }

  if (!config.x402.cdpApiKeyId || !config.x402.cdpApiKeySecret) {
    warnings.push('CDP_API_KEY_ID or CDP_API_KEY_SECRET not set - x402 facilitator may fail');
  }

  return { warnings, errors };
}

module.exports = {
  config,
  validateConfig
};

