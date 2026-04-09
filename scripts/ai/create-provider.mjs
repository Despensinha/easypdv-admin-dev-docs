/**
 * Factory function for creating AI provider instances.
 *
 * Reads environment variables to determine which provider to instantiate.
 * Callers import createProvider() and never know which implementation they get.
 *
 * Environment variables:
 * - AI_PROVIDER: Provider type (default: 'openai')
 * - OPENAI_API_KEY: Required for OpenAI provider
 * - OPENAI_MODEL: Model to use (default: 'gpt-5.4-mini')
 */

import { createOpenAIProvider } from './openai-provider.mjs';

/**
 * Create an AI provider instance based on environment configuration.
 * @returns {import('./ai-provider.mjs').AIProvider}
 */
export function createProvider() {
  const providerType = process.env.AI_PROVIDER || 'openai';

  switch (providerType) {
    case 'openai': {
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is required. Set it as environment variable.');
      }
      return createOpenAIProvider({
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_MODEL || 'gpt-5.4-mini',
      });
    }
    default:
      throw new Error(`Unknown AI provider: ${providerType}`);
  }
}
