/**
 * Orchestrator Routes
 * Streaming orchestrator endpoint for conversational AI agent
 */

const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { streamGeminiOrchestrator, generateWithGeminiOrchestrator } = require('../services/orchestrator.service');
const storage = require('../storage'); // Auto-selects PostgreSQL or memory
const { executeTool } = require('../services/tool-executor.service');

/**
 * POST /api/agent/chat
 * Stream conversational responses with automatic tool calling
 * Body: { userId, message, conversationHistory?, state? }
 */
router.post('/chat', async (req, res) => {
  // Set up Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  try {
    const { userId, message, conversationHistory, state } = req.body;

    // Validate input
    if (!userId || typeof userId !== 'string') {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'userId is required' 
      })}\n\n`);
      res.end();
      return;
    }

    if (!message || typeof message !== 'string') {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: 'message is required' 
      })}\n\n`);
      res.end();
      return;
    }

    // Ensure user profile exists for conversation tracking
    let user = await storage.getUser(userId);
    if (!user) {
      const placeholderWallet = `placeholder-${userId}-${randomUUID()}`;
      user = await storage.createUser({
        id: userId,
        username: userId,
        wallet_address: placeholderWallet,
        wallet_private_key: `placeholder-key-${randomUUID()}`,
        balance: 0
      });

      res.write(`data: ${JSON.stringify({
        type: 'system',
        content: '👋 Created a new profile for you.'
      })}\n\n`);

      console.log('[Agent API] Created new user profile:', userId);
    }

    console.log('[Agent API] Stream request for user:', userId);
    console.log('[Agent API] Message:', message.substring(0, 50));

    // Stream Gemini responses and tool calls
    await streamGeminiOrchestrator({
      userId: user.id,
      message,
      conversationHistory: conversationHistory || [],
      state: state || {},
      onChunk: (chunk) => {
        // Send each chunk as Server-Sent Event
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
      },
      onComplete: (finalResult) => {
        console.log('[Agent API] Stream complete for user:', userId);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ 
            type: 'done', 
            ...finalResult 
          })}\n\n`);
          res.end();
        }
      },
      onError: (error) => {
        console.error('[Agent API] Stream error:', error);
        if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({ 
            type: 'error', 
            error: error.message 
          })}\n\n`);
          res.end();
        }
      }
    });
  } catch (error) {
    console.error('[Agent API] Request handling error:', error);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ 
        type: 'error', 
        error: error.message || 'Internal server error' 
      })}\n\n`);
      res.end();
    }
  }
});

/**
 * POST /api/agent/generate
 * LLM-orchestrated image generation with intelligent model selection
 * Body: { userId, prompt, referenceImages?, preferredModelId?, aspectRatio?, style?, extraParams? }
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      userId,
      prompt,
      referenceImages,
      preferredModelId,
      aspectRatio,
      style,
      extraParams
    } = req.body || {};

    // Validate userId
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'userId is required'
      });
    }

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required and must be a non-empty string'
      });
    }

    // Ensure user exists
    let user = await storage.getUser(userId);
    if (!user) {
      const placeholderWallet = `placeholder-${userId}-${randomUUID()}`;
      user = await storage.createUser({
        id: userId,
        username: userId,
        wallet_address: placeholderWallet,
        wallet_private_key: `placeholder-key-${randomUUID()}`,
        balance: 0
      });

      console.log('[Agent API] Created new user profile for /generate:', userId);
    }

    // Use Gemini orchestrator for intelligent generation
    const result = await generateWithGeminiOrchestrator({
      userId: user.id,
      prompt: prompt.trim(),
      referenceImages: referenceImages || [],
      state: {
        preferredModelId,
        aspectRatio,
        style,
        extraParams
      }
    });

    if (result.success) {
      res.json({
        success: true,
        imageUrl: result.imageUrl,
        metadata: result.metadata,
        reasoning: result.reasoning,
        workflow: {
          toolCalls: result.toolCalls
        }
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Image generation failed',
        reasoning: result.reasoning,
        workflow: {
          toolCalls: result.toolCalls
        }
      });
    }
  } catch (error) {
    console.error('[Agent API] Generate workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Image generation failed'
    });
  }
});

/**
 * GET /api/agent/status
 * Check if orchestrator is available
 */
router.get('/status', (req, res) => {
  const { config } = require('../config/env.config');
  const isConfigured = !!config.gemini.apiKey;
  
  res.json({
    success: true,
    orchestratorAvailable: isConfigured,
    message: isConfigured 
      ? 'Orchestrator is ready' 
      : 'Gemini API key not configured'
  });
});

/**
 * GET /api/agent/user/:userId
 * Get basic user profile information
 */
router.get('/user/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    const user = await storage.getUser(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found. Send a message to /api/agent/chat to create a profile.'
      });
    }

    res.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        createdAt: user.createdAt || user.created_at
      }
    });
  } catch (error) {
    console.error('[Agent API] Get user error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;

