/**
 * Image Generation Service
 * Handles image generation using Replicate API
 */

const Replicate = require('replicate');
const storage = require('../storage'); // Auto-selects PostgreSQL or memory
const replicateModelsService = require('./replicate-models.service');
const { v4: uuidv4 } = require('uuid');
const { config } = require('../config/env.config');

class ImageGenerationService {
  constructor() {
    const apiToken = config.replicate.apiToken;
    if (!apiToken) {
      console.warn('⚠️  REPLICATE_API_TOKEN not set. Image generation will fail.');
    }
    
    this.replicate = new Replicate({
      auth: apiToken
    });
  }

  validatePrompt(prompt) {
    if (!prompt || typeof prompt !== 'string') {
      throw new Error('Prompt is required');
    }
    if (prompt.length < 3) {
      throw new Error('Prompt must be at least 3 characters');
    }
    if (prompt.length > 2000) {
      throw new Error('Prompt must be less than 2000 characters');
    }
  }

  async getModelConfig(modelId) {
    const model = await replicateModelsService.getModelById(modelId);
    if (!model) {
      throw new Error(`Model ${modelId} is not supported`);
    }
    return model;
  }

  async getDimensions(modelId, aspectRatio) {
    const model = await this.getModelConfig(modelId);
    const dimensions = model.aspectRatios[aspectRatio] || model.aspectRatios['1:1'];
    return dimensions;
  }

  async generateImage(modelId, prompt, metadata = {}) {
    try {
      this.validatePrompt(prompt);

      const model = await this.getModelConfig(modelId);
      const aspectRatio = metadata.aspectRatio || '1:1';
      const dimensions = await this.getDimensions(modelId, aspectRatio);
      const referenceImages = metadata.referenceImages || [];
      const negativePrompt = metadata.negativePrompt;

      console.log(`🎨 Generating image with ${model.name} (${model.fullName})...`);
      console.log(`   Prompt: ${prompt.substring(0, 100)}...`);
      console.log(`   Dimensions: ${dimensions.width}x${dimensions.height}`);
      if (referenceImages.length > 0) {
        console.log(`   Reference Images: ${referenceImages.length}`);
      }

      // Build input params
      const inputParams = {
        prompt: prompt,
        width: dimensions.width,
        height: dimensions.height,
        num_outputs: 1,
        ...metadata.extraParams
      };

      // Add negative prompt if provided
      if (negativePrompt) {
        inputParams.negative_prompt = negativePrompt;
      }

      // Add reference images if model supports them
      if (referenceImages.length > 0) {
        if (referenceImages.length === 1) {
          // Single reference image
          inputParams.image = referenceImages[0];
        } else {
          // Multiple reference images
          inputParams.images = referenceImages;
        }
      }

      // Call Replicate API with the model's full name
      const output = await this.replicate.run(
        model.fullName,
        {
          input: inputParams
        }
      );

      console.log('output:', output);

      // Extract image URL from output
      let imageUrl = output;
      if (Array.isArray(output) && output.length > 0) {
        const firstOutput = output[0];
        if (typeof firstOutput === 'string') {
          imageUrl = firstOutput;
        } else if (firstOutput && typeof firstOutput.url === 'function') {
          imageUrl = firstOutput.url().href;
        } else if (firstOutput && typeof firstOutput === 'object' && firstOutput.href) {
          imageUrl = firstOutput.href;
        }
      } else if (typeof output === 'string') {
        imageUrl = output;
      } else if (typeof output === 'object' && output.href) {
        imageUrl = output.href;
      } else if (typeof output === 'object' && output.url) {
        imageUrl = output.url().href;
      } else if (typeof output === 'object' && output.url && typeof output.url() === 'function') {
        imageUrl = output.url().href;
      } else if (typeof output === 'object' && output.url && typeof output.url() === 'string') {
        imageUrl = output.url();
      }

      console.log(`✅ Image generated: ${imageUrl}`);

      return {
        success: true,
        imageUrl,
        metadata: {
          model: modelId,
          dimensions,
          aspectRatio,
          prompt: prompt.substring(0, 200)
        }
      };
    } catch (error) {
      console.error('❌ Image generation failed:', error);
      throw new Error(`Image generation failed: ${error.message}`);
    }
  }

  async createGeneration(walletAddress, modelId, prompt, metadata = {}) {
    const jobId = uuidv4();

    // Create generation record
    const generation = await storage.createGeneration({
      jobId,
      walletAddress,
      prompt,
      modelName: modelId,
      status: 'running',
      metadata
    });

    try {
      // Generate the image
      const result = await this.generateImage(modelId, prompt, metadata);

      // Update generation with result
      await storage.updateGeneration(jobId, {
        status: 'completed',
        image_url: result.imageUrl,
        metadata: {
          ...metadata,
          ...result.metadata
        }
      });

      return {
        success: true,
        jobId,
        image_url: result.imageUrl,
        status: 'completed'
      };
    } catch (error) {
      // Update generation with error
      await storage.updateGeneration(jobId, {
        status: 'failed',
        metadata: {
          ...metadata,
          error: error.message
        }
      });

      throw error;
    }
  }
}

module.exports = new ImageGenerationService();

