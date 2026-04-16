/**
 * Content generation orchestrator for AI-driven documentation updates.
 *
 * Chains all Phase 7 (provider) and Phase 8 (diff analysis) modules into
 * a single pipeline: parseDiff -> mapFilesToDocs -> preFilter -> classifyDiffs
 * -> mergeDiffsPerPage -> Promise.allSettled(updatePage/createPage)
 * -> summarizeChanges -> write files -> return JSON.
 *
 * Per D-02: Standalone script in scripts/ai/.
 * Per D-03: Full pipeline internally — receives only ERP repo path + version tags.
 * Per D-12: Outputs JSON to stdout for Phase 10 consumption.
 */

import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { splitFrontmatter, joinFrontmatter } from './ai-provider.mjs';
import { getDiffBetweenTags, parseDiff } from './diff-parser.mjs';
import { loadPageMap, mapFilesToDocs } from './page-mapper.mjs';
import { preFilter, classifyDiffs } from './diff-classifier.mjs';
import { createProvider } from './create-provider.mjs';

/**
 * Merge diffs from multiple ERP files that map to the same docSection.
 * Per D-04: Reduces AI calls by concatenating diffs per page.
 *
 * @param {Array<{filePath: string, changeType: string, hunks: Array, docSection: string}>} files
 * @returns {Map<string, {docSection: string, mergedDiff: string, sourceFiles: string[]}>}
 */
export function mergeDiffsPerPage(files) {
  /** @type {Map<string, {docSection: string, diffs: string[], sourceFiles: string[]}>} */
  const groups = new Map();

  for (const file of files) {
    const key = file.docSection;
    if (!groups.has(key)) {
      groups.set(key, { docSection: key, diffs: [], sourceFiles: [] });
    }
    const group = groups.get(key);

    // Reconstruct diff text from hunks
    const diffText = file.hunks
      .map((h) => `${h.header}\n${h.lines.join('\n')}`)
      .join('\n');

    group.diffs.push(`--- ${file.filePath} ---\n${diffText}`);
    group.sourceFiles.push(file.filePath);
  }

  // Finalize merged diffs
  /** @type {Map<string, {docSection: string, mergedDiff: string, sourceFiles: string[]}>} */
  const result = new Map();
  for (const [key, group] of groups) {
    result.set(key, {
      docSection: group.docSection,
      mergedDiff: group.diffs.join('\n\n'),
      sourceFiles: group.sourceFiles,
    });
  }

  return result;
}

/**
 * Find the target MDX/MD file in a documentation section directory.
 * Per D-11: Glob for *.md and *.mdx. Single file = that's it. Multiple = match by title.
 *
 * @param {string} docsRepoPath - Root of the docs repo
 * @param {string} docSection - e.g., 'latest/financeiro/'
 * @param {string|null} expectedTitle - Title to match in frontmatter (for multi-file dirs)
 * @param {Object} deps - Injectable dependencies
 * @returns {Promise<string|null>} Absolute path to the file, or null
 */
