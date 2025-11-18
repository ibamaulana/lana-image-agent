/**
 * Model Filter Service
 * Deterministic filtering and scoring of models based on requirements
 */

const fs = require('fs');
const path = require('path');

/**
 * Load model summaries from cache
 */
function loadModelSummaries() {
  const summariesPath = path.join(__dirname, '../../storage/model-summaries.json');
  
  if (!fs.existsSync(summariesPath)) {
    console.warn('⚠️  Model summaries not found, returning empty array');
    return [];
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(summariesPath, 'utf-8'));
    return data.models || [];
  } catch (error) {
    console.error('❌ Failed to load model summaries:', error.message);
    return [];
  }
}

/**
 * Score a model based on requirements
 */
function scoreModel(model, requirements) {
  let score = 0;
  const reasons = [];
  
  // Base score from popularity (runCount)
  const popularityScore = Math.min(Math.log10(model.runCount || 1) / 10, 1) * 20;
  score += popularityScore;
  
  // Check preferred model match
  if (requirements.preferredModel) {
    const preferredLower = requirements.preferredModel.toLowerCase();
    const modelNameLower = model.name.toLowerCase();
    const modelIdLower = model.id.toLowerCase();
    const ownerLower = model.owner.toLowerCase();
    
    if (modelNameLower.includes(preferredLower) || 
        modelIdLower.includes(preferredLower) ||
        ownerLower.includes(preferredLower) ||
        model.fullName.toLowerCase().includes(preferredLower)) {
      score += 100; // Huge boost for explicit preference
      reasons.push('User explicitly requested this model');
    }
  }
  
  // Check reference image support
  if (requirements.needsReferenceImages) {
    if (model.capabilities.supportsReferenceImages || 
        model.capabilities.imageToImage) {
      score += 30;
      reasons.push('Supports reference images');
    } else {
      score -= 50; // Heavy penalty if doesn't support
      reasons.push('Does not support reference images (required)');
    }
  } else {
    // For text-to-image, prefer models that are good at it
    if (model.capabilities.textToImage) {
      score += 10;
    }
  }
  
  // Check style match
  if (requirements.styleFocus && requirements.styleFocus.length > 0) {
    const modelStyles = model.summary?.styleStrengths || [];
    if (modelStyles.length > 0) {
      const matchedStyles = requirements.styleFocus.filter(reqStyle => 
        modelStyles.some(modelStyle => 
          modelStyle.toLowerCase().includes(reqStyle.toLowerCase()) ||
          reqStyle.toLowerCase().includes(modelStyle.toLowerCase())
        )
      );
      
      if (matchedStyles.length > 0) {
        score += matchedStyles.length * 15;
        reasons.push(`Matches style: ${matchedStyles.join(', ')}`);
      } else {
        score -= 10;
        reasons.push('Style mismatch');
      }
    }
  }
  
  // Check quality requirements
  if (requirements.minQuality) {
    const qualityMap = {
      'low': 1,
      'moderate': 2,
      'good': 3,
      'very-good': 4,
      'excellent': 5
    };
    
    const minQualityLevel = qualityMap[requirements.minQuality] || 3;
    const modelDetail = qualityMap[model.summary?.qualityProfile?.detail] || 3;
    const modelPromptFollowing = qualityMap[model.summary?.qualityProfile?.promptFollowing] || 3;
    
    if (modelDetail >= minQualityLevel) {
      score += 10;
      reasons.push('Meets quality requirements');
    } else {
      score -= 20;
      reasons.push('Below quality requirements');
    }
    
    if (modelPromptFollowing >= minQualityLevel) {
      score += 5;
    }
  }
  
  // Check speed preference
  if (requirements.speedPreference === 'fast') {
    const speed = model.summary?.qualityProfile?.speed || 'moderate';
    if (speed === 'very-fast' || speed === 'fast') {
      score += 15;
      reasons.push('Fast generation');
    } else if (speed === 'very-slow' || speed === 'slow') {
      score -= 10;
      reasons.push('Slow generation');
    }
  } else if (requirements.speedPreference === 'no') {
    // Quality over speed
    const speed = model.summary?.qualityProfile?.speed || 'moderate';
    if (speed === 'very-fast' || speed === 'fast') {
      score -= 5; // Slight penalty for prioritizing speed over quality
    }
  }
  
  // Check bestFor match
  if (requirements.useCase && model.summary?.bestFor) {
    const useCaseLower = requirements.useCase.toLowerCase();
    const matchedUseCase = model.summary.bestFor.some(bestFor => 
      bestFor.toLowerCase().includes(useCaseLower) ||
      useCaseLower.includes(bestFor.toLowerCase())
    );
    
    if (matchedUseCase) {
      score += 20;
      reasons.push('Matches use case');
    }
  }
  
  // Check aspect ratio support
  if (requirements.aspectRatio && model.capabilities.supportedAspectRatios) {
    if (model.capabilities.supportedAspectRatios.includes(requirements.aspectRatio)) {
      score += 5;
    } else if (model.capabilities.supportedAspectRatios.includes('custom')) {
      score += 3; // Custom means it probably supports it
    } else {
      score -= 5;
      reasons.push('Aspect ratio not supported');
    }
  }
  
  // Check special needs
  if (requirements.specialNeeds && requirements.specialNeeds.length > 0) {
    const summaryText = JSON.stringify(model.summary || {}).toLowerCase();
    const matchedNeeds = requirements.specialNeeds.filter(need => 
      summaryText.includes(need.toLowerCase())
    );
    
    if (matchedNeeds.length > 0) {
      score += matchedNeeds.length * 10;
      reasons.push(`Supports: ${matchedNeeds.join(', ')}`);
    }
  }
  
  // Penalize models that are explicitly not good for this
  if (requirements.useCase && model.summary?.notGoodFor) {
    const useCaseLower = requirements.useCase.toLowerCase();
    const notGoodMatch = model.summary.notGoodFor.some(notGood => 
      notGood.toLowerCase().includes(useCaseLower) ||
      useCaseLower.includes(notGood.toLowerCase())
    );
    
    if (notGoodMatch) {
      score -= 30;
      reasons.push('Model explicitly not recommended for this use case');
    }
  }
  
  return { score, reasons };
}

