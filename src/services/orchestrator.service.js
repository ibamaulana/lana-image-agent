/**
 * Gemini Streaming Orchestrator Service
 * Lightweight conversational layer for the simplified image workflow
 */

const { GoogleGenAI } = require('@google/genai');
const { executeTool } = require('./tool-executor.service');
const { config } = require('../config/env.config');

let geminiClient = null;

function getGeminiClient() {
  if (!config.gemini.apiKey) {
    throw new Error(
      'GEMINI_API_KEY is not configured. Set it in your environment to enable the orchestrator agent.'
    );
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }

  return geminiClient;
}

/**
 * Get tool definitions for Gemini function calling
 */
function getToolDefinitions() {
  return [
    {
      functionDeclarations: [
        {
          name: 'list_models',
          description:
            'List available image generation models with their capabilities and strengths. Filter by reference image support if needed.',
          parameters: {
            type: 'object',
            properties: {
              referenceImageCount: {
                type: 'number',
                description: 'Optional filter: 0 for text-to-image only, 1 for single reference support, >1 for multiple reference support'
              }
            }
          }
        },
        {
          name: 'generate_image',
          description:
            'Generate an image with the specified model and parameters. You must select the model and refine the prompt yourself before calling this.',
          parameters: {
            type: 'object',
            properties: {
              modelId: {
                type: 'string',
                description: 'Required: Model ID to use for generation (from list_models)'
              },
              prompt: {
                type: 'string',
                description: 'Required: Refined prompt with quality tags and details'
              },
              title: {
                type: 'string',
                description: 'Required: A creative, descriptive title for the image (3-8 words)'
              },
              referenceImages: {
                type: 'array',
                items: {
                  type: 'string'
                },
                description: 'Optional: Reference image URLs for image-to-image generation'
              },
              aspectRatio: {
                type: 'string',
                description: 'Optional: Aspect ratio like "1:1", "16:9", "9:16" (infer from user intent)'
              },
              style: {
                type: 'string',
                description: 'Optional: Style preference'
              },
              negativePrompt: {
                type: 'string',
                description: 'Optional: Negative prompt to avoid unwanted elements'
              },
              extraParams: {
                type: 'object',
                description: 'Optional: Additional model-specific parameters'
              }
            },
            required: ['modelId', 'prompt', 'title']
          }
        }
      ]
    }
  ];
}

/**
 * Build system instruction based on current state
 */
