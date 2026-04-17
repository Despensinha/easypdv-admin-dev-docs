---
title: CI/CD
description: Workflows de integracao continua e entrega continua do Despensinha ERP.
sidebar:
  order: 1
---

O Despensinha ERP utiliza **GitHub Actions** para CI/CD, com 8 workflows que cobrem release automático, validação de PRs, sincronização de branches e dispatch de documentação.

## Visao Geral

| Workflow | Arquivo | Trigger | Proposito |
|----------|---------|---------|-----------|
| Release | `release.yml` | Push em `master` | Semantic-release (changelog, git tag, GitHub release) |
| Dispatch Docs | `dispatch-docs.yml` | `workflow_dispatch` (manual) | Envia versão para ambos repos de docs |
| PR Build | `pr-build.yml` | `workflow_call` | Check reutilizável de build (types, lint, build) |
| PR Auto-approve | `pr-validation-auto-approve.yml` | PR em `develop` | Roda semantic PR + build, aprova e faz merge |
| Semantic PR | `semantic-pr.yml` | `workflow_call` | Valida título do PR (conventional commits) |
| Notify Changelog | `notify-changelog.yml` | Release publicada | Dispatch para repo externo de changelog |
| Sync Develop | `sync-develop-direct.yml` | Após release workflow | Sincroniza `develop` com `master` após release |
| Sync Branch | `sync-work-branch-direct.yml` | PR merged em `develop` | Sincroniza branch de origem com `develop` |

## release.yml

**Arquivo:** `.github/workflows/release.yml`  
**Trigger:** Push em `master` (ignora commits com `[skip ci]`)  
**Concurrency:** `release-${{ github.ref }}` (sem cancelamento)

**O que faz:**

1. Checkout com `fetch-depth: 0` (necessário para semantic-release ler histórico e tags)
2. Configura git author como `github-actions[bot]`
3. Executa semantic-release via `cycjimmy/semantic-release-action@v4`
4. Plugins: `conventional-changelog-conventionalcommits`, `@semantic-release/changelog`, `@semantic-release/git`
5. Gera automaticamente: `CHANGELOG.md`, git tag, GitHub release

**Secrets/Tokens:** `GITHUB_TOKEN`

```yaml
# .github/workflows/release.yml
on:
  push:
    branches: [ master ]

jobs:
  release:
    if: contains(github.event.head_commit.message, '[skip ci]') == false
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - name: Config git author
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
      - name: Semantic Release
        uses: cycjimmy/semantic-release-action@v4
        with:
          extra_plugins: |
            conventional-changelog-conventionalcommits
            @semantic-release/changelog
            @semantic-release/git
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## dispatch-docs.yml

**Arquivo:** `.github/workflows/dispatch-docs.yml`  
**Trigger:** `workflow_dispatch` (execução manual com input opcional de versão)  
**Concurrency:** `dispatch-docs` (sem cancelamento)

**O que faz:**

1. Checkout com `sparse-checkout` apenas do `package.json`
2. Valida que `DISPATCH_TOKEN` está configurado como secret
3. Detecta versão: usa input manual se fornecido, caso contrário lê do `package.json`
4. Envia `repository_dispatch` para o repo de docs do usuário (`despensinha-erp-docs`)
5. Envia `repository_dispatch` para o repo de docs dev (`despensinha-erp-dev-docs`)
6. Gera resumo no step summary com versão e repos notificados

**Secrets/Tokens:** `DISPATCH_TOKEN` (PAT com scope `repo` para cross-repo dispatch)

```yaml
# .github/workflows/dispatch-docs.yml
on:
  workflow_dispatch:
    inputs:
      version:
        type: string
        required: false
        description: "Versao do ERP (deixe vazio para usar package.json)"

jobs:
  dispatch:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          sparse-checkout: package.json
          sparse-checkout-cone-mode: false

      - name: Validar DISPATCH_TOKEN
        run: |
          if [ -z "${{ secrets.DISPATCH_TOKEN }}" ]; then
            echo "::error::DISPATCH_TOKEN nao configurado."
            exit 1
          fi

      - name: Detectar versao
        id: version
        run: |
          if [ -n "${{ inputs.version }}" ]; then
            VERSION="${{ inputs.version }}"
          else
            VERSION=$(jq -r '.version' package.json)
          fi
          echo "value=$VERSION" >> "$GITHUB_OUTPUT"

      - name: Dispatch para docs usuario
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.DISPATCH_TOKEN }}
          repository: Despensinha/despensinha-erp-docs
          event-type: docs-version-update
          client-payload: '{"app_version": "${{ steps.version.outputs.value }}"}'

      - name: Dispatch para docs dev
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.DISPATCH_TOKEN }}
          repository: Despensinha/despensinha-erp-dev-docs
          event-type: docs-version-update
          client-payload: '{"app_version": "${{ steps.version.outputs.value }}"}'
