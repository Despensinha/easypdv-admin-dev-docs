import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  generateContent,
  mergeDiffsPerPage,
  findDocFile,
  buildNewPageFrontmatter,
} from './generate-content.mjs';

// --- Test helpers ---

function makeFile(filePath, changeType = 'modify', docSection = null) {
  const base = {
    filePath,
    changeType,
    hunks: [{ header: '@@ -1,3 +1,5 @@', lines: ['+new line'] }],
  };
  if (docSection) base.docSection = docSection;
  return base;
}

function makeMockProvider(overrides = {}) {
  return {
    updatePage: async (diff, existingContent, pageMeta) => ({
      success: true,
      content: 'Updated body content',
    }),
    createPage: async (diff, pageMeta) => ({
      success: true,
      content: 'New page body content',
    }),
    summarizeChanges: async (results) => ({
      success: true,
      content: '## Summary\n\nChanges applied.',
    }),
    classify: async (prompt) => ({ success: true, content: '[]' }),
    ...overrides,
  };
}

function makeMockDeps(overrides = {}) {
  return {
    readFile: async (path) => '---\ntitle: Test Page\nsidebar:\n  order: 1\n---\n\nOld content',
    writeFile: async (path, content) => {},
    readdir: async (path) => ['index.md'],
    mkdir: async (path, opts) => {},
    getDiffBetweenTags: async (repoPath, from, to) => ({
      success: true,
      content:
        'diff --git a/src/app/pages/finance/BillsPage.tsx b/src/app/pages/finance/BillsPage.tsx\n@@ -1,3 +1,5 @@\n+new line',
    }),
    parseDiff: (text) => [
      {
        filePath: 'src/app/pages/finance/BillsPage.tsx',
        changeType: 'modify',
        hunks: [{ header: '@@ -1,3 +1,5 @@', lines: ['+new line'] }],
      },
    ],
    loadPageMap: async (path) => ({
      repoType: 'user',
      mappings: [
        {
          erpDir: 'src/app/pages/finance/',
          docSection: 'latest/financeiro/',
          description: 'Financial module pages',
        },
      ],
    }),
    mapFilesToDocs: (files, map) => ({
      mapped: [
        {
          filePath: 'src/app/pages/finance/BillsPage.tsx',
          changeType: 'modify',
          hunks: [{ header: '@@ -1,3 +1,5 @@', lines: ['+new line'] }],
          docSection: 'latest/financeiro/',
        },
      ],
      unmapped: [],
    }),
    preFilter: (files) => ({ skipped: [], remaining: files }),
    classifyDiffs: async (rem, unm, prov) => ({
      success: true,
      files: rem.map((f) => ({
        filePath: f.filePath,
        classification: 'ui-only',
        isNewModule: false,
      })),
    }),
    createProvider: () => makeMockProvider(),
    splitFrontmatter: (content) => {
      const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
      if (!match) return { frontmatter: '', body: content };
      return { frontmatter: match[1], body: match[2] };
    },
    joinFrontmatter: (fm, body) => `---\n${fm}\n---\n\n${body}`,
    ...overrides,
  };
}

// --- Tests ---

describe('mergeDiffsPerPage', () => {
  it('groups files by docSection', () => {
    const files = [
      makeFile('src/app/pages/finance/BillsPage.tsx', 'modify', 'latest/financeiro/'),
      makeFile('src/app/pages/finance/PaymentsPage.tsx', 'modify', 'latest/financeiro/'),
      makeFile('src/app/pages/sales/SalesPage.tsx', 'modify', 'latest/vendas/'),
    ];
    const result = mergeDiffsPerPage(files);
    assert.equal(result.size, 2);
    assert.ok(result.has('latest/financeiro/'));
    assert.ok(result.has('latest/vendas/'));
  });

  it('concatenates diffs with file path separator', () => {
    const files = [
      makeFile('src/app/pages/finance/BillsPage.tsx', 'modify', 'latest/financeiro/'),
      makeFile('src/app/pages/finance/PaymentsPage.tsx', 'modify', 'latest/financeiro/'),
    ];
    const result = mergeDiffsPerPage(files);
    const group = result.get('latest/financeiro/');
    assert.ok(group.mergedDiff.includes('--- src/app/pages/finance/BillsPage.tsx ---'));
    assert.ok(group.mergedDiff.includes('--- src/app/pages/finance/PaymentsPage.tsx ---'));
  });

  it('collects sourceFiles for each group', () => {
    const files = [
      makeFile('src/app/pages/finance/BillsPage.tsx', 'modify', 'latest/financeiro/'),
      makeFile('src/app/pages/finance/PaymentsPage.tsx', 'modify', 'latest/financeiro/'),
    ];
    const result = mergeDiffsPerPage(files);
    const group = result.get('latest/financeiro/');
    assert.deepEqual(group.sourceFiles, [
      'src/app/pages/finance/BillsPage.tsx',
      'src/app/pages/finance/PaymentsPage.tsx',
    ]);
  });
});

