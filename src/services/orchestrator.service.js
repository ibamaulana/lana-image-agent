/**
 * Gemini Streaming Orchestrator Service
 * Lightweight conversational layer for the simplified image workflow
 */

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');
const { GoogleGenAI } = require('@google/genai');
const { executeTool } = require('./tool-executor.service');
const { config } = require('../config/env.config');
const z = require('zod');

const gxaiCacheDir = path.join(__dirname, '..', '..', '.cache');
const gxaiBundlePath = path.join(gxaiCacheDir, 'gxai-agent.cjs');
let gxaiModule = null;

function getGxaiModule() {
  if (gxaiModule) {
    return gxaiModule;
  }

  const entryPath = require.resolve('gxai/main.ts');
  const needsBuild =
    !fs.existsSync(gxaiBundlePath) ||
    fs.statSync(gxaiBundlePath).mtimeMs < fs.statSync(entryPath).mtimeMs;

  if (needsBuild) {
    fs.mkdirSync(gxaiCacheDir, { recursive: true });
    try {
      esbuild.buildSync({
        entryPoints: [entryPath],
        outfile: gxaiBundlePath,
        bundle: true,
        platform: 'node',
        format: 'cjs',
        target: 'node18',
        logLevel: 'warning',
        sourcemap: false,
      });
    } catch (error) {
      console.error('[GXAI] Failed to bundle gxai/main.ts with esbuild', error);
      throw new Error(
        'Unable to compile gxai runtime dependency. Ensure esbuild is installed (npm install esbuild) and retry.'
      );
    }
  }

  gxaiModule = require(gxaiBundlePath);
  return gxaiModule;
}

