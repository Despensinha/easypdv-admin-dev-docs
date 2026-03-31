// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  integrations: [
    starlight({
      title: 'Despensinha ERP - Dev Docs',
      defaultLocale: 'root',
      locales: {
        root: {
          label: 'Português',
          lang: 'pt-BR',
        },
      },
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/Despensinha' }],
      sidebar: [
        {
          label: 'Introdução',
          items: [
            { label: 'Stack Tecnológica', slug: 'introducao/tech-stack' },
            { label: 'Estrutura do Projeto', slug: 'introducao/estrutura-do-projeto' },
          ],
        },
        {
          label: 'Arquitetura',
          items: [
            { label: 'Roteamento', slug: 'arquitetura/roteamento' },
            { label: 'RBAC (Permissões)', slug: 'arquitetura/rbac' },
          ],
        },
        {
          label: 'Módulos',
          items: [
            { label: 'Autenticação', slug: 'modulos/autenticacao' },
            { label: 'Tabelas', slug: 'modulos/tabelas' },
            { label: 'Formulários', slug: 'modulos/formularios' },
            { label: 'Exportação', slug: 'modulos/exportacao' },
          ],
        },
        {
          label: 'Funcionalidades',
          items: [
            { label: 'Filtros por URL', slug: 'funcionalidades/filtros-url' },
            { label: 'Permissões', slug: 'funcionalidades/permissoes' },
            { label: 'Internacionalização', slug: 'funcionalidades/internacionalizacao' },
            { label: 'Notificações', slug: 'funcionalidades/notificacoes' },
          ],
        },
        {
          label: 'Changelog',
          items: [
            { label: 'Histórico de Versões', slug: 'changelog' },
          ],
        },
      ],
    }),
  ],
});
