/**
 * Prompt template functions for AI-powered documentation generation.
 *
 * These functions produce system+user prompt pairs that instruct the AI
 * provider to generate or update documentation content in pt-BR.
 * The repoType parameter adjusts tone: 'user' for simple language,
 * 'dev' for technical detail.
 */

const TONE_INSTRUCTIONS = {
  user: 'Escreva em portugues brasileiro, linguagem simples e direta. Evite jargao tecnico.',
  dev: 'Escreva em portugues brasileiro com detalhes tecnicos. Inclua nomes de componentes, props, e fluxo de dados.',
};

/**
 * Build prompts for updating an existing documentation page.
 * @param {string} diff - Git diff content
 * @param {string} existingContent - Current page body (without frontmatter)
 * @param {import('./ai-provider.mjs').PageMeta} pageMeta
 * @returns {{ system: string, user: string }}
 */
export function buildUpdatePrompt(diff, existingContent, pageMeta) {
  const tone = TONE_INSTRUCTIONS[pageMeta.repoType];

  const system = `Voce e um escritor de documentacao tecnica para o Despensinha ERP.
${tone}

Regras:
- NAO inclua frontmatter (o bloco --- no inicio). Retorne APENAS o corpo da pagina.
- Mantenha a estrutura de headings (##, ###) existente quando possivel.
- Atualize apenas as secoes afetadas pelo diff. Preserve o restante intacto.
- Use tabelas markdown para campos e configuracoes.
- Escreva em pt-BR.`;

  const user = `## Pagina atual: ${pageMeta.title}
Secao: ${pageMeta.section}
${pageMeta.siblingTitles ? `Paginas adjacentes: ${pageMeta.siblingTitles.join(', ')}` : ''}

## Conteudo atual da pagina:
${existingContent}

## Diff das mudancas no ERP:
\`\`\`diff
${diff}
\`\`\`

${pageMeta.styleExample ? `## Exemplo de estilo (referencia de tom e formato):\n${pageMeta.styleExample}` : ''}

Atualize o conteudo da pagina para refletir as mudancas do diff. Retorne o corpo completo atualizado.`;

  return { system, user };
}

/**
 * Build prompts for creating a new documentation page.
 * @param {string} diff - Git diff content
 * @param {import('./ai-provider.mjs').PageMeta} pageMeta
 * @returns {{ system: string, user: string }}
 */
export function buildCreatePrompt(diff, pageMeta) {
  const tone = TONE_INSTRUCTIONS[pageMeta.repoType];

  const system = `Voce e um escritor de documentacao tecnica para o Despensinha ERP.
${tone}

Regras:
- NAO inclua frontmatter (o bloco --- no inicio). Retorne APENAS o corpo da pagina.
- Crie uma pagina completa com headings ## para cada secao principal.
- Use tabelas markdown para campos e configuracoes.
- Escreva em pt-BR.`;

  const user = `## Nova pagina: ${pageMeta.title}
Secao: ${pageMeta.section}
${pageMeta.siblingTitles ? `Paginas adjacentes: ${pageMeta.siblingTitles.join(', ')}` : ''}

## Diff das mudancas no ERP:
\`\`\`diff
${diff}
\`\`\`

${pageMeta.frontmatterTemplate ? `## Template de frontmatter esperado:\n\`\`\`yaml\n${JSON.stringify(pageMeta.frontmatterTemplate, null, 2)}\n\`\`\`\n` : ''}
${pageMeta.styleExample ? `## Exemplo de estilo (referencia de tom e formato):\n${pageMeta.styleExample}` : ''}

Crie o corpo completo da nova pagina de documentacao baseado no diff acima.`;

  return { system, user };
}

/**
 * Build prompts for removing documentation of a deleted ERP feature.
 * @param {string} existingContent - Current page body (without frontmatter)
 * @param {string} deletedDiff - Git diff showing the removed code
 * @param {import('./ai-provider.mjs').PageMeta} pageMeta
 * @returns {{ system: string, user: string }}
 */
export function buildDeletePrompt(deletedDiff, existingContent, pageMeta) {
  const tone = TONE_INSTRUCTIONS[pageMeta.repoType];

  const system = `Voce e um escritor de documentacao tecnica para o Despensinha ERP.
${tone}

Regras:
- NAO inclua frontmatter (o bloco --- no inicio). Retorne APENAS o corpo da pagina.
- O diff abaixo mostra codigo que foi REMOVIDO do ERP. A funcionalidade nao existe mais.
- REMOVA da documentacao qualquer secao que descreva a funcionalidade removida.
- Se a pagina inteira descreve apenas a funcionalidade removida, retorne exatamente: __PAGE_DELETED__
- NAO adicione documentacao sobre o que foi removido. A funcionalidade nao existe mais.
- Preserve intacto todo o conteudo que NAO esta relacionado ao codigo removido.
- Escreva em pt-BR.`;

  const user = `## Pagina atual: ${pageMeta.title}
Secao: ${pageMeta.section}

## Conteudo atual da pagina:
${existingContent}

## Diff do codigo REMOVIDO do ERP:
\`\`\`diff
${deletedDiff}
\`\`\`

Remova da documentacao as secoes relacionadas ao codigo removido. Retorne o corpo completo atualizado (sem as secoes removidas).`;

  return { system, user };
}

