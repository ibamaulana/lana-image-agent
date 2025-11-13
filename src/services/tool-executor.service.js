/**
 * Tool Executor Service
 * Executes MCP tools called by the orchestrator
 */

const promptService = require('./prompt.service');
const imageGenerationService = require('./image-generation.service');
const replicateModelsService = require('./replicate-models.service');

/**
 * Execute suggest-prompt tool
 */
async function executeSuggestPrompt({ userInput }) {
  try {
    const result = await promptService.suggest(userInput);

    return {
      success: true,
      suggestion: result.suggestion
    };
  } catch (error) {
    throw new Error(error.message || 'Failed to generate prompt suggestion');
  }
}

/**
 * Execute list-models tool
 * @param {Object} params
 * @param {number} params.referenceImageCount - Optional filter by reference image count
 */
async function executeListModels({ referenceImageCount } = {}) {
  try {
    const models = await replicateModelsService.getImageModels({ referenceImageCount });

    return {
      success: true,
      models: models.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description || '',
        owner: model.owner,
        fullName: model.fullName,
        aspectRatios: Object.keys(model.aspectRatios || {}),
        runCount: model.runCount || 0,
        tags: model.tags || [],
        isOfficial: model.isOfficial || false,
        url: model.url || null,
        capabilities: model.capabilities || {
          supportsSingleReference: false,
          supportsMultipleReferences: false,
          supportsImageToImage: false
        },
        strengths: model.strengths || [],
        // NEW: Expose input schema for LLM to make intelligent decisions
        inputSchema: model.inputSchema || {}
      })),
      total: models.length
    };
  } catch (error) {
    throw new Error(error.message || 'Failed to list models');
  }
}

/**
 * Execute search-models tool
 */
async function executeSearchModels({ keyword }) {
  try {
    if (!keyword) {
      throw new Error('keyword is required for searching models');
    }

    const models = await replicateModelsService.searchModels(keyword);

    return {
      success: true,
      keyword,
      models: models.map((model) => ({
        id: model.id,
        name: model.name,
        description: model.description || '',
        owner: model.owner,
        fullName: model.fullName,
        aspectRatios: Object.keys(model.aspectRatios || {}),
        runCount: model.runCount || 0,
        tags: model.tags || [],
        isOfficial: model.isOfficial || false,
        url: model.url || null
      })),
      total: models.length
    };
  } catch (error) {
    throw new Error(error.message || 'Failed to search models');
  }
}

/**
 * Execute get-model tool
 */
async function executeGetModel({ modelId }) {
  try {
    if (!modelId) {
      throw new Error('modelId is required');
    }

    const model = await replicateModelsService.getModelById(modelId);
    
    if (!model) {
      throw new Error(`Model '${modelId}' not found`);
    }

    return {
      success: true,
      model: {
        id: model.id,
        name: model.name,
        description: model.description,
        owner: model.owner,
        fullName: model.fullName,
        aspectRatios: model.aspectRatios,
        tags: model.tags || []
      }
    };
  } catch (error) {
    throw new Error(error.message || 'Failed to get model details');
  }
}

/**
 * Execute generate-image tool
 * Simplified image generation - just executes with provided parameters
 */
async function executeGenerateImage({
  modelId,
  prompt,
  referenceImages,
  aspectRatio,
  style,
  negativePrompt,
  extraParams
}) {
  try {
    // Validate required params
    if (!modelId) {
      throw new Error('modelId is required');
    }

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      throw new Error('prompt is required and must be a non-empty string');
    }

    // Normalize referenceImages to array
    let normalizedReferences = [];
    if (referenceImages) {
      if (Array.isArray(referenceImages)) {
        normalizedReferences = referenceImages.filter(ref => typeof ref === 'string' && ref.trim().length > 0);
      } else if (typeof referenceImages === 'string' && referenceImages.trim().length > 0) {
        normalizedReferences = [referenceImages.trim()];
      }
    }

    // Get model details
    const model = await replicateModelsService.getModelById(modelId);
    if (!model) {
      throw new Error(`Model "${modelId}" not found`);
    }

    // Schema-aware validation: Check if model accepts reference images
    if (normalizedReferences.length > 0) {
      const imageInputParams = Object.entries(model.inputSchema || {})
        .filter(([_, param]) => param.isImageInput === true && !param.isMask)
        .map(([name, param]) => ({ name, type: param.type }));

      if (imageInputParams.length === 0) {
        throw new Error(
          `Model "${model.name}" does not accept reference images. ` +
          `Its inputSchema does not have any image input parameters. ` +
          `Please choose a model that supports image-to-image generation.`
        );
      }

      // Check if model supports multiple images if user provided more than one
      if (normalizedReferences.length > 1) {
        const arrayImageParams = imageInputParams.filter(p => p.type === 'array');
        if (arrayImageParams.length === 0) {
          throw new Error(
            `Model "${model.name}" only accepts single reference image but ${normalizedReferences.length} were provided. ` +
            `Please choose a model that supports multiple reference images or provide only one reference image.`
          );
        }
      }

      console.log(`[Schema Validation] Model "${model.name}" accepts images via: ${imageInputParams.map(p => p.name).join(', ')}`);
    }

    // Note: Mask parameters are excluded from validation - they're for inpainting, not standard reference-based generation

    console.log(`[Generate Image] Model: ${model.name}, References: ${normalizedReferences.length}`);

    // Generate the image
    const generationResult = await imageGenerationService.generateImage(model.id, prompt, {
      aspectRatio: aspectRatio || '1:1',
      style: style || 'None',
      referenceImages: normalizedReferences,
      negativePrompt,
      extraParams: extraParams || {}
    });

    const { imageUrl, metadata } = generationResult;

    return {
      success: true,
      imageUrl,
      metadata: {
        model: {
          id: model.id,
          name: model.name,
          fullName: model.fullName,
          capabilities: model.capabilities
        },
        prompt,
        negativePrompt: negativePrompt || null,
        referenceImages: normalizedReferences,
        aspectRatio: metadata.aspectRatio,
        style: style || 'None',
        dimensions: metadata.dimensions,
        size: metadata.dimensions ? `${metadata.dimensions.width}x${metadata.dimensions.height}` : undefined
      }
    };
  } catch (error) {
    throw new Error(error.message || 'Image generation failed');
  }
}

/**
 * Main executor function that routes to appropriate tool handler
 */
async function executeTool(toolName, args = {}) {
  console.log('[Tool Executor] Executing:', toolName, 'with args:', Object.keys(args));

  switch (toolName) {
    case 'suggest-prompt':
      return await executeSuggestPrompt(args);
    
    case 'list-models':
      return await executeListModels(args);
    
    case 'search-models':
      return await executeSearchModels(args);
    
    case 'get-model':
      return await executeGetModel(args);
    
    case 'generate-image':
      return await executeGenerateImage(args);
    
    // Legacy support
    case 'image-generation-workflow':
      return await executeGenerateImage(args);

    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  executeTool,
  executeSuggestPrompt,
  executeListModels,
  executeSearchModels,
  executeGetModel,
  executeGenerateImage
};
