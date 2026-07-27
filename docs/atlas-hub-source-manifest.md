# Manifesto de origem do Atlas Hub

- Repositório fonte: `kauzone11/atlas-impact`
- SHA fonte: `57fa677dc938d5fb1082c317e92a0cfd0b93c3c4`
- Data da sincronização: 2026-07-27
- Comando de verificação: `npm run hub:source:verify -- C:/caminho/atlas-impact`
- O CI verifica a manifestação registrada com `--manifest-only`, pois o
  repositório-fonte é privado e não há token cross-repository configurado; a
  comparação SHA/hash completa é executada localmente com o checkout fonte.

## Arquivos copiados diretamente

Foram copiados byte a byte todos os arquivos presentes em:

- `src/app/hub/**`
- `src/app/api/hub/**`
- `src/components/hub/**`
- `src/lib/hub/**`

O verificador compara o hash de cada arquivo desses namespaces com o checkout
fonte fixado no SHA acima.

As sete adaptações documentadas são limitadas a adapters de teste ou correções
de lint sem mudança de regra: o teste de administração integrada usa uma
identidade de ator Hub local, sem criar ou importar o modelo de usuário da
aplicação maior; os demais removem imports/estado não usados e preservam o
comportamento executável.

## Dependências compartilhadas necessárias

| Arquivo | Consumidor Hub | Justificativa |
| --- | --- | --- |
| `src/app/globals.css` | layout raiz e páginas Hub | estilos globais e tokens usados pelo shell |
| `src/components/UserAvatar.tsx` | `src/app/hub/minha-conta` | avatar exibido no fluxo de conta |
| `src/lib/avatar.ts` | `UserAvatar` | normalização e iniciais do avatar |
| `src/lib/prisma.ts` | APIs e serviços Hub | singleton do Prisma Client |
| `tailwind.config.ts` | CSS global e componentes Hub | tokens, cores e classes Tailwind usadas pelo Hub |

Nenhum módulo de autenticação ou negócio fora do Hub foi mantido como
dependência de runtime.

## Adapters standalone

- `src/app/page.tsx`: redireciona a raiz para `/hub/login` ou `/hub`.
- `src/app/layout.tsx`: metadata, idioma, CSS global e estrutura mínima.
- `middleware.ts`: protege somente `/hub/**` e `/api/hub/**`.
- `src/app/api/health/route.ts`: health check mínimo da aplicação e banco.
- `scripts/sync-atlas-hub-source.mjs`: sincronização dos quatro namespaces.
- `scripts/verify-atlas-hub-source-sync.mjs`: verificação de hashes e limites.
- `scripts/preflight-hub-operations.ts`: reconhece a baseline standalone como
  histórico íntegro, além da migration histórica da aplicação integrada.

## Caminhos deliberadamente excluídos

Foram excluídos landing pages, estudos, coleta, resultados, engine de cálculo,
observatórios, eventos, relatórios, dados demonstrativos, autenticação da
plataforma maior, APIs fora de `/api/hub`, páginas fora de `/hub` e migrations
que pertenciam à aplicação integrada ou à reconstrução anterior.

## Diferenças inevitáveis

O aplicativo integrado fornece a raiz, middleware, layout, schema completo e
histórico de migrations da aplicação maior. A distribuição standalone substitui
somente esses pontos de composição por adapters mínimos e uma baseline
PostgreSQL do subconjunto Hub; as páginas, APIs, serviços e regras do Hub não
foram renomeados ou reescritos.
