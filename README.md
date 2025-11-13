# Lana Image Agent 🎨

An intelligent AI-powered image generation system that uses LLM-based orchestration to select optimal models and generate high-quality images from text prompts or reference images.

## 🌟 Key Features

- **Intelligent Model Selection**: LLM analyzes model input schemas to select the best model for each request
- **Schema-Based Decision Making**: Models expose their capabilities through OpenAPI schemas rather than hardcoded rules
- **Dynamic Model Discovery**: Automatically fetches and caches official image generation models from Replicate
- **Reference Image Support**: Handles single or multiple reference images for image-to-image generation
- **Streaming Responses**: Real-time streaming of LLM reasoning and generation progress
- **MCP Integration**: Model Context Protocol support for agent communication

## 🏗️ Architecture

### Core Services

#### 1. **Replicate Models Service** (`src/services/replicate-models.service.js`)
- Fetches image generation models from Replicate API
- Extracts simplified input schemas from OpenAPI specifications
- Detects model capabilities by analyzing input parameters:
  - `isImageInput: true` - Parameters that accept reference images
  - `isMask: true` - Parameters for inpainting (excluded from standard generation)
  - Parameter types, options, defaults, and constraints
- Caches models for 1 hour to reduce API calls
- Provides fallback models if API is unavailable

**Schema Extraction Example:**
```javascript
{
  prompt: { 
    type: 'string', 
    description: 'Text prompt for generation', 
    required: true 
  },
  image: { 
    type: 'string', 
    format: 'uri', 
    isImageInput: true 
  },
  aspect_ratio: { 
    type: 'string', 
    options: ['1:1', '16:9', '9:16'], 
    default: '1:1' 
  },
  mask: {
    type: 'string',
    isMask: true,
    optionalForReferenceImages: true
  }
}
```

#### 2. **Orchestrator Service** (`src/services/orchestrator.service.js`)
- Powered by Google Gemini AI with function calling
- Orchestrates the image generation workflow:
  1. Understands user request
  2. Calls `list_models` with optional reference image count filter
  3. **Analyzes input schemas** to select the best model
  4. Refines the prompt with quality tags
  5. Calls `generate_image` with selected model
  6. Returns results to user
- Provides streaming and non-streaming modes
- Handles tool execution and error recovery

**Intelligent Model Selection:**
The LLM receives each model's `inputSchema` and makes decisions based on:
- **Text-to-Image**: Matches model strengths (anime, photorealistic, fast) to user intent
- **Image-to-Image**: Examines inputSchema for image input parameters (excluding masks)
  - Single reference: Models with `isImageInput: true` parameter
  - Multiple references: Models with array-type image input
- **Constraints**: Respects aspect ratio options, parameter defaults, and requirements

#### 3. **Tool Executor Service** (`src/services/tool-executor.service.js`)
- Executes tools called by the orchestrator:
  - `list-models`: Returns models with capabilities and input schemas
  - `generate-image`: Validates and executes image generation
  - `suggest-prompt`: Enhances user prompts
  - `search-models`: Searches models by keyword
- **Schema-Aware Validation**: Validates reference images by checking inputSchema
  - Filters out mask parameters (for inpainting only)
  - Ensures model accepts the correct number of reference images
  - Provides detailed error messages based on schema analysis

#### 4. **Image Generation Service** (`src/services/image-generation.service.js`)
- Executes image generation on Replicate
- Maps parameters to model-specific input schemas
- Handles polling and result retrieval
- Uploads generated images to storage

## 🎯 Why Schema-Based Model Selection?

### Before (Rule-Based):
```javascript
// Hardcoded boolean flags
capabilities: {
  supportsSingleReference: false,
  supportsMultipleReferences: false,
  supportsImageToImage: false
}

// LLM sees limited information
if (capabilities.supportsSingleReference) {
  // Use this model
}
```

**Problems:**
- ❌ Limited information for decision making
- ❌ Hardcoded rules need maintenance
- ❌ Can't understand new model capabilities automatically
- ❌ No insight into parameter constraints

### After (Schema-Based):
```javascript
// Rich schema information
inputSchema: {
  prompt: { type: 'string', required: true },
  image: { type: 'string', isImageInput: true },
  aspect_ratio: { options: ['1:1', '16:9', '9:16'] },
  guidance_scale: { type: 'number', default: 3.5 }
}

// LLM makes intelligent decisions
// "This model has an 'image' parameter with isImageInput=true,
//  so it can handle the user's reference image..."
```

