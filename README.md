# Atlas Hub

Plataforma de gestão integrada para organizações.

Este repositório é a distribuição standalone do Atlas Hub mantido no projeto
`kauzone11/atlas-impact`.

## Fonte de verdade

O código funcional do Hub é sincronizado a partir do commit registrado em
[`atlas-hub-source.json`](./atlas-hub-source.json).

## Funcionalidades

Organizações, diretorias, projetos, tarefas, reuniões, disponibilidade,
finanças, notificações, busca, pessoas, governança, estratégia, crescimento,
minha conta e ajustes.

## Arquitetura

O código funcional permanece nos namespaces `src/app/hub`, `src/app/api/hub`,
`src/components/hub` e `src/lib/hub`. O restante do aplicativo contém somente
dependências compartilhadas necessárias ou adapters standalone documentados.

## Rotas

As páginas usam o namespace `/hub` e as APIs usam `/api/hub`. A raiz apenas
encaminha para `/hub/login` ou `/hub` conforme a sessão presente.

## Banco de dados

O schema Prisma contém somente os modelos e enums do Atlas Hub. A migration
baseline é gerada para PostgreSQL vazio e aplicada com `prisma migrate deploy`.

## Autenticação

O Hub usa suas sessões, cookies, contexto de organização, convites e regras de
permissão próprios. O isolamento de tenant é mantido nos serviços e APIs Hub.

## Configuração local

Copie `.env.example` para `.env` e configure `DATABASE_URL` e os segredos de
sessão. Não versionamos `.env` nem dados locais.

## Criação da primeira organização

Depois de aplicar a baseline e gerar o cliente Prisma, use:

```bash
npm run hub:organization:create -- --help
```

## Testes

```bash
npm run hub:source:verify
npm run typecheck
npm run hub:collaboration:preflight
npm run hub:operations:preflight
npm run hub:strategy-growth:preflight
npm run hub:accounts:preflight
npm run hub:test
npm run build
```

## Sincronização com a fonte

Com um checkout limpo de `atlas-impact` no commit registrado:

```bash
npm run hub:source:sync -- C:/caminho/atlas-impact
npm run hub:source:verify -- C:/caminho/atlas-impact
```

O sincronizador nunca executa commit, push ou deploy.

## Segurança

Use secrets fora do repositório, mantenha o PostgreSQL protegido e revise as
permissões do Hub antes de publicar uma instância.

## Contribuição

Alterações no código principal devem primeiro existir e ser validadas no Hub
da fonte. Atualizações standalone devem registrar a origem no manifesto.