export async function findDocFile(docsRepoPath, docSection, expectedTitle, deps) {
  const dirPath = join(docsRepoPath, 'src', 'content', 'docs', docSection);

  let entries;
  try {
    entries = await deps.readdir(dirPath);
  } catch {
    return null;
  }

  // Filter to .md and .mdx files only
  const mdFiles = entries.filter(
    (f) => f.endsWith('.md') || f.endsWith('.mdx')
  );

  if (mdFiles.length === 0) return null;

  if (mdFiles.length === 1) {
    return join(dirPath, mdFiles[0]);
  }

  // Multiple files — match by frontmatter title
  if (!expectedTitle) return join(dirPath, mdFiles[0]);

  for (const file of mdFiles) {
    const filePath = join(dirPath, file);
    try {
      const content = await deps.readFile(filePath, 'utf-8');
      const { frontmatter } = deps.splitFrontmatter(content);
      // Extract title from frontmatter YAML
      const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
      if (titleMatch) {
        const title = titleMatch[1].replace(/^["']|["']$/g, '').trim();
        if (title === expectedTitle) {
          return filePath;
        }
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Build frontmatter for a new page.
 * Per D-07: System generates frontmatter using fixed template. AI returns body only.
 *
 * @param {string} title - Page title (from AI suggestion)
 * @param {number} sidebarOrder - Sidebar order number
 * @returns {string} Frontmatter YAML (without --- delimiters)
 */
export function buildNewPageFrontmatter(title, sidebarOrder) {
  return `title: "${title}"\ndescription: "Documentacao do modulo ${title} no Despensinha ERP."\nsidebar:\n  order: ${sidebarOrder}`;
}

/**
 * Main content generation orchestrator.
 * Per D-03: Full pipeline — parse, map, filter, classify, generate, write, return.
 *
 * @param {Object} options
 * @param {string} options.erpRepoPath - Path to ERP repository
 * @param {string} options.fromTag - Previous version tag
 * @param {string} options.toTag - New version tag
 * @param {string} options.docsRepoPath - Path to docs repo root
 * @param {string} options.pageMapPath - Path to page-map.json
 * @param {Object} [options.deps] - Injectable dependencies (for testing)
 * @returns {Promise<{updated: Array, created: Array, failures: Array, summary: string}>}
 */
export async function generateContent(options) {
  const {
    erpRepoPath,
    fromTag,
    toTag,
    docsRepoPath,
    pageMapPath,
    deps: injectedDeps,
  } = options;

  // Resolve dependencies (use injected or real)
  const deps = {
    readFile: injectedDeps?.readFile || ((p) => readFile(p, 'utf-8')),
    writeFile: injectedDeps?.writeFile || writeFile,
    readdir: injectedDeps?.readdir || readdir,
    mkdir: injectedDeps?.mkdir || mkdir,
    getDiffBetweenTags: injectedDeps?.getDiffBetweenTags || getDiffBetweenTags,
    parseDiff: injectedDeps?.parseDiff || parseDiff,
    loadPageMap: injectedDeps?.loadPageMap || loadPageMap,
    mapFilesToDocs: injectedDeps?.mapFilesToDocs || mapFilesToDocs,
    preFilter: injectedDeps?.preFilter || preFilter,
    classifyDiffs: injectedDeps?.classifyDiffs || classifyDiffs,
    createProvider: injectedDeps?.createProvider || createProvider,
    splitFrontmatter: injectedDeps?.splitFrontmatter || splitFrontmatter,
    joinFrontmatter: injectedDeps?.joinFrontmatter || joinFrontmatter,
  };

  const result = { updated: [], created: [], deleted: [], failures: [], summary: '' };

  // 1. Get raw diff
  console.error(`[generate-content] Getting diff between ${fromTag}..${toTag}`);
  const diffResult = await deps.getDiffBetweenTags(erpRepoPath, fromTag, toTag);
  if (!diffResult.success) {
    console.error(`[generate-content] Failed to get diff: ${diffResult.error}`);
    result.summary = `Failed to get diff: ${diffResult.error}`;
    return result;
  }

  // 2. Parse diff into structured files
  const parsedFiles = deps.parseDiff(diffResult.content);
  console.error(`[generate-content] Parsed ${parsedFiles.length} files from diff`);

  if (parsedFiles.length === 0) {
    result.summary = 'No files changed between tags.';
    return result;
  }

  // 3. Load page map
  const pageMap = await deps.loadPageMap(pageMapPath);
  console.error(`[generate-content] Loaded page map (repoType: ${pageMap.repoType})`);

  // 4. Map files to doc sections
  const { mapped, unmapped } = deps.mapFilesToDocs(parsedFiles, pageMap);
  console.error(`[generate-content] Mapped: ${mapped.length}, Unmapped: ${unmapped.length}`);

  // 5. Pre-filter mapped files (remove tests/mocks)
  const { remaining } = deps.preFilter(mapped);
  console.error(`[generate-content] After pre-filter: ${remaining.length} files remaining`);

  // 6. Create provider
  const provider = deps.createProvider();

  // 7. Classify diffs with AI
  const classResult = await deps.classifyDiffs(remaining, unmapped, provider);
  if (!classResult.success) {
    console.error(`[generate-content] Classification failed: ${classResult.error}`);
    result.summary = `Classification failed: ${classResult.error}`;
    return result;
  }

  const classifiedFiles = classResult.files;
  console.error(`[generate-content] Classified ${classifiedFiles.length} files`);

  // 8. Separate: delete files vs update files vs create files vs skip
  // 8a. Pull out deleted files BEFORE classification-based routing
  const deleteFiles = mapped.filter((f) => f.changeType === 'delete');
  const nonDeleteMapped = mapped.filter((f) => f.changeType !== 'delete');

  const updateFilePaths = new Set(
    classifiedFiles
      .filter((f) => f.classification !== 'refactor-skip' && !f.isNewModule)
      .map((f) => f.filePath)
  );
  const createFilePaths = new Set(
    classifiedFiles.filter((f) => f.isNewModule).map((f) => f.filePath)
  );

  // Get non-deleted mapped files that need updating (non-skip, non-newModule, have docSection)
  const updateFiles = nonDeleteMapped.filter((f) => updateFilePaths.has(f.filePath));
  // Get unmapped files that are new modules
  const createFiles = unmapped.filter((f) => createFilePaths.has(f.filePath));

  console.error(
    `[generate-content] Delete: ${deleteFiles.length} files, Update: ${updateFiles.length} files, Create: ${createFiles.length} files`
  );

  // 9. Merge diffs per page for deletes and updates (per D-04)
  const deleteMergedGroups = mergeDiffsPerPage(deleteFiles);
  const mergedGroups = mergeDiffsPerPage(updateFiles);

  // 10a. Build delete tasks
  const deleteTasks = Array.from(deleteMergedGroups.values()).map(async (group) => {
    try {
      const docFilePath = await findDocFile(docsRepoPath, group.docSection, null, deps);
      if (!docFilePath) {
        // Doc file doesn't exist — nothing to delete
        return {
          type: 'deleted',
          page: group.docSection,
          sourceFiles: group.sourceFiles,
          note: 'No doc file found (already removed or never existed)',
        };
      }

      const existingContent = await deps.readFile(docFilePath);
      const { frontmatter, body } = deps.splitFrontmatter(existingContent);

      const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
      const title = titleMatch
        ? titleMatch[1].replace(/^["']|["']$/g, '').trim()
        : group.docSection;

      const sectionParts = group.docSection.replace(/^latest\//, '').replace(/\/$/, '');

      /** @type {import('./ai-provider.mjs').PageMeta} */
      const pageMeta = {
        title,
        section: sectionParts,
        repoType: pageMap.repoType,
      };

      const aiResult = await provider.deletePage(group.mergedDiff, body, pageMeta);

      if (!aiResult.success) {
        return {
          type: 'failure',
          page: group.docSection,
          error: aiResult.error,
          sourceFiles: group.sourceFiles,
        };
      }

      if (aiResult.content === '__PAGE_DELETED__') {
        // AI determined the entire page should be removed
        const { unlink } = await import('node:fs/promises');
        await unlink(docFilePath);
        return {
          type: 'deleted',
          page: group.docSection,
          sourceFiles: group.sourceFiles,
          note: 'Page entirely removed (all content was about deleted feature)',
        };
      }

      // AI returned updated content with deleted sections removed
      const updatedContent = deps.joinFrontmatter(frontmatter, aiResult.content);
      await deps.writeFile(docFilePath, updatedContent);

      return {
        type: 'updated',
        page: group.docSection,
        sourceFiles: group.sourceFiles,
        note: 'Removed sections for deleted feature',
      };
    } catch (err) {
      return {
        type: 'failure',
        page: group.docSection,
        error: err.message,
        sourceFiles: group.sourceFiles,
      };
    }
  });

  // 10b. Build update tasks
  const updateTasks = Array.from(mergedGroups.values()).map(async (group) => {
    try {
      // Find the target doc file
      const docFilePath = await findDocFile(docsRepoPath, group.docSection, null, deps);
      if (!docFilePath) {
        return {
          type: 'failure',
          page: group.docSection,
          error: `No doc file found in ${group.docSection}`,
          sourceFiles: group.sourceFiles,
        };
      }

      // Read existing content
      const existingContent = await deps.readFile(docFilePath);
      const { frontmatter, body } = deps.splitFrontmatter(existingContent);

      // Extract title for PageMeta
      const titleMatch = frontmatter.match(/^title:\s*(.+)$/m);
      const title = titleMatch
        ? titleMatch[1].replace(/^["']|["']$/g, '').trim()
        : group.docSection;

      // Extract section from docSection (e.g., 'latest/financeiro/' -> 'financeiro')
      const sectionParts = group.docSection.replace(/^latest\//, '').replace(/\/$/, '');

      /** @type {import('./ai-provider.mjs').PageMeta} */
      const pageMeta = {
        title,
        section: sectionParts,
        repoType: pageMap.repoType,
      };

      // Call provider.updatePage with merged diff
      const aiResult = await provider.updatePage(group.mergedDiff, body, pageMeta);

      if (!aiResult.success) {
        return {
          type: 'failure',
          page: group.docSection,
          error: aiResult.error,
          sourceFiles: group.sourceFiles,
        };
      }

      // Write updated file with preserved frontmatter
      const updatedContent = deps.joinFrontmatter(frontmatter, aiResult.content);
      await deps.writeFile(docFilePath, updatedContent);

      return {
        type: 'updated',
        page: group.docSection,
        sourceFiles: group.sourceFiles,
      };
    } catch (err) {
      return {
        type: 'failure',
        page: group.docSection,
        error: err.message,
        sourceFiles: group.sourceFiles,
      };
    }
  });

  // 11. Build create tasks
  const createTasks = createFiles.map(async (file) => {
    try {
      // Reconstruct diff text from hunks
      const diffText = file.hunks
        .map((h) => `${h.header}\n${h.lines.join('\n')}`)
        .join('\n');

      // Extract module name from path for context
      const pathParts = file.filePath.split('/');
      const moduleName = pathParts[pathParts.length - 2] || pathParts[pathParts.length - 1];

      /** @type {import('./ai-provider.mjs').PageMeta} */
      const pageMeta = {
        title: moduleName,
        section: moduleName,
        repoType: pageMap.repoType,
      };

      // Call provider.createPage — AI suggests path and title
      const aiResult = await provider.createPage(diffText, pageMeta);

      if (!aiResult.success) {
        return {
          type: 'failure',
          page: file.filePath,
          error: aiResult.error,
          sourceFiles: [file.filePath],
        };
      }

      // Determine file path — use AI suggestion or fallback
      const suggestedPath =
        aiResult.suggestedPath || `latest/${moduleName.toLowerCase()}/index.md`;
      const suggestedTitle = aiResult.suggestedTitle || moduleName;

      const fullPath = join(docsRepoPath, 'src', 'content', 'docs', suggestedPath);

      // Ensure directory exists (per Pitfall 4)
      const dirPath = fullPath.substring(0, fullPath.lastIndexOf('/'));
      await deps.mkdir(dirPath, { recursive: true });

      // Build frontmatter and write file
      const frontmatter = buildNewPageFrontmatter(suggestedTitle, 99);
      const fileContent = deps.joinFrontmatter(frontmatter, aiResult.content);
      await deps.writeFile(fullPath, fileContent);

      return {
        type: 'created',
        page: suggestedPath,
        title: suggestedTitle,
        sourceFiles: [file.filePath],
      };
    } catch (err) {
      return {
        type: 'failure',
        page: file.filePath,
        error: err.message,
        sourceFiles: [file.filePath],
      };
    }
  });

  // 12. Execute all tasks in parallel (per D-01)
  const allSettled = await Promise.allSettled([...deleteTasks, ...updateTasks, ...createTasks]);

  // 13. Collect results
  for (const settled of allSettled) {
    // Promise.allSettled always fulfills since tasks catch internally
    const taskResult = settled.status === 'fulfilled' ? settled.value : {
      type: 'failure',
      page: 'unknown',
      error: settled.reason?.message || 'Unknown error',
      sourceFiles: [],
    };

    switch (taskResult.type) {
      case 'updated':
        result.updated.push({
          page: taskResult.page,
          sourceFiles: taskResult.sourceFiles,
        });
        break;
      case 'created':
        result.created.push({
          page: taskResult.page,
          title: taskResult.title,
          sourceFiles: taskResult.sourceFiles,
        });
        break;
      case 'deleted':
        result.deleted.push({
          page: taskResult.page,
          note: taskResult.note,
          sourceFiles: taskResult.sourceFiles,
        });
        break;
      case 'failure':
        result.failures.push({
          page: taskResult.page,
          error: taskResult.error,
          sourceFiles: taskResult.sourceFiles,
        });
        break;
    }
  }

  console.error(
    `[generate-content] Results: ${result.updated.length} updated, ${result.created.length} created, ${result.deleted.length} deleted, ${result.failures.length} failures`
  );

  // 14. Summarize changes (per D-09)
  const summaryInput = [
    ...result.updated.map((u) => ({ success: true, content: `Updated: ${u.page}` })),
    ...result.created.map((c) => ({ success: true, content: `Created: ${c.page} (${c.title})` })),
    ...result.deleted.map((d) => ({ success: true, content: `Deleted: ${d.page} (${d.note})` })),
    ...result.failures.map((f) => ({ success: false, error: `${f.page}: ${f.error}` })),
  ];

  const summaryResult = await provider.summarizeChanges(summaryInput);
  result.summary = summaryResult.success
    ? summaryResult.content
    : `Summary generation failed: ${summaryResult.error}`;

  return result;
}

// CLI entry point -- only runs when executed directly
const isMain =
  process.argv[1] &&
  import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.error('Usage: node generate-content.mjs <erpRepoPath> <fromTag> <toTag>');
    process.exit(0);
  }
  const [erpRepoPath, fromTag, toTag] = args;
  if (!erpRepoPath || !fromTag || !toTag) {
    console.error('Usage: node generate-content.mjs <erpRepoPath> <fromTag> <toTag>');
    process.exit(1);
  }
  const docsRepoPath = new URL('../../', import.meta.url).pathname;
  const pageMapPath = new URL('./page-map.json', import.meta.url).pathname;
  generateContent({ erpRepoPath, fromTag, toTag, docsRepoPath, pageMapPath })
    .then((r) => console.log(JSON.stringify(r, null, 2)))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
