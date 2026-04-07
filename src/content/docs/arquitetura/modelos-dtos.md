---
title: Modelos e DTOs
description: Convenções de tipagem com TypeScript DTOs no Despensinha ERP.
---

O ERP usa **TypeScript types** para representar dados da API e entidades de domínio. Todos os modelos ficam em `src/app/models/` — são mais de **210 arquivos**, sendo 168 DTOs e 42 entidades/utilitários.

## Estrutura

```
src/app/models/
├── AccountDetailsDto.ts       # DTO de resposta
├── BankAccountDto.ts          # DTO com initial empty
├── CreateProductDto.ts        # DTO de request (criação)
├── ...
├── EnumType.ts                # Tipo utilitário (enum genérico)
├── DataTableColumnDef.ts      # Tipo de UI (coluna de tabela)
├── ListData.ts                # Tipo de paginação
└── ... (210+ arquivos)
```

## Convenções de Nomenclatura

| Sufixo | Tipo | Exemplo |
|--------|------|---------|
| `*Dto.ts` | DTO de resposta ou request da API | `ProductDto.ts`, `BankAccountDto.ts` |
| `Create*Dto.ts` / `*RequestDto.ts` | DTO de request (criação/edição) | `AcceptInvitationRequestDto.ts` |
| `*FilterDto.ts` | Filtros para listagem | `BarcodeNotFoundReportFilterDto.ts` |
| `*ChartDto.ts` / `*ChartItemDto.ts` | Dados para gráficos | `AverageTicketChartDto.ts` |
| Sem sufixo | Entidade de domínio ou utilitário | `Address.ts`, `Contact.ts`, `EnumType.ts` |

## Padrão de DTO

Cada DTO é um `type` exportado, com campos opcionais marcados com `?`:

```ts
// src/app/models/AccountDetailsDto.ts
import { type EnumType } from "./EnumType";

export type AccountDetailsDto = {
  id: string;
  profile_picture_url: string;
  name: string;
  role: string;
  telephone: string;
  email: string;
  google_account: boolean;
  environment_id: string;
  business_name: string;
  first_access: boolean;
  theme: EnumType;
  permissions: EnumType[];
};
```

### Initial Empty Pattern

DTOs de formulário exportam um objeto vazio inicial para uso com Formik:

```ts
// src/app/models/BankAccountDto.ts
export type BankAccountDto = {
  id?: string;
  name: string;
  agency: string;
  // ...
};

export const initialBankAccountEmpty: BankAccountDto = {
  name: '',
  agency: '',
  // ... todos os campos com valores padrão
};
```

## Tipos Utilitários

### EnumType

Tipo genérico para enums que vêm da API como `{ value, label }`:

```ts
export type EnumType = {
  value: string;
  label: string;
};
```

Usado em praticamente todos os DTOs para campos como `status`, `type`, `role`, etc.

### ListData

Tipo para respostas paginadas:

```ts
export type ListData<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  // ...
};
```

### DataTableColumnDef / DataTableFilter

Tipos internos de UI para configuração do componente DataTable.

## Relação com Endpoints

Os DTOs são usados como generics nas funções CRUD da [Camada API](../camada-api/):

```ts
import { get, post } from '@/api/axios';
import { ProductEndpoints } from '@/api/endpoints/ProductEndpoints';
import { type ProductDto } from '@/app/models/ProductDto';
import { type ListData } from '@/app/models/ListData';

// Listagem paginada
const products = await get<ListData<ProductDto>>(ProductEndpoints.list);

// Criação
const created = await post<ProductDto>(ProductEndpoints.create, payload);
```

## Módulos com Mais DTOs

| Módulo | Exemplos de DTOs | Quantidade aprox. |
|--------|-----------------|-------------------|
| Financeiro | `BankAccountDto`, `CashFlowDto`, `InstallmentDto` | ~25 |
| Vendas | `SaleOrderDto`, `NfceDto`, `CouponDto` | ~20 |
| Suprimentos | `InventoryDto`, `BuyOrderDto`, `PicklistDto` | ~15 |
| Cadastros | `ProductDto`, `ClientContactDto`, `SupplierContactDto` | ~20 |
| Dashboards | `AverageTicketChartDto`, `BestSellerProductDto` | ~10 |
| Relatórios | `SalesReportDto`, `FinanceReportDto` | ~10 |

## Adicionando um Novo DTO

1. Crie `src/app/models/{EntityName}Dto.ts`
2. Exporte como `type` (não `interface`) para consistência
3. Use `EnumType` para campos enum vindos da API
4. Se for usado em formulário, exporte `initial{EntityName}Empty`
5. Use o DTO como generic nas funções CRUD
