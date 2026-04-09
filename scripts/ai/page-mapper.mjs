/**
 * Page mapper for ERP-to-docs path resolution.
 *
 * Loads a page-map.json config and resolves ERP file paths to
 * documentation sections. Unmapped paths are collected separately
 * for downstream new-module detection (per D-07).
 */

import { readFile } from 'node:fs/promises';

/**
 * @typedef {Object} PageMapEntry
 * @property {string} erpDir
 * @property {string|null} docSection
 * @property {string} description
 */

/**
 * @typedef {Object} PageMap
 * @property {'user'|'dev'} repoType
 * @property {PageMapEntry[]} mappings
 */

/**
 * @typedef {Object} MappedFile
 * @property {string} filePath
 * @property {'add'|'modify'|'delete'} changeType
 * @property {import('./diff-parser.mjs').DiffHunk[]} hunks
 * @property {string} docSection
 */

/**
 * @typedef {Object} MapResult
 * @property {MappedFile[]} mapped - Files with docSection (non-null mapping found)
 * @property {import('./diff-parser.mjs').ParsedDiffFile[]} unmapped - Files with no mapping entry at all
 */

/**
 * Load and parse a page-map.json config file.
 *
 * @param {string} pageMapPath - Absolute path to page-map.json
 * @returns {Promise<PageMap>}
 */
export async function loadPageMap(pageMapPath) {
  const raw = await readFile(pageMapPath, 'utf-8');
  return JSON.parse(raw);
}

/**
 * Map parsed diff files to documentation sections using page-map.json.
 *
 * Uses longest prefix match (per D-06 directory-level granularity):
 * - If mapping found AND docSection is non-null: file goes to mapped[]
 * - If mapping found AND docSection is null: file is skipped (intentionally not doc-relevant)
 * - If NO mapping found: file goes to unmapped[] (per D-07, for new module detection)
 *
 * @param {import('./diff-parser.mjs').ParsedDiffFile[]} parsedFiles
 * @param {PageMap} pageMap
 * @returns {MapResult}
 */
export function mapFilesToDocs(parsedFiles, pageMap) {
  /** @type {MappedFile[]} */
  const mapped = [];
  /** @type {import('./diff-parser.mjs').ParsedDiffFile[]} */
  const unmapped = [];

  for (const file of parsedFiles) {
    // Find longest matching erpDir prefix
    let bestMatch = null;
    let bestLength = 0;

    for (const entry of pageMap.mappings) {
      if (file.filePath.startsWith(entry.erpDir) && entry.erpDir.length > bestLength) {
        bestMatch = entry;
        bestLength = entry.erpDir.length;
      }
    }

    if (bestMatch === null) {
      // No mapping found at all -- goes to new module detection
      unmapped.push(file);
    } else if (bestMatch.docSection !== null) {
      // Mapping found with doc section -- add to mapped
      mapped.push({
        filePath: file.filePath,
        changeType: file.changeType,
        hunks: file.hunks,
        docSection: bestMatch.docSection,
      });
    }
    // else: mapping found but docSection is null -- intentionally skip
  }

  return { mapped, unmapped };
}
