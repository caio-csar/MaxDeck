# MaxDeck

Portal público da Maxdata para organizar, instalar e atualizar scripts do Tampermonkey usados nas integrações entre TendiChat, Max Atendimento, ChatGPT e outras ferramentas internas.

## Endereços

- Portal público: https://caio-csar.github.io/MaxDeck/
- Painel administrativo: https://maxdeck-admin.caiocesar1214.workers.dev/
- Repositório: https://github.com/caio-csar/MaxDeck

O portal é público. O painel administrativo exige autenticação e publica alterações diretamente na branch `main` deste repositório.

## O que o projeto oferece

- catálogo de scripts em cards, com busca e categorias;
- destaques e ordenação configuráveis;
- links diretos para compartilhar um script específico;
- instalação pelo Tampermonkey;
- atualização automática dos scripts instalados por `@updateURL`, `@downloadURL` e `@version`;
- imagens e GIFs de demonstração;
- indicação de quantos dias se passaram desde a última atualização;
- painel para adicionar, editar, ativar, desativar, destacar e ordenar scripts.

## Estrutura do repositório

```text
.
├── .github/workflows/deploy-pages.yml  # publicação automática do portal
├── admin/worker.js                     # painel e API administrativa na Cloudflare
├── docs/ARQUITETURA.md                 # arquitetura e fluxos operacionais
├── site/
│   ├── index.html                      # portal público
│   ├── catalog.json                    # catálogo e metadados dos scripts
│   ├── assets/                         # logos e imagens da interface
│   ├── media/                          # demonstrações dos scripts
│   └── scripts/                        # arquivos .user.js instaláveis
└── AGENTS.md                           # regras para Codex e outros agentes
```

## Como o catálogo funciona

Cada registro de `site/catalog.json` possui um ID estável, nome, versão, arquivo, descrição, categoria, status de publicação, destaque, posição de exibição, data da última atualização e até três mídias.

Pontos importantes:

- `enabled: false` apenas remove o card do portal; não desinstala nem desativa cópias já instaladas;
- `featured: true` envia o item para a seção de destaques;
- `displayOrder` controla a ordem pública dentro da seção;
- `updatedAt` muda quando o arquivo do script é publicado pelo painel;
- o nome de arquivo de um script existente deve permanecer estável, pois faz parte da URL de atualização;
- a versão precisa aumentar para que o Tampermonkey reconheça uma atualização.

## Adicionar ou atualizar scripts

O fluxo recomendado é pelo painel administrativo:

1. Acesse o painel.
2. Escolha **Novo script** ou **Editar**.
3. Importe um `.user.js` ou cole seu conteúdo completo.
4. O painel lê `@name`, `@version` e `@description` do cabeçalho.
5. Ajuste categoria, publicação, destaque, ordem e mídias.
6. Publique.

Uma publicação de script cria um único commit no GitHub contendo o `.user.js`, o catálogo e as mídias relacionadas. O Worker também garante as URLs públicas de download e atualização no cabeçalho.

## Continuar em outro computador

```bash
git clone https://github.com/caio-csar/MaxDeck.git
cd MaxDeck
git pull --ff-only
```

Abra a pasta clonada como projeto local no Codex. Leia primeiro `AGENTS.md` e `docs/ARQUITETURA.md`.

Como o painel também escreve na branch `main`, sempre execute `git fetch origin` e confira se a cópia local está atualizada antes de editar ou publicar.

Para enviar alterações será necessário autenticar o GitHub nesse computador. Para publicar uma nova versão do Worker administrativo, também será necessário autenticar a Cloudflare com o Wrangler. Os valores secretos permanecem armazenados na Cloudflare e não devem ser copiados para o repositório.

## Visualização local

O portal não exige compilação. Sirva a pasta `site` com qualquer servidor HTTP estático. Exemplo:

```bash
python -m http.server 8000 --directory site
```

Depois acesse `http://localhost:8000/`.

## Publicação

### Portal

Todo push na branch `main` aciona `.github/workflows/deploy-pages.yml`, que publica a pasta `site` no GitHub Pages.

### Painel administrativo

Alterações em `admin/worker.js` precisam de uma publicação separada:

```bash
pnpm dlx wrangler@latest deploy admin/worker.js \
  --name maxdeck-admin \
  --compatibility-date 2026-08-24 \
  --keep-vars
```

O parâmetro `--keep-vars` preserva as configurações definidas no painel da Cloudflare. Os segredos necessários são:

- `ADMIN_PASSWORD`
- `GITHUB_TOKEN`

Nunca registre os valores desses segredos no Git, em documentação ou em logs.

## Documentação complementar

- [Arquitetura e fluxos](docs/ARQUITETURA.md)
- [Instruções para agentes](AGENTS.md)

