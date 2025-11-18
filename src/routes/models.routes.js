/**
 * Models Routes
 * Endpoints for fetching and caching model data with READMEs
 */

const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const Replicate = require('replicate');
const { config } = require('../config/env.config');
const { GoogleGenAI } = require('@google/genai');

let geminiClient = null;

function getGeminiClient() {
  if (!config.gemini.apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: config.gemini.apiKey });
  }
  return geminiClient;
}

/**
 * Extract simplified input schema from OpenAPI schema
 */
function extractSimplifiedSchema(modelSchema) {
  const simplified = {};

  try {
    const properties = modelSchema?.openapi_schema?.components?.schemas?.Input?.properties;
    const required = modelSchema?.openapi_schema?.components?.schemas?.Input?.required || [];
    
    if (!properties) {
      return simplified;
    }

    for (const [key, value] of Object.entries(properties)) {
      const paramInfo = {
        type: value.type || 'string',
        description: value.description || '',
        required: required.includes(key)
      };

      if (value.enum && Array.isArray(value.enum)) {
        paramInfo.options = value.enum;
      }

      if (value.default !== undefined) {
        paramInfo.default = value.default;
      }

      if (value.format) {
        paramInfo.format = value.format;
      }

      if (value.allOf) {
        const allOfTypes = value.allOf.map(item => item.type).filter(Boolean);
        if (allOfTypes.length > 0) {
          paramInfo.type = allOfTypes[0];
        }
      }

      // Detect if parameter is for image input
      const isImageParam = 
        key.toLowerCase().includes('image') || 
        value.format === 'uri' ||
        (value.description && value.description.toLowerCase().includes('image'));
      
      if (isImageParam) {
        paramInfo.isImageInput = true;
      }

      // Detect mask parameters
      const isMaskParam = 
        key.toLowerCase() === 'mask' ||
        key.toLowerCase().includes('mask') ||
        (value.description && value.description.toLowerCase().includes('mask for inpainting'));
      
      if (isMaskParam) {
        paramInfo.isMask = true;
        paramInfo.optionalForReferenceImages = true;
      }

      simplified[key] = paramInfo;
    }
  } catch (error) {
    console.warn('Could not extract simplified schema:', error.message);
  }

  return simplified;
}

/**
 * Check if model is an image generation model
 */
function isImageGenerationModel(model) {
  const name = (model.name || '').toLowerCase();
  const description = (model.description || '').toLowerCase();
  const tags = (model.tags || []).map(t => t.toLowerCase());

  const imageKeywords = [
    'image', 'text-to-image', 'generation', 'diffusion', 'flux',
    'stable-diffusion', 'sdxl', 'dalle', 'midjourney', 'art', 'picture', 'photo'
  ];

  const excludeKeywords = [
    'upscale', 'super-resolution', 'video', 'audio', 'music', 'speech',
    'text-only', 'captioning', 'detection', 'segmentation', 'classification', 'face-swap'
  ];

  const hasExcluded = excludeKeywords.some(keyword => 
    name.includes(keyword) || description.includes(keyword) || tags.includes(keyword)
  );

  if (hasExcluded) return false;

  const hasImageKeyword = imageKeywords.some(keyword => 
    name.includes(keyword) || description.includes(keyword) || tags.includes(keyword)
  );

  return hasImageKeyword;
}

/**
 * GET /api/models/fetch-source
 * Fetches all official image generation models with their READMEs
 * Saves to storage/model-source.json
 */
