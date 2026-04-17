---
title: Autenticação
description: Fluxo de autenticação JWT no Despensinha ERP.
sidebar:
  order: 1
---

A autenticação usa **JWT** com refresh token. O estado do usuário autenticado é mantido no `AuthContext`.

## Arquivos Principais

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/app/modules/auth/core/AuthContext.tsx` | Provider do usuário autenticado |
| `src/app/modules/auth/core/AuthHelpers.ts` | Leitura/escrita do token no storage |
| `src/api/axios.ts` | Interceptors de auth e refresh |
| `src/app/routing/AbilityProtectedRoute.tsx` | Proteção de rotas por permissão via CASL |
| `src/app/casl/permissions.ts` | Lista centralizada de permissões da aplicação |

## Fluxo de Login

1. Usuário submete credenciais → `POST /auth/login`
2. API retorna `accessToken` e `refreshToken`
3. Tokens são armazenados via `AuthHelpers.saveTokens()`
4. `AuthContext` atualiza `currentUser` com dados decodificados do JWT
5. A partir desse momento, componentes e rotas passam a consultar permissões do usuário via `AbilityProtectedRoute`

## Interceptors Axios

O interceptor em `src/api/axios.ts` injeta o `accessToken` em cada requisição:

```ts
axiosInstance.interceptors.request.use((config) => {
  const token = AuthHelpers.getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

Quando a API retorna `401`, o interceptor de resposta tenta renovar o token:

```ts
axiosInstance.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401 && !error.config._retry) {
      error.config._retry = true;
      const newToken = await refreshAccessToken();
      error.config.headers.Authorization = `Bearer ${newToken}`;
      return axiosInstance(error.config);
    }
    return Promise.reject(error);
  }
);
```

Esse fluxo é usado por módulos que dependem de autenticação, inclusive páginas protegidas por permissão, como `dashboard` e relatórios.

## Proteção de Rotas por Permissão

Além do controle de sessão via JWT, o ERP passou a proteger rotas com `AbilityProtectedRoute`, combinando autenticação com autorização baseada em permissões.

### Componentes e Props

| Componente | Prop | Responsabilidade |
|-----------|------|-----------------|
| `AbilityProtectedRoute` | `permission` | Verifica se o usuário possui a permissão exigida para renderizar a rota |
| `Routes` / `Route` | `element` | Envolve a página ou layout protegido |
| `PERMISSIONS` | constantes | Identificadores centralizados usados pela camada de autorização |

### Exemplo de uso

```tsx
<Route
  element={
    <AbilityProtectedRoute permission={PERMISSIONS.DASHBOARD}>
      <DashboardWrapper />
    </AbilityProtectedRoute>
  }
  path="dashboard/*"
/>
```

Na prática, o `HomeWrapper` agora protege o acesso ao dashboard com `PERMISSIONS.DASHBOARD`. O `ReportsWrapper` também aplica proteção granular em cada subrota, como:

- `RELATORIOS_VENDAS_VENDAS`
- `RELATORIOS_VENDAS_PRODUTOS_NAO_ENCONTRADOS`
- `RELATORIOS_SUPRIMENTOS_ESTOQUE_SALDO`
- `RELATORIOS_FINANCEIRO_DRE`

Isso evita que o usuário consiga navegar diretamente para uma rota sem a respectiva permissão, mesmo estando autenticado.

## useAuth Hook

```tsx
import { useAuth } from '../modules/auth';

function MyComponent() {
  const { currentUser, logout } = useAuth();
  // currentUser.role, currentUser.name, etc.
}
```

O `useAuth` continua sendo a interface principal para leitura do usuário autenticado, logout e consumo do contexto de autenticação nos componentes de UI.

## Autorização em Páginas de Negócio

Algumas mudanças recentes introduzem novos fluxos dependentes de sessão autenticada e autorização:

### Lista de Produtos

Na página `ProductListPage`, foi adicionado um modal de impressão em lote de etiquetas:

| Estado | Tipo | Função |
|--------|------|--------|
| `isBulkTagModalVisible` | `boolean` | Controla a visibilidade de `TagPrintModal` |
| `bulkTagProducts` | `ProductDto[]` | Armazena os produtos selecionados em massa |

### Fluxo de dados do modal de etiquetas

1. O usuário seleciona várias linhas na `StandardBulkActions`
2. A ação extra **Imprimir Etiquetas** é executada
3. O callback recebe `selectedRows`
4. Os itens são convertidos para `ProductDto`
5. O estado `bulkTagProducts` é preenchido
6. O componente `TagPrintModal` é exibido com `products={bulkTagProducts.map(mapProductToTagData)}`
7. Ao fechar o modal, a tela limpa `bulkTagProducts` e oculta o modal

### Componentes envolvidos

| Componente | Prop | Responsabilidade |
|-----------|------|-----------------|
| `StandardBulkActions` | `extraActions` | Permite adicionar ações em lote além das ações padrão |
| `TagPrintModal` | `products` | Recebe os dados já mapeados para impressão |
| `TagPrintModal` | `show` | Controla exibição do modal |
| `TagPrintModal` | `onClose` | Fecha o modal e dispara limpeza do estado local |

### Configuração da ação extra

| Campo | Tipo | Descrição |
|------|------|-------------|
| `label` | `string` | Texto exibido na ação (`Imprimir Etiquetas`) |
| `icon` | `string` | Ícone Bootstrap Icons (`bi bi-tag`) |
| `variant` | `string` | Variante visual do botão (`info`) |
| `onClick` | `function` | Recebe `selectedRows` e abre o modal com os produtos selecionados |

## Ajustes em Fluxos de Admin e Cadastro

A autenticação e autorização continuam influenciando páginas administrativas e de configuração:

### Preferências da Empresa

A tela de preferências passou a alternar dinamicamente entre **CPF** e **CNPJ** conforme o campo `person_type`.

#### Campos e validação

| Campo | Regra | Comportamento |
|------|-------|---------------|
| `person_type` | obrigatório via seleção | Define se a pessoa é `PHYSICAL` ou `LEGAL` |
| `cpf` | obrigatório quando `person_type.value === 'PHYSICAL'` | Exibe e valida CPF |
| `cnpj` | obrigatório quando `person_type.value === 'LEGAL'` | Exibe e valida CNPJ |

#### Fluxo de atualização do formulário

1. O usuário seleciona `Tipo de pessoa` no `Select`
2. O `formik.setFieldValue("person_type", ...)` atualiza o estado do formulário
3. Se o tipo for `PHYSICAL`, o campo `cnpj` é limpo
4. Caso contrário, o campo `cpf` é limpo
5. A UI renderiza condicionalmente `PatternFormat` para CPF ou CNPJ
6. O schema `Yup` valida o campo correspondente usando `when('person_type.value', ...)`

### Reset de sequência de NFe

No modal `NfeResetSequenceNumberModal`, a payload enviada ao backend foi ajustada para usar nomes de campos em snake_case:

| Campo enviado | Origem | Observação |
|--------------|--------|-------------|
| `direction_type` | `directionType.value` | Tipo de direção da sequência |
| `initial_number` | `Number(resetNumber) || 1` | Número inicial para reinício |

Isso garante compatibilidade com o contrato esperado pela API no fluxo de reset.

## Ajustes de Responsividade em Dashboards e Relatórios

Vários cards e tabelas foram ajustados para melhorar a usabilidade em telas menores. Esses componentes seguem sendo renderizados após autenticação, então dependem do mesmo contexto de sessão e permissão.

### Componentes ajustados

| Componente | Ajuste aplicado |
|-----------|-----------------|
| `AverageTicketCard` | Organiza filtros e métricas em layout responsivo com `flex-column` / `flex-md-row` |
| `TotalSalesCard` | Mesmo padrão responsivo do ticket médio |
| `BestSellerProductsCard` | Adaptação do cabeçalho e envolvimento da `DataTable` em `table-responsive` |
| `DashboardInfoCards` | Converte blocos em coluna no mobile, mantendo lado a lado em `sm+` |
| `PosAvailabilityCard` | Alinha conteúdo de forma vertical no mobile |

### Impacto no fluxo de dados

Essas mudanças não alteram o carregamento dos dados, apenas a composição visual:

- filtros de período continuam alimentando consultas via `Flatpickr`
- tabelas continuam consumindo `products`, `columns` e estados de loading/error
- os cards seguem dependentes das mesmas queries e estados assíncronos
- o `AbilityProtectedRoute` garante que essas telas só sejam acessadas por usuários autorizados

## Veja Também

- [Error Handling](/arquitetura/error-handling/) — Tratamento centralizado de erros, incluindo erros de autenticação
- [API e Endpoints](/arquitetura/api-endpoints/) — Endpoints de autenticação (`/auth/login`, `/auth/refresh`)
- [Hooks Customizados](/modulos/hooks/) — Outros hooks do sistema
- [Controle de Permissões](/arquitetura/permissoes/) — Estrutura de `PERMISSIONS` e uso de `AbilityProtectedRoute`