/**
 * Replicate Models Service
 * Dynamically fetches image generation models from Replicate API
 */

const Replicate = require('replicate');
const { config } = require('../config/env.config');

class ReplicateModelsService {
  constructor() {
    const apiToken = config.replicate.apiToken;
    if (!apiToken) {
      console.warn('⚠️  REPLICATE_API_TOKEN not set. Model fetching will fail.');
    }
    
    this.replicate = new Replicate({
      auth: apiToken
    });

    // Cache for models
    this.modelsCache = {
      data: null,
      fetchedAt: 0,
      ttl: 3600000 // 1 hour cache
    };

    // Fallback models in case API fails
    this.fallbackModels = [
      {
        id: 'flux-schnell',
        name: 'Flux Schnell',
        owner: 'black-forest-labs',
        fullName: 'black-forest-labs/flux-schnell',
        description: 'Fast image generation with Flux',
        aspectRatios: {
          '1:1': { width: 1024, height: 1024 },
          '16:9': { width: 1344, height: 768 },
          '21:9': { width: 1536, height: 640 },
          '9:16': { width: 768, height: 1344 },
          '4:3': { width: 1152, height: 896 }
        },
        capabilities: {
          supportsSingleReference: false,
          supportsMultipleReferences: false,
          supportsImageToImage: false
        },
        strengths: ['fast', 'general-purpose', 'text-to-image'],
        inputSchema: {
          prompt: { type: 'string', description: 'Text prompt for image generation', required: true },
          aspect_ratio: { type: 'string', description: 'Aspect ratio for the image', options: ['1:1', '16:9', '21:9', '9:16', '4:3'], default: '1:1' },
          num_outputs: { type: 'integer', description: 'Number of images to generate', default: 1 }
        }
      },
      {
        id: 'flux-dev',
        name: 'Flux Dev',
        owner: 'black-forest-labs',
        fullName: 'black-forest-labs/flux-dev',
        description: 'High quality image generation with Flux',
        aspectRatios: {
          '1:1': { width: 1024, height: 1024 },
          '16:9': { width: 1344, height: 768 },
          '21:9': { width: 1536, height: 640 },
          '9:16': { width: 768, height: 1344 },
          '4:3': { width: 1152, height: 896 }
        },
        capabilities: {
          supportsSingleReference: false,
          supportsMultipleReferences: false,
          supportsImageToImage: false
        },
        strengths: ['high-quality', 'detailed', 'photorealistic', 'text-to-image'],
        inputSchema: {
          prompt: { type: 'string', description: 'Text prompt for image generation', required: true },
          aspect_ratio: { type: 'string', description: 'Aspect ratio for the image', options: ['1:1', '16:9', '21:9', '9:16', '4:3'], default: '1:1' },
          guidance_scale: { type: 'number', description: 'Guidance scale for generation', default: 3.5 },
          num_inference_steps: { type: 'integer', description: 'Number of denoising steps', default: 28 }
        }
      },
      {
        id: 'stable-diffusion',
        name: 'Stable Diffusion',
        owner: 'stability-ai',
        fullName: 'stability-ai/stable-diffusion',
        description: 'Classic stable diffusion model',
        aspectRatios: {
          '1:1': { width: 512, height: 512 },
          '16:9': { width: 768, height: 432 },
          '9:16': { width: 432, height: 768 }
        },
        capabilities: {
          supportsSingleReference: false,
          supportsMultipleReferences: false,
          supportsImageToImage: false
        },
        strengths: ['versatile', 'general-purpose', 'text-to-image'],
        inputSchema: {
          prompt: { type: 'string', description: 'Text prompt for image generation', required: true },
          width: { type: 'integer', description: 'Width of the generated image', default: 512 },
          height: { type: 'integer', description: 'Height of the generated image', default: 512 },
          negative_prompt: { type: 'string', description: 'Negative prompt to avoid certain elements' }
        }
      }
    ];
  }

  /**
   * Check if cache is valid
   */
  isCacheValid() {
    if (!this.modelsCache.data) return false;
    const now = Date.now();
    return (now - this.modelsCache.fetchedAt) < this.modelsCache.ttl;
  }

  /**
   * Determine aspect ratios based on model's output schema
   */
  getAspectRatiosForModel(modelSchema) {
    // Default aspect ratios
    const defaultRatios = {
      '1:1': { width: 1024, height: 1024 },
      '16:9': { width: 1344, height: 768 },
      '21:9': { width: 1536, height: 640 },
      '9:16': { width: 768, height: 1344 },
      '4:3': { width: 1152, height: 896 }
    };

    // Try to parse model's schema for supported dimensions
    try {
      const schema = modelSchema?.openapi_schema?.components?.schemas?.Input?.properties;
      
      if (schema?.width && schema?.height) {
        // Model supports custom width/height
        return defaultRatios;
      }

      if (schema?.aspect_ratio?.enum) {
        // Model has predefined aspect ratios
        const ratios = {};
        schema.aspect_ratio.enum.forEach(ratio => {
          ratios[ratio] = this.calculateDimensions(ratio);
        });
        return ratios;
      }
    } catch (error) {
      console.warn('Could not parse model schema:', error.message);
    }

    return defaultRatios;
  }

