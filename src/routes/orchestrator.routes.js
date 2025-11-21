/**
 * Orchestrator Routes
 * Streaming orchestrator endpoint for conversational AI agent
 */

const express = require('express');
const { randomUUID } = require('crypto');
const router = express.Router();
const { streamGeminiOrchestrator, generateWithGeminiOrchestrator,generateWithGeminiOrchestratorGx } = require('../services/orchestrator.service');
const storage = require('../storage'); // Auto-selects PostgreSQL or memory
const { executeTool } = require('../services/tool-executor.service');
const { settleResponseFromHeader } = require('x402/types');
const paymentService = require('../services/payment.service');
const bs58 = require('bs58');

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
    } = req.body || {};

    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required and must be a non-empty string'
      });
    }

    // Use Gemini orchestrator for intelligent generation
    const result = await generateWithGeminiOrchestratorGx({
      userId: null,
      prompt: prompt.trim(),
      referenceImages: referenceImages || [],
      state: {}
    });

    if (result.success) {
      res.json({
        success: true,
        imageUrl: result.imageUrl,
        metadata: result.metadata,
        reasoning: result.reasoning,
        refinedData: result.refinedData,
        safetyCheck: result.safetyCheck,
        phaseTimings: result.phaseTimings,
        workflow: {
          toolCalls: result.toolCalls
        }
      });
    } else {
      // Check if it's a content policy violation
      const statusCode = result.safetyCheck?.safe === false ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: result.error || 'Image generation failed',
        safetyCheck: result.safetyCheck,
        phaseTimings: result.phaseTimings,
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
 * POST /api/agent/generate-x402
 * LLM-orchestrated image generation with intelligent model selection
 * Body: { userId, prompt, referenceImages?, preferredModelId?, aspectRatio?, style?, extraParams? }
 */
router.post('/generate-x402', async (req, res) => {
  // Support both camelCase and snake_case naming conventions
  const prompt = req.body?.prompt;
  const referenceImages = req.body?.referenceImages || req.body?.reference_images;
  const startWebhookUrl = req.body?.startWebhookUrl || req.body?.start_webhook_url;
  const successWebhookUrl = req.body?.successWebhookUrl || req.body?.success_webhook_url;
  const failureWebhookUrl = req.body?.failureWebhookUrl || req.body?.failure_webhook_url;
  
  console.log('[DEBUG] Extracted webhooks:', {
    startWebhookUrl,
    successWebhookUrl,
    failureWebhookUrl
  });
  
  try {
    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required and must be a non-empty string'
      });
    }

    // if (!req.headers['x-payment']) {
    //   const paymentRequirements = await paymentService.preparePayment();
    //   return res.status(402).json({
    //     accepts: paymentRequirements,
    //     error: "X-PAYMENT header is required",
    //     x402Version: 1
    //   });
    // }
    
    // start when request header X-PAYMENT is present
    let paymentMetadata = null;
    // if (req.headers['x-payment']) {
      // const paymentHeader = req.headers['x-payment'];
      // prepare payment
      // const paymentRequirements = await paymentService.preparePayment();
      // verify payment first
      // const paymentResponse = await paymentService.verifyPayment(paymentHeader, paymentRequirements);
      // if (!paymentResponse.success) {
      //   return res.status(400).json({
      //     success: false,
      //     error: paymentResponse.error || 'Payment failed'
      //   });
      // }
      // console.log('payment verified:', paymentResponse);
      // console.log('payer:', paymentResponse.verification.payer, bs58.default.decode(paymentResponse.verification.payer));

      if (startWebhookUrl) {
        console.log('trigger startwebhook on url:', startWebhookUrl);
        fetch(startWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: prompt,
          })
        });
      }

      // Use Gemini orchestrator for intelligent generation
      const result = await generateWithGeminiOrchestrator({
        userId: null,
        prompt: prompt.trim(),
        referenceImages: referenceImages || [],
        state: {}
      });

      if (result.success) {
        if(successWebhookUrl){
          console.log('trigger successwebhook on url:', successWebhookUrl);
          fetch(successWebhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              result: result,
              paymentMetadata: paymentMetadata
            })
          });
        }
        res.json({
          success: true,
          imageUrl: result.imageUrl,
          metadata: {
            ...result.metadata,
            payment: paymentMetadata
          },
          reasoning: result.reasoning,
          refinedData: result.refinedData,
          safetyCheck: result.safetyCheck,
          phaseTimings: result.phaseTimings,
          workflow: {
            toolCalls: result.toolCalls
          }
        });

        // settle payment
        // const paymentResponse = await paymentService.settleOnlyPayment(paymentHeader, paymentRequirements);
        // if (!paymentResponse.success) {
        //   console.error('[Agent API] Payment settlement failed:', paymentResponse.error);
        // }
        // paymentMetadata = paymentResponse.settlement;

        // if(successWebhookUrl){
        //   console.log('trigger successwebhook on url:', successWebhookUrl);
        //   fetch(successWebhookUrl, {
        //     method: 'POST',
        //     headers: {
        //       'Content-Type': 'application/json'
        //     },
        //     body: JSON.stringify({
        //       result: result,
        //       paymentMetadata: paymentMetadata
        //     })
        //   });
        // }
      } else {
        if(failureWebhookUrl){
          console.log('trigger failurewebhook on url:', failureWebhookUrl);
          fetch(failureWebhookUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              error: result.error || 'Image generation failed',
              reasoning: result.reasoning,
              safetyCheck: result.safetyCheck
            })
          });
        }
        
        // Check if it's a content policy violation
        const statusCode = result.safetyCheck?.safe === false ? 400 : 500;
        
        res.status(statusCode).json({
          success: false,
          error: result.error || 'Image generation failed',
          safetyCheck: result.safetyCheck,
          phaseTimings: result.phaseTimings,
          reasoning: result.reasoning,
          workflow: {
            toolCalls: result.toolCalls
          }
        });
      }
      
    // }
  } catch (error) {
    console.log('failurewebhook url:', failureWebhookUrl);
    if(failureWebhookUrl){
      console.log('trigger failurewebhook on url:', failureWebhookUrl);
      fetch(failureWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: error.message || 'Image generation failed',
        })
      });
    }
    console.error('[Agent API] Generate workflow error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Image generation failed'
    });
  }
});

