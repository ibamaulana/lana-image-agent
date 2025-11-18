/**
 * Simplified Backend Server
 * MCP-based agent for wallet management and image generation with Gemini orchestrator
 */

const express = require('express');
const cors = require('cors');
const { config, validateConfig } = require('./src/config/env.config');
const { paymentMiddleware } = require('x402-express');
const { facilitator } = require("@coinbase/x402");

const app = express();
const PORT = config.server.port;

// Middleware
app.use(cors({
  origin: '*',
  credentials: true,
  exposedHeaders: ['Mcp-Session-Id']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// MCP Session Management
const mcpSessions = new Map();

const cleanupSession = async (sessionId) => {
  const session = mcpSessions.get(sessionId);
  if (!session) return;

  try {
    await session.transport.close?.();
  } catch (error) {
    console.error('Failed to close MCP transport', error);
  }

  try {
    await session.server.close();
  } catch (error) {
    console.error('Failed to close MCP server instance', error);
  }

  mcpSessions.delete(sessionId);
  console.log(`🗑️  Cleaned up session: ${sessionId}`);
};

const x402PayToAddress = process.env.X402_SOLANA_RECEIVING_ADDRESS;
const x402PriceUsd = process.env.X402_PRICE_USD || '0.06';

const price = Number(x402PriceUsd);
const formattedPrice = Number.isFinite(price) ? `$${price.toFixed(2)}` : x402PriceUsd;

app.use(paymentMiddleware(
  x402PayToAddress,
  {
    'POST /api/agent/generate-x402-simple': {
      price: 0.001,
      network: 'solana',
      config: {
        description: 'Create Image with Lana Agent',
        maxTimeoutSeconds: 120,
        mimeType: 'application/json',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: {
              type: 'string',
              description: 'Primary creative brief for the image'
            },
            referenceImages: {
              type: 'array',
              description: 'Optional reference image URLs to steer generation',
              items: {
                type: 'string',
                format: 'uri'
              }
            },
            startWebhookUrl: {
              type: 'string',
              description: 'Optional webhook URL to receive updates about the generation'
            },
            successWebhookUrl: {
              type: 'string',
              description: 'Optional webhook URL to receive updates about the generation when the generation is successful'
            },
            failureWebhookUrl: {
              type: 'string',
              description: 'Optional webhook URL to receive updates about the generation when the generation fails'
            },
          },
          required: ['prompt'],
          additionalProperties: false
        },
        outputSchema: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            imageUrl: {
              type: 'string',
              format: 'uri',
              description: 'Generated image URL when success=true'
            },
            metadata: {
              type: 'object',
              description: 'Model + render metadata returned by the orchestrator',
              properties: {
                model: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    name: { type: 'string' },
                    fullName: { type: 'string' }
                  }
                },
                prompt: { type: 'string' },
                negativePrompt: { type: 'string', nullable: true },
                referenceImages: {
                  type: 'array',
                  items: { type: 'string', format: 'uri' }
                },
                aspectRatio: { type: 'string' },
                style: { type: 'string' },
                size: { type: 'string' }
              }
            },
            reasoning: {
              type: 'string',
              description: 'LLM explanation of the workflow'
            },
            workflow: {
              type: 'object',
              properties: {
                toolCalls: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      tool: { type: 'string' },
                      success: { type: 'boolean' }
                    }
                  }
                }
              }
            },
            error: {
              type: 'string',
              description: 'Error message when success=false'
            }
          }
        },
        discoverable: true
      }
    }
  },
  facilitator
));

// Orchestrator routes (Gemini-powered conversational agent)
if (config.features.orchestratorEnabled) {
  app.use('/api/agent', require('./src/routes/orchestrator.routes'));
  console.log('✅ Gemini orchestrator enabled');
} else {
  console.warn('⚠️  Gemini orchestrator disabled (set GEMINI_API_KEY to enable)');
}

