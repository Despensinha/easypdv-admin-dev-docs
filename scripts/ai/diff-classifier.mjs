/**
 * Diff classifier for ERP change analysis.
 *
 * Two-layer classification:
 * 1. Deterministic pre-filter catches test/mock/story/Metronic files
 * 2. AI batch call classifies remaining files into documentation categories
 *
 * Per D-09 (deterministic pre-filter), D-10 (single AI batch),
 * D-13 (unmapped new-module detection), D-14 (classification output).
 */

import { buildClassifyPrompt } from './prompts.mjs';

/**
 * @typedef {Object} ClassifiedFile
 * @property {string} filePath
 * @property {'ui-only'|'architecture'|'new-feature'|'refactor-skip'} classification
 * @property {boolean} isNewModule
 */

/**
 * @typedef {Object} ClassificationResult
 * @property {boolean} success
 * @property {ClassifiedFile[]} [files]
 * @property {string} [error]
 */

/**
 * @typedef {Object} PreFilterResult
 * @property {import('./diff-parser.mjs').ParsedDiffFile[]} skipped
 * @property {import('./diff-parser.mjs').ParsedDiffFile[]} remaining
 */

const IGNORED_PATTERNS = [
  /\.test\.(ts|tsx|js|jsx|mjs)$/,
  /\.spec\.(ts|tsx|js|jsx|mjs)$/,
  /\/__tests__\//,
  /\/__mocks__\//,
  /\.stories\.(ts|tsx)$/,
  /\.d\.ts$/,
];

const IGNORED_DIRS = ['src/_metronic/'];

/**
 * Deterministically filter files that never need documentation updates.
 *
 * Test files, mocks, stories, type declarations, and Metronic template
 * files are always classified as refactor-skip without AI involvement.
 *
 * @param {import('./diff-parser.mjs').ParsedDiffFile[]} files
 * @returns {PreFilterResult}
 */
export function preFilter(files) {
  /** @type {import('./diff-parser.mjs').ParsedDiffFile[]} */
  const skipped = [];
  /** @type {import('./diff-parser.mjs').ParsedDiffFile[]} */
  const remaining = [];

  for (const file of files) {
    const matchesPattern = IGNORED_PATTERNS.some((pattern) => pattern.test(file.filePath));
    const matchesDir = IGNORED_DIRS.some((dir) => file.filePath.startsWith(dir));

    if (matchesPattern || matchesDir) {
      skipped.push(file);
    } else {
      remaining.push(file);
    }
  }

  return { skipped, remaining };
}

/**
 * Classify remaining diff files using AI in a single batch call.
 *
 * Combines remaining (mapped) and unmapped files into one batch.
 * Unmapped files are flagged so the AI can detect new ERP modules.
 *
 * @param {import('./diff-parser.mjs').ParsedDiffFile[]} remaining - Files that passed pre-filter
 * @param {import('./diff-parser.mjs').ParsedDiffFile[]} unmapped - Files with no page-map entry
 * @param {import('./ai-provider.mjs').AIProvider} provider - AI provider with classify method
 * @returns {Promise<ClassificationResult>}
 */
export async function classifyDiffs(remaining, unmapped, provider) {
  if (remaining.length === 0 && unmapped.length === 0) {
    return { success: true, files: [] };
  }

  // Combine remaining and unmapped, marking unmapped files
  const combinedFiles = [
    ...remaining.map((f) => ({
      filePath: f.filePath,
      changeType: f.changeType,
      hunks: f.hunks,
    })),
    ...unmapped.map((f) => ({
      filePath: f.filePath,
      changeType: f.changeType,
      hunks: f.hunks,
      unmapped: true,
    })),
  ];

  const prompt = buildClassifyPrompt(combinedFiles);
  const result = await provider.classify(prompt);

  if (!result.success) {
    return { success: false, error: result.error };
  }

  try {
    const parsed = JSON.parse(result.content);
    /** @type {ClassifiedFile[]} */
    const classifiedFiles = parsed.map((item) => ({
      filePath: item.filePath,
      classification: item.classification,
      isNewModule: item.isNewModule || false,
    }));
    return { success: true, files: classifiedFiles };
  } catch {
    return { success: false, error: 'Failed to parse AI classification response' };
  }
}