const { Agent } = getGxaiModule();

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
            'List available image generation models with their capabilities and strengths. Models are pre-filtered based on requirements, so you get the best matches.',
          parameters: {
            type: 'object',
            properties: {
              referenceImageCount: {
                type: 'number',
                description: 'Optional filter: 0 for text-to-image only, 1 for single reference support, >1 for multiple reference support (legacy, use modelRequirements instead)'
              },
              modelRequirements: {
                type: 'object',
                description: 'Model requirements from refined prompt (preferred method)',
                properties: {
                  needsReferenceImages: { type: 'boolean' },
                  minQuality: { type: 'string' },
                  styleFocus: { type: 'array', items: { type: 'string' } },
                  speedPreference: { type: 'string' },
                  preferredModel: { type: 'string' },
                  aspectRatio: { type: 'string' }
                }
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
     * Avoid model that has mask parameters
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
    - Simply ensure the prompt references the image, then include the user's intent
    - Examples:
      * User: "change this to anime style" → Prompt: "based on this reference image, anime style, vibrant colors, clean lines"
      * User: "add multiple hands" → Prompt: "based on this reference image, add multiple hands"
      * User: "make it photorealistic" → Prompt: "based on this reference image, photorealistic, highly detailed, sharp focus"
      * User: "remove the background" → Prompt: "based on this reference image, remove the background, clean edges"
    - DO NOT add unnecessary subject descriptions (like "girl", "horse", "building") - the reference already has the subject
    - The reference image is the source of truth for WHAT to generate
    - The prompt should start with "based on this reference image," followed by the user's requested modifications
   
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
 * Helper function to fetch image as base64 for multimodal analysis
 */
async function fetchImageAsBase64(imageUrl) {
  try {
    const axios = require('axios');
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000 // 10 second timeout
    });
    
    const buffer = Buffer.from(response.data);
    const base64 = buffer.toString('base64');
    
    // Detect mime type from response headers or URL
    let mimeType = response.headers['content-type'] || 'image/jpeg';
    if (!mimeType.startsWith('image/')) {
      // Fallback mime type detection from URL
      if (imageUrl.toLowerCase().endsWith('.png')) mimeType = 'image/png';
      else if (imageUrl.toLowerCase().endsWith('.gif')) mimeType = 'image/gif';
      else if (imageUrl.toLowerCase().endsWith('.webp')) mimeType = 'image/webp';
      else mimeType = 'image/jpeg';
    }
    
    return { base64, mimeType };
  } catch (error) {
    console.error('[Image Fetch] Failed to fetch image:', imageUrl, error.message);
    throw error;
  }
}

/**
 * Build multimodal parts for Gemini (text + images)
 */
async function buildMultimodalParts(text, imageUrls = []) {
  const parts = [{ text }];
  
  for (const imageUrl of imageUrls) {
    try {
      const { base64, mimeType } = await fetchImageAsBase64(imageUrl);
      parts.push({
        inlineData: {
          mimeType,
          data: base64
        }
      });
    } catch (error) {
      console.warn('[Multimodal] Skipping image due to fetch error:', imageUrl);
      // Add a text note about the failed image
      parts.push({ text: `\n[Note: Could not load reference image: ${imageUrl}]` });
    }
  }
  
  return parts;
}

/**
 * Get user-friendly error message based on safety category
 */
function getSafetyErrorMessage(category) {
  const messages = {
    nsfw: 'Your request contains adult or sexually explicit content which is not allowed. Please revise your prompt to be family-friendly.',
    child_safety: 'Your request may involve content related to minors in an inappropriate context. This is strictly prohibited for safety reasons.',
    violence: 'Your request contains graphic violence or gore which exceeds our content guidelines. Please consider a less explicit approach.',
    illegal: 'Your request involves illegal activities or content which we cannot generate.',
    error: 'We were unable to verify the safety of your request. Please try rephrasing your prompt.'
  };
  
  return messages[category] || 'Your request violates our content policy. Please revise and try again.';
}

/**
 * Phase 0: Content Safety Check
 * Analyzes both text prompt and reference images for prohibited content
 */
async function checkContentSafety({
  prompt,
  referenceImages = []
}) {
    const ai = getGeminiClient();
  
  const safetySystemPrompt = `You are a content safety moderator for an AI image generation service.

Your job is to analyze user prompts AND reference images to determine if they contain prohibited content.

**PROHIBITED CONTENT:**
1. **NSFW/Adult Content:**
   - Sexually explicit content
   - Nudity or sexual acts
   - Adult/pornographic themes
   - Suggestive or sexual content
   - Revealing clothing or poses with sexual intent
   
2. **Child Safety (STRICT):**
   - Any content involving minors in inappropriate contexts
   - Child exploitation or endangerment
   - Sexualization of minors
   - Children in revealing clothing or suggestive poses
   - ANY combination of children + inappropriate context
   
3. **Violence/Gore:**
   - Extreme violence or graphic gore
   - Realistic depictions of serious harm or death
   - Excessive blood or mutilation
   
4. **Illegal Content:**
   - Illegal activities or promotion thereof
   - Weapons being used to harm people
   - Drug manufacturing or use

**ALLOWED CONTENT:**
- Artistic nudity in classical art context (statues, famous paintings)
- Medical/educational anatomy diagrams
- Fashion/swimwear in appropriate adult modeling context
- Age-appropriate content suitable for all audiences
- Fantasy violence (gaming, comics) without realistic gore
- Historical or documentary content with context

**When analyzing REFERENCE IMAGES:**
- Look at the actual visual content
- Consider what the user might be trying to replicate or modify
- If an image shows prohibited content, flag it even if the text prompt seems innocent
- Consider the combination of image + text prompt

**Analysis Instructions:**
1. Read the user's text prompt carefully
2. Examine any reference images provided
3. Consider context and intent from both text and images
4. Be EXTREMELY strict about child safety - ANY doubt should flag it
5. Be reasonable about artistic expression for adults
6. Consider if combining the text + images creates problematic intent

**Output Format (JSON only, no markdown):**
{
  "safe": true or false,
  "reason": "Brief explanation if unsafe, empty string if safe",
  "category": "nsfw" | "child_safety" | "violence" | "illegal" | "safe",
  "confidence": 0.0 to 1.0
}

Examples:
- Text: "a beautiful sunset" + No images → {"safe": true, "reason": "", "category": "safe", "confidence": 1.0}
- Text: "make this sexier" + Image of person → {"safe": false, "reason": "Request to sexualize content", "category": "nsfw", "confidence": 0.9}
- Text: "anime style" + Image of child → {"safe": false, "reason": "Child in reference image with transformation request", "category": "child_safety", "confidence": 0.95}
- Text: "epic battle scene" + No images → {"safe": true, "reason": "", "category": "safe", "confidence": 0.95}

Output ONLY valid JSON, no other text.`;

  let userMessage = `Analyze this for content safety:\n\nTEXT PROMPT: "${prompt}"`;
  
  if (referenceImages.length > 0) {
    userMessage += `\n\nREFERENCE IMAGES: ${referenceImages.length} image(s) provided below. Please examine them carefully.`;
  }

  console.log('[Phase 0 - Safety] Analyzing prompt and', referenceImages.length, 'reference image(s)...');

  try {
    // Build multimodal parts (text + images)
    const parts = await buildMultimodalParts(userMessage, referenceImages);

    const response = await ai.models.generateContent({
      model: "gemini-flash-latest",
      contents: [{
        role: 'user',
        parts
      }],
      config: {
        systemInstruction: {
          parts: [{ text: safetySystemPrompt }]
        },
        generationConfig: {
          temperature: 0.2, // Very low temperature for consistent safety decisions
          maxOutputTokens: 512
        }
      }
    });

    const responseText = response.candidates?.[0]?.content?.parts
      ?.filter(part => part.text)
      ?.map(part => part.text)
      ?.join('') || '';

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      // If we can't parse the safety response, fail safe and reject
      console.error('[Phase 0 - Safety] Failed to parse safety response');
      return {
        safe: false,
        reason: 'Unable to verify content safety',
        category: 'error',
        confidence: 1.0
      };
    }

    const safetyResult = JSON.parse(jsonMatch[0]);
    console.log('[Phase 0 - Safety] Result:', safetyResult);
    
    return safetyResult;
  } catch (error) {
    console.error('[Phase 0 - Safety] Error during safety check:', error);
    // Fail safe: reject on error
    return {
      safe: false,
      reason: 'Error during safety verification',
      category: 'error',
      confidence: 1.0
    };
  }
}