function buildSystemInstruction(state = {}) {
  return `You are Lana, an expert AI image generation assistant.

Your workflow for generating images:

1. **Understand the request**
   - What does the user want to create?
   - Are there reference images? How many?
   - What style/mood/aspect ratio do they want?

2. **Get available models** (call list_models)
   - If the user provides reference images:
     * Count them and call list_models with referenceImageCount parameter
     * For 1 reference: use referenceImageCount=1
     * For 2+ references: use referenceImageCount=2 (gets models supporting multiple)
   - If no references: call list_models without parameters
   - You'll receive models with their inputSchema, strengths, and capabilities

3. **Select the best model intelligently by analyzing inputSchema**
   - Each model includes an inputSchema object showing ALL parameters it accepts
   - Example inputSchema:
     {
       "prompt": {"type": "string", "required": true},
       "image": {"type": "string", "format": "uri", "isImageInput": true},
       "aspect_ratio": {"type": "string", "options": ["1:1", "16:9", "9:16"]}
     }
   
   - **For text-to-image (no references):**
     * Choose models based on strengths matching user intent
     * For anime/manga style → models with "anime" strength
     * For photorealistic → models with "photorealistic" or "high-quality" strength
     * For speed → models with "fast" strength
     * Consider runCount (popularity) and descriptions
   
   - **For image-to-image (with reference images):**
     * Examine the inputSchema to see if it has image input parameters
     * Look for parameters with isImageInput=true (excluding mask parameters with isMask=true)
     * Mask parameters are for inpainting/editing, not standard image-to-image generation
     * For 1 reference: choose models with single image input parameter (e.g., "image")
     * For 2+ references: choose models with array image input (e.g., "images" with type "array")
     * Match model strengths to user intent (style transfer, reimagination, etc.)
   
   - **Use the inputSchema to understand constraints:**
     * Check available aspect_ratio options in the schema
     * Check for parameters like guidance_scale, num_inference_steps, strength, etc.
     * Respect parameter defaults and required fields

4. **Refine the prompt**
   
   **CRITICAL: Different approach for reference images vs. text-only:**
   
   **When reference images are provided:**
   - The reference image DEFINES the subject - DO NOT change or describe the subject
   - Keep the prompt MINIMAL and GENERAL
   - Only add style/quality tags that complement the transformation
   - Examples:
     * User: "change this to anime style" → Prompt: "anime style, vibrant colors, clean lines"
     * User: "make it photorealistic" → Prompt: "photorealistic, highly detailed, sharp focus"
     * User: "add dramatic lighting" → Prompt: "dramatic lighting, cinematic, high contrast"
   - DO NOT add subject descriptions (like "girl", "horse", "building") - the reference already has the subject
   - The reference image is the source of truth for WHAT to generate
   - The prompt should only describe HOW to transform/stylize it
   
   **When NO reference images (text-to-image only):**
   - Enhance the user's prompt with quality tags and descriptive details
   - Add subject details and scene composition
   - Examples:
     * Photorealistic: add "highly detailed, sharp focus, professional photography"
     * Anime: add "anime style, vibrant colors, clean lines, detailed character"
     * Artistic: add "digital art, concept art, highly detailed"
   
   **For all generations:**
   - Infer aspectRatio from user intent:
     * Portrait/person/selfie → "9:16"
     * Landscape/wide/panorama → "16:9"
     * Square/icon/logo → "1:1"
   - Create a negative prompt to avoid common issues:
     * "blurry, low quality, distorted, ugly, bad anatomy, watermark"
   - Keep the user's creative vision intact
   
   **IMPORTANT: About mask parameters**
   - Some models have a "mask" parameter in their inputSchema
   - Masks are for INPAINTING (editing specific areas), NOT standard reference-based generation
   - When using reference images for standard image-to-image: DO NOT include mask parameter
   - Only use mask if the user explicitly wants to edit/inpaint specific regions

5. **Generate the image** (call generate_image)
   - Use your selected modelId
   - Use your refined prompt
   - Create a creative, descriptive title (3-8 words):
     * With reference images: Focus on the transformation/style (e.g., "Anime Style Transformation", "Photorealistic Rendering")
     * Without reference images: Describe the scene/subject (e.g., "Majestic Horse at Sunrise")
   - Pass referenceImages array if provided by user
   - Include aspectRatio and negativePrompt
   - Call the tool and wait for result

6. **Present the result**
   - Share the image URL
   - Explain your model choice briefly
   - Mention key metadata (size, aspect ratio)
   - If user provided references, confirm they were used

Guidelines:
- Be creative but respect user intent
- **With reference images: Keep prompts minimal and general** - don't describe the subject, only the style/transformation
- **Without reference images: Be descriptive** - add details and quality tags to create the full scene
- Explain your reasoning briefly (which model and why)
- If generation fails, explain the issue and suggest a solution
- For follow-up requests, adjust parameters accordingly

Tools available:
- list_models: Get available models with capabilities
- generate_image: Execute image generation

IMPORTANT: You MUST call list_models first, then analyze the results and call generate_image with your selected model and refined prompt. Do NOT skip model selection.`;
}

/**
 * Map conversation history to Gemini contents format
 */
function mapHistoryToContents(history = []) {
  return history.map((entry) => ({
    role: entry.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: entry.content }]
  }));
}

/**
 * Stream Gemini orchestrator responses with tool calling
 */