/**
 * POST /api/agent/generate-x402
 * LLM-orchestrated image generation with intelligent model selection
 * Body: { userId, prompt, referenceImages?, preferredModelId?, aspectRatio?, style?, extraParams? }
 */
router.post('/generate-x402-simple', async (req, res) => {
  // Support both camelCase and snake_case naming conventions
  const prompt = req.body?.prompt;
  const referenceImages = req.body?.referenceImages || req.body?.reference_images;
  const startWebhookUrl = req.body?.startWebhookUrl || req.body?.start_webhook_url;
  const successWebhookUrl = req.body?.successWebhookUrl || req.body?.success_webhook_url;
  const failureWebhookUrl = req.body?.failureWebhookUrl || req.body?.failure_webhook_url;
  
  console.log('[DEBUG] Extracted webhooks:', {
    startWebhookUrl,
    successWebhookUrl,
    failureWebhookUrl
  });

  let paymentMetadata = {}
  
  try {
    // Validate prompt
    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'prompt is required and must be a non-empty string'
      });
    }
    
    if (startWebhookUrl) {
      console.log('trigger startwebhook on url:', startWebhookUrl);
      fetch(startWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          prompt: prompt,
        })
      });
    }

    // Use Gemini orchestrator for intelligent generation
    const result = await generateWithGeminiOrchestrator({
      userId: null,
      prompt: prompt.trim(),
      referenceImages: referenceImages || [],
      state: {}
    });

    res.on('finish', async () => {
      console.log("res on finish with result:",result)
      if (res.statusCode >= 400) {
        return;
      }

      const headerValue = res.getHeader('X-PAYMENT-RESPONSE');
      const paymentHeader = Array.isArray(headerValue) ? headerValue[0] : headerValue;

      if (!paymentHeader) {
        console.warn('x402 payment header missing on generation creation response');
        return;
      }

      const settleResponse = settleResponseFromHeader(String(paymentHeader));
      if(successWebhookUrl){
        console.log('trigger successwebhook on url:', successWebhookUrl);
        fetch(successWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            result: result,
            paymentMetadata: settleResponse
          })
        });
      }
    });

    if (result.success) {
      res.json({
        success: true,
        imageUrl: result.imageUrl,
        metadata: {
          ...result.metadata,
          payment: paymentMetadata
        },
        reasoning: result.reasoning,
        refinedData: result.refinedData,
        safetyCheck: result.safetyCheck,
        phaseTimings: result.phaseTimings,
        workflow: {
          toolCalls: result.toolCalls
        }
      });
    } else {
      if(failureWebhookUrl){
        console.log('trigger failurewebhook on url:', failureWebhookUrl);
        fetch(failureWebhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            error: result.error || 'Image generation failed',
            reasoning: result.reasoning,
            safetyCheck: result.safetyCheck
          })
        });
      }
      
      // Check if it's a content policy violation
      const statusCode = result.safetyCheck?.safe === false ? 400 : 500;
      
      res.status(statusCode).json({
        success: false,
        error: result.error || 'Image generation failed',
        safetyCheck: result.safetyCheck,
        phaseTimings: result.phaseTimings,
        reasoning: result.reasoning,
        workflow: {
          toolCalls: result.toolCalls
        }
      });
    }
  } catch (error) {
    console.log('failurewebhook url:', failureWebhookUrl);
    if(failureWebhookUrl){
      console.log('trigger failurewebhook on url:', failureWebhookUrl);
      fetch(failureWebhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          error: error.message || 'Image generation failed',
        })
      });
    }
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

