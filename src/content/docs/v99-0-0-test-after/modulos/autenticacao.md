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

## Fluxo de Login

1. Usuário submete credenciais → `POST /auth/login`
2. API retorna `accessToken` e `refreshToken`
3. Tokens são armazenados via `AuthHelpers.saveTokens()`
4. `AuthContext` atualiza `currentUser` com dados decodificados do JWT

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

## useAuth Hook

```tsx
import { useAuth } from '../modules/auth';

function MyComponent() {
  const { currentUser, logout } = useAuth();
  // currentUser.role, currentUser.name, etc.
}
```

## Configurações de Preferências e Formulários

Além do fluxo de autenticação, algumas páginas administrativas passaram a aplicar validação adicional em formulários de configuração e cadastro. O padrão adotado continua centralizado em componentes de página que combinam `Formik`, `Yup`, `react-query` e componentes de interface como `Select`, com persistência via mutations.

### Configuração de Separação

A página `src/app/pages/preferences/config/SeparationPreferencesPage.tsx` foi removida no diff, mas a lógica de preferência de separação que ela representava seguia o padrão abaixo:

- carregamento inicial com `useQuery`
- preenchimento do formulário com `formik.setValues(...)`
- salvamento com `useMutation`
- feedback visual com `SystemNotification`
- navegação com `useNavigate`

### Componentes e dependências utilizadas

| Componente / Hook | Responsabilidade |
|-------------------|------------------|
| `useQuery` | Busca do estado atual da configuração no backend |
| `useMutation` | Persistência das alterações |
| `useFormik` | Controle de estado e submissão do formulário |
| `Select` (`react-select`) | Seleção do tipo de disparo da separação |
| `SystemNotification` | Exibição de sucesso e erro |
| `getErrorMessage` | Normalização de mensagens de erro da API |
| `PageTitle` | Renderização do título e breadcrumbs da página |
| `useNavigate` | Retorno para a rota anterior/cancelamento |

### Fluxo de dados da configuração de separação

| Etapa | Descrição |
|-------|-----------|
| 1 | `useQuery` chama `getSeparationConfigDetails()` |
| 2 | O retorno da API é mesclado com `initialSeparationConfig` |
| 3 | `formik.setValues(...)` popula o formulário com os dados atuais |
| 4 | O usuário altera `separation_type` no `Select` |
| 5 | `formik.handleSubmit` dispara `editMutation.mutate(values)` |
| 6 | `editSeparationConfig(...)` envia os dados para persistência |
| 7 | Em sucesso, `SystemNotification.success(...)` confirma a alteração |
| 8 | Em erro, `SystemNotification.error(...)` exibe a mensagem tratada por `getErrorMessage(...)` |

### Estrutura do campo `separation_type`

O campo selecionado no `react-select` é mapeado para um objeto com `value` e `description`, que é convertido pelo formulário para o formato esperado pelo DTO `SeparationConfigDto`.

| Campo | Tipo | Observação |
|-------|------|------------|
| `separation_type.value` | string | Identificador da regra de disparo |
| `separation_type.description` | string | Rótulo exibido ao usuário |

### Opções disponíveis

| Valor | Rótulo | Descrição funcional |
|-------|--------|---------------------|
| `MANUAL` | Manual | O envio para separação ocorre manualmente |
| `ON_SAVE_SALES_ORDER` | Ao salvar pedido de venda | Dispara ao salvar o pedido |
| `ON_APPROVE_SALES_ORDER` | Ao aprovar pedido de venda | Dispara na aprovação do pedido |
| `ON_SAVE_NFE` | Ao salvar NFe | Dispara no momento do salvamento da nota |
| `ON_AUTH_NFE` | Ao autorizar NFe | Dispara após autorização fiscal |

### Validação de limite de uso em cupom

No fluxo de criação de cupons, a validação do formulário foi ajustada em `src/app/pages/sales/coupon/CreateCouponListPage.tsx` para incluir um novo campo opcional de limite de uso.

#### Regras adicionadas ao schema Yup

| Campo | Regra | Mensagem |
|-------|-------|----------|
| `usage_limit` | `.min(1)` | `O limite deve ser pelo menos 1` |
| `usage_limit` | `.nullable()` | Permite ausência de valor |

#### Impacto no fluxo de formulário

- o campo `usage_limit` passa a ser validado no schema do formulário
- valores nulos continuam permitidos
- quando informado, o limite mínimo aceito é `1`

### Exemplo de uso do novo campo no formulário

```ts
const validationSchema = Yup.object({
  type: Yup.object().required("O tipo de desconto é obrigatório"),
  discount_value: Yup.number().required("O fator de desconto é obrigatório"),
  usage_limit: Yup.number()
    .min(1, "O limite deve ser pelo menos 1")
    .nullable(),
});
```

## Veja Também

- [Error Handling](/arquitetura/error-handling/) — Tratamento centralizado de erros, incluindo erros de autenticação
- [API e Endpoints](/arquitetura/api-endpoints/) — Endpoints de autenticação (`/auth/login`, `/auth/refresh`)
- [Hooks Customizados](/modulos/hooks/) — Outros hooks do sistema