async function streamGeminiOrchestrator({
  userId,
  message,
  conversationHistory = [],
  state = {},
  onChunk,
  onComplete,
  onError
}) {
  try {
    const ai = getGeminiClient();
    const tools = getToolDefinitions();
    const systemPrompt = buildSystemInstruction(state);

    const contents = [
      ...mapHistoryToContents(conversationHistory),
      {
        role: 'user',
        parts: [{ text: message }]
      }
    ];

    const configOptions = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: config.gemini.temperature,
        maxOutputTokens: config.gemini.maxOutputTokens
      },
      tools
    };

    console.log('[Orchestrator] Starting stream for user:', userId);
    console.log('[Orchestrator] Message:', message.substring(0, 80));

    const response = await ai.models.generateContentStream({
      model: config.gemini.model,
      config: configOptions,
      contents
    });

    let fullText = '';
    const functionCalls = [];

    for await (const chunk of response) {
      const chunkText = chunk.text;

      if (chunkText) {
        fullText += chunkText;
        onChunk({
          type: 'text',
          content: chunkText,
          delta: true
        });
      }

      if (chunk.candidates?.length) {
        for (const candidate of chunk.candidates) {
          const parts = candidate.content?.parts || [];
          for (const part of parts) {
            if (part.functionCall) {
              functionCalls.push(part.functionCall);
            }
          }
        }
      }
    }

    console.log('[Orchestrator] Stream complete. Function calls:', functionCalls.length);

    const toolResults = [];

    for (const toolCall of functionCalls) {
      const toolName = toolCall.name.replace(/_/g, '-');
      const toolArgs = { ...toolCall.args, userId };

      console.log('[Orchestrator] Executing tool:', toolName);

      onChunk({
        type: 'tool_call_start',
        toolName,
        toolArgs
      });

      try {
        const toolResult = await executeTool(toolName, toolArgs);
        toolResults.push({ name: toolName, result: toolResult });

        onChunk({
          type: 'tool_call_complete',
          toolName,
          result: toolResult
        });

        let followUpMessage = '';

        if (toolName === 'list-models') {
          const topModels = toolResult.models
            .slice(0, 5)
            .map(
              (model, index) => {
                const imageInputParams = Object.entries(model.inputSchema || {})
                  .filter(([_, param]) => param.isImageInput && !param.isMask)
                  .map(([name]) => name);
                const hasImageInput = imageInputParams.length > 0 ? ` [Image inputs: ${imageInputParams.join(', ')}]` : '';
                return `${index + 1}. ${model.name} (${model.id}) - Strengths: ${model.strengths.join(', ')}${hasImageInput}${model.runCount ? ` (${(model.runCount / 1000000).toFixed(1)}M runs)` : ''}`;
              }
            )
            .join('\n');
          followUpMessage = `Available models (${toolResult.total} total):\n${topModels}\n\nNow analyze the user's request and the model list. Select the BEST model based on:\n- User's intent (style, quality needs)\n- Reference image count if any (examine inputSchema for image input parameters, excluding masks)\n- Model strengths and popularity\n\nEach model has an inputSchema showing its parameters. Use this to understand:\n- Which models accept reference images (look for isImageInput: true, but ignore isMask: true)\n- Mask parameters are for inpainting only, not standard reference-based generation\n- What aspect ratios are supported\n- What other parameters are available\n\nThen refine the prompt and call generate_image with your selected model.`;
        } else if (toolName === 'generate-image') {
          followUpMessage = `Image generated successfully at ${toolResult.imageUrl}.\n\nTitle: ${toolResult.metadata.title}\nModel: ${toolResult.metadata.model.name}\nPrompt: ${toolResult.metadata.prompt}\nSize: ${toolResult.metadata.size}\n${toolResult.metadata.referenceImages.length > 0 ? `References: ${toolResult.metadata.referenceImages.length} image(s)\n` : ''}\nShare this with the user in a friendly way, explaining your model choice briefly.`;
        }

        if (followUpMessage) {
          const followUpContents = [
            ...contents,
            {
              role: 'model',
              parts: [{ text: fullText }]
            },
            {
              role: 'user',
              parts: [{ text: followUpMessage }]
            }
          ];

          const followUpResponse = await ai.models.generateContentStream({
            model: config.gemini.model,
            config: configOptions,
            contents: followUpContents
          });

          for await (const chunk of followUpResponse) {
            const chunkText = chunk.text;
            if (chunkText) {
              fullText += chunkText;
              onChunk({
                type: 'text',
                content: chunkText,
                delta: true
              });
            }
          }
        }
      } catch (toolError) {
        console.error('[Orchestrator] Tool execution failed:', toolName, toolError);

        onChunk({
          type: 'tool_call_error',
          toolName,
          error: toolError.message
        });

        const errorMessage = `The ${toolName} tool failed with: ${toolError.message}. Explain the issue gently and suggest a next step.`;
        const errorContents = [
          ...contents,
          {
            role: 'model',
            parts: [{ text: fullText }]
          },
          {
            role: 'user',
            parts: [{ text: errorMessage }]
          }
        ];

        const errorResponse = await ai.models.generateContentStream({
          model: config.gemini.model,
          config: configOptions,
          contents: errorContents
        });

        for await (const chunk of errorResponse) {
          const chunkText = chunk.text;
          if (chunkText) {
            fullText += chunkText;
            onChunk({
              type: 'text',
              content: chunkText,
              delta: true
            });
          }
        }
      }
    }

    onComplete({
      fullText,
      toolResults,
      nextAction: 'none'
    });
  } catch (error) {
    console.error('[Orchestrator] Stream error:', error);
    onError(error);
  }
}

