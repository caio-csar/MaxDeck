# AGENTS.md — MaxDeck

Este arquivo orienta Codex e outros agentes que trabalharem neste repositório.

## Objetivo do projeto

Manter um portal público, simples e confiável para descoberta, instalação e atualização de scripts Tampermonkey da Maxdata, acompanhado de um painel administrativo protegido que publica no GitHub.

Comunique-se com o mantenedor em português do Brasil. Preserve a interface compacta, escura e profissional e evite alterações que não façam parte do pedido atual.

## Fonte da verdade

- Repositório: `caio-csar/MaxDeck`
- Branch de produção: `main`
- Portal: `https://caio-csar.github.io/MaxDeck/`
- Admin: `https://maxdeck-admin.caiocesar1214.workers.dev/`

O painel administrativo cria commits diretamente em `main`. Portanto, a branch remota pode avançar enquanto um agente trabalha.

Antes de qualquer alteração:

1. execute `git fetch origin`;
2. confira `git status --short --branch`;
3. confirme que não há alterações versionadas do usuário;
4. se a cópia estiver atrás e limpa, atualize-a apenas com fast-forward;
5. nunca sobrescreva nem descarte arquivos do usuário para sincronizar.

Antes de publicar, repita o `fetch`. Se `origin/main` tiver avançado, incorpore as mudanças com segurança e execute novamente as validações. Nunca use push forçado.

## Mapa do projeto

- `site/index.html`: interface pública e comportamento dos cards.
- `site/catalog.json`: catálogo canônico exibido no portal.
- `site/scripts/*.user.js`: arquivos instalados e atualizados pelo Tampermonkey.
- `site/assets/`: identidade visual do portal.
- `site/media/`: imagens e GIFs vinculados aos scripts.
- `admin/worker.js`: Worker da Cloudflare que serve o painel e conversa com a API do GitHub.
- `.github/workflows/deploy-pages.yml`: publicação da pasta `site` no GitHub Pages.
- `docs/ARQUITETURA.md`: arquitetura, fluxo de dados e operação.

## Regras que não podem ser quebradas

1. Mantenha os IDs `S###` estáveis. Links compartilhados usam esses IDs.
2. Não renomeie o arquivo de um script existente. A URL do arquivo é usada pelo Tampermonkey para atualizações.
3. Aumente `@version` em toda atualização funcional do script. Código diferente com a mesma versão pode não ser instalado automaticamente.
4. Preserve ou regenere `@downloadURL` e `@updateURL` apontando para o GitHub Pages.
5. `enabled` controla somente a exibição no MaxDeck. Não o trate como desativação remota de scripts já instalados.
6. Alterações apenas em ordem, destaque, descrição ou visibilidade não devem alterar `updatedAt`.
7. Uma publicação de script deve manter script, catálogo e mídias no mesmo commit atômico.
8. Não reduza os controles de autenticação, comparação segura de senha ou validação de caminhos e uploads do Worker.
9. Preserve a compatibilidade com Chrome, Firefox, Opera e Opera GX.

## Cabeçalho dos scripts

Todo arquivo em `site/scripts` deve conter um bloco Tampermonkey completo:

```javascript
// ==UserScript==
// @name         Nome do script
// @version      1.0.0
// @description  Descrição curta
// ...
// ==/UserScript==
```

O Worker insere ou atualiza `@version`, `@downloadURL` e `@updateURL` no momento da publicação. O arquivo aceita no máximo 2 MB.

## Catálogo e mídias

Campos esperados em cada item de `site/catalog.json`:

- `id`, `name`, `version`, `file`, `description`;
- `category`: `TendiChat`, `MaxAtendimento` ou `Outros`;
- `enabled`, `featured`, `displayOrder`, `updatedAt`;
- `media`: até três entradas PNG, JPG, WebP ou GIF.

Cada mídia pode ter no máximo 3 MB. Caminhos precisam permanecer dentro de `site/media/<slug>/`.

## Validação mínima

Execute validações proporcionais à mudança. Para alterações no portal, catálogo ou Worker, a verificação mínima é:

```bash
node --check admin/worker.js
git diff --check
```

Também confirme:

- `site/catalog.json` é JSON válido;
- não existem IDs nem nomes de arquivo duplicados;
- todos os itens têm `updatedAt` válido;
- o JavaScript embutido em `site/index.html` compila;
- todo `.user.js` alterado possui cabeçalho completo;
- links de instalação e compartilhamento continuam usando o arquivo e o ID corretos.

Para mudanças visuais, sirva `site` por HTTP local. Não valide abrindo `index.html` diretamente pelo sistema de arquivos.

## Publicação segura

- Adicione ao commit somente os arquivos do pedido atual.
- Não inclua caches, dependências, backups ou protótipos locais.
- Um push em `main` publica o portal automaticamente pelo GitHub Actions.
- Alterar `admin/worker.js` no GitHub não atualiza o Worker sozinho; execute a publicação com Wrangler.
- Ao publicar o Worker, use `--keep-vars` e confirme depois que `ADMIN_PASSWORD` e `GITHUB_TOKEN` continuam configurados.
- Após publicar, verifique HTTP 200 no portal e no catálogo. O admin deve responder 401 sem autenticação.

## Dados que nunca devem entrar no Git

- valores de `ADMIN_PASSWORD` e `GITHUB_TOKEN`;
- credenciais do GitHub ou da Cloudflare;
- `.wrangler/`, `.pnpm-store/` e `node_modules/`;
- exportações e backups locais do Tampermonkey;
- protótipos fora da estrutura ativa do projeto.

Se houver arquivos não versionados que não foram criados pela tarefa atual, preserve-os e não os adicione ao commit.

## Critério de conclusão

Uma tarefa só está concluída quando:

1. a implementação solicitada está validada;
2. a branch remota foi conferida novamente;
3. o commit contém somente mudanças intencionais;
4. o push foi confirmado no GitHub;
5. quando aplicável, GitHub Pages e Cloudflare Worker foram verificados em produção.