  /**
   * Calculate dimensions for aspect ratio
   */
  calculateDimensions(aspectRatio) {
    const [w, h] = aspectRatio.split(':').map(Number);
    const baseSize = 1024;
    
    if (w > h) {
      return {
        width: baseSize,
        height: Math.round(baseSize * (h / w))
      };
    } else if (h > w) {
      return {
        width: Math.round(baseSize * (w / h)),
        height: baseSize
      };
    } else {
      return {
        width: baseSize,
        height: baseSize
      };
    }
  }

  /**
   * Check if model is an image generation model
   */
  isImageGenerationModel(model) {
    const name = (model.name || '').toLowerCase();
    const description = (model.description || '').toLowerCase();
    const tags = (model.tags || []).map(t => t.toLowerCase());

    // Keywords that indicate image generation
    const imageKeywords = [
      'image',
      'text-to-image',
      'generation',
      'diffusion',
      'flux',
      'stable-diffusion',
      'sdxl',
      'dalle',
      'midjourney',
      'art',
      'picture',
      'photo'
    ];

    // Keywords to exclude (upscaling, editing, etc.)
    const excludeKeywords = [
      'upscale',
      'super-resolution',
      'video',
      'audio',
      'music',
      'speech',
      'text-only',
      'captioning',
      'detection',
      'segmentation',
      'classification',
      'face-swap'
    ];

    // Check for exclusions first
    const hasExcluded = excludeKeywords.some(keyword => 
      name.includes(keyword) || 
      description.includes(keyword) ||
      tags.includes(keyword)
    );

    if (hasExcluded) return false;

    // Check for image generation keywords
    const hasImageKeyword = imageKeywords.some(keyword => 
      name.includes(keyword) || 
      description.includes(keyword) ||
      tags.includes(keyword)
    );

    return hasImageKeyword;
  }