/**
 * Phase 1: Prompt Refiner
 * Analyzes prompt and reference images to output structured refinement data
 */
async function refinePromptWithGemini({
  userId,
  prompt,
  referenceImages = []
}) {
  const ai = getGeminiClient();
  
  const refinerSystemPrompt = `You are a prompt refinement specialist for AI image generation.

Your job is to analyze the user's request (text + any reference images) and output a structured JSON response.

**DETECT MODEL PREFERENCE:**
- Check if the user explicitly mentions a specific model name in their request
- Examples: "use flux", "with seedream", "stable diffusion", "SDXL", "flux-dev", "flux-schnell"
- If detected, extract the model name/keyword and include it in preferred_model
- If no specific model mentioned, leave preferred_model as null or empty

**If reference images are provided:**
- Mode: "image_to_image"
- EXAMINE the reference images to understand what the user is working with
- Keep refined_prompt MINIMAL and GENERAL - the reference defines the subject
- Focus on the transformation/style the user wants

**If NO reference images (text-to-image):**
- Mode: "text_to_image"
- ENHANCE the prompt with quality tags and descriptive details
- Example: "a horse" → "a majestic horse running through a field at sunrise, highly detailed, professional photography, sharp focus, 8k, dramatic lighting"

**Output Format (JSON only, no markdown):**
{
  "mode": "text_to_image" or "image_to_image",
  "title": "Creative 3-8 word title for the image",
  "refined_prompt": "The refined prompt string (remove model name if mentioned)",
  "aspect_ratio": "1:1" | "16:9" | "9:16" | "4:5",
  "style": "photorealistic" | "anime" | "artistic" | "digital-art" | "fantasy" | "cinematic" | etc.,
  "preferred_model": "model name/keyword if user specified, otherwise null",
  "referenceImages": ["url1", "url2"],
  "modelRequirements": {
    "needsReferenceImages": true or false,
    "minQuality": "low" | "moderate" | "good" | "very-good" | "excellent",
    "styleFocus": ["photorealistic", "anime", etc.],
    "speedPreference": "fast" | "no" | null,
    "useCase": "brief description of use case if clear",
    "specialNeeds": ["handles faces well", "good at hands", etc.]
  }
}

**Model Requirements Guidelines:**
- needsReferenceImages: true if reference images provided, false otherwise
- minQuality: Infer from user language:
  * "high quality", "detailed", "professional", "best" → "excellent"
  * "good quality", "nice" → "very-good"
  * "quick", "fast", "simple" → "good" or "moderate"
  * Default: "good"
- styleFocus: Array of style keywords matching the "style" field
- speedPreference: "fast" if user emphasizes speed/quick, "no" if quality is priority, null otherwise
- useCase: Brief description if clear (e.g., "portrait generation", "product photography", "concept art")
- specialNeeds: Array of specific requirements mentioned:
  * "faces", "portrait", "people" → ["handles faces well"]
  * "hands" → ["good at hands"]
  * "text", "words" → ["handles text well"]
  * "consistency" → ["maintains consistency"]

**Aspect Ratio Guidelines:**
- If reference images provided: analyze their aspect ratio and match it
- Portrait/person/selfie → "9:16"
- Landscape/wide/panorama → "16:9"
- Square/icon/logo → "1:1"
- Social media post → "4:5"

**Style Guidelines:**
Infer from user's language, intent, and reference images:
- "realistic", "photo" → "photorealistic"
- "anime", "manga", "cartoon" → "anime"
- "painting", "art", "watercolor" → "artistic"
- "3d render", "cgi" → "digital-art"
- "movie", "film" → "cinematic"
- If reference images: try to match their visual style

**Title Creation:**
- With reference images: Focus on transformation (e.g., "Anime Style Transformation", "Dramatic Cinematic Rendering")
- Without reference images: Describe the scene (e.g., "Majestic Horse at Golden Sunrise")

**Important about preferred_model:**
- Extract model keywords like: "flux", "seedream", "stable-diffusion", "sdxl", "flux-dev", "flux-schnell", etc.
- Remove the model reference from refined_prompt - don't include "use flux" in the actual image prompt
- Be flexible with variations: "flux dev" → "flux-dev", "stable diffusion" → "stable-diffusion"

Output ONLY valid JSON, no other text.`;

  let userMessage = `Refine this image generation request:\n\nUSER PROMPT: "${prompt}"`;
  
  if (referenceImages.length > 0) {
    userMessage += `\n\nREFERENCE IMAGES: ${referenceImages.length} image(s) provided below. Examine them to understand what the user wants to transform or use as inspiration.`;
  }

  console.log('[Phase 1 - Refiner] Analyzing prompt and', referenceImages.length, 'reference image(s)...');

  try {
    // Build multimodal parts (text + images)
    const parts = await buildMultimodalParts(userMessage, referenceImages);

    const response = await ai.models.generateContent({
      model: "gemini-2.5-pro",
      contents: [{
        role: 'user',
        parts
      }],
      config: {
        systemInstruction: {
          parts: [{ text: refinerSystemPrompt }]
        },
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 1024
        }
      }
    });

    const responseText = response.candidates?.[0]?.content?.parts
      ?.filter(part => part.text)
      ?.map(part => part.text)
      ?.join('') || '';

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from refiner response');
    }

    const refinedData = JSON.parse(jsonMatch[0]);
    
    // Ensure referenceImages array is included
    refinedData.referenceImages = referenceImages;
    
    // Ensure modelRequirements has defaults
    if (!refinedData.modelRequirements) {
      refinedData.modelRequirements = {};
    }
    
    // Set needsReferenceImages based on actual reference images
    refinedData.modelRequirements.needsReferenceImages = referenceImages.length > 0;
    
    // Ensure styleFocus includes the style
    if (!refinedData.modelRequirements.styleFocus) {
      refinedData.modelRequirements.styleFocus = [];
    }
    if (refinedData.style && !refinedData.modelRequirements.styleFocus.includes(refinedData.style)) {
      refinedData.modelRequirements.styleFocus.push(refinedData.style);
    }
    
    // Set default minQuality if not specified
    if (!refinedData.modelRequirements.minQuality) {
      refinedData.modelRequirements.minQuality = 'good';
    }
    
    // Add preferred_model to modelRequirements if specified
    if (refinedData.preferred_model) {
      refinedData.modelRequirements.preferredModel = refinedData.preferred_model;
    }
    
    // Add aspectRatio to modelRequirements
    if (refinedData.aspect_ratio) {
      refinedData.modelRequirements.aspectRatio = refinedData.aspect_ratio;
    }
    
    console.log('[Phase 1 - Refiner] Output:', refinedData);
    console.log('[Phase 1 - Refiner] Model Requirements:', refinedData.modelRequirements);
    
    return refinedData;
  } catch (error) {
    console.error('[Phase 1 - Refiner] Error during refinement:', error);
    throw error;
  }
}