describe('findDocFile', () => {
  it('returns single file when directory has one MDX/MD file', async () => {
    const deps = {
      readdir: async () => ['index.md'],
      readFile: async () => '---\ntitle: Test\n---\n\nContent',
      splitFrontmatter: (c) => {
        const m = c.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        return m ? { frontmatter: m[1], body: m[2] } : { frontmatter: '', body: c };
      },
    };
    const result = await findDocFile('/docs', 'latest/financeiro/', null, deps);
    assert.ok(result.endsWith('index.md'));
  });

  it('matches by frontmatter title when multiple files exist', async () => {
    const deps = {
      readdir: async () => ['contas-a-pagar.md', 'contas-a-receber.md'],
      readFile: async (path) => {
        if (path.includes('contas-a-pagar'))
          return '---\ntitle: Contas a Pagar\n---\n\nContent';
        return '---\ntitle: Contas a Receber\n---\n\nContent';
      },
      splitFrontmatter: (c) => {
        const m = c.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
        return m ? { frontmatter: m[1], body: m[2] } : { frontmatter: '', body: c };
      },
    };
    const result = await findDocFile('/docs', 'latest/financeiro/', 'Contas a Pagar', deps);
    assert.ok(result.includes('contas-a-pagar.md'));
  });

  it('returns null when no match found', async () => {
    const deps = {
      readdir: async () => [],
      readFile: async () => '',
      splitFrontmatter: (c) => ({ frontmatter: '', body: c }),
    };
    const result = await findDocFile('/docs', 'latest/financeiro/', 'Missing Page', deps);
    assert.equal(result, null);
  });
});

describe('buildNewPageFrontmatter', () => {
  it('produces correct frontmatter template', () => {
    const result = buildNewPageFrontmatter('Planograma', 5);
    assert.ok(result.includes('title: "Planograma"'));
    assert.ok(result.includes('description: "Documentacao do modulo Planograma no Despensinha ERP."'));
    assert.ok(result.includes('sidebar:'));
    assert.ok(result.includes('order: 5'));
  });
});