  /**
   * Extract simplified input schema from OpenAPI schema
   * This allows the LLM to understand model capabilities directly
   */
  extractSimplifiedSchema(modelSchema) {
    const simplified = {};

    try {
      const properties = modelSchema?.openapi_schema?.components?.schemas?.Input?.properties;
      const required = modelSchema?.openapi_schema?.components?.schemas?.Input?.required || [];
      
      if (!properties) {
        return simplified;
      }

      // Extract key parameters that the LLM needs to know about
      for (const [key, value] of Object.entries(properties)) {
        const paramInfo = {
          type: value.type || 'string',
          description: value.description || '',
          required: required.includes(key)
        };

        // Add enum/options if available
        if (value.enum && Array.isArray(value.enum)) {
          paramInfo.options = value.enum;
        }

        // Add default value if available
        if (value.default !== undefined) {
          paramInfo.default = value.default;
        }

        // Add format info (e.g., uri for images)
        if (value.format) {
          paramInfo.format = value.format;
        }

        // Add allOf constraints if present (common in Replicate schemas)
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

        // Detect mask parameters - these are for inpainting, not standard image generation
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
   * Detect model capabilities from schema and metadata
   * Now also returns the input schema for LLM decision-making
   */
  detectCapabilities(model, modelSchema) {
    const capabilities = {
      supportsSingleReference: false,
      supportsMultipleReferences: false,
      supportsImageToImage: false
    };

    try {
      const schema = modelSchema?.openapi_schema?.components?.schemas?.Input?.properties;
      
      if (schema) {
        // Check for image input parameter
        const hasImageParam = schema.image !== undefined;
        const hasImagesParam = schema.images !== undefined;
        
        if (hasImageParam) {
          // Single image input
          capabilities.supportsSingleReference = true;
          capabilities.supportsImageToImage = true;
        }
        
        if (hasImagesParam) {
          // Multiple images input
          capabilities.supportsMultipleReferences = true;
          capabilities.supportsSingleReference = true;
          capabilities.supportsImageToImage = true;
        }
      }
    } catch (error) {
      console.warn('Could not detect capabilities:', error.message);
    }

    return capabilities;
  }

  /**
   * Extract strengths from model metadata
   */
  extractStrengths(model) {
    const strengths = [];
    const name = (model.name || '').toLowerCase();
    const description = (model.description || '').toLowerCase();
    const tags = (model.tags || []).map(t => t.toLowerCase());
    const allText = `${name} ${description} ${tags.join(' ')}`;

    // Strength keywords mapping
    const strengthMap = {
      'fast': ['fast', 'quick', 'speed', 'schnell', 'turbo'],
      'high-quality': ['quality', 'detailed', 'professional', 'pro', 'hd', 'ultra'],
      'photorealistic': ['photo', 'realistic', 'photorealistic', 'real'],
      'anime': ['anime', 'manga', 'japanese'],
      'artistic': ['art', 'artistic', 'creative', 'painting'],
      '3d': ['3d', 'render', 'cgi'],
      'versatile': ['versatile', 'general', 'multipurpose'],
      'text-to-image': ['text-to-image', 'txt2img'],
      'image-to-image': ['image-to-image', 'img2img', 'transformation']
    };

    for (const [strength, keywords] of Object.entries(strengthMap)) {
      if (keywords.some(keyword => allText.includes(keyword))) {
        strengths.push(strength);
      }
    }

    // Default strength if none detected
    if (strengths.length === 0) {
      strengths.push('general-purpose');
    }

    return strengths;
  }

  /**
   * Fetch models from Replicate API
   */
  async fetchModelsFromAPI() {
    try {
      console.log('🔍 Fetching image models from Replicate API...');

      // Use Replicate's collections endpoint to get models
      // collections.get() returns a single collection with models
      const response = await this.replicate.collections.get('text-to-image');
      console.log('📦 Collection response received');
      
      const imageModels = [];
      
      // Get models from the collection response
      // The response might have models directly or in a results array
      const models = response.models || response.results || [];
      
      // Iterate through all models and filter by is_official: true
      // No slug filtering - just check if model is official
      for (const model of models) {
        // Filter: Must be official AND image generation model
        if (model.is_official === true && this.isImageGenerationModel(model)) {
          // Extract owner and name from model URL or latest_version
          const modelUrl = model.latest_version?.model || model.url || '';
          const urlParts = modelUrl.split('/').filter(Boolean);
          const owner = urlParts[urlParts.length - 2] || model.owner || 'unknown';
          const name = urlParts[urlParts.length - 1] || model.name || 'unknown';
          
          const capabilities = this.detectCapabilities(model, model.latest_version);
          const strengths = this.extractStrengths(model);
          const inputSchema = this.extractSimplifiedSchema(model.latest_version);

          const modelData = {
            id: name,
            name: model.name,
            owner: owner,
            fullName: `${owner}/${name}`,
            description: model.description || '',
            runCount: model.run_count || 0,
            tags: model.tags || [],
            aspectRatios: this.getAspectRatiosForModel(model.latest_version),
            isOfficial: model.is_official || false,
            coverImageUrl: model.cover_image_url || null,
            url: model.url || null,
            capabilities,
            strengths,
            inputSchema
          };

          imageModels.push(modelData);
        }
      }

      // Sort by popularity (run count)
      imageModels.sort((a, b) => b.runCount - a.runCount);

      console.log(`✅ Fetched ${imageModels.length} official image generation models from Replicate`);
      
      return imageModels;
    } catch (error) {
      console.error('❌ Failed to fetch models from Replicate:', error.message);
      throw error;
    }
  }

  /**
   * Get all image generation models (cached)
   * @param {Object} options - Filter options
   * @param {number} options.referenceImageCount - Filter by reference image support (0, 1, or >1)
   */
  async getImageModels(options = {}) {
    // Get all models (cached or fresh)
    let models;
    
    // Return cached models if valid
    if (this.isCacheValid()) {
      console.log('📦 Using cached Replicate models');
      models = this.modelsCache.data;
    } else {
      try {
        // Fetch fresh models
        models = await this.fetchModelsFromAPI();
        
        // Update cache
        this.modelsCache = {
          data: models,
          fetchedAt: Date.now(),
          ttl: this.modelsCache.ttl
        };
      } catch (error) {
        console.warn('⚠️  Using fallback models due to API error:', error.message);
        
        // Use fallback models
        models = this.fallbackModels;
      }
    }

    // Apply filters if specified
    if (options.referenceImageCount !== undefined) {
      const count = options.referenceImageCount;
      
      if (count === 0) {
        // No filtering needed for text-to-image
        return models;
      } else if (count === 1) {
        // Filter to models that support at least single reference
        models = models.filter(m => m.capabilities.supportsSingleReference);
        console.log(`🔍 Filtered to ${models.length} models supporting single reference image`);
      } else if (count > 1) {
        // Filter to models that support multiple references
        models = models.filter(m => m.capabilities.supportsMultipleReferences);
        console.log(`🔍 Filtered to ${models.length} models supporting multiple reference images`);
      }
    }

    return models;
  }

  /**
   * Get a specific model by ID
   */
  async getModelById(modelId) {
    const models = await this.getImageModels();
    return models.find(m => m.id === modelId || m.fullName === modelId);
  }

  /**
   * Search models by keyword
   */
  async searchModels(keyword) {
    const models = await this.getImageModels();
    const lowerKeyword = keyword.toLowerCase();
    
    return models.filter(model => 
      model.name.toLowerCase().includes(lowerKeyword) ||
      model.description.toLowerCase().includes(lowerKeyword) ||
      model.tags.some(tag => tag.toLowerCase().includes(lowerKeyword))
    );
  }

  /**
   * Get models formatted for prompt service
   */
  async getModelsForPromptService() {
    const models = await this.getImageModels();
    
    return models.map(model => ({
      id: model.id,
      name: model.name,
      keywords: [
        ...model.name.toLowerCase().split(/[-_\s]+/),
        ...(model.tags || []).map(t => t.toLowerCase())
      ]
    }));
  }

  /**
   * Clear cache (useful for testing)
   */
  clearCache() {
    this.modelsCache = {
      data: null,
      fetchedAt: 0,
      ttl: this.modelsCache.ttl
    };
  }
}

module.exports = new ReplicateModelsService();