router.get('/fetch-source', async (req, res) => {
  try {
    console.log('🔍 Starting model source fetch...');
    
    const apiToken = config.replicate.apiToken;
    if (!apiToken) {
      return res.status(500).json({
        success: false,
        error: 'REPLICATE_API_TOKEN is not configured'
      });
    }

    const replicate = new Replicate({ auth: apiToken });
    
    // Fetch the text-to-image collection
    console.log('📦 Fetching text-to-image collection...');
    const collection = await replicate.collections.get('text-to-image');
    const models = collection.models || collection.results || [];
    
    console.log(`Found ${models.length} models in collection`);

    const modelSource = {
      fetchedAt: new Date().toISOString(),
      totalModels: 0,
      models: []
    };

    let processedCount = 0;
    let errorCount = 0;

    for (const model of models) {
      // Only process official models that are image generation models
      if (model.is_official !== true || !isImageGenerationModel(model)) {
        continue;
      }

      try {
        const owner = model.owner || 'unknown';
        const name = model.name || 'unknown';
        
        console.log(`📥 Fetching README for ${owner}/${name}...`);
        
        // Fetch README using the correct endpoint
        const readmeUrl = `https://api.replicate.com/v1/models/${owner}/${name}/readme`;
        const readmeResponse = await fetch(readmeUrl, {
          headers: {
            'Authorization': `Token ${apiToken}`,
            'Content-Type': 'application/json'
          }
        });

        let readme = '';
        if (readmeResponse.ok) {
          // Endpoint returns raw markdown text
          readme = await readmeResponse.text();
          console.log(`   ✓ README fetched (${readme.length} chars)`);
        } else {
          console.warn(`   ⚠️  README fetch failed: ${readmeResponse.status}`);
        }

        modelSource.models.push({
          id: name,
          name: model.name,
          owner: owner,
          fullName: `${owner}/${name}`,
          createdAt: model.created_at || null,
          runCount: model.run_count || 0,
          isOfficial: model.is_official || false,
          coverImageUrl: model.cover_image_url || null,
          url: model.url || null,
          inputSchema: extractSimplifiedSchema(model.latest_version),
          readme: readme
        });

        processedCount++;
      } catch (error) {
        console.error(`   ❌ Error processing ${model.owner}/${model.name}:`, error.message);
        errorCount++;
      }
    }

    modelSource.totalModels = modelSource.models.length;

    // Save to storage/model-source.json
    const storagePath = path.join(__dirname, '../../storage/model-source.json');
    fs.writeFileSync(storagePath, JSON.stringify(modelSource, null, 2), 'utf-8');
    
    console.log(`✅ Model source data saved successfully`);
    console.log(`   Total processed: ${processedCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Saved to: ${storagePath}`);

    res.json({
      success: true,
      totalModels: modelSource.totalModels,
      processedCount,
      errorCount,
      fetchedAt: modelSource.fetchedAt,
      message: 'Model source data fetched and saved successfully'
    });
  } catch (error) {
    console.error('❌ Failed to fetch model source:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * Build summary generation prompt for a model
 */
function buildSummaryPrompt(model) {
  return `You are analyzing a Replicate AI model's README to create a concise, decision-focused summary for model selection.

**Model Information:**
Name: ${model.name}
Owner: ${model.owner}
Run Count: ${model.runCount}
Input Schema: ${JSON.stringify(model.inputSchema, null, 2)}

**README Content:**
${model.readme || 'No README available'}

**Generate a JSON summary with these fields:**

1. **oneLinePitch** (1 sentence): Capture the model's core value proposition
   - Focus on what makes it unique or when to use it
   - Example: "Ultra-fast text-to-image with good quality, trading some detail for speed"

2. **bestFor** (array, 3-5 items): Specific use cases where this model excels
   - Be concrete and actionable
   - Examples: "Quick prototyping", "Photorealistic portraits", "Anime-style illustrations"

3. **notGoodFor** (array, 2-4 items): What this model struggles with or doesn't support
   - Help prevent misuse
   - Examples: "Image-to-image transformations", "Extreme detail requirements"

4. **styleStrengths** (array, 3-5 items): Visual styles this model produces well
   - Examples: "Photorealistic", "Anime", "Digital art", "Oil painting style"

5. **qualityProfile** (object): Rate these aspects as "low", "moderate", "good", "very-good", or "excellent"
   - speed: How fast is inference?
   - detail: Level of fine detail in outputs
   - coherence: How well composed/structured are results?
   - promptFollowing: How accurately it interprets prompts

6. **typicalUseCase** (1-2 sentences): A concrete scenario where you'd choose this model
   - Make it relatable and practical

7. **keyParameters** (object): Main input parameters and what they do (3-5 max)
   - Brief description of each important parameter

8. **promptingTips** (array, 2-4 items): Advice for getting best results from this model
   - Based on README examples and documentation
   - Practical tips users can apply

9. **comparisonToAlternatives** (1 sentence): How it compares to similar models
   - Only if mentioned in README or obvious from specs
   - Example: "Faster than SDXL but less detailed than Midjourney-style models"

**Important:**
- If README is missing or minimal, make reasonable inferences from the model name, schema, and run count
- Be honest about unknowns - use "unknown" or "not specified" if information isn't available
- Focus on practical, actionable information for model selection

**Output only valid JSON (no markdown, no code blocks):**
{
  "oneLinePitch": "...",
  "bestFor": ["...", "..."],
  "notGoodFor": ["...", "..."],
  "styleStrengths": ["...", "..."],
  "qualityProfile": {
    "speed": "...",
    "detail": "...",
    "coherence": "...",
    "promptFollowing": "..."
  },
  "typicalUseCase": "...",
  "keyParameters": {
    "param_name": "description"
  },
  "promptingTips": ["...", "..."],
  "comparisonToAlternatives": "..."
}`;
}

/**
 * Detect capabilities from input schema
 */
function detectCapabilities(inputSchema) {
  const capabilities = {
    textToImage: false,
    imageToImage: false,
    supportsReferenceImages: false,
    supportedAspectRatios: []
  };

  if (!inputSchema || Object.keys(inputSchema).length === 0) {
    capabilities.textToImage = true; // Default assumption
    return capabilities;
  }

  // Check for text prompt support
  if (inputSchema.prompt) {
    capabilities.textToImage = true;
  }

  // Check for image inputs (excluding masks)
  const imageInputs = Object.entries(inputSchema).filter(
    ([key, param]) => param.isImageInput && !param.isMask
  );

  if (imageInputs.length > 0) {
    capabilities.imageToImage = true;
    capabilities.supportsReferenceImages = true;
  }

  // Extract supported aspect ratios
  if (inputSchema.aspect_ratio && inputSchema.aspect_ratio.options) {
    capabilities.supportedAspectRatios = inputSchema.aspect_ratio.options;
  } else if (inputSchema.width && inputSchema.height) {
    capabilities.supportedAspectRatios = ['custom'];
  } else {
    capabilities.supportedAspectRatios = ['1:1']; // Default
  }

  return capabilities;
}

/**
 * Estimate inference time from quality profile
 */
function estimateInferenceTime(summary) {
  const speed = summary.qualityProfile?.speed || 'moderate';
  
  const speedMap = {
    'very-fast': '1-3s',
    'fast': '3-8s',
    'moderate': '8-15s',
    'slow': '15-30s',
    'very-slow': '30s+'
  };
  
  return speedMap[speed] || 'unknown';
}

/**
 * Estimate cost tier
 */
function estimateCostTier(model, summary) {
  const speed = summary.qualityProfile?.speed || 'moderate';
  
  // Fast models are typically cheaper
  if (speed === 'very-fast' || speed === 'fast') {
    return 'low';
  } else if (speed === 'moderate') {
    return 'medium';
  } else {
    return 'high';
  }
}

/**
 * Extract tags from model and summary
 */
function extractTags(model, summary) {
  const tags = new Set();
  
  // Add from style strengths
  if (summary.styleStrengths) {
    summary.styleStrengths.forEach(style => {
      tags.add(style.toLowerCase().replace(/\s+/g, '-'));
    });
  }
  
  // Add from quality profile
  if (summary.qualityProfile) {
    if (summary.qualityProfile.speed === 'very-fast' || summary.qualityProfile.speed === 'fast') {
      tags.add('fast');
    }
    if (summary.qualityProfile.detail === 'excellent' || summary.qualityProfile.detail === 'very-good') {
      tags.add('high-detail');
    }
  }
  
  // Add capability tags
  const capabilities = detectCapabilities(model.inputSchema);
  if (capabilities.textToImage) tags.add('text-to-image');
  if (capabilities.imageToImage) tags.add('image-to-image');
  
  return Array.from(tags);
}

/**
 * GET /api/models/generate-summaries
 * Reads model-source.json and generates LLM summaries
 * Saves to storage/model-summaries.json
 */
router.get('/generate-summaries', async (req, res) => {
  try {
    console.log('🤖 Starting summary generation...');
    
    // Read source data
    const sourcePath = path.join(__dirname, '../../storage/model-source.json');
    
    if (!fs.existsSync(sourcePath)) {
      return res.status(404).json({
        success: false,
        error: 'Model source data not found. Run /api/models/fetch-source first.'
      });
    }
    
    const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
    console.log(`📖 Loaded ${sourceData.totalModels} models from source`);
    
    const summaries = {
      generatedAt: new Date().toISOString(),
      sourceVersion: sourceData.fetchedAt,
      models: []
    };
    
    const ai = getGeminiClient();
    let successCount = 0;
    let errorCount = 0;
    
    for (const model of sourceData.models) {
      try {
        console.log(`🔍 Analyzing ${model.name}...`);
        
        const prompt = buildSummaryPrompt(model);
        
        const response = await ai.models.generateContent({
          model: 'gemini-flash-latest',
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          config: {
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 2048
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
          throw new Error('Failed to extract JSON from response');
        }
        
        const summary = JSON.parse(jsonMatch[0]);
        
        const capabilities = detectCapabilities(model.inputSchema);
        const tags = extractTags(model, summary);
        const inferenceTime = estimateInferenceTime(summary);
        const costTier = estimateCostTier(model, summary);
        
        summaries.models.push({
          id: model.id,
          name: model.name,
          owner: model.owner,
          fullName: model.fullName,
          runCount: model.runCount,
          isOfficial: model.isOfficial,
          capabilities,
          summary,
          tags,
          inferenceTime,
          costTier,
          inputSchema: model.inputSchema
        });
        
        successCount++;
        console.log(`   ✓ Summary generated`);
      } catch (error) {
        console.error(`   ❌ Error generating summary for ${model.name}:`, error.message);
        errorCount++;
      }
    }
    
    // Save to storage/model-summaries.json
    const summariesPath = path.join(__dirname, '../../storage/model-summaries.json');
    fs.writeFileSync(summariesPath, JSON.stringify(summaries, null, 2), 'utf-8');
    
    console.log(`✅ Model summaries saved successfully`);
    console.log(`   Success: ${successCount}`);
    console.log(`   Errors: ${errorCount}`);
    console.log(`   Saved to: ${summariesPath}`);
    
    res.json({
      success: true,
      totalSummaries: summaries.models.length,
      successCount,
      errorCount,
      generatedAt: summaries.generatedAt,
      message: 'Model summaries generated and saved successfully'
    });
  } catch (error) {
    console.error('❌ Failed to generate summaries:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/list
 * Lists models from the cached summaries
 */
router.get('/list', async (req, res) => {
  try {
    const summariesPath = path.join(__dirname, '../../storage/model-summaries.json');
    
    if (!fs.existsSync(summariesPath)) {
      return res.status(404).json({
        success: false,
        error: 'Model summaries not found. Run /api/models/fetch-source and /api/models/generate-summaries first.'
      });
    }
    
    const data = JSON.parse(fs.readFileSync(summariesPath, 'utf-8'));
    
    res.json({
      success: true,
      generatedAt: data.generatedAt,
      sourceVersion: data.sourceVersion,
      totalModels: data.models.length,
      models: data.models
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

/**
 * GET /api/models/status
 * Check the status of cached model data
 */
router.get('/status', async (req, res) => {
  const sourcePath = path.join(__dirname, '../../storage/model-source.json');
  const summariesPath = path.join(__dirname, '../../storage/model-summaries.json');
  
  const status = {
    source: {
      exists: fs.existsSync(sourcePath),
      fetchedAt: null,
      totalModels: 0
    },
    summaries: {
      exists: fs.existsSync(summariesPath),
      generatedAt: null,
      totalModels: 0
    }
  };
  
  if (status.source.exists) {
    try {
      const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf-8'));
      status.source.fetchedAt = sourceData.fetchedAt;
      status.source.totalModels = sourceData.totalModels;
    } catch (error) {
      status.source.error = error.message;
    }
  }
  
  if (status.summaries.exists) {
    try {
      const summariesData = JSON.parse(fs.readFileSync(summariesPath, 'utf-8'));
      status.summaries.generatedAt = summariesData.generatedAt;
      status.summaries.totalModels = summariesData.models.length;
    } catch (error) {
      status.summaries.error = error.message;
    }
  }
  
  res.json({
    success: true,
    ...status
  });
});

module.exports = router;

