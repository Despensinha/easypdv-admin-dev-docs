import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { preFilter, classifyDiffs } from './diff-classifier.mjs';

/**
 * Helper: create a minimal ParsedDiffFile object.
 */
function makeFile(filePath, changeType = 'modify') {
  return {
    filePath,
    changeType,
    hunks: [{ header: '@@ -1,3 +1,5 @@', lines: ['+ added'] }],
  };
}

describe('preFilter', () => {
  it('marks .test.ts file as skipped', () => {
    const result = preFilter([makeFile('src/app/pages/finance/BillsPage.test.ts')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('marks .test.tsx file as skipped', () => {
    const result = preFilter([makeFile('src/components/Modal.test.tsx')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('marks .test.js file as skipped', () => {
    const result = preFilter([makeFile('src/utils/helper.test.js')]);
    assert.equal(result.skipped.length, 1);
  });

  it('marks .test.mjs file as skipped', () => {
    const result = preFilter([makeFile('scripts/ai/prompts.test.mjs')]);
    assert.equal(result.skipped.length, 1);
  });

  it('marks .spec.tsx file as skipped', () => {
    const result = preFilter([makeFile('src/components/Button.spec.tsx')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('marks file in __tests__/ as skipped', () => {
    const result = preFilter([makeFile('src/__tests__/integration.ts')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('marks file in __mocks__/ as skipped', () => {
    const result = preFilter([makeFile('src/__mocks__/api.ts')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('marks .stories.tsx file as skipped', () => {
    const result = preFilter([makeFile('src/components/Button.stories.tsx')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('marks .d.ts file as skipped', () => {
    const result = preFilter([makeFile('src/types/global.d.ts')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('marks file under src/_metronic/ as skipped', () => {
    const result = preFilter([makeFile('src/_metronic/layout/MasterLayout.tsx')]);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.remaining.length, 0);
  });

  it('keeps normal file in remaining', () => {
    const result = preFilter([makeFile('src/app/pages/finance/BillsPage.tsx')]);
    assert.equal(result.skipped.length, 0);
    assert.equal(result.remaining.length, 1);
  });

  it('splits mixed input correctly', () => {
    const files = [
      makeFile('src/app/pages/finance/BillsPage.tsx'),
      makeFile('src/app/pages/finance/BillsPage.test.ts'),
      makeFile('src/_metronic/layout/MasterLayout.tsx'),
      makeFile('src/app/pages/sales/SalesPage.tsx'),
      makeFile('src/components/Modal.stories.tsx'),
    ];
    const result = preFilter(files);
    assert.equal(result.remaining.length, 2);
    assert.equal(result.skipped.length, 3);
    assert.ok(result.remaining.some((f) => f.filePath.includes('BillsPage.tsx')));
    assert.ok(result.remaining.some((f) => f.filePath.includes('SalesPage.tsx')));
  });
});

describe('classifyDiffs', () => {
  it('returns success with empty files when remaining and unmapped are empty', async () => {
    const mockProvider = { classify: async () => ({ success: true, content: '[]' }) };
    const result = await classifyDiffs([], [], mockProvider);
    assert.equal(result.success, true);
    assert.deepEqual(result.files, []);
  });

  it('parses valid AI JSON response into ClassifiedFile array', async () => {
    const aiResponse = JSON.stringify([
      { filePath: 'src/app/pages/finance/BillsPage.tsx', classification: 'ui-only', isNewModule: false },
      { filePath: 'src/app/pages/sales/SalesPage.tsx', classification: 'architecture', isNewModule: false },
    ]);
    const mockProvider = { classify: async () => ({ success: true, content: aiResponse }) };
    const remaining = [
      makeFile('src/app/pages/finance/BillsPage.tsx'),
      makeFile('src/app/pages/sales/SalesPage.tsx'),
    ];
    const result = await classifyDiffs(remaining, [], mockProvider);
    assert.equal(result.success, true);
    assert.equal(result.files.length, 2);
    assert.equal(result.files[0].classification, 'ui-only');
    assert.equal(result.files[1].classification, 'architecture');
  });

  it('returns error when AI call fails', async () => {
    const mockProvider = { classify: async () => ({ success: false, error: 'API timeout' }) };
    const remaining = [makeFile('src/app/pages/finance/BillsPage.tsx')];
    const result = await classifyDiffs(remaining, [], mockProvider);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('API timeout'));
  });

  it('returns error when AI returns invalid JSON', async () => {
    const mockProvider = { classify: async () => ({ success: true, content: 'not json at all' }) };
    const remaining = [makeFile('src/app/pages/finance/BillsPage.tsx')];
    const result = await classifyDiffs(remaining, [], mockProvider);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Failed to parse'));
  });

  it('marks unmapped files with unmapped flag for AI batch', async () => {
    let capturedPrompt = null;
    const aiResponse = JSON.stringify([
      { filePath: 'src/app/pages/finance/BillsPage.tsx', classification: 'ui-only', isNewModule: false },
      { filePath: 'src/app/pages/unknown/NewPage.tsx', classification: 'new-feature', isNewModule: true },
    ]);
    const mockProvider = {
      classify: async (prompt) => {
        capturedPrompt = prompt;
        return { success: true, content: aiResponse };
      },
    };
    const remaining = [makeFile('src/app/pages/finance/BillsPage.tsx')];
    const unmapped = [makeFile('src/app/pages/unknown/NewPage.tsx', 'add')];
    const result = await classifyDiffs(remaining, unmapped, mockProvider);
    assert.equal(result.success, true);
    assert.equal(result.files.length, 2);
    // Verify the unmapped file was sent with unmapped flag
    assert.ok(capturedPrompt.user.includes('unmapped'));
    assert.ok(capturedPrompt.user.includes('src/app/pages/unknown/NewPage.tsx'));
  });

  it('defaults isNewModule to false when not present in AI response', async () => {
    const aiResponse = JSON.stringify([
      { filePath: 'src/app/pages/finance/BillsPage.tsx', classification: 'ui-only' },
    ]);
    const mockProvider = { classify: async () => ({ success: true, content: aiResponse }) };
    const remaining = [makeFile('src/app/pages/finance/BillsPage.tsx')];
    const result = await classifyDiffs(remaining, [], mockProvider);
    assert.equal(result.success, true);
    assert.equal(result.files[0].isNewModule, false);
  });
});