describe('generateContent', () => {
  it('calls updatePage with merged diffs and writes file with preserved frontmatter', async () => {
    let writtenPath = null;
    let writtenContent = null;
    const deps = makeMockDeps({
      writeFile: async (path, content) => {
        writtenPath = path;
        writtenContent = content;
      },
    });

    const result = await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.equal(result.updated.length, 1);
    assert.ok(writtenContent.includes('---\ntitle: Test Page'));
    assert.ok(writtenContent.includes('Updated body content'));
  });

  it('produces ONE updatePage call for multiple ERP files mapping to same docSection', async () => {
    let updateCallCount = 0;
    const provider = makeMockProvider({
      updatePage: async (diff) => {
        updateCallCount++;
        return { success: true, content: 'Updated' };
      },
    });

    const deps = makeMockDeps({
      createProvider: () => provider,
      parseDiff: () => [
        makeFile('src/app/pages/finance/BillsPage.tsx'),
        makeFile('src/app/pages/finance/PaymentsPage.tsx'),
      ],
      mapFilesToDocs: (files) => ({
        mapped: [
          { ...files[0], docSection: 'latest/financeiro/' },
          { ...files[1], docSection: 'latest/financeiro/' },
        ],
        unmapped: [],
      }),
      classifyDiffs: async (rem) => ({
        success: true,
        files: rem.map((f) => ({
          filePath: f.filePath,
          classification: 'ui-only',
          isNewModule: false,
        })),
      }),
    });

    await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.equal(updateCallCount, 1, 'Should call updatePage once for merged diffs');
  });

  it('calls createPage for files with isNewModule=true', async () => {
    let createCalled = false;
    let mkdirCalled = false;
    const provider = makeMockProvider({
      createPage: async (diff, pageMeta) => {
        createCalled = true;
        return {
          success: true,
          content: 'New page body',
          suggestedPath: 'latest/planograma/index.md',
          suggestedTitle: 'Planograma',
        };
      },
    });

    const deps = makeMockDeps({
      createProvider: () => provider,
      mapFilesToDocs: (files) => ({
        mapped: [],
        unmapped: [makeFile('src/app/pages/planogram/PlanogramPage.tsx', 'add')],
      }),
      classifyDiffs: async (rem, unm) => ({
        success: true,
        files: [
          ...rem.map((f) => ({ filePath: f.filePath, classification: 'ui-only', isNewModule: false })),
          ...unm.map((f) => ({
            filePath: f.filePath,
            classification: 'new-feature',
            isNewModule: true,
          })),
        ],
      }),
      mkdir: async () => {
        mkdirCalled = true;
      },
    });

    const result = await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.ok(createCalled, 'createPage should have been called');
    assert.ok(mkdirCalled, 'mkdir should have been called for new page');
    assert.equal(result.created.length, 1);
  });

  it('handles partial failure - one page fails, others succeed', async () => {
    let callCount = 0;
    const provider = makeMockProvider({
      updatePage: async () => {
        callCount++;
        if (callCount === 1) return { success: false, error: 'timeout' };
        return { success: true, content: 'Updated body' };
      },
    });

    const deps = makeMockDeps({
      createProvider: () => provider,
      parseDiff: () => [
        makeFile('src/app/pages/finance/BillsPage.tsx'),
        makeFile('src/app/pages/sales/SalesPage.tsx'),
      ],
      mapFilesToDocs: (files) => ({
        mapped: [
          { ...files[0], docSection: 'latest/financeiro/' },
          { ...files[1], docSection: 'latest/vendas/' },
        ],
        unmapped: [],
      }),
      classifyDiffs: async (rem) => ({
        success: true,
        files: rem.map((f) => ({
          filePath: f.filePath,
          classification: 'ui-only',
          isNewModule: false,
        })),
      }),
    });

    const result = await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.equal(result.updated.length, 1, 'One page should succeed');
    assert.equal(result.failures.length, 1, 'One page should fail');
    assert.equal(result.failures[0].error, 'timeout');
  });

  it('failure includes page name, error message, and sourceFiles', async () => {
    const provider = makeMockProvider({
      updatePage: async () => ({ success: false, error: 'API rate limit' }),
    });

    const deps = makeMockDeps({
      createProvider: () => provider,
    });

    const result = await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.equal(result.failures.length, 1);
    assert.ok(typeof result.failures[0].page === 'string');
    assert.ok(typeof result.failures[0].error === 'string');
    assert.ok(Array.isArray(result.failures[0].sourceFiles));
    assert.ok(result.failures[0].sourceFiles.length > 0);
  });

  it('calls summarizeChanges with all results', async () => {
    let summarizeArgs = null;
    const provider = makeMockProvider({
      summarizeChanges: async (results) => {
        summarizeArgs = results;
        return { success: true, content: '## Changes summary' };
      },
    });

    const deps = makeMockDeps({
      createProvider: () => provider,
    });

    const result = await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.ok(summarizeArgs !== null, 'summarizeChanges should have been called');
    assert.equal(result.summary, '## Changes summary');
  });

  it('returns empty arrays when all files are refactor-skip', async () => {
    const deps = makeMockDeps({
      classifyDiffs: async (rem) => ({
        success: true,
        files: rem.map((f) => ({
          filePath: f.filePath,
          classification: 'refactor-skip',
          isNewModule: false,
        })),
      }),
    });

    const result = await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.equal(result.updated.length, 0);
    assert.equal(result.created.length, 0);
    assert.equal(result.failures.length, 0);
    assert.ok(typeof result.summary === 'string');
  });

  it('returns structured JSON with updated, created, failures, and summary', async () => {
    const deps = makeMockDeps();

    const result = await generateContent({
      erpRepoPath: '/erp',
      fromTag: 'v1.27.1',
      toTag: 'v1.28.0',
      docsRepoPath: '/docs',
      pageMapPath: '/docs/scripts/ai/page-map.json',
      deps,
    });

    assert.ok(Array.isArray(result.updated));
    assert.ok(Array.isArray(result.created));
    assert.ok(Array.isArray(result.failures));
    assert.ok(typeof result.summary === 'string');

    // Updated entries have page and sourceFiles
    if (result.updated.length > 0) {
      assert.ok(typeof result.updated[0].page === 'string');
      assert.ok(Array.isArray(result.updated[0].sourceFiles));
    }
  });
});