/**
 * Phase 2: Image Generation Agent
 * Uses refined data to select model and generate image
 */
async function generateImageWithAgent({
  userId,
  refinedData,
  state = {}
}) {
  const ai = getGeminiClient();
  const tools = getToolDefinitions();
  
  const agentSystemPrompt = `You are an AI image generation agent.

You receive a refined prompt specification and must execute EXACTLY this workflow:

1. **Call list_models ONCE** to get available models
   - **IMPORTANT**: Pass the modelRequirements from the input specification
   - The models will be pre-filtered and scored based on these requirements
   - You'll receive the top 3-5 best matching models
   - Example: list_models({ modelRequirements: { needsReferenceImages: true, minQuality: "excellent", styleFocus: ["photorealistic"], preferredModel: "flux-dev" } })

2. **Select THE BEST model from the filtered list** (only one)
   - Models are already filtered and ranked by relevance
   - Read the summary.oneLinePitch and summary.bestFor for each model
   - Check summary.qualityProfile to understand speed/quality trade-offs
   - If user specified a preferred_model, prioritize it if it appears in the list
   - Consider the summary.typicalUseCase to see if it matches the user's intent
   - Select the model that best matches the refined_prompt requirements

3. **Call generate_image ONCE** with your selected model:
   - Your selected modelId (only the best one)
   - The refined_prompt provided to you
   - The title, aspect_ratio, style, and referenceImages from the input
   - Add appropriate negativePrompt: "blurry, low quality, distorted, ugly, bad anatomy, watermark, text"

IMPORTANT: 
- Call list_models ONCE with modelRequirements
- The models are pre-filtered - trust the filtering and pick from the provided list
- Select ONE best model from the filtered results
- Call generate_image ONCE
- STOP after successful generation - do not try other models`;

  const inputSpec = JSON.stringify(refinedData, null, 2);
  
  console.log('[Phase 2 - Agent] Starting generation with refined data');
  console.log('[Phase 2 - Agent] Mode:', refinedData.mode);
  console.log('[Phase 2 - Agent] Style:', refinedData.style);
  console.log('[Phase 2 - Agent] References:', refinedData.referenceImages?.length || 0);

  const contents = [{
    role: 'user',
    parts: [{ text: `Generate image with this specification:\n${inputSpec}` }]
  }];

    const configOptions = {
      systemInstruction: {
      parts: [{ text: agentSystemPrompt }]
      },
      generationConfig: {
      temperature: 0.3,
        maxOutputTokens: 2048
      },
      tools
    };

    let response = await ai.models.generateContent({
      model: config.gemini.model,
      contents,
      config: configOptions
    });

    const toolResults = [];
    const conversationHistory = [...contents];
    let iterationCount = 0;
    const maxIterations = 10;

  // Tool execution loop
    while (iterationCount < maxIterations) {
      const candidates = response.candidates || [];
    if (candidates.length === 0) break;

      const candidate = candidates[0];
      const parts = candidate.content?.parts || [];
      const functionCalls = parts.filter(part => part.functionCall);
      
    if (functionCalls.length === 0) break;

      conversationHistory.push({
        role: 'model',
        parts: candidate.content?.parts || []
      });

      for (const part of functionCalls) {
        const functionCall = part.functionCall;
        const toolName = functionCall.name.replace(/_/g, '-');
        let toolArgs = { ...functionCall.args, userId };
        
        // Auto-inject modelRequirements for list_models if not provided by LLM
        if (toolName === 'list-models' && refinedData.modelRequirements && !toolArgs.modelRequirements) {
          toolArgs.modelRequirements = refinedData.modelRequirements;
          console.log('[Phase 2 - Agent] Auto-injected modelRequirements for list_models');
        }

        console.log('[Phase 2 - Agent] Executing tool:', toolName);

        try {
          const toolResult = await executeTool(toolName, toolArgs);
          toolResults.push({ name: toolName, result: toolResult });

          console.log('[Phase 2 - Agent] Tool result:', toolName, 'success:', toolResult.success);

          // If this is a successful image generation, return immediately
          if (toolName === 'generate-image' && toolResult.success) {
            console.log('[Phase 2 - Agent] ✓ Image generated successfully, returning result');
            return {
              success: true,
              imageUrl: toolResult.imageUrl,
              metadata: toolResult.metadata,
              refinedData,
              toolCalls: toolResults.map(tr => ({
                tool: tr.name,
                success: tr.result.success
              }))
            };
          }

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
          console.error('[Phase 2 - Agent] Tool execution failed:', toolName, toolError);
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

      response = await ai.models.generateContent({
        model: config.gemini.model,
        contents: conversationHistory,
        config: configOptions
      });

      iterationCount++;
    }
    
  // Extract result
    const imageResult = toolResults.find(tr => tr.name === 'generate-image');
    
    if (imageResult && imageResult.result.success) {
      return {
        success: true,
        imageUrl: imageResult.result.imageUrl,
        metadata: imageResult.result.metadata,
      refinedData,
        toolCalls: toolResults.map(tr => ({
          tool: tr.name,
          success: tr.result.success
        }))
      };
    } else {
      return {
        success: false,
        error: 'Image generation was not completed',
        toolCalls: toolResults.map(tr => ({
          tool: tr.name,
          success: tr.result.success
        }))
      };
    }
}

/**
 * Three-phase Gemini orchestrator for image generation
 * Phase 0: Content safety check (with image analysis)
 * Phase 1: Prompt refinement (with image analysis)
 * Phase 2: Model selection & generation (with tools)
 */
async function generateWithGeminiOrchestrator({
  userId,
  prompt,
  referenceImages = [],
  state = {}
}) {
  try {
    const startTime = Date.now();
    console.log('[Orchestrator] ========== Starting Three-Phase Generation ==========');
    console.log('[Orchestrator] User:', userId);
    console.log('[Orchestrator] Prompt:', prompt.substring(0, 100));
    
    // Normalize reference images
    let normalizedReferences = [];
    if (referenceImages) {
      if (Array.isArray(referenceImages)) {
        normalizedReferences = referenceImages.filter(ref => 
          typeof ref === 'string' && ref.trim().length > 0
        );
      } else if (typeof referenceImages === 'string' && referenceImages.trim().length > 0) {
        normalizedReferences = [referenceImages.trim()];
      }
    }
    
    console.log('[Orchestrator] Reference Images:', normalizedReferences.length);

    // ===== PHASE 0: Content Safety Check =====
    console.log('[Phase 0] Starting content safety check...');
    const phaseZeroStart = Date.now();
    
    const safetyResult = await checkContentSafety({
      prompt,
      referenceImages: normalizedReferences
    });
    
    const phaseZeroDuration = Date.now() - phaseZeroStart;
    console.log('[Phase 0] Completed in', phaseZeroDuration, 'ms');
    console.log('[Phase 0] Result:', safetyResult.safe ? 'SAFE' : 'UNSAFE -', safetyResult.category);

    // If content is not safe, return error immediately
    if (!safetyResult.safe) {
      console.warn('[Phase 0] Content flagged as', safetyResult.category);
      return {
        success: false,
        error: 'Content policy violation',
        safetyCheck: {
          safe: false,
          reason: safetyResult.reason,
          category: safetyResult.category,
          message: getSafetyErrorMessage(safetyResult.category),
          confidence: safetyResult.confidence
        },
        phaseTimings: {
          safety: phaseZeroDuration,
          total: Date.now() - startTime
        }
      };
    }

    console.log('[Phase 0] ✓ Content approved, proceeding to refinement');

    // ===== PHASE 1: Prompt Refinement =====
    console.log('[Phase 1] Starting prompt refinement...');
    const phaseOneStart = Date.now();
    
    const refinedData = await refinePromptWithGemini({
      userId,
      prompt,
      referenceImages: normalizedReferences
    });
    
    const phaseOneDuration = Date.now() - phaseOneStart;
    console.log('[Phase 1] Completed in', phaseOneDuration, 'ms');
    console.log('[Phase 1] Mode:', refinedData.mode);
    console.log('[Phase 1] Title:', refinedData.title);
    console.log('[Phase 1] Style:', refinedData.style);

    // ===== PHASE 2: Image Generation =====
    console.log('[Phase 2] Starting image generation...');
    const phaseTwoStart = Date.now();
    
    const result = await generateImageWithAgent({
      userId,
      refinedData,
      state
    });
    
    const phaseTwoDuration = Date.now() - phaseTwoStart;
    console.log('[Phase 2] Completed in', phaseTwoDuration, 'ms');

    const totalDuration = Date.now() - startTime;
    console.log('[Orchestrator] ========== Total Time:', totalDuration, 'ms ==========');
    
    // Add safety check and timing info to successful response
    return {
      ...result,
      safetyCheck: {
        safe: true,
        category: 'safe',
        confidence: safetyResult.confidence
      },
      phaseTimings: {
        safety: phaseZeroDuration,
        refinement: phaseOneDuration,
        generation: phaseTwoDuration,
        total: totalDuration
      }
    };
  } catch (error) {
    console.error('[Orchestrator] Generation error:', error);
    throw error;
  }
}

async function generateWithGeminiOrchestratorGx({
  userId,
  prompt,
  referenceImages = [],
  state = {}
}) {
  try {
    const startTime = Date.now();
    console.log('[Orchestrator] ========== Starting Three-Phase Generation ==========');
    console.log('[Orchestrator] User:', userId);
    console.log('[Orchestrator] Prompt:', prompt.substring(0, 100));
    
    // Normalize reference images
    let normalizedReferences = [];
    if (referenceImages) {
      if (Array.isArray(referenceImages)) {
        normalizedReferences = referenceImages.filter(ref => 
          typeof ref === 'string' && ref.trim().length > 0
        );
      } else if (typeof referenceImages === 'string' && referenceImages.trim().length > 0) {
        normalizedReferences = [referenceImages.trim()];
      }
    }
    
    console.log('[Orchestrator] Reference Images:', normalizedReferences.length);

    // ===== PHASE 0: Content Safety Check =====
    console.log('[Phase 0] Starting content safety check...');
    const phaseZeroStart = Date.now();

    const safetyAgent = new Agent({
      llm: 'o4-mini-2025-04-16', // Your LLM model (e.g., OpenAI GPT variant)
      inputFormat: z.object({
        prompt: z.string(),
        referenceImages: z.array(z.string()),
      }),
      outputFormat: z.object({
        safe: z.boolean(),
        reason: z.string(),
        category: z.enum(['nsfw', 'child_safety', 'violence', 'illegal', 'safe']),
        confidence: z.number().min(0).max(1),
      }),
      temperature: 0.7, // Optional: Controls creativity (0-1)
    });

    const safetyResultGx = await safetyAgent.run({
      prompt,
      referenceImages: normalizedReferences
    });

    console.log('[Phase 0] Result:', safetyResultGx);
    
    const safetyResult = await checkContentSafety({
      prompt,
      referenceImages: normalizedReferences
    });
    
    const phaseZeroDuration = Date.now() - phaseZeroStart;
    console.log('[Phase 0] Completed in', phaseZeroDuration, 'ms');
    console.log('[Phase 0] Result:', safetyResult.safe ? 'SAFE' : 'UNSAFE -', safetyResult.category);

    // If content is not safe, return error immediately
    if (!safetyResult.safe) {
      console.warn('[Phase 0] Content flagged as', safetyResult.category);
      return {
        success: false,
        error: 'Content policy violation',
        safetyCheck: {
          safe: false,
          reason: safetyResult.reason,
          category: safetyResult.category,
          message: getSafetyErrorMessage(safetyResult.category),
          confidence: safetyResult.confidence
        },
        phaseTimings: {
          safety: phaseZeroDuration,
          total: Date.now() - startTime
        }
      };
    }

    console.log('[Phase 0] ✓ Content approved, proceeding to refinement');

    // ===== PHASE 1: Prompt Refinement =====
    console.log('[Phase 1] Starting prompt refinement...');
    const phaseOneStart = Date.now();
    
    const refinedData = await refinePromptWithGemini({
      userId,
      prompt,
      referenceImages: normalizedReferences
    });
    
    const phaseOneDuration = Date.now() - phaseOneStart;
    console.log('[Phase 1] Completed in', phaseOneDuration, 'ms');
    console.log('[Phase 1] Mode:', refinedData.mode);
    console.log('[Phase 1] Title:', refinedData.title);
    console.log('[Phase 1] Style:', refinedData.style);

    // ===== PHASE 2: Image Generation =====
    console.log('[Phase 2] Starting image generation...');
    const phaseTwoStart = Date.now();
    
    const result = await generateImageWithAgent({
      userId,
      refinedData,
      state
    });
    
    const phaseTwoDuration = Date.now() - phaseTwoStart;
    console.log('[Phase 2] Completed in', phaseTwoDuration, 'ms');

    const totalDuration = Date.now() - startTime;
    console.log('[Orchestrator] ========== Total Time:', totalDuration, 'ms ==========');
    
    // Add safety check and timing info to successful response
    return {
      ...result,
      safetyCheck: {
        safe: true,
        category: 'safe',
        confidence: safetyResult.confidence
      },
      phaseTimings: {
        safety: phaseZeroDuration,
        refinement: phaseOneDuration,
        generation: phaseTwoDuration,
        total: totalDuration
      }
    };
  } catch (error) {
    console.error('[Orchestrator] Generation error:', error);
    throw error;
  }
}

module.exports = {
  streamGeminiOrchestrator,
  generateWithGeminiOrchestratorGx,
  generateWithGeminiOrchestrator,
  getToolDefinitions,
  checkContentSafety,
  getSafetyErrorMessage
};
