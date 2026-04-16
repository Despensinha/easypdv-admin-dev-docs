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

## Cupom de Desconto: Tipos e Validações

As regras de criação de cupom passaram a incluir um novo tipo de desconto e validações mais restritas para o código do cupom.

### Componentes envolvidos

| Arquivo | Responsabilidade |
|---------|-----------------|
| `src/app/pages/sales/coupon/CreateCouponListPage.tsx` | Página de criação/edição de cupom, definição das opções de tipo e schema de validação |
| `Yup` | Biblioteca responsável pela validação dos campos do formulário |

### Tipos de cupom disponíveis

A lista de opções do campo `type` foi expandida com o tipo de frete grátis.

| Valor | Label | Comportamento esperado |
|-------|-------|----------------------|
| `PERCENTAGE` | Porcentagem | Aplica desconto percentual sobre o valor do pedido |
| `PRICE` | Valor fixo | Aplica um valor fixo de desconto monetário |
| `FREE_SHIPPING` | Frete grátis | Remove o custo de frete do pedido, respeitando as regras do cupom |

### Validação do campo `code`

O campo `code` agora possui restrições de tamanho mínimo e máximo, além de continuar obrigatório.

| Campo | Regra | Mensagem de erro |
|-------|-------|------------------|
| `code` | `min(4)` | O código deve ter pelo menos 4 caracteres |
| `code` | `max(20)` | O código deve ter no máximo 20 caracteres |
| `code` | `required()` | O código do cupom é obrigatório |

### Fluxo de dados no formulário

1. O usuário preenche os dados do cupom no formulário.
2. O componente monta `couponTypeOptions`, incluindo `FREE_SHIPPING`.
3. O `validationSchema`, construído com `useMemo`, valida o payload antes do submit.
4. O campo `code` é validado localmente pelo schema `Yup` antes do envio para a API.
5. Após validação, os dados são enviados ao backend com o tipo selecionado em `type`.

### Trecho de validação atualizado

```ts
const couponTypeOptions = [
  { value: "PERCENTAGE", label: "Porcentagem" },
  { value: "PRICE", label: "Valor fixo" },
  { value: "FREE_SHIPPING", label: "Frete grátis" },
];

const validationSchema = useMemo(() => {
  const schema = {
    name: Yup.string().required("O nome do cupom é obrigatório"),
    code: Yup.string()
      .min(4, "O código deve ter pelo menos 4 caracteres")
      .max(20, "O código deve ter no máximo 20 caracteres")
      .required("O código do cupom é obrigatório"),
    type: Yup.object().required("O tipo de desconto é obrigatório"),
    discount_value: Yup.number()
      .required("O fator de desconto é obrigatório"),
  };

  return Yup.object(schema);
}, []);
```

## Veja Também

- [Error Handling](/arquitetura/error-handling/) — Tratamento centralizado de erros, incluindo erros de autenticação
- [API e Endpoints](/arquitetura/api-endpoints/) — Endpoints de autenticação (`/auth/login`, `/auth/refresh`)
- [Hooks Customizados](/modulos/hooks/) — Outros hooks do sistema