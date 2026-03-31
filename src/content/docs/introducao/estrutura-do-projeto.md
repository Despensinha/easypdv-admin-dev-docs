---
title: Estrutura do Projeto
description: Organização de arquivos e diretórios do Despensinha ERP.
---

O projeto está em `/despensinha-admin-app/` (ou no diretório raiz conforme o ambiente).

## Estrutura Principal

```
src/
├── _metronic/          # Template Metronic: layout, assets SCSS, i18n base
├── api/
│   ├── axios.ts        # Instância axios com interceptors de auth
│   └── endpoints/      # ~90 arquivos de endpoints por feature
├── app/
│   ├── App.tsx         # Root: providers (QueryClient, Auth, CASL, i18n)
│   ├── pages/          # Páginas por módulo de negócio
│   ├── modules/        # Módulos compartilhados (auth, table, export)
│   ├── components/     # Componentes reutilizáveis
│   ├── models/         # ~200 DTOs TypeScript
│   ├── casl/           # AbilityContext e definição de permissões
│   ├── enums/          # Enums de domínio fiscal e de negócio
│   ├── helpers/        # Utilitários de API, tabelas e formatação
│   ├── hooks/          # Custom hooks (useDataTable, useUrlFilter)
│   ├── utils/          # Utilitários (exportação, datas, impostos)
│   └── routing/        # AppRoutes e rotas por perfil de usuário
└── shared/
    └── projectEnvVariables.ts  # Variáveis de ambiente tipadas
```

## Convenção de Páginas

Cada módulo em `src/app/pages/` segue a estrutura:

```
pages/[modulo]/
├── [Modulo]Page.tsx          # Página principal (listagem)
├── components/               # Componentes específicos do módulo
│   ├── [Modulo]Table.tsx     # Tabela principal
│   ├── [Modulo]Modal.tsx     # Modal de criação/edição
│   └── [Modulo]Filters.tsx   # Offcanvas de filtros
└── hooks/
    └── use[Modulo]Data.ts    # Hook de React Query para o módulo
```

## Pontos de Entrada

- `src/app/App.tsx` — providers globais
- `src/app/routing/AppRoutes.tsx` — roteamento principal
- `src/api/axios.ts` — cliente HTTP global
