/**
 * AI Provider interface definitions and frontmatter helpers.
 *
 * This file defines the contract (via JSDoc typedefs) that all AI provider
 * implementations must satisfy. It also exports utility functions for
 * frontmatter manipulation used by the orchestrator layer.
 */

/**
 * @typedef {Object} AIProviderResult
 * @property {boolean} success
 * @property {string} [content] - Generated MDX body (present when success=true)
 * @property {string} [error] - Error message (present when success=false)
 */

/**
 * @typedef {Object} PageMeta
 * @property {string} title - Page title from frontmatter
 * @property {string} section - Parent section (e.g., 'cadastros', 'vendas')
 * @property {'user'|'dev'} repoType - Determines tone of generated content
 * @property {string[]} [siblingTitles] - Adjacent page titles for context
 * @property {string} [styleExample] - Excerpt from a well-written page
 * @property {Object} [frontmatterTemplate] - Expected frontmatter structure
 */

/**
 * @typedef {Object} AIProvider
 * @property {(diff: string, existingContent: string, pageMeta: PageMeta) => Promise<AIProviderResult>} updatePage
 * @property {(diff: string, pageMeta: PageMeta) => Promise<AIProviderResult>} createPage
 * @property {(results: AIProviderResult[]) => Promise<AIProviderResult>} summarizeChanges
 */

const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/;

/**
 * Split a file's frontmatter from its body content.
 * @param {string} fileContent - Full MDX file content
 * @returns {{ frontmatter: string, body: string }}
 */
export function splitFrontmatter(fileContent) {
  const match = fileContent.match(FRONTMATTER_REGEX);
  if (!match) {
    return { frontmatter: '', body: fileContent };
  }
  return { frontmatter: match[1], body: match[2] };
}

/**
 * Rejoin frontmatter and body into a complete file.
 * @param {string} frontmatter - YAML frontmatter (without --- delimiters)
 * @param {string} body - MDX body content
 * @returns {string}
 */
export function joinFrontmatter(frontmatter, body) {
  return `---\n${frontmatter}\n---\n\n${body}`;
}
