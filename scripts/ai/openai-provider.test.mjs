import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOpenAIProvider } from './openai-provider.mjs';

/**
 * Create a mock OpenAI client for testing.
 * @param {Function} responseFn - Function called when client.responses.create() is invoked
 */
function mockClient(responseFn) {
  return {
    responses: {
      create: responseFn,
    },
    chat: {
      completions: {
        create: responseFn,
      },
    },
  };
}

const pageMeta = { title: 'Catalogo', section: 'cadastros', repoType: 'user' };
const longContent = 'Este e um conteudo gerado com tamanho suficiente para passar na validacao de comprimento minimo de cinquenta caracteres exigidos pelo provider.';

describe('createOpenAIProvider', () => {
  it('throws when apiKey is falsy', () => {
    assert.throws(
      () => createOpenAIProvider({ apiKey: '', model: 'gpt-5.4-mini' }),
      (err) => {
        assert.ok(err.message.includes('OPENAI_API_KEY'));
        return true;
      }
    );
  });

  it('returns object with updatePage, createPage, summarizeChanges methods', () => {
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini' });
    assert.equal(typeof provider.updatePage, 'function');
    assert.equal(typeof provider.createPage, 'function');
    assert.equal(typeof provider.summarizeChanges, 'function');
  });
});

describe('updatePage', () => {
  it('returns success with content on API success', async () => {
    const client = mockClient(async () => ({ output_text: longContent }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.updatePage('+ added line', 'existing content', pageMeta);
    assert.equal(result.success, true);
    assert.equal(result.content, longContent);
  });

  it('returns success false on API error (never throws)', async () => {
    const client = mockClient(async () => { throw new Error('API rate limit'); });
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.updatePage('+ added line', 'existing content', pageMeta);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('API rate limit'));
  });

  it('returns success false when response is too short', async () => {
    const client = mockClient(async () => ({ output_text: 'short' }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.updatePage('+ added line', 'existing content', pageMeta);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('too short'));
  });

  it('strips leading frontmatter from response', async () => {
    const bodyContent = longContent;
    const withFrontmatter = `---\ntitle: Test\n---\n${bodyContent}`;
    const client = mockClient(async () => ({ output_text: withFrontmatter }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.updatePage('+ added line', 'existing content', pageMeta);
    assert.equal(result.success, true);
    assert.ok(!result.content.startsWith('---'));
    assert.ok(result.content.includes(bodyContent));
  });
});

describe('createPage', () => {
  it('returns success with content on API success', async () => {
    const client = mockClient(async () => ({ output_text: longContent }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.createPage('+ new module', pageMeta);
    assert.equal(result.success, true);
    assert.equal(result.content, longContent);
  });

  it('returns success false on API error (never throws)', async () => {
    const client = mockClient(async () => { throw new Error('Network error'); });
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.createPage('+ new module', pageMeta);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Network error'));
  });

  it('returns success false when response is too short', async () => {
    const client = mockClient(async () => ({ output_text: 'x' }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.createPage('+ new module', pageMeta);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('too short'));
  });
});

describe('summarizeChanges', () => {
  const results = [
    { success: true, content: 'Page updated' },
    { success: false, error: 'API error' },
  ];

  it('returns success with content on API success', async () => {
    const client = mockClient(async () => ({ output_text: 'Resumo das mudancas realizadas.' }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.summarizeChanges(results);
    assert.equal(result.success, true);
    assert.ok(result.content.includes('Resumo'));
  });

  it('returns success false on API error (never throws)', async () => {
    const client = mockClient(async () => { throw new Error('Timeout'); });
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.summarizeChanges(results);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Timeout'));
  });

  it('returns success false on empty response', async () => {
    const client = mockClient(async () => ({ output_text: '' }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.summarizeChanges(results);
    assert.equal(result.success, false);
    assert.ok(result.error.includes('Empty summary response'));
  });
});

describe('classify', () => {
  it('returns success with JSON content on API success', async () => {
    const jsonResponse = JSON.stringify([{ filePath: 'src/app/pages/finance/BillsPage.tsx', classification: 'ui-only', isNewModule: false }]);
    const client = mockClient(async () => ({ output_text: jsonResponse }));
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.classify({ system: 'system prompt', user: 'user prompt' });
    assert.equal(result.success, true);
    assert.equal(result.content, jsonResponse);
  });

  it('returns success false on API error (never throws)', async () => {
    const client = mockClient(async () => { throw new Error('API rate limit'); });
    const provider = createOpenAIProvider({ apiKey: 'test-key', model: 'gpt-5.4-mini', client });
    const result = await provider.classify({ system: 'system prompt', user: 'user prompt' });
    assert.equal(result.success, false);
    assert.ok(result.error.includes('API rate limit'));
  });
});
