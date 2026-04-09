/**
 * Diff parser for ERP git diffs.
 *
 * Parses raw unified diff text into structured objects for downstream
 * page mapping and change classification. Also provides helpers to
 * execute git commands for tag detection and diff generation.
 */

import { execFile as execFileCb } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCb);

/**
 * @typedef {Object} DiffHunk
 * @property {string} header - e.g., "@@ -10,6 +10,8 @@ function name"
 * @property {string[]} lines - Raw hunk lines (context +, -, space)
 */

/**
 * @typedef {Object} ParsedDiffFile
 * @property {string} filePath - e.g., "src/app/pages/finance/BillsToPayPage.tsx"
 * @property {'add'|'modify'|'delete'} changeType
 * @property {DiffHunk[]} hunks
 */

/**
 * Parse raw unified diff text into structured ParsedDiffFile array.
 *
 * Line-by-line state machine that handles new files, deleted files,
 * renames, binary files, and multi-file diffs.
 *
 * @param {string} diffText - Raw unified diff output from git diff
 * @returns {ParsedDiffFile[]}
 */
export function parseDiff(diffText) {
  if (!diffText || !diffText.trim()) {
    return [];
  }

  const lines = diffText.split('\n');
  /** @type {ParsedDiffFile[]} */
  const files = [];
  /** @type {ParsedDiffFile|null} */
  let currentFile = null;
  /** @type {DiffHunk|null} */
  let currentHunk = null;
  let isBinary = false;

  for (const line of lines) {
    // New file header
    if (line.startsWith('diff --git ')) {
      // Save previous file
      if (currentFile && !isBinary) {
        if (currentHunk) {
          currentFile.hunks.push(currentHunk);
        }
        files.push(currentFile);
      }

      // Extract filePath from b/ path
      const match = line.match(/diff --git a\/.+ b\/(.+)/);
      const filePath = match ? match[1] : '';

      currentFile = {
        filePath,
        changeType: 'modify',
        hunks: [],
      };
      currentHunk = null;
      isBinary = false;
      continue;
    }

    if (!currentFile) continue;

    // Detect new file
    if (line.startsWith('new file mode')) {
      currentFile.changeType = 'add';
      continue;
    }

    // Detect deleted file
    if (line.startsWith('deleted file mode')) {
      currentFile.changeType = 'delete';
      continue;
    }

    // Detect rename (treat as modify)
    if (line.startsWith('similarity index')) {
      currentFile.changeType = 'modify';
      continue;
    }

    // Update filePath from rename to line
    if (line.startsWith('rename to ')) {
      currentFile.filePath = line.replace('rename to ', '');
      continue;
    }

    // Detect binary file
    if (line.includes('Binary files')) {
      isBinary = true;
      continue;
    }

    // Hunk header
    if (line.startsWith('@@')) {
      if (currentHunk) {
        currentFile.hunks.push(currentHunk);
      }
      currentHunk = {
        header: line,
        lines: [],
      };
      continue;
    }

    // Hunk content lines (starting with +, -, or space)
    if (currentHunk && (line.startsWith('+') || line.startsWith('-') || line.startsWith(' '))) {
      currentHunk.lines.push(line);
    }
  }

  // Save last file
  if (currentFile && !isBinary) {
    if (currentHunk) {
      currentFile.hunks.push(currentHunk);
    }
    files.push(currentFile);
  }

  return files;
}

/**
 * Execute git diff between two tags, filtered to src/ directory.
 *
 * Per D-03: Only src/app/, src/shared/, src/api/ paths are relevant.
 * Uses --find-renames=80 for rename detection.
 *
 * @param {string} repoPath - Absolute path to the ERP repo
 * @param {string} fromTag - Base tag (e.g., "v1.27.1")
 * @param {string} toTag - Target tag (e.g., "v1.28.0")
 * @returns {Promise<{success: boolean, content?: string, error?: string}>}
 */
export async function getDiffBetweenTags(repoPath, fromTag, toTag) {
  try {
    const { stdout } = await execFile('git', [
      'diff',
      '--no-color',
      '--unified=3',
      '--find-renames=80',
      `${fromTag}..${toTag}`,
      '--',
      'src/',
    ], {
      cwd: repoPath,
      maxBuffer: 10 * 1024 * 1024,
    });
    return { success: true, content: stdout };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Detect the two most recent tags from the ERP repo.
 *
 * Per D-02: Uses git tag --sort=-v:refname to get tags in descending
 * version order. Returns the first two (current and previous).
 *
 * @param {string} repoPath - Absolute path to the ERP repo
 * @returns {Promise<{currentTag: string, previousTag: string}>}
 * @throws {Error} When fewer than 2 tags exist
 */
export async function detectTags(repoPath) {
  const { stdout } = await execFile('git', [
    'tag',
    '--sort=-v:refname',
  ], {
    cwd: repoPath,
  });

  const tags = stdout.split('\n').filter(Boolean);

  if (tags.length < 2) {
    throw new Error(`Need at least 2 tags, found ${tags.length}`);
  }

  return {
    currentTag: tags[0],
    previousTag: tags[1],
  };
}