```

## pr-build.yml

**Arquivo:** `.github/workflows/pr-build.yml`  
**Trigger:** `workflow_call` (reutilizável, chamado por outros workflows)

**O que faz:**

1. Checkout do código
2. Setup Node.js 18
3. Instala dependências (`npm install`)
4. Verifica tipos (`npm run check-types`)
5. Roda linter (`npm run lint`)
6. Executa build (`npm run build`)

**Secrets/Tokens:** Nenhum (usa apenas `GITHUB_TOKEN` implícito)

```yaml
# .github/workflows/pr-build.yml
on:
  workflow_call:

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '18'
      - run: npm install
      - run: npm run check-types
      - run: npm run lint
      - run: npm run build
```

## pr-validation-auto-approve.yml

**Arquivo:** `.github/workflows/pr-validation-auto-approve.yml`  
**Trigger:** Pull request em `develop` (opened, synchronize, reopened, ready_for_review)

**O que faz:**

1. Chama `semantic-pr.yml` para validar título do PR (job1)
2. Chama `pr-build.yml` para check de build (job2)
3. Se ambos passam (job3):
   - Ignora PRs draft e de forks
   - Aprova o PR automaticamente
   - Se a branch estiver atrasada, atualiza com a base
   - Tenta fazer merge via squash
   - Sincroniza a branch de origem com `develop` após merge

**Secrets/Tokens:** `GITHUB_TOKEN` (via `github.token`)

```yaml
# .github/workflows/pr-validation-auto-approve.yml
on:
  pull_request:
    branches: [ develop ]
    types: [opened, synchronize, reopened, ready_for_review]

jobs:
  job1:
    uses: ./.github/workflows/semantic-pr.yml
  job2:
    uses: ./.github/workflows/pr-build.yml
  job3:
    runs-on: ubuntu-latest
    needs: [job1, job2]
    if: success()
    steps:
      - name: Approve and try to merge
        uses: actions/github-script@v7
        with:
          script: |
            // Aprova PR, atualiza branch se necessario, merge via squash
            // Sincroniza branch de origem com develop apos merge
```

## semantic-pr.yml

**Arquivo:** `.github/workflows/semantic-pr.yml`  
**Trigger:** `workflow_call` (reutilizável, chamado por `pr-validation-auto-approve.yml`)

**O que faz:**

1. Valida que o título do PR segue a convenção de conventional commits
2. Usa `amannn/action-semantic-pull-request@v5`
3. Garante que os títulos de PR como `feat: ...`, `fix: ...`, `chore: ...` são aceitos

**Secrets/Tokens:** `GITHUB_TOKEN`

```yaml
# .github/workflows/semantic-pr.yml
on:
  workflow_call:

jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - uses: amannn/action-semantic-pull-request@v5
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

## notify-changelog.yml

**Arquivo:** `.github/workflows/notify-changelog.yml`  
**Trigger:** Release publicada (`release: types: [published]`)

**O que faz:**

1. Envia `repository_dispatch` para o repo externo de changelog público
2. Payload inclui o nome do repositório e a tag da release

**Secrets/Tokens:** `CHANGELOG_PAT` (PAT para dispatch cross-repo)

```yaml
# .github/workflows/notify-changelog.yml
on:
  release:
    types: [published]

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - name: Dispatch changelog update
        uses: peter-evans/repository-dispatch@v3
        with:
          token: ${{ secrets.CHANGELOG_PAT }}
          repository: seu-org/changelog-publico
          event-type: release-published
          client-payload: '{"repo": "${{ github.repository }}", "version": "${{ github.event.release.tag_name }}"}'
```

## sync-develop-direct.yml

**Arquivo:** `.github/workflows/sync-develop-direct.yml`  
**Trigger:** Após o workflow "Release (semantic-release)" completar com sucesso em `master`

**O que faz:**

1. Checkout com `fetch-depth: 0` e ref `master`
2. Configura git author como `github-actions[bot]`
3. Verifica se a branch `develop` existe
4. Faz merge de `origin/master` em `develop`
5. Push de `develop` atualizada
6. Se houver conflitos, falha com mensagem de intervenção manual

**Secrets/Tokens:** `GITHUB_TOKEN`