/**
 * Build prompts for summarizing a batch of documentation changes.
 * @param {import('./ai-provider.mjs').AIProviderResult[]} results
 * @returns {{ system: string, user: string }}
 */
export function buildSummarizePrompt(results) {
  const system = `Voce e um resumidor de mudancas de documentacao para o Despensinha ERP.
Produza um resumo conciso em markdown das mudancas realizadas.
Escreva em pt-BR.`;

  const resultsText = results.map((r, i) => {
    if (r.success) {
      return `${i + 1}. [sucesso] ${r.content ? r.content.slice(0, 100) + '...' : 'Conteudo gerado'}`;
    }
    return `${i + 1}. [erro] ${r.error || 'Erro desconhecido'}`;
  }).join('\n');

  const user = `## Resultados das atualizacoes:
${resultsText}

Produza um resumo conciso em markdown adequado para o corpo de um Pull Request. Liste as paginas atualizadas com sucesso e as que falharam.`;

  return { system, user };
}

/**
 * Build prompts for classifying diff files into documentation-relevant categories.
 * @param {Array<{filePath: string, changeType: string, hunks: Array<{header: string, lines: string[]}>, unmapped?: boolean}>} files
 * @returns {{ system: string, user: string }}
 */
export function buildClassifyPrompt(files) {
  const system = `Voce e um classificador de mudancas de codigo do Despensinha ERP.
Para cada arquivo, classifique como exatamente um tipo:
- "ui-only": Mudancas visuais (CSS, layout, textos de interface, estilos)
- "architecture": Mudancas estruturais (rotas, providers, estado global, API endpoints, services)
- "new-feature": Funcionalidade nova (novos componentes, novos endpoints, novas paginas)
- "refactor-skip": Refatoracao interna sem impacto na documentacao

Para arquivos marcados como "unmapped" (sem mapeamento para documentacao existente),
avalie se representam um novo modulo do ERP que precisa de documentacao.
Se sim, classifique como "new-feature" e adicione "isNewModule": true.
Se nao (arquivo utilitario, config interno), classifique como "refactor-skip".

Responda em JSON valido: [{"filePath": "...", "classification": "...", "isNewModule": false}]
Responda APENAS o JSON array, sem markdown code fences.`;

  const filesInfo = files.map((f) => ({
    filePath: f.filePath,
    changeType: f.changeType,
    hunkHeaders: f.hunks.map((h) => h.header),
    linesChanged: f.hunks.reduce((sum, h) => sum + h.lines.length, 0),
    unmapped: f.unmapped || false,
  }));

  const user = `Classifique estas mudancas:\n${JSON.stringify(filesInfo, null, 2)}`;

  return { system, user };
}
