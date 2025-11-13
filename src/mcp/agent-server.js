/**
 * MCP Agent Server
 * MCP server with 5 core tools for wallet and image generation
 */

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');
const { executeTool } = require('../services/tool-executor.service');

const toolError = (message) => ({
  content: [
    {
      type: 'text',
      text: message || 'An error occurred'
    }
  ],
  structuredContent: {
    success: false,
    error: message || 'An error occurred'
  },
  isError: true
});

/**
 * Create the MCP server with all tools
 */
function createAgentServer() {
  const server = new McpServer(
    {
      name: 'lana-agent-simple',
      version: '1.0.0'
    },
    {
      capabilities: {
        logging: {}
      }
    }
  );

  // Tool 1: List Models
  server.registerTool(
    'list-models',
    {
      title: 'List Available Models',
      description: 'Fetch available image generation models with their capabilities. Filter by reference image support if needed.',
      inputSchema: z.object({
        referenceImageCount: z
          .number()
          .optional()
          .describe('Filter models by reference image support: 0 (text-to-image), 1 (single reference), or >1 (multiple references)')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        total: z.number(),
        models: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            owner: z.string(),
            fullName: z.string(),
            aspectRatios: z.array(z.string()),
            runCount: z.number(),
            tags: z.array(z.string()),
            isOfficial: z.boolean(),
            url: z.string().nullable(),
            capabilities: z.object({
              supportsSingleReference: z.boolean(),
              supportsMultipleReferences: z.boolean(),
              supportsImageToImage: z.boolean()
            }),
            strengths: z.array(z.string())
          })
        )
      })
    },
    async ({ referenceImageCount }) => {
      try {
        const result = await executeTool('list-models', { referenceImageCount });

        return {
          content: [
            {
              type: 'text',
              text: `📚 Found ${result.total} models${referenceImageCount !== undefined ? ` (filtered for ${referenceImageCount} reference images)` : ''}.\n\nTop models:\n${result.models
                .slice(0, 5)
                .map((model, index) => `${index + 1}. ${model.name} (${model.id}) - ${model.strengths.join(', ')}`)
                .join('\n')}`
            }
          ],
          structuredContent: result
        };
      } catch (error) {
        return toolError(error.message || 'Failed to list models');
      }
    }
  );

  // Tool 2: Suggest Prompt
  server.registerTool(
    'suggest-prompt',
    {
      title: 'Suggest Prompt',
      description: 'Transform user input into an optimized image generation prompt',
      inputSchema: z.object({
        userInput: z
          .string()
          .min(3)
          .describe('Natural language description of desired image')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        suggestion: z.object({
          prompt: z.string(),
          aspectRatio: z.string(),
          style: z.string(),
          model: z.object({
            id: z.string(),
            name: z.string()
          }),
          promptMetadata: z.record(z.any())
        })
      })
    },
    async ({ userInput }) => {
      try {
        const result = await executeTool('suggest-prompt', { userInput });

        return {
          content: [
            {
              type: 'text',
              text: `✨ Prompt Suggestion\n\nOptimized Prompt: ${result.suggestion.prompt}\n\nStyle: ${result.suggestion.style}\nAspect Ratio: ${result.suggestion.aspectRatio}\nRecommended Model: ${result.suggestion.model.name}`
            }
          ],
          structuredContent: result
        };
      } catch (error) {
        return toolError(error.message || 'Failed to generate prompt suggestion');
      }
    }
  );

  // Tool 3: Search Models
  server.registerTool(
    'search-models',
    {
      title: 'Search Models',
      description: 'Search for image generation models using a keyword',
      inputSchema: z.object({
        keyword: z.string().min(2).describe('Keyword to search for')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        keyword: z.string(),
        total: z.number(),
        models: z.array(
          z.object({
            id: z.string(),
            name: z.string(),
            description: z.string(),
            owner: z.string(),
            fullName: z.string(),
            aspectRatios: z.array(z.string()),
            runCount: z.number(),
            tags: z.array(z.string()),
            isOfficial: z.boolean(),
            url: z.string().nullable()
          })
        )
      })
    },
    async ({ keyword }) => {
      try {
        const result = await executeTool('search-models', { keyword });

        return {
          content: [
            {
              type: 'text',
              text: `🔍 Found ${result.total} models matching "${result.keyword}".\n\n${result.models
                .slice(0, 5)
                .map((model, index) => `${index + 1}. ${model.name} (${model.id})`)
                .join('\n')}`
            }
          ],
          structuredContent: result
        };
      } catch (error) {
        return toolError(error.message || 'Failed to search models');
      }
    }
  );

  // Tool 4: Generate Image
  server.registerTool(
    'generate-image',
    {
      title: 'Generate Image',
      description: 'Generate an image with the specified model and parameters. Call list-models first to choose the best model.',
      inputSchema: z.object({
        modelId: z
          .string()
          .min(1)
          .describe('Required model ID to use for generation'),
        prompt: z
          .string()
          .min(3)
          .describe('Required prompt describing the desired image'),
        referenceImages: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe('Optional reference image URL(s) for image-to-image generation'),
        aspectRatio: z
          .string()
          .optional()
          .describe('Optional aspect ratio (e.g., "1:1", "16:9", "9:16")'),
        style: z
          .string()
          .optional()
          .describe('Optional style preference'),
        negativePrompt: z
          .string()
          .optional()
          .describe('Optional negative prompt to avoid unwanted elements'),
        extraParams: z
          .record(z.any())
          .optional()
          .describe('Additional model-specific parameters')
      }),
      outputSchema: z.object({
        success: z.boolean(),
        imageUrl: z.string(),
        metadata: z.object({
          model: z.object({
            id: z.string(),
            name: z.string(),
            fullName: z.string(),
            capabilities: z.object({
              supportsSingleReference: z.boolean(),
              supportsMultipleReferences: z.boolean(),
              supportsImageToImage: z.boolean()
            })
          }),
          prompt: z.string(),
          negativePrompt: z.string().nullable(),
          referenceImages: z.array(z.string()),
          aspectRatio: z.string(),
          style: z.string(),
          size: z.string().optional(),
          dimensions: z
            .object({
              width: z.number(),
              height: z.number()
            })
            .optional()
        })
      })
    },
    async ({ modelId, prompt, referenceImages, aspectRatio, style, negativePrompt, extraParams }, extra) => {
      try {
        if (extra?.sessionId) {
          await server.sendLoggingMessage(
            {
              level: 'info',
              data: `🚀 Generating image with ${modelId}...`
            },
            extra.sessionId
          );
        }

        const result = await executeTool('generate-image', {
          modelId,
          prompt,
          referenceImages,
          aspectRatio,
          style,
          negativePrompt,
          extraParams
        });

        if (extra?.sessionId) {
          await server.sendLoggingMessage(
            {
              level: 'info',
              data: `✅ Image generated: ${result.imageUrl}`
            },
            extra.sessionId
          );
        }

        const refInfo = result.metadata.referenceImages.length > 0 
          ? `\nReferences: ${result.metadata.referenceImages.length} image(s)` 
          : '';

        return {
          content: [
            {
              type: 'text',
              text: [
                '✅ Image generation completed!',
                '',
                `Model: ${result.metadata.model.name} (${result.metadata.model.id})`,
                `Aspect Ratio: ${result.metadata.aspectRatio}`,
                result.metadata.size ? `Size: ${result.metadata.size}` : null,
                refInfo || null,
                '',
                `Image URL: ${result.imageUrl}`
              ]
                .filter(Boolean)
                .join('\n')
            }
          ],
          structuredContent: result
        };
      } catch (error) {
        if (extra?.sessionId) {
          await server.sendLoggingMessage(
            {
              level: 'error',
              data: `❌ Generation failed: ${error.message}`
            },
            extra.sessionId
          );
        }
        return toolError(error.message || 'Image generation failed');
      }
    }
  );

  return server;
}

module.exports = {
  createAgentServer
};

