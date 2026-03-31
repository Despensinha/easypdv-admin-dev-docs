---
title: Formulários
description: Padrão de formulários com Formik e Yup no Despensinha ERP.
---

Os formulários usam **Formik** para estado e **Yup** para validação.

## Arquivos de Inputs

Inputs customizados estão em `src/app/components/inputs/`. Os mais usados:

| Componente | Uso |
|-----------|-----|
| `TextInput` | Campo de texto simples |
| `SelectInput` | Dropdown com react-select |
| `DateInput` | Seletor de data com flatpickr |
| `CurrencyInput` | Campo monetário com máscara |
| `MaskedInput` | Campo com máscara (CPF, CNPJ, CEP) |

## Estrutura de um Formulário

```tsx
import { Formik, Form } from 'formik';
import * as Yup from 'yup';

const schema = Yup.object({
  name: Yup.string().required('Nome é obrigatório'),
  document: Yup.string().required('CPF/CNPJ é obrigatório'),
});

function ClientForm({ onSubmit }) {
  return (
    <Formik
      initialValues={{ name: '', document: '' }}
      validationSchema={schema}
      onSubmit={onSubmit}
    >
      {() => (
        <Form>
          <TextInput name="name" label="Nome" />
          <MaskedInput name="document" label="CPF/CNPJ" mask="cpf-cnpj" />
          <button type="submit">Salvar</button>
        </Form>
      )}
    </Formik>
  );
}
```

## Erros de API

Erros retornados pela API são mapeados para os campos do Formik via `setFieldError`:

```ts
try {
  await ClientEndpoints.create(values);
} catch (error) {
  const apiErrors = parseApiErrors(error); // src/app/helpers/apiErrors.ts
  apiErrors.forEach(({ field, message }) => setFieldError(field, message));
}
```
