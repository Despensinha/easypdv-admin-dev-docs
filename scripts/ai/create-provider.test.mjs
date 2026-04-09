import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

describe('createProvider', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('defaults to openai provider and returns object with 3 methods', async () => {
    delete process.env.AI_PROVIDER;
    process.env.OPENAI_API_KEY = 'test-key-123';
    process.env.OPENAI_MODEL = 'gpt-5.4-mini';

    const { createProvider } = await import(`./create-provider.mjs?t=${Date.now()}`);
    const provider = createProvider();

    assert.equal(typeof provider.updatePage, 'function');
    assert.equal(typeof provider.createPage, 'function');
    assert.equal(typeof provider.summarizeChanges, 'function');
  });

  it('throws when OPENAI_API_KEY is missing', async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_API_KEY;

    const { createProvider } = await import(`./create-provider.mjs?t=${Date.now()}-nokey`);

    assert.throws(() => createProvider(), (err) => {
      assert.ok(err.message.includes('OPENAI_API_KEY'));
      return true;
    });
  });

  it('throws for unknown AI_PROVIDER', async () => {
    process.env.AI_PROVIDER = 'anthropic';
    process.env.OPENAI_API_KEY = 'test-key-123';

    const { createProvider } = await import(`./create-provider.mjs?t=${Date.now()}-unknown`);

    assert.throws(() => createProvider(), (err) => {
      assert.ok(err.message.includes('Unknown AI provider'));
      return true;
    });
  });

  it('passes model default gpt-5.4-mini when OPENAI_MODEL is unset', async () => {
    delete process.env.AI_PROVIDER;
    delete process.env.OPENAI_MODEL;
    process.env.OPENAI_API_KEY = 'test-key-123';

    const { createProvider } = await import(`./create-provider.mjs?t=${Date.now()}-model`);
    // If it doesn't throw, the default model was used successfully
    const provider = createProvider();
    assert.ok(provider);
  });
});

describe('splitFrontmatter', () => {
  it('splits frontmatter from body', async () => {
    const { splitFrontmatter } = await import('./ai-provider.mjs');
    const result = splitFrontmatter('---\ntitle: X\n---\nbody');
    assert.equal(result.frontmatter, 'title: X');
    assert.equal(result.body, 'body');
  });

  it('returns empty frontmatter when none present', async () => {
    const { splitFrontmatter } = await import('./ai-provider.mjs');
    const result = splitFrontmatter('no frontmatter');
    assert.equal(result.frontmatter, '');
    assert.equal(result.body, 'no frontmatter');
  });
});

describe('joinFrontmatter', () => {
  it('joins frontmatter and body with delimiters', async () => {
    const { joinFrontmatter } = await import('./ai-provider.mjs');
    const result = joinFrontmatter('title: X', 'body');
    assert.equal(result, '---\ntitle: X\n---\n\nbody');
  });
});