// Models routes (for fetching and caching model data)
app.use('/api/models', require('./src/routes/models.routes'));
console.log('✅ Models API enabled');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    success: true,
    message: 'Lana Agent Backend (Simple) is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    config: {
      ...config.features,
      network: config.solana.network,
      activeSessions: mcpSessions.size
    }
  });
});

// Session management endpoint
app.get('/sessions', (req, res) => {
  const sessions = Array.from(mcpSessions.entries()).map(([id, session]) => ({
    id,
    hasTransport: !!session.transport,
    hasServer: !!session.server
  }));

  res.json({
    success: true,
    count: mcpSessions.size,
    sessions
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error',
    ...(config.server.env === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
const startServer = async () => {
  // Initialize database if not using memory storage
  if (!config.database.useMemory) {
    try {
      const db = require('./src/database/db');
      await db.connect();
    } catch (error) {
      console.error('❌ Database initialization failed:', error.message);
      console.log('💡 Falling back to in-memory storage');
      // Force memory storage if database fails
      config.database.useMemory = true;
    }
  }

  app.listen(PORT, () => {
    console.log('\n🚀 Lana Agent Backend (Simple) Started\n');
    console.log(`   Port: ${PORT}`);
    console.log(`   Environment: ${config.server.env}`);
    console.log(`   Storage: ${config.database.useMemory ? '📦 Memory' : '🐘 PostgreSQL'}`);
    console.log(`   Health: http://localhost:${PORT}/health`);
    console.log(`   MCP Endpoint: http://localhost:${PORT}/mcp`);
    console.log(`   Sessions: http://localhost:${PORT}/sessions\n`);
    
    // Validate configuration
    const { warnings, errors } = validateConfig();
    
    if (errors.length > 0) {
      console.error('❌ Configuration Errors:');
      errors.forEach(err => console.error(`   - ${err}`));
    }
    
    if (warnings.length > 0) {
      console.warn('⚠️  Configuration Warnings:');
      warnings.forEach(warn => console.warn(`   - ${warn}`));
    }
    
    console.log('\n📊 Features Status:');
    console.log(`   Orchestrator: ${config.features.orchestratorEnabled ? '✅' : '❌'}`);
    console.log(`   Payments: ${config.features.paymentsEnabled ? '✅' : '❌'}`);
    console.log(`   Image Generation: ${config.features.imageGenerationEnabled ? '✅' : '❌'}`);
    
    console.log('\n📚 Available Endpoints:');
    console.log('   MCP Tools:');
    console.log('      1. list-models - Fetch available models with capabilities');
    console.log('      2. search-models - Search models by keyword');
    console.log('      3. suggest-prompt - Refine user ideas into prompts');
    console.log('      4. generate-image - Generate image with specified model');
    
    if (config.features.orchestratorEnabled) {
      console.log('\n   Orchestrator:');
      console.log('      POST /api/agent/chat - Conversational agent with auto tool calling');
      console.log('      POST /api/agent/generate - LLM-orchestrated image generation');
      console.log('      GET  /api/agent/status - Check orchestrator status');
    }
    
    console.log('\n   Models API:');
    console.log('      GET /api/models/status - Check cached model data status');
    console.log('      GET /api/models/fetch-source - Fetch models + READMEs (slow, run periodically)');
    console.log('      GET /api/models/generate-summaries - Generate LLM summaries from source');
    console.log('      GET /api/models/list - List models from cache');
  });
};

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  
  // Close all MCP sessions
  for (const [sessionId, session] of mcpSessions.entries()) {
    await cleanupSession(sessionId);
  }
  
  // Close database connection
  if (!config.database.useMemory) {
    try {
      const db = require('./src/database/db');
      await db.close();
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
  }
  
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down server...');
  
  // Close all MCP sessions
  for (const [sessionId, session] of mcpSessions.entries()) {
    await cleanupSession(sessionId);
  }
  
  // Close database connection
  if (!config.database.useMemory) {
    try {
      const db = require('./src/database/db');
      await db.close();
    } catch (error) {
      console.error('Error closing database:', error.message);
    }
  }
  
  process.exit(0);
});

startServer();

module.exports = app;