```yaml
# .github/workflows/sync-develop-direct.yml
on:
  workflow_run:
    workflows: ["Release (semantic-release)"]
    branches: [ master ]
    types:
      - completed

jobs:
  sync-develop:
    if: github.event.workflow_run.conclusion == 'success'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          ref: master
      - name: Sync develop with master
        run: |
          git fetch origin
          git checkout develop
          git pull origin develop
          git merge origin/master --no-edit
          git push origin develop
```

## sync-work-branch-direct.yml

**Arquivo:** `.github/workflows/sync-work-branch-direct.yml`  
**Trigger:** PR merged em `develop` (pull_request closed)

**O que faz:**

1. Verifica que o PR foi realmente merged (não apenas fechado) e não é de fork
2. Obtém o SHA mais recente de `develop`
3. Atualiza a branch de origem do PR para apontar para o mesmo SHA de `develop` (force update)
4. Mantém a branch de trabalho sincronizada, evitando conflitos futuros

**Secrets/Tokens:** `GITHUB_TOKEN` (via `github.token`)

```yaml
# .github/workflows/sync-work-branch-direct.yml
on:
  pull_request:
    types: [closed]
    branches: [develop]

jobs:
  sync-branch:
    if: github.event.pull_request.merged == true && !github.event.pull_request.head.repo.fork
    runs-on: ubuntu-latest
    steps:
      - name: Sync source branch with develop
        uses: actions/github-script@v7
        with:
          script: |
            const developRef = await github.rest.git.getRef({
              owner, repo, ref: 'heads/develop'
            });
            await github.rest.git.updateRef({
              owner, repo,
              ref: `heads/${pr.head.ref}`,
              sha: developRef.data.object.sha,
              force: true
            });
```

## Fluxo de Release

O pipeline completo de release segue esta sequência:

```
PR merged em master
    |
    v
release.yml (semantic-release)
    |
    +---> CHANGELOG.md atualizado
    +---> Git tag criada (ex: v1.27.1)
    +---> GitHub Release publicada
    |
    v
notify-changelog.yml (disparado pela release)
    |
    +---> Dispatch para repo externo de changelog
    |
    v
sync-develop-direct.yml (disparado pelo release workflow)
    |
    +---> Merge master em develop
    +---> Push develop atualizada
```

## Fluxo de PR

O pipeline de validação de PRs segue esta sequência:

```
PR aberto/atualizado em develop
    |
    v
pr-validation-auto-approve.yml
    |
    +---> semantic-pr.yml (valida titulo conventional commits)
    +---> pr-build.yml (check-types, lint, build)
    |
    v (se ambos passam)
    |
    +---> Auto-approve do PR
    +---> Atualiza branch se atrasada
    +---> Squash merge automatico
    +---> Sincroniza branch de origem com develop
```

## Mudanças na página de setup

A tela de onboarding/configuração inicial do ERP recebeu uma atualização importante no **Step 1** (`src/app/pages/setup/SetupPage.tsx` e `src/app/pages/setup/components/Step1.tsx`): o cadastro agora diferencia **Pessoa jurídica** e **Pessoa física** antes de exibir o documento fiscal.

### SetupPage.tsx

A validação do formulário passou a considerar o campo `person_type` como obrigatório e a aplicar regras condicionais para `cnpj` e `cpf`.

| Campo | Tipo | Regra de validação | Mensagem |
|------|------|--------------------|----------|
| `person_type` | `object` | Obrigatório | `Tipo de pessoa é obrigatório` |
| `cnpj` | `string` | Obrigatório apenas quando `person_type.value === 'LEGAL'` | `CNPJ é obrigatório` |
| `cpf` | `string` | Obrigatório apenas quando `person_type.value === 'PHYSICAL'` | `CPF é obrigatório` |

**Fluxo de validação no Formik/Yup:**

- `person_type` passa a ser a chave de controle da etapa.
- Quando o usuário seleciona **Pessoa física**, o campo `cnpj` é limpo com `formik.setFieldValue("cnpj", "")`.
- Quando o usuário seleciona **Pessoa jurídica**, o campo `cpf` é limpo com `formik.setFieldValue("cpf", "")`.
- A renderização do input fiscal é condicional, baseada em `formik.values.person_type?.value`.

### Step1.tsx

O componente `Step1` passou a renderizar um seletor para o tipo de pessoa usando `Select` e o campo fiscal correspondente usando `PatternFormat`.

#### Componentes envolvidos