/**
 * Non-streaming Gemini orchestrator for image generation
 * Returns JSON result without streaming
 */
async function generateWithGeminiOrchestrator({
  userId,
  prompt,
  referenceImages = [],
  state = {}
}) {
  try {
    const startTime = Date.now();
    console.log('[DEBUG] ========== Starting generateWithGeminiOrchestrator ==========');
    console.log('[DEBUG] Start time:', new Date().toISOString());
    
    const ai = getGeminiClient();
    const tools = getToolDefinitions();
    const systemPrompt = buildSystemInstruction(state);
    
    console.log('[DEBUG] Client initialized. Elapsed:', Date.now() - startTime, 'ms');

    // Normalize referenceImages to array
    let normalizedReferences = [];
    if (referenceImages) {
      if (Array.isArray(referenceImages)) {
        normalizedReferences = referenceImages.filter(ref => typeof ref === 'string' && ref.trim().length > 0);
      } else if (typeof referenceImages === 'string' && referenceImages.trim().length > 0) {
        normalizedReferences = [referenceImages.trim()];
      }
    }

    // Build user message
    let userMessage = prompt;
    if (normalizedReferences.length > 0) {
      userMessage += `\n\nReference images (${normalizedReferences.length}):\n${normalizedReferences.map((url, i) => `${i + 1}. ${url}`).join('\n')}`;
    }

    const contents = [
      {
        role: 'user',
        parts: [{ text: userMessage }]
      }
    ];

    const configOptions = {
      systemInstruction: {
        parts: [{ text: systemPrompt }]
      },
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 2048
      },
      tools
    };

    console.log('[Orchestrator] Starting non-streaming generation for user:', userId);
    console.log('[Orchestrator] Prompt:', prompt.substring(0, 80));
    console.log('[Orchestrator] Reference Images:', normalizedReferences.length);
    console.log('[DEBUG] Request prepared. Elapsed:', Date.now() - startTime, 'ms');

    // Initial LLM call
    console.log('[DEBUG] Calling Gemini API (initial)...');
    const llmStartTime = Date.now();
    let response = await ai.models.generateContent({
      model: config.gemini.model,
      contents,
      config: configOptions
    });
    console.log('[DEBUG] Initial Gemini API response received. Duration:', Date.now() - llmStartTime, 'ms');
    console.log('[DEBUG] Total elapsed:', Date.now() - startTime, 'ms');

    const toolResults = [];
    const conversationHistory = [...contents];
    let iterationCount = 0;
    const maxIterations = 10;

    // Loop through tool calls
    console.log('[DEBUG] Starting tool execution loop...');
    while (iterationCount < maxIterations) {
      const loopStartTime = Date.now();
      console.log('[DEBUG] --- Iteration', iterationCount + 1, '---');
      
      const candidates = response.candidates || [];
      if (candidates.length === 0) {
        console.log('[DEBUG] No candidates found, exiting loop');
        break;
      }

      const candidate = candidates[0];
      const parts = candidate.content?.parts || [];
      
      // Check for function calls
      const functionCalls = parts.filter(part => part.functionCall);
      
      if (functionCalls.length === 0) {
        // No more function calls, we're done
        console.log('[DEBUG] No more function calls, exiting loop');
        break;
      }

      console.log('[DEBUG] Found', functionCalls.length, 'function call(s) to execute');

      // Add model response to history
      conversationHistory.push({
        role: 'model',
        parts: candidate.content?.parts || []
      });

      // Execute each function call
      for (const part of functionCalls) {
        const functionCall = part.functionCall;
        const toolName = functionCall.name.replace(/_/g, '-');
        const toolArgs = { ...functionCall.args, userId };

        console.log('[Orchestrator] Executing tool:', toolName, 'args:', Object.keys(toolArgs));
        console.log('[DEBUG] Starting tool execution:', toolName);
        const toolStartTime = Date.now();

        try {
          const toolResult = await executeTool(toolName, toolArgs);
          const toolDuration = Date.now() - toolStartTime;
          console.log('[DEBUG] Tool execution completed:', toolName, 'Duration:', toolDuration, 'ms');
          console.log('[DEBUG] Total elapsed:', Date.now() - startTime, 'ms');
          
          toolResults.push({ name: toolName, result: toolResult });

          console.log('[Orchestrator] Tool result:', toolName, 'success:', toolResult.success);

          // Add function response to history
          conversationHistory.push({
            role: 'user',
            parts: [{
              functionResponse: {
                name: functionCall.name,
                response: toolResult
              }
            }]
          });
        } catch (toolError) {
          const toolDuration = Date.now() - toolStartTime;
          console.error('[Orchestrator] Tool execution failed:', toolName, toolError);
          console.log('[DEBUG] Tool execution failed. Duration:', toolDuration, 'ms');
          
          // Add error response
          conversationHistory.push({
            role: 'user',
            parts: [{
              functionResponse: {
                name: functionCall.name,
                response: {
                  success: false,
                  error: toolError.message
                }
              }
            }]
          });
        }
      }

      // Continue the conversation with tool results
      console.log('[DEBUG] Calling Gemini API (follow-up)...');
      const followUpStartTime = Date.now();
      response = await ai.models.generateContent({
        model: config.gemini.model,
        contents: conversationHistory,
        config: configOptions
      });
      console.log('[DEBUG] Follow-up Gemini API response received. Duration:', Date.now() - followUpStartTime, 'ms');
      console.log('[DEBUG] Iteration', iterationCount + 1, 'total duration:', Date.now() - loopStartTime, 'ms');
      console.log('[DEBUG] Total elapsed:', Date.now() - startTime, 'ms');

      iterationCount++;
    }
    
    console.log('[DEBUG] Tool execution loop completed after', iterationCount, 'iterations');

    // Extract final result
    console.log('[DEBUG] Extracting final result...');
    const resultStartTime = Date.now();
    
    const finalCandidate = response.candidates?.[0];
    const finalText = finalCandidate?.content?.parts
      ?.filter(part => part.text)
      ?.map(part => part.text)
      ?.join('') || '';

    // Find generate-image tool result
    const imageResult = toolResults.find(tr => tr.name === 'generate-image');
    
    console.log('[DEBUG] Result extraction completed. Duration:', Date.now() - resultStartTime, 'ms');
    console.log('[DEBUG] ========== Total Generation Time:', Date.now() - startTime, 'ms ==========');
    console.log('[DEBUG] End time:', new Date().toISOString());
    
    if (imageResult && imageResult.result.success) {
      console.log('[DEBUG] Returning successful image result');
      return {
        success: true,
        imageUrl: imageResult.result.imageUrl,
        metadata: imageResult.result.metadata,
        reasoning: finalText,
        toolCalls: toolResults.map(tr => ({
          tool: tr.name,
          success: tr.result.success
        }))
      };
    } else {
      console.log('[DEBUG] Returning failure - image generation not completed');
      return {
        success: false,
        error: 'Image generation was not completed',
        reasoning: finalText,
        toolCalls: toolResults.map(tr => ({
          tool: tr.name,
          success: tr.result.success
        }))
      };
    }
  } catch (error) {
    console.error('[Orchestrator] Generation error:', error);
    console.error('[DEBUG] Error occurred in generateWithGeminiOrchestrator');
    throw error;
  }
}

module.exports = {
  streamGeminiOrchestrator,
  generateWithGeminiOrchestrator,
  getToolDefinitions
};