/**
 * Filter and score models based on requirements
 * @param {Object} requirements - Model requirements from Phase 1
 * @param {number} limit - Maximum number of models to return (default: 5)
 * @returns {Array} Filtered and scored models
 */
function filterAndScoreModels(requirements = {}, limit = 5) {
  const allModels = loadModelSummaries();
  
  if (allModels.length === 0) {
    console.warn('⚠️  No models available for filtering');
    return [];
  }
  
  console.log(`🔍 Filtering ${allModels.length} models with requirements:`, requirements);
  
  // First pass: Hard filters (must pass)
  let filtered = allModels.filter(model => {
    // Must support reference images if needed
    if (requirements.needsReferenceImages) {
      if (!model.capabilities.supportsReferenceImages && 
          !model.capabilities.imageToImage) {
        return false;
      }
    }
    
    // Must support text-to-image if no references
    if (!requirements.needsReferenceImages) {
      if (!model.capabilities.textToImage) {
        return false;
      }
    }
    
    // Must support aspect ratio if specified
    if (requirements.aspectRatio && 
        model.capabilities.supportedAspectRatios &&
        !model.capabilities.supportedAspectRatios.includes(requirements.aspectRatio) &&
        !model.capabilities.supportedAspectRatios.includes('custom')) {
      return false;
    }
    
    return true;
  });
  
  console.log(`   ✓ ${filtered.length} models passed hard filters`);
  
  // Second pass: Score all remaining models
  const scored = filtered.map(model => {
    const { score, reasons } = scoreModel(model, requirements);
    return {
      ...model,
      _score: score,
      _scoreReasons: reasons
    };
  });
  
  // Sort by score (descending)
  scored.sort((a, b) => b._score - a._score);
  
  // Return top N models
  const topModels = scored.slice(0, limit);
  
  console.log(`   ✓ Selected top ${topModels.length} models:`);
  topModels.forEach((model, idx) => {
    console.log(`      ${idx + 1}. ${model.name} (score: ${model._score.toFixed(1)}) - ${model._scoreReasons[0] || 'No specific reason'}`);
  });
  
  // Remove internal scoring fields before returning
  return topModels.map(({ _score, _scoreReasons, ...model }) => model);
}

module.exports = {
  filterAndScoreModels,
  loadModelSummaries,
  scoreModel
};

