import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildUpdatePrompt, buildCreatePrompt, buildSummarizePrompt, buildClassifyPrompt } from './prompts.mjs';

describe('buildUpdatePrompt', () => {
  const diff = '+ nova linha adicionada';
  const existingContent = '## Pagina existente\n\nConteudo atual.';
  const baseMeta = { title: 'Catalogo', section: 'cadastros', repoType: 'user' };

  it('returns object with system and user strings', () => {
    const result = buildUpdatePrompt(diff, existingContent, baseMeta);
    assert.equal(typeof result.system, 'string');
    assert.equal(typeof result.user, 'string');
  });

  it('system prompt contains "linguagem simples e direta" for repoType user', () => {
    const result = buildUpdatePrompt(diff, existingContent, { ...baseMeta, repoType: 'user' });
    assert.ok(result.system.includes('linguagem simples e direta'));
  });

  it('system prompt contains "detalhes tecnicos" for repoType dev', () => {
    const result = buildUpdatePrompt(diff, existingContent, { ...baseMeta, repoType: 'dev' });
    assert.ok(result.system.includes('detalhes tecnicos'));
  });

  it('system prompt contains "NAO inclua frontmatter"', () => {
    const result = buildUpdatePrompt(diff, existingContent, baseMeta);
    assert.ok(result.system.includes('NAO inclua frontmatter'));
  });

  it('user prompt contains the diff', () => {
    const result = buildUpdatePrompt(diff, existingContent, baseMeta);
    assert.ok(result.user.includes(diff));
  });

  it('user prompt contains the page title', () => {
    const result = buildUpdatePrompt(diff, existingContent, baseMeta);
    assert.ok(result.user.includes('Catalogo'));
  });

  it('user prompt contains existing content', () => {
    const result = buildUpdatePrompt(diff, existingContent, baseMeta);
    assert.ok(result.user.includes(existingContent));
  });

  it('user prompt includes sibling titles when provided', () => {
    const meta = { ...baseMeta, siblingTitles: ['Produtos', 'Categorias'] };
    const result = buildUpdatePrompt(diff, existingContent, meta);
    assert.ok(result.user.includes('Produtos'));
    assert.ok(result.user.includes('Categorias'));
  });

  it('user prompt includes style example when provided', () => {
    const meta = { ...baseMeta, styleExample: '## Exemplo de estilo bem escrito' };
    const result = buildUpdatePrompt(diff, existingContent, meta);
    assert.ok(result.user.includes('Exemplo de estilo bem escrito'));
  });
});

describe('buildCreatePrompt', () => {
  const diff = '+ novo modulo adicionado';
  const baseMeta = { title: 'Novo Modulo', section: 'vendas', repoType: 'dev' };

  it('returns object with system and user strings', () => {
    const result = buildCreatePrompt(diff, baseMeta);
    assert.equal(typeof result.system, 'string');
    assert.equal(typeof result.user, 'string');
  });

  it('system prompt contains "detalhes tecnicos" for repoType dev', () => {
    const result = buildCreatePrompt(diff, baseMeta);
    assert.ok(result.system.includes('detalhes tecnicos'));
  });

  it('system prompt contains "linguagem simples e direta" for repoType user', () => {
    const result = buildCreatePrompt(diff, { ...baseMeta, repoType: 'user' });
    assert.ok(result.system.includes('linguagem simples e direta'));
  });

  it('system prompt contains "NAO inclua frontmatter"', () => {
    const result = buildCreatePrompt(diff, baseMeta);
    assert.ok(result.system.includes('NAO inclua frontmatter'));
  });

  it('user prompt contains diff and page title', () => {
    const result = buildCreatePrompt(diff, baseMeta);
    assert.ok(result.user.includes(diff));
    assert.ok(result.user.includes('Novo Modulo'));
  });

  it('user prompt includes frontmatter template when provided', () => {
    const meta = { ...baseMeta, frontmatterTemplate: { title: 'X', sidebar: { order: 1 } } };
    const result = buildCreatePrompt(diff, meta);
    assert.ok(result.user.includes('frontmatter'));
  });
});

describe('buildSummarizePrompt', () => {
  const results = [
    { success: true, content: 'Pagina atualizada' },
    { success: false, error: 'API error' },
  ];

  it('returns object with system and user strings', () => {
    const result = buildSummarizePrompt(results);
    assert.equal(typeof result.system, 'string');
    assert.equal(typeof result.user, 'string');
  });

  it('system prompt mentions summarizer role', () => {
    const result = buildSummarizePrompt(results);
    assert.ok(result.system.includes('pt-BR') || result.system.includes('resumo'));
  });

  it('user prompt contains results info', () => {
    const result = buildSummarizePrompt(results);
    assert.ok(result.user.includes('success') || result.user.includes('sucesso') || result.user.includes('true'));
  });
});

describe('buildClassifyPrompt', () => {
  const files = [
    {
      filePath: 'src/app/pages/finance/BillsPage.tsx',
      changeType: 'modify',
      hunks: [{ header: '@@ -10,6 +10,8 @@ function BillsPage', lines: ['+ new line'] }],
    },
    {
      filePath: 'src/app/pages/unknown/NewPage.tsx',
      changeType: 'add',
      hunks: [{ header: '@@ -0,0 +1,50 @@ ', lines: ['+ export default function NewPage'] }],
      unmapped: true,
    },
  ];

  it('returns object with system and user strings', () => {
    const result = buildClassifyPrompt(files);
    assert.equal(typeof result.system, 'string');
    assert.equal(typeof result.user, 'string');
  });

  it('system contains all four classification types', () => {
    const result = buildClassifyPrompt(files);
    assert.ok(result.system.includes('ui-only'));
    assert.ok(result.system.includes('architecture'));
    assert.ok(result.system.includes('new-feature'));
    assert.ok(result.system.includes('refactor-skip'));
  });

  it('system contains unmapped instruction for new module detection', () => {
    const result = buildClassifyPrompt(files);
    assert.ok(result.system.includes('unmapped'));
  });

  it('user contains file paths from input', () => {
    const result = buildClassifyPrompt(files);
    assert.ok(result.user.includes('src/app/pages/finance/BillsPage.tsx'));
    assert.ok(result.user.includes('src/app/pages/unknown/NewPage.tsx'));
  });

  it('handles empty files array without error', () => {
    const result = buildClassifyPrompt([]);
    assert.equal(typeof result.system, 'string');
    assert.equal(typeof result.user, 'string');
  });
});
