import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Inline test page-map fixture (subset of real mappings)
const testPageMap = {
  repoType: 'user',
  mappings: [
    { erpDir: 'src/app/pages/finance/', docSection: 'latest/financeiro/', description: 'Finance' },
    { erpDir: 'src/app/pages/catalog/', docSection: 'latest/cadastros/', description: 'Catalog' },
    { erpDir: 'src/app/pages/sales/', docSection: 'latest/vendas/', description: 'Sales' },
    { erpDir: 'src/shared/', docSection: null, description: 'Shared utilities' },
    { erpDir: 'src/_metronic/', docSection: null, description: 'Metronic - skip' },
    { erpDir: 'src/app/modules/', docSection: null, description: 'Shared modules' },
  ],
};

describe('mapFilesToDocs', () => {
  /** @type {typeof import('./page-mapper.mjs').mapFilesToDocs} */
  let mapFilesToDocs;

  it('loads module', async () => {
    const mod = await import(`./page-mapper.mjs?t=${Date.now()}`);
    mapFilesToDocs = mod.mapFilesToDocs;
    assert.equal(typeof mapFilesToDocs, 'function');
  });

  it('maps finance file to latest/financeiro/', async () => {
    const mod = await import(`./page-mapper.mjs?t=${Date.now()}`);
    mapFilesToDocs = mod.mapFilesToDocs;
    const files = [
      { filePath: 'src/app/pages/finance/BillsToPayPage.tsx', changeType: 'modify', hunks: [] },
    ];
    const result = mapFilesToDocs(files, testPageMap);
    assert.equal(result.mapped.length, 1);
    assert.equal(result.mapped[0].docSection, 'latest/financeiro/');
    assert.equal(result.unmapped.length, 0);
  });

  it('skips src/shared/ file (docSection=null) - not in mapped or unmapped', async () => {
    const mod = await import(`./page-mapper.mjs?t=${Date.now()}`);
    mapFilesToDocs = mod.mapFilesToDocs;
    const files = [
      { filePath: 'src/shared/utils/format.ts', changeType: 'modify', hunks: [] },
    ];
    const result = mapFilesToDocs(files, testPageMap);
    assert.equal(result.mapped.length, 0);
    assert.equal(result.unmapped.length, 0);
  });

  it('puts unknown path in unmapped array', async () => {
    const mod = await import(`./page-mapper.mjs?t=${Date.now()}`);
    mapFilesToDocs = mod.mapFilesToDocs;
    const files = [
      { filePath: 'src/app/pages/newmodule/NewPage.tsx', changeType: 'add', hunks: [] },
    ];
    const result = mapFilesToDocs(files, testPageMap);
    assert.equal(result.mapped.length, 0);
    assert.equal(result.unmapped.length, 1);
    assert.equal(result.unmapped[0].filePath, 'src/app/pages/newmodule/NewPage.tsx');
  });

  it('skips _metronic files (docSection=null)', async () => {
    const mod = await import(`./page-mapper.mjs?t=${Date.now()}`);
    mapFilesToDocs = mod.mapFilesToDocs;
    const files = [
      { filePath: 'src/_metronic/layout/Header.tsx', changeType: 'modify', hunks: [] },
    ];
    const result = mapFilesToDocs(files, testPageMap);
    assert.equal(result.mapped.length, 0);
    assert.equal(result.unmapped.length, 0);
  });

  it('correctly splits multiple files between mapped and unmapped', async () => {
    const mod = await import(`./page-mapper.mjs?t=${Date.now()}`);
    mapFilesToDocs = mod.mapFilesToDocs;
    const files = [
      { filePath: 'src/app/pages/finance/BillsPage.tsx', changeType: 'modify', hunks: [] },
      { filePath: 'src/app/pages/catalog/ProductPage.tsx', changeType: 'add', hunks: [] },
      { filePath: 'src/shared/helpers.ts', changeType: 'modify', hunks: [] },
      { filePath: 'src/app/pages/brandnew/Page.tsx', changeType: 'add', hunks: [] },
      { filePath: 'src/_metronic/core/Init.tsx', changeType: 'modify', hunks: [] },
    ];
    const result = mapFilesToDocs(files, testPageMap);
    // finance + catalog = 2 mapped
    assert.equal(result.mapped.length, 2);
    // brandnew = 1 unmapped (shared and metronic are skipped, not unmapped)
    assert.equal(result.unmapped.length, 1);
    assert.equal(result.unmapped[0].filePath, 'src/app/pages/brandnew/Page.tsx');
  });
});

describe('loadPageMap', () => {
  it('reads and parses the actual page-map.json file', async () => {
    const mod = await import(`./page-mapper.mjs?t=${Date.now()}`);
    const pageMap = await mod.loadPageMap(join(__dirname, 'page-map.json'));
    assert.equal(pageMap.repoType, 'user');
    assert.ok(Array.isArray(pageMap.mappings));
    assert.ok(pageMap.mappings.length >= 15);
    // Verify a known mapping exists
    const financeMapping = pageMap.mappings.find(m => m.erpDir === 'src/app/pages/finance/');
    assert.ok(financeMapping);
    assert.equal(financeMapping.docSection, 'latest/financeiro/');
  });
});
