/**
 * Frontend Configuration
 * Centralized config for the simplified frontend
 */

export const config = {
  backend: {
    url: process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3001',
  },
  x402: {
    priceUsd: process.env.NEXT_PUBLIC_X402_PRICE_USD || '0.06',
    network: process.env.NEXT_PUBLIC_X402_NETWORK || 'solana-devnet',
  },
  app: {
    name: 'LANA',
    description: 'AI Image Generator Agent',
    version: '2.0.0',
  },
};

export const BACKEND_URL = config.backend.url.replace(/\/$/, '');
export const X402_PRICE = config.x402.priceUsd;
export const X402_NETWORK = config.x402.network;

