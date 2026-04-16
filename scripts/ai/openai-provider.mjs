/**
 * OpenAI provider implementation of the AIProvider interface.
 *
 * Uses the OpenAI Responses API (preferred) with fallback to Chat Completions.
 * All methods follow the never-throw contract: errors are returned as
 * { success: false, error: message }, never thrown.
 */

import OpenAI from 'openai';
import { buildUpdatePrompt, buildCreatePrompt, buildDeletePrompt, buildSummarizePrompt } from './prompts.mjs';

const MIN_CONTENT_LENGTH = 50;

/**
 * Create an OpenAI-backed AI provider.
 * @param {{ apiKey: string, model: string, client?: Object }} config
 * @returns {import('./ai-provider.mjs').AIProvider}
 */
export function createOpenAIProvider({ apiKey, model, client }) {
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is required');
  }

  const openai = client || new OpenAI({ apiKey });

  /**
   * Call the OpenAI API with system and user prompts.
   * Tries Responses API first, falls back to Chat Completions.
   * @param {string} systemPrompt
   * @param {string} userPrompt
   * @returns {Promise<string>}
   */
  async function callAI(systemPrompt, userPrompt) {
    try {
      const response = await openai.responses.create({
        model,
        instructions: systemPrompt,
        input: userPrompt,
      });
      return response.output_text;
    } catch (err) {
      // If Responses API is not available for this model, fall back to Chat Completions
      if (err.message?.includes('not found') || err.status === 404) {
        const completion = await openai.chat.completions.create({
          model,
          messages: [
            { role: 'developer', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
        });
        return completion.choices[0].message.content;
      }
      throw err;
    }
  }

  /**
   * Strip leading frontmatter block if the AI accidentally included one.
   * @param {string} content
   * @returns {string}
   */
  function stripFrontmatter(content) {
    return content.replace(/^---\n[\s\S]*?\n---\n*/, '');
  }

  return {
    async updatePage(diff, existingContent, pageMeta) {
      try {
        const { system, user } = buildUpdatePrompt(diff, existingContent, pageMeta);
        let content = await callAI(system, user);
        content = stripFrontmatter(content);

        if (!content || content.length < MIN_CONTENT_LENGTH) {
          return { success: false, error: `Response too short (${content?.length || 0} chars)` };
        }
        return { success: true, content };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async createPage(diff, pageMeta) {
      try {
        const { system, user } = buildCreatePrompt(diff, pageMeta);
        let content = await callAI(system, user);
        content = stripFrontmatter(content);

        if (!content || content.length < MIN_CONTENT_LENGTH) {
          return { success: false, error: `Response too short (${content?.length || 0} chars)` };
        }
        return { success: true, content };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async deletePage(diff, existingContent, pageMeta) {
      try {
        const { system, user } = buildDeletePrompt(diff, existingContent, pageMeta);
        let content = await callAI(system, user);
        content = stripFrontmatter(content);

        // AI returns __PAGE_DELETED__ when the entire page should be removed
        if (content && content.trim() === '__PAGE_DELETED__') {
          return { success: true, content: '__PAGE_DELETED__' };
        }

        if (!content || content.length < MIN_CONTENT_LENGTH) {
          return { success: false, error: `Response too short (${content?.length || 0} chars)` };
        }
        return { success: true, content };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async summarizeChanges(results) {
      try {
        const { system, user } = buildSummarizePrompt(results);
        const content = await callAI(system, user);

        if (!content) {
          return { success: false, error: 'Empty summary response' };
        }
        return { success: true, content };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },

    async classify(prompt) {
      try {
        const content = await callAI(prompt.system, prompt.user);
        return { success: true, content };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };
}