**Benefits:**
- ✅ LLM understands actual model capabilities
- ✅ Automatic support for new models with different parameter names
- ✅ Better parameter mapping and validation
- ✅ Understands constraints (aspect ratios, value ranges)
- ✅ Can distinguish between reference images and masks

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Replicate API Token
- Google Gemini API Key
- PostgreSQL (optional, can use in-memory storage)

### Environment Variables
```env
# Replicate
REPLICATE_API_TOKEN=your_replicate_token

# Gemini AI
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-2.0-flash-exp
GEMINI_TEMPERATURE=0.7
GEMINI_MAX_OUTPUT_TOKENS=2048

# Storage (optional)
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=lana_agent
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password

# Server
PORT=3000
NODE_ENV=development
```

### Installation
```bash
# Install dependencies
npm install

# Start the server
npm start

# Development mode with auto-reload
npm run dev
```

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

## 📡 API Endpoints

### Generate Image (Streaming)
```bash
POST /api/orchestrator/stream
Content-Type: application/json

{
  "message": "Create a photorealistic portrait of a cat",
  "conversationHistory": []
}
```

### Generate Image (Non-Streaming)
```bash
POST /api/orchestrator/generate
Content-Type: application/json

{
  "prompt": "A serene mountain landscape",
  "referenceImages": ["https://example.com/reference.jpg"]
}
```

### List Models
```bash
GET /api/models
GET /api/models?referenceImageCount=1  # Filter by reference support
```

## 🔍 How It Works: Example Flow

1. **User Request**: "Create an anime version of this photo: [reference.jpg]"

2. **LLM Calls `list_models`**: 
   - `referenceImageCount: 1` (one reference image)
   - Receives models with inputSchema

3. **LLM Analyzes Schemas**:
   ```javascript
   // Model A: flux-schnell
   inputSchema: { 
     prompt: {...}, 
     aspect_ratio: {...}
     // No image input - skip this one
   }
   
   // Model B: anime-img2img  
   inputSchema: {
     prompt: {...},
     image: { isImageInput: true },  // ✓ Can accept reference
     strength: { type: 'number' }
   }
   // Has 'anime' strength + accepts images - perfect!
   ```

4. **LLM Selects Model B**: Matches anime style + accepts reference image

5. **LLM Calls `generate_image`**:
   ```javascript
   {
     modelId: 'anime-img2img',
     prompt: 'anime style portrait, vibrant colors, clean lines...',
     referenceImages: ['reference.jpg'],
     aspectRatio: '9:16'
   }
   ```

6. **Validation**: Checks inputSchema - Model B has `isImageInput: true` ✓

7. **Generation**: Image created and returned to user

## 🛡️ Mask Parameter Handling

Some models have `mask` parameters for inpainting (editing specific regions). The system automatically:
- Detects mask parameters with `isMask: true`
- Excludes them from reference image validation
- Instructs LLM that masks are for inpainting only, not standard generation

**Example:**
```javascript
// Inpainting model schema
inputSchema: {
  image: { isImageInput: true },      // Reference image
  mask: { isMask: true },              // For inpainting (excluded)
  prompt: { type: 'string' }
}

// Standard img2img works without mask
// Mask only needed if user explicitly wants inpainting
```

## 🧪 Testing

```bash
# Run all tests
npm test

# Test specific service
npm test -- replicate-models.service.test.js
```

## 📝 Development Notes

### Adding New Tools
1. Add tool definition in `orchestrator.service.js` → `getToolDefinitions()`
2. Implement handler in `tool-executor.service.js`
3. Update system instruction to guide LLM usage

### Model Caching
- Models cached for 1 hour by default
- Clear cache: `replicateModelsService.clearCache()`
- Fallback models used if API fails

### Debugging
```javascript
// Enable detailed logging
console.log('[Orchestrator] Starting generation...');
console.log('[Schema Validation] Checking inputSchema...');
console.log('[Tool Executor] Executing:', toolName);
```

## 🤝 Contributing

Contributions welcome! Please:
1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Test with multiple models

## 📄 License

MIT License - see LICENSE file for details

## 🙏 Acknowledgments

- **Replicate**: Model hosting and execution
- **Google Gemini**: LLM orchestration with function calling
- **Model Context Protocol**: Agent communication standard

---

Built with ❤️ for intelligent image generation