| Componente | Papel | Props/uso relevante |
|-----------|-------|---------------------|
| `Select` | Seleção do tipo de pessoa | `id`, `isSearchable={false}`, `options`, `placeholder`, `value`, `onChange` |
| `PatternFormat` | Máscara do documento fiscal | `format`, `id`, `placeholder`, `formik.getFieldProps(...)` |
| `formik` (`FormikProps<SetupRequestDto>`) | Estado e validação do formulário | `values`, `errors`, `setFieldValue`, `getFieldProps` |

#### Configuração de `personTypeOptions`

| value | label | Significado |
|------|-------|-------------|
| `LEGAL` | `Pessoa jurídica` | Exibe e valida `cnpj` |
| `PHYSICAL` | `Pessoa física` | Exibe e valida `cpf` |

#### Fluxo de dados no Step 1

1. O usuário seleciona o tipo de pessoa no `Select`.
2. O `onChange` grava o objeto no Formik em `person_type` com o shape:
   - `value`
   - `description`
3. O componente decide qual campo exibir:
   - `PHYSICAL` → mostra `CPF`
   - qualquer outro valor / padrão → mostra `CNPJ`
4. O campo exibido usa `PatternFormat` para aplicar máscara:
   - CPF: `###.###.###-##`
   - CNPJ: `##.###.###/####-##`
5. O erro correspondente é renderizado com base em `formik.errors.cpf` ou `formik.errors.cnpj`.

#### Máscaras e placeholders

| Documento | Máscara (`format`) | Placeholder |
|-----------|---------------------|--------------|
| CPF | `###.###.###-##` | `xxx.xxx.xxx-xx` |
| CNPJ | `##.###.###/####-##` | `xx.xxx.xxx/xxxx-xx` |

#### Efeito prático na UI

- O label do campo deixa de ser fixo em `CNPJ`.
- O formulário fica adaptado ao perfil cadastrado.
- A experiência de cadastro inicial passa a evitar preenchimento de documento inválido para o tipo de pessoa selecionado.
- A lógica de obrigatoriedade fica centralizada no schema `Yup`, mantendo consistência entre UI e validação.

## Ajustes de responsividade em SubscriptionDetailsTab

O componente `src/app/pages/subscription/components/SubscriptionDetailsTab.tsx` recebeu ajustes de layout para melhorar a responsividade em diferentes larguras de tela. As mudanças afetam principalmente as grades de cards e blocos de indicadores.

### Grid de módulos

A renderização dos módulos do sistema passou de `col-3` para:

| Classe | Comportamento |
|--------|---------------|
| `col-12` | Ocupa a linha inteira em telas muito pequenas |
| `col-sm-6` | Exibe 2 colunas em `sm` |
| `col-xl-3` | Exibe 4 colunas em `xl` |

Isso melhora a leitura dos cards quando há muitos módulos em `systemModulesData.modules`.

### Cards de métricas e disponibilidade

Os blocos de métricas que antes usavam `col` genérico agora recebem combinações explícitas de colunas responsivas.

| Classe | Papel no layout |
|--------|-----------------|
| `col-6` | Metade da largura em telas pequenas |
| `col-md-4` | Um terço da largura em `md` |
| `col-xl` | Distribuição automática proporcional em telas maiores |

#### Componentes afetados

| Seção | Ajuste de classe |
|------|-------------------|
| Métrica 1 | `col` → `col-6 col-md-4 col-xl` |
| Métrica 2 | `col` → `col-6 col-md-4 col-xl` |
| Métrica 3 | `col d-flex ...` → `col-6 col-md-4 col-xl d-flex ...` |
| Métrica 4 | `col d-flex ...` → `col-6 col-md-4 col-xl d-flex ...` |
| Métrica 5 | `col` → `col-6 col-md-4 col-xl` |
| Métrica 6 | `col` → `col-6 col-md-4 col-xl` |
| Métrica 7 | `col` → `col-6 col-md-4 col-xl` |

### Impacto técnico

- Os cards deixam de colapsar em uma distribuição inconsistente em telas intermediárias.
- O conteúdo mantém alinhamento visual mais previsível.
- A experiência em `sm`, `md` e `xl` fica mais estável, principalmente nos blocos com ícones, porcentagens e contadores.

### Resumo das mudanças de UI

| Área | Mudança principal | Benefício |
|-----|-------------------|-----------|
| Setup / Step 1 | Campo fiscal condicional por `person_type` | Evita CNPJ em pessoa física e CPF em pessoa jurídica |
| Setup / validação | Schema Yup com regras condicionais | Validação coerente com a seleção do usuário |
| Subscription details | Ajuste de classes Bootstrap responsivas | Melhor distribuição dos cards em diferentes breakpoints |