addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

const REPOSITORY = "caio-csar/MaxDeck";
const BRANCH = "main";
const CATALOG_PATH = "site/catalog.json";
const SCRIPTS_PATH = "site/scripts";
const PUBLIC_SCRIPT_BASE = "https://caio-csar.github.io/MaxDeck/scripts/";
const MAX_MEDIA_FILES = 3;
const MAX_MEDIA_BYTES = 3 * 1024 * 1024;
const MAX_SCRIPT_BYTES = 2 * 1024 * 1024;
const MAX_REQUEST_BYTES = 16 * 1024 * 1024;
const textEncoder = new TextEncoder();

async function secureEqual(value, expected) {
  const [valueHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected)),
  ]);
  const left = new Uint8Array(valueHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function isAuthorized(request) {
  const authorization = request.headers.get("authorization") || "";
  if (!authorization.startsWith("Basic ")) return false;
  try {
    const credentials = atob(authorization.slice(6));
    const password = credentials.split(":").slice(1).join(":");
    return secureEqual(password, ADMIN_PASSWORD);
  } catch {
    return false;
  }
}

function unauthorized() {
  return new Response("Acesso restrito", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="MaxDeck Admin"' },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=UTF-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

async function github(path, init = {}) {
  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${GITHUB_TOKEN}`,
      "User-Agent": "MaxDeck-Admin/2.0 (https://github.com/caio-csar/MaxDeck)",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    let details = `GitHub respondeu ${response.status}`;
    try {
      const payload = await response.text();
      if (payload) {
        try {
          const parsed = JSON.parse(payload);
          details = parsed.message || details;
        } catch {
          details = payload.trim() || details;
        }
      }
    } catch {}
    const error = new Error(details);
    error.status = response.status;
    throw error;
  }
  return response;
}

async function githubJson(path, init = {}) {
  return (await github(path, init)).json();
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

async function readRepositoryFile(path, ref = BRANCH) {
  const payload = await githubJson(`/repos/${REPOSITORY}/contents/${encodePath(path)}?ref=${encodeURIComponent(ref)}`);
  return { content: decodeBase64(payload.content), sha: payload.sha };
}

async function repositoryFileExists(path, ref) {
  try {
    await readRepositoryFile(path, ref);
    return true;
  } catch (error) {
    if (error && error.status === 404) return false;
    throw error;
  }
}

async function getBranchState() {
  const reference = await githubJson(`/repos/${REPOSITORY}/git/ref/heads/${encodeURIComponent(BRANCH)}`);
  const commit = await githubJson(`/repos/${REPOSITORY}/git/commits/${reference.object.sha}`);
  return { commitSha: reference.object.sha, treeSha: commit.tree.sha };
}

async function getCatalogSnapshot() {
  const branch = await getBranchState();
  const catalog = await readRepositoryFile(CATALOG_PATH, branch.commitSha);
  return { ...branch, items: JSON.parse(catalog.content) };
}

async function createBlob(content, encoding) {
  return githubJson(`/repos/${REPOSITORY}/git/blobs`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ content, encoding }),
  });
}

async function commitFiles(snapshot, message, changes) {
  const uniqueChanges = [...new Map(changes.map((change) => [change.path, change])).values()];
  const treeEntries = await Promise.all(uniqueChanges.map(async (change) => {
    if (change.delete) return { path: change.path, mode: "100644", type: "blob", sha: null };
    const blob = await createBlob(change.content, change.encoding || "utf-8");
    return { path: change.path, mode: "100644", type: "blob", sha: blob.sha };
  }));
  const tree = await githubJson(`/repos/${REPOSITORY}/git/trees`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ base_tree: snapshot.treeSha, tree: treeEntries }),
  });
  const commit = await githubJson(`/repos/${REPOSITORY}/git/commits`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ message, tree: tree.sha, parents: [snapshot.commitSha] }),
  });
  try {
    await githubJson(`/repos/${REPOSITORY}/git/refs/heads/${encodeURIComponent(BRANCH)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sha: commit.sha, force: false }),
    });
  } catch (error) {
    if (error && (error.status === 409 || error.status === 422)) {
      throw new Error("O catálogo foi alterado por outra publicação. Recarregue o painel e tente novamente.");
    }
    throw error;
  }
  return commit;
}

function cleanText(value, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "script";
}

function normalizeMedia(entry) {
  const path = cleanText(entry && entry.path, 260);
  const match = path.match(/^media\/[a-z0-9-]{1,80}\/[a-z0-9-]{1,100}\.(png|jpe?g|webp|gif)$/i);
  if (!match) throw new Error("Mídia inválida no catálogo.");
  const extension = match[1].toLowerCase();
  const type = extension === "jpg" || extension === "jpeg" ? "image/jpeg" : `image/${extension}`;
  return { path, alt: cleanText(entry && entry.alt, 180), type };
}

function normalizeCore(item) {
  const name = cleanText(item && item.name, 180);
  const file = cleanText(item && item.file, 220);
  const version = cleanText(item && item.version, 40) || "1.0.0";
  const categories = ["TendiChat", "MaxAtendimento", "Outros"];
  const category = categories.includes(item && item.category) ? item.category : "Outros";
  const idValue = cleanText(item && item.id, 20).toUpperCase();
  const id = /^S\d{3,}$/.test(idValue) ? idValue : "";
  const orderValue = Number(item && item.displayOrder);
  if (!name || !file.endsWith(".user.js") || file.includes("/") || file.includes("\\")) {
    throw new Error("Nome ou arquivo inválido.");
  }
  return {
    id,
    name,
    version,
    file,
    description: cleanText(item && item.description, 280),
    category,
    enabled: !item || item.enabled !== false,
    featured: !!(item && item.featured === true),
    displayOrder: Number.isFinite(orderValue) && orderValue > 0 ? Math.floor(orderValue) : 0,
  };
}

function normalizeItem(item) {
  return {
    ...normalizeCore(item),
    media: Array.isArray(item && item.media) ? item.media.slice(0, MAX_MEDIA_FILES).map(normalizeMedia) : [],
  };
}

function nextScriptId(items) {
  const maximum = items.reduce((value, item) => {
    const match = String(item.id || "").match(/^S(\d+)$/);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0);
  return `S${String(maximum + 1).padStart(3, "0")}`;
}

function nextDisplayOrder(items, featured) {
  return items.filter((item) => item.featured === featured).reduce((value, item) => Math.max(value, Number(item.displayOrder) || 0), 0) + 1;
}

function ensureCatalogIdentities(rawItems) {
  const items = rawItems.map(normalizeItem);
  const used = new Set();
  let next = items.reduce((value, item) => {
    const match = item.id.match(/^S(\d+)$/);
    return Math.max(value, match ? Number(match[1]) : 0);
  }, 0) + 1;
  const orderBySection = { featured: 0, regular: 0 };
  return items.map((item) => {
    let id = item.id;
    if (!id || used.has(id)) {
      do id = `S${String(next++).padStart(3, "0")}`; while (used.has(id));
    }
    used.add(id);
    const section = item.featured ? "featured" : "regular";
    const displayOrder = item.displayOrder || ++orderBySection[section];
    orderBySection[section] = Math.max(orderBySection[section], displayOrder);
    return { ...item, id, displayOrder };
  });
}

function base64ByteLength(value) {
  const padding = value.endsWith("==") ? 2 : value.endsWith("=") ? 1 : 0;
  return Math.floor(value.length * 3 / 4) - padding;
}

function materializeItem(raw, identity = {}) {
  const core = { ...normalizeCore(raw), ...identity };
  const mediaInput = Array.isArray(raw && raw.media) ? raw.media : [];
  if (mediaInput.length > MAX_MEDIA_FILES) throw new Error(`Cada script aceita até ${MAX_MEDIA_FILES} mídias.`);
  const changes = [];
  const media = mediaInput.map((entry) => {
    if (entry && entry.path) return normalizeMedia(entry);
    const mediaType = cleanText(entry && entry.type, 40).toLowerCase();
    const extensionByType = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
    const extension = extensionByType[mediaType];
    const content = String(entry && entry.data || "").replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    if (!extension || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) throw new Error("Use uma imagem PNG, JPG, WebP ou GIF válida.");
    if (base64ByteLength(content) > MAX_MEDIA_BYTES) throw new Error("A mídia deve ter no máximo 3 MB.");
    const folder = slugify(core.file.replace(/\.user\.js$/i, ""));
    const relativePath = `media/${folder}/${crypto.randomUUID()}.${extension}`;
    changes.push({ path: `site/${relativePath}`, content, encoding: "base64" });
    return { path: relativePath, alt: cleanText(entry && entry.alt, 180), type: mediaType };
  });
  return { item: { ...core, media }, changes };
}

function mediaPaths(items) {
  return new Set(items.flatMap((item) => Array.isArray(item.media) ? item.media.map((entry) => entry.path) : []));
}

function removedMediaChanges(previousItems, currentItems) {
  const previous = mediaPaths(previousItems);
  const current = mediaPaths(currentItems);
  return [...previous].filter((path) => !current.has(path)).map((path) => ({ path: `site/${path}`, delete: true }));
}

function catalogChange(items) {
  return { path: CATALOG_PATH, content: `${JSON.stringify(items, null, 2)}\n`, encoding: "utf-8" };
}

function addUpdateMetadata(source, file, version) {
  const content = String(source || "").replace(/^\uFEFF/, "");
  if (textEncoder.encode(content).byteLength > MAX_SCRIPT_BYTES) throw new Error("O script deve ter no máximo 2 MB.");
  const match = content.match(/^\/\/\s*==UserScript==\s*$[\s\S]*?^\/\/\s*==\/UserScript==\s*$/m);
  if (!match) throw new Error("O código precisa conter o cabeçalho completo // ==UserScript== e // ==/UserScript==.");
  const header = match[0];
  if (!/^\/\/\s*@name(?:\:[\w-]+)?\s+.+$/m.test(header)) throw new Error("O cabeçalho Tampermonkey precisa conter @name.");
  const publicUrl = `${PUBLIC_SCRIPT_BASE}${encodeURIComponent(file)}`;
  let lines = header.split(/\r?\n/).filter((line) => !/^\/\/\s*@(downloadURL|updateURL)\s+/i.test(line));
  const versionIndex = lines.findIndex((line) => /^\/\/\s*@version\s+/i.test(line));
  if (versionIndex >= 0) lines[versionIndex] = `// @version      ${version}`;
  else {
    const nameIndex = lines.findIndex((line) => /^\/\/\s*@name(?:\:[\w-]+)?\s+/i.test(line));
    lines.splice(nameIndex + 1, 0, `// @version      ${version}`);
  }
  const updatedVersionIndex = lines.findIndex((line) => /^\/\/\s*@version\s+/i.test(line));
  lines.splice(updatedVersionIndex + 1, 0, `// @downloadURL ${publicUrl}`, `// @updateURL ${publicUrl}`);
  return content.replace(header, lines.join("\n"));
}

async function getCatalog() {
  const snapshot = await getCatalogSnapshot();
  return { items: ensureCatalogIdentities(snapshot.items), commitSha: snapshot.commitSha };
}

async function updateCatalogFromRequest(rawItems, message) {
  if (!Array.isArray(rawItems) || rawItems.length > 250) throw new Error("Catálogo inválido.");
  const snapshot = await getCatalogSnapshot();
  const previousItems = ensureCatalogIdentities(snapshot.items);
  const previousByFile = new Map(previousItems.map((item) => [item.file, item]));
  if (rawItems.length !== previousItems.length) throw new Error("Use a opção Novo script para adicionar itens ao catálogo.");
  const changes = [];
  const items = rawItems.map((raw) => {
    const file = cleanText(raw && raw.file, 220);
    const previous = previousByFile.get(file);
    if (!previous) throw new Error(`O script ${file || "informado"} não existe no catálogo atual.`);
    const materialized = materializeItem(raw, { id: previous.id });
    changes.push(...materialized.changes);
    return materialized.item;
  });
  if (new Set(items.map((item) => item.file)).size !== previousItems.length) throw new Error("O catálogo contém arquivos duplicados.");
  changes.push(...removedMediaChanges(previousItems, items), catalogChange(items));
  await commitFiles(snapshot, message, changes);
  return items;
}

async function handleApi(request, url) {
  if (url.pathname === "/api/catalog" && request.method === "GET") return json(await getCatalog());

  if (url.pathname === "/api/catalog" && request.method === "PUT") {
    const body = await request.json();
    const items = await updateCatalogFromRequest(body.items, cleanText(body.message, 140) || "Atualizar catálogo pelo MaxDeck Admin");
    return json({ ok: true, items });
  }

  if (url.pathname === "/api/script" && request.method === "GET") {
    const file = cleanText(url.searchParams.get("file"), 220);
    if (!file.endsWith(".user.js") || file.includes("/") || file.includes("\\")) throw new Error("Arquivo inválido.");
    return json(await readRepositoryFile(`${SCRIPTS_PATH}/${file}`));
  }

  if (url.pathname === "/api/script" && request.method === "POST") {
    const body = await request.json();
    const snapshot = await getCatalogSnapshot();
    const previousItems = ensureCatalogIdentities(snapshot.items);
    const core = normalizeCore(body);
    if (previousItems.some((entry) => entry.file.toLocaleLowerCase("pt-BR") === core.file.toLocaleLowerCase("pt-BR"))) throw new Error("Esse arquivo já existe no catálogo.");
    if (await repositoryFileExists(`${SCRIPTS_PATH}/${core.file}`, snapshot.commitSha)) throw new Error("Esse arquivo já existe no repositório.");
    const identity = { id: nextScriptId(previousItems), displayOrder: nextDisplayOrder(previousItems, core.featured) };
    const materialized = materializeItem(body, identity);
    const content = addUpdateMetadata(body.content, materialized.item.file, materialized.item.version);
    const items = [...previousItems, materialized.item];
    await commitFiles(snapshot, `Adicionar ${materialized.item.name}`, [
      { path: `${SCRIPTS_PATH}/${materialized.item.file}`, content, encoding: "utf-8" },
      ...materialized.changes,
      catalogChange(items),
    ]);
    return json({ ok: true, item: materialized.item }, 201);
  }

  if (url.pathname === "/api/script" && request.method === "PUT") {
    const body = await request.json();
    const snapshot = await getCatalogSnapshot();
    const previousItems = ensureCatalogIdentities(snapshot.items);
    const previousIndex = previousItems.findIndex((entry) => entry.file === cleanText(body.file, 220));
    if (previousIndex < 0) throw new Error("Esse script não existe no catálogo.");
    const previous = previousItems[previousIndex];
    const materialized = materializeItem(body, { id: previous.id });
    const content = addUpdateMetadata(body.content, previous.file, materialized.item.version);
    const items = previousItems.map((item, index) => index === previousIndex ? materialized.item : item);
    await commitFiles(snapshot, `Atualizar ${materialized.item.name} para ${materialized.item.version}`, [
      { path: `${SCRIPTS_PATH}/${previous.file}`, content, encoding: "utf-8" },
      ...materialized.changes,
      ...removedMediaChanges(previousItems, items),
      catalogChange(items),
    ]);
    return json({ ok: true, item: materialized.item });
  }

  return json({ error: "Rota não encontrada." }, 404);
}

async function handleRequest(request) {
  if (!(await isAuthorized(request))) return unauthorized();
  const url = new URL(request.url);
  try {
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_REQUEST_BYTES) return json({ error: "A publicação excede o limite de 16 MB." }, 413);
    if (url.pathname.startsWith("/api/")) return await handleApi(request, url);
    if (url.pathname !== "/") return new Response("Não encontrado", { status: 404 });
    return new Response(ADMIN_HTML, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src 'self' blob: data: https://caio-csar.github.io; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
        "x-frame-options": "DENY",
        "x-content-type-options": "nosniff",
        "referrer-policy": "no-referrer",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    console.error(JSON.stringify({ message: "request_failed", error: message, path: url.pathname }));
    return url.pathname.startsWith("/api/") ? json({ error: message }, 500) : new Response("Erro interno", { status: 500 });
  }
}

const ADMIN_HTML = String.raw`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>MaxDeck Admin</title>
  <style>
    :root{color-scheme:dark;--bg:#090a0c;--surface:#121419;--ink:#f2f3f5;--muted:#969da8;--line:#2b2f37;--red:#d20a18;--red2:#351318;--amber:#ffb454;--danger:#ef4452;--shadow:0 22px 70px rgba(0,0,0,.38)}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 18% -10%,rgba(210,10,24,.12),transparent 28rem),var(--bg);color:var(--ink);font:14px/1.45 Inter,Arial,sans-serif}.shell{max-width:1360px;margin:auto;padding:28px 24px 70px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:20px}.brand{display:flex;align-items:center;gap:13px}.mark{display:grid;place-items:center;width:42px;height:42px;border-radius:11px;background:var(--red);color:#fff;font-weight:900}.brand h1{margin:0;font-size:27px;letter-spacing:-.04em}.brand p{margin:1px 0 0;color:var(--muted)}button,input,select,textarea{font:inherit}.top-actions,.actions,.modalfoot,.media-actions{display:flex;gap:7px}.primary,.secondary,.ghost,.iconbtn{border:0;border-radius:8px;cursor:pointer;font-weight:750}.primary{padding:11px 16px;background:var(--red);color:#fff}.primary:hover{background:#ed1222}.secondary{padding:10px 14px;background:#f0f1f3;color:#111318}.ghost{padding:9px 12px;background:#23262d;color:#e7e9ec}.iconbtn{padding:7px 9px;background:transparent;color:var(--muted)}button:disabled{cursor:not-allowed;opacity:.55}.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:26px 0}.stat{padding:17px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.stat b{display:block;font-size:25px}.stat span{color:var(--muted);font-size:12px}.panel{border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}.toolbar{display:flex;align-items:stretch;justify-content:space-between;gap:14px;padding:16px;border-bottom:1px solid var(--line)}.admin-controls{display:flex;flex:1;gap:8px;flex-wrap:wrap}.search,.control,.field input,.field select,.field textarea{border:1px solid var(--line);border-radius:8px;background:#0d0f13;color:var(--ink)}.search{flex:1;min-width:270px;padding:10px 12px}.control{min-width:145px;padding:10px 11px}.filters{display:flex;gap:6px;flex-wrap:wrap;padding:12px 16px;border-bottom:1px solid var(--line)}.chip{padding:7px 12px;border:1px solid var(--line);border-radius:99px;background:#17191f;color:var(--muted);cursor:pointer}.chip.active{border-color:#6c1f28;background:var(--red2);color:#ffacb6}.row-grid{display:grid;grid-template-columns:minmax(260px,1.7fr) 128px 78px 98px 68px 210px;gap:13px;align-items:center}.table-head{padding:9px 17px;border-bottom:1px solid var(--line);background:#0f1115}.sort-button{padding:5px 3px;border:0;background:transparent;color:#777f8c;text-align:left;cursor:pointer;font-size:10px;font-weight:850;letter-spacing:.08em;text-transform:uppercase}.sort-button.active{color:#f0f2f5}.sort-arrow{margin-left:4px;color:#ff8d99}.rows{min-height:280px}.row{padding:14px 17px;border-bottom:1px solid #24272e}.row:last-child{border-bottom:0}.script h3{margin:0 0 4px;font-size:14px}.script p{margin:0;color:var(--muted);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.script-id{display:inline-block;margin-right:6px;color:#ff9eaa;font:800 10px/1.2 Consolas,monospace}.badge{width:max-content;padding:5px 8px;border-radius:6px;background:#22252b;color:#b8bec7;font-size:10px;font-weight:750}.status-on{background:#15352a;color:#8be0bb}.status-off{background:#351318;color:#ff9eaa}.version{font-weight:750}.featured{color:var(--amber);font-size:20px}.switch{position:relative;flex:0 0 auto;width:42px;height:24px;border:0;border-radius:99px;background:#bbc3be;cursor:pointer}.switch:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.18s}.switch.on{background:var(--red)}.switch.on:after{transform:translateX(18px)}.actions{justify-content:flex-end;align-items:center}.footer{display:flex;justify-content:space-between;align-items:center;padding:13px 17px;color:var(--muted)}.dirty{color:var(--amber);font-weight:750}.empty{padding:58px;text-align:center;color:var(--muted)}dialog{width:min(920px,calc(100vw - 28px));max-height:92vh;border:1px solid var(--line);border-radius:15px;padding:0;background:var(--surface);color:var(--ink);box-shadow:0 30px 100px rgba(0,0,0,.65)}dialog::backdrop{background:rgba(2,3,5,.78);backdrop-filter:blur(3px)}.modalhead{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--line)}.modalhead h2{margin:0;font-size:22px}.modalbody{padding:20px 22px;overflow:auto;max-height:calc(92vh - 135px)}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:13px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:11px;font-weight:750}.field input,.field select,.field textarea{width:100%;padding:10px}.field textarea.code{height:320px;font:12px/1.45 Consolas,monospace;resize:vertical}.modalfoot{justify-content:flex-end;padding:14px 22px;border-top:1px solid var(--line)}.import-bar,.upload-row,.settings-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px;border:1px solid var(--line);border-radius:9px;background:#0d0f13}.import-copy strong{display:block;font-size:12px}.import-copy span,.media-help,.organizer-copy{color:var(--muted);font-size:11px}.settings-row{justify-content:flex-start;gap:20px}.check{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700}.check input{width:16px;height:16px;accent-color:var(--red)}.media-editor{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:#0d0f13}.media-help{margin:0}.media-list{display:grid;gap:8px}.media-item{display:grid;grid-template-columns:72px 1fr auto;align-items:center;gap:10px;padding:8px;border:1px solid var(--line);border-radius:9px;background:#17191f}.media-item img{width:72px;height:48px;border-radius:6px;background:#090a0c;object-fit:cover}.media-item input{width:100%;padding:8px}.media-actions button{padding:6px 8px}.upload-count{color:var(--muted);font-size:11px}.empty-media{padding:10px;color:var(--muted);text-align:center;font-size:11px}.organizer-dialog{width:min(780px,calc(100vw - 28px))}.organizer-copy{margin:0 0 16px}.organizer-section{margin-top:15px}.organizer-section h3{margin:0 0 8px;font-size:13px}.organizer-list{display:grid;gap:7px;min-height:44px;padding:7px;border:1px dashed #373c46;border-radius:10px;background:#0d0f13}.organizer-item{display:grid;grid-template-columns:28px 36px 1fr auto;align-items:center;gap:8px;padding:9px;border:1px solid var(--line);border-radius:8px;background:#191c22}.organizer-item.dragging{opacity:.45}.drag-handle{color:#777f8c;cursor:grab;font-size:17px}.position{color:#ff9eaa;font:800 11px Consolas,monospace}.organizer-name{font-weight:700}.organizer-name small{display:block;color:var(--muted);font-weight:500}.organizer-move{display:flex;gap:4px}.organizer-move button{padding:5px 8px}.toast{position:fixed;right:22px;bottom:22px;max-width:420px;padding:13px 16px;border-radius:9px;background:#edf0f4;color:#111318;box-shadow:var(--shadow);opacity:0;transform:translateY(12px);pointer-events:none;transition:.2s;z-index:10}.toast.show{opacity:1;transform:none}.toast.error{background:var(--danger);color:#fff}@media(max-width:1000px){.row-grid{grid-template-columns:minmax(230px,1fr) 90px 210px}.row-grid>.category,.row-grid>.version,.row-grid>.featured,.table-head>[data-sort="category"],.table-head>[data-sort="version"],.table-head>[data-sort="featured"]{display:none}}@media(max-width:720px){.shell{padding:20px 10px 55px}.overview{grid-template-columns:1fr 1fr}.toolbar,.topbar{align-items:stretch;flex-direction:column}.top-actions{width:100%}.top-actions button{flex:1}.admin-controls{width:100%}.control{flex:1}.row-grid{grid-template-columns:1fr 155px}.row-grid>.status,.table-head>[data-sort="enabled"]:not(:last-child){display:none}.actions{gap:4px}.actions .ghost{padding:7px}.formgrid{grid-template-columns:1fr}.field.full{grid-column:auto}.media-item{grid-template-columns:60px 1fr}.media-item img{width:60px}.media-actions{grid-column:1/-1}.import-bar,.upload-row{align-items:stretch;flex-direction:column}.organizer-item{grid-template-columns:26px 30px 1fr}.organizer-move{grid-column:1/-1;justify-content:flex-end}}
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar"><div class="brand"><div class="mark">M</div><div><h1>MaxDeck Admin</h1><p>Controle o catálogo e publique scripts.</p></div></div><div class="top-actions"><button class="ghost" id="organizePortal">Organizar MaxDeck</button><button class="primary" id="newScript">+ Novo script</button></div></header>
    <section class="overview"><div class="stat"><b id="total">—</b><span>Total de scripts</span></div><div class="stat"><b id="online">—</b><span>Visíveis no portal</span></div><div class="stat"><b id="offline">—</b><span>Ocultos</span></div><div class="stat"><b id="featuredCount">—</b><span>Em destaque</span></div></section>
    <section class="panel">
      <div class="toolbar"><div class="admin-controls"><input class="search" id="search" placeholder="Buscar por nome, descrição ou arquivo"><select class="control" id="statusFilter" aria-label="Filtrar por publicação"><option value="all">Todos os status</option><option value="enabled">Ativos</option><option value="disabled">Desativados</option></select><select class="control" id="featuredFilter" aria-label="Filtrar por destaque"><option value="all">Todos os destaques</option><option value="featured">Em destaque</option><option value="regular">Sem destaque</option></select><button class="ghost" id="clearFilters">Limpar filtros</button></div><button class="secondary" id="publishCatalog" disabled>Publicar alterações</button></div>
      <div class="filters" id="filters"></div>
      <div class="table-head row-grid"><button class="sort-button" data-sort="name">Script</button><button class="sort-button" data-sort="category">Categoria</button><button class="sort-button" data-sort="version">Versão</button><button class="sort-button" data-sort="enabled">Status</button><button class="sort-button" data-sort="featured">Destaque</button><button class="sort-button" data-sort="enabledSwitch">No MaxDeck</button></div>
      <div class="rows" id="rows"><div class="empty">Carregando catálogo…</div></div><div class="footer"><span id="resultCount"></span><span id="saveState">Tudo publicado</span></div>
    </section>
  </div>
  <dialog id="editor"><div class="modalhead"><h2 id="modalTitle">Editar script</h2><button class="iconbtn" id="closeModal" aria-label="Fechar">✕</button></div><div class="modalbody"><div class="formgrid">
    <div class="field"><label>Nome</label><input id="name"></div><div class="field"><label>Arquivo</label><input id="file"></div><div class="field"><label>Versão</label><input id="version"></div><div class="field"><label>Categoria</label><select id="category"><option>TendiChat</option><option>MaxAtendimento</option><option>Outros</option></select></div>
    <div class="field full"><label>Descrição</label><input id="description" placeholder="Descrição do cabeçalho Tampermonkey"></div><div class="field full"><label>Exibição</label><div class="settings-row"><label class="check"><input id="enabled" type="checkbox"> Exibir no MaxDeck</label><label class="check"><input id="featured" type="checkbox"> Script em destaque</label></div></div>
    <div class="field full"><label>Importação</label><div class="import-bar"><div class="import-copy"><strong>Cole o código abaixo ou selecione um arquivo .user.js</strong><span>Nome, versão, descrição e arquivo serão preenchidos pelo cabeçalho.</span></div><div class="top-actions"><button class="ghost" id="parseHeader" type="button">Ler cabeçalho</button><button class="ghost" id="chooseScript" type="button">Selecionar arquivo</button><input id="scriptUpload" type="file" accept=".user.js,text/javascript,application/javascript" hidden></div></div></div>
    <div class="field full"><label>Demonstrações</label><div class="media-editor"><p class="media-help">Até 3 imagens ou GIFs, com no máximo 3 MB cada. O envio acontece somente quando você publicar.</p><div class="media-list" id="mediaList"></div><div class="upload-row"><span class="upload-count" id="mediaCount">0 de 3 mídias</span><button class="ghost" id="chooseMedia" type="button">+ Adicionar imagem ou GIF</button><input id="mediaUpload" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple hidden></div></div></div>
    <div class="field full"><label>Código Tampermonkey</label><textarea class="code" id="code" spellcheck="false"></textarea></div>
  </div></div><div class="modalfoot"><button class="ghost" id="saveMetadata">Salvar metadados</button><button class="primary" id="publishScript">Publicar script</button></div></dialog>
  <dialog class="organizer-dialog" id="organizer"><div class="modalhead"><h2>Organizar MaxDeck</h2><button class="iconbtn" id="closeOrganizer" aria-label="Fechar">✕</button></div><div class="modalbody"><p class="organizer-copy">Arraste os scripts ou use as setas. Esta ordem altera somente o portal público; a tabela administrativa permanece independente.</p><section class="organizer-section"><h3>Destaques</h3><div class="organizer-list" id="featuredOrganizer" data-section="featured"></div></section><section class="organizer-section"><h3>Demais scripts</h3><div class="organizer-list" id="regularOrganizer" data-section="regular"></div></section></div><div class="modalfoot"><button class="ghost" id="cancelOrganizer">Cancelar</button><button class="primary" id="saveOrganizer">Salvar ordem no MaxDeck</button></div></dialog>
  <div class="toast" id="toast"></div>
  <script>
    const portalBase="https://caio-csar.github.io/MaxDeck/";
    const state={items:[],query:"",category:"Todos",status:"all",featuredFilter:"all",sortKey:"name",sortDirection:"asc",editing:-1,isNew:false,dirty:false,editorMedia:[],organizer:{featured:[],regular:[]},dragging:null};
    const byId=(id)=>document.getElementById(id);
    const escapeHtml=(value)=>String(value==null?"":value).replace(/[&<>"']/g,(character)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[character]));
    async function api(path,options){const response=await fetch(path,{cache:"no-store",headers:{"content-type":"application/json"},...(options||{})});let payload={};try{payload=await response.json()}catch{}if(!response.ok)throw new Error(payload.error||"Falha na operação.");return payload}
    function toast(message,isError){const element=byId("toast");element.textContent=message;element.className="toast show"+(isError?" error":"");clearTimeout(toast.timer);toast.timer=setTimeout(()=>element.className="toast",3600)}
    function setDirty(value=true){state.dirty=value;byId("publishCatalog").disabled=!value;byId("saveState").textContent=value?"Alterações ainda não publicadas":"Tudo publicado";byId("saveState").className=value?"dirty":""}
    function nextOrder(featured){return state.items.filter((item)=>item.featured===featured).reduce((maximum,item)=>Math.max(maximum,Number(item.displayOrder)||0),0)+1}
    function compareItems(left,right){let result=0;const key=state.sortKey==="enabledSwitch"?"enabled":state.sortKey;if(key==="version")result=String(left.version).localeCompare(String(right.version),"pt-BR",{numeric:true,sensitivity:"base"});else if(key==="enabled"||key==="featured")result=Number(left[key]===true)-Number(right[key]===true);else result=String(left[key]||"").localeCompare(String(right[key]||""),"pt-BR",{numeric:true,sensitivity:"base"});if(result===0)result=left.name.localeCompare(right.name,"pt-BR",{sensitivity:"base"});return state.sortDirection==="asc"?result:-result}
    function visibleItems(){const query=state.query.trim().toLocaleLowerCase("pt-BR");return state.items.filter((item)=>(state.category==="Todos"||item.category===state.category)&&(state.status==="all"||(state.status==="enabled"?item.enabled!==false:item.enabled===false))&&(state.featuredFilter==="all"||(state.featuredFilter==="featured"?item.featured===true:item.featured!==true))&&(!query||(item.name+" "+item.description+" "+item.file+" "+item.id).toLocaleLowerCase("pt-BR").includes(query))).sort(compareItems)}
    function updateSortHeaders(){document.querySelectorAll("[data-sort]").forEach((button)=>{const active=button.dataset.sort===state.sortKey;button.classList.toggle("active",active);button.innerHTML=escapeHtml(button.dataset.label)+(active?'<span class="sort-arrow">'+(state.sortDirection==="asc"?"↑":"↓")+"</span>":"")})}
    document.querySelectorAll("[data-sort]").forEach((button)=>{button.dataset.label=button.textContent;button.onclick=()=>{const key=button.dataset.sort;if(state.sortKey===key)state.sortDirection=state.sortDirection==="asc"?"desc":"asc";else{state.sortKey=key;state.sortDirection=(key==="enabled"||key==="enabledSwitch"||key==="featured")?"desc":"asc"}render()}});
    function shareUrl(item){return portalBase+"#"+encodeURIComponent(item.id)}
    async function copyText(value){try{await navigator.clipboard.writeText(value)}catch{const input=document.createElement("textarea");input.value=value;document.body.append(input);input.select();document.execCommand("copy");input.remove()}}
    function render(){const items=visibleItems();byId("total").textContent=state.items.length;byId("online").textContent=state.items.filter((item)=>item.enabled!==false).length;byId("offline").textContent=state.items.filter((item)=>item.enabled===false).length;byId("featuredCount").textContent=state.items.filter((item)=>item.featured===true).length;byId("resultCount").textContent=items.length+" script"+(items.length===1?"":"s");byId("rows").innerHTML=items.length?items.map((item)=>{const index=state.items.indexOf(item),enabled=item.enabled!==false;return '<div class="row row-grid"><div class="script"><h3><span class="script-id">'+escapeHtml(item.id)+'</span>'+escapeHtml(item.name)+'</h3><p>'+escapeHtml(item.description||item.file)+(Array.isArray(item.media)&&item.media.length?' · '+item.media.length+' mídia'+(item.media.length===1?'':'s'):'')+'</p></div><span class="badge category">'+escapeHtml(item.category||"Outros")+'</span><span class="version">v'+escapeHtml(item.version)+'</span><span class="badge status '+(enabled?'status-on':'status-off')+'">'+(enabled?'Ativo':'Desativado')+'</span><button class="iconbtn featured" data-feature="'+index+'" title="Alternar destaque" aria-label="Alternar destaque">'+(item.featured?"★":"☆")+'</button><div class="actions"><button class="ghost" data-share="'+index+'" title="Copiar link">Link</button><button class="switch '+(enabled?"on":"")+'" data-toggle="'+index+'" aria-label="Alternar publicação" aria-pressed="'+enabled+'"></button><button class="ghost" data-edit="'+index+'">Editar</button></div></div>'}).join(""):'<div class="empty">Nenhum script encontrado.</div>';document.querySelectorAll("[data-toggle]").forEach((button)=>button.onclick=()=>{const item=state.items[Number(button.dataset.toggle)];item.enabled=!(item.enabled!==false);setDirty();render()});document.querySelectorAll("[data-feature]").forEach((button)=>button.onclick=()=>{const item=state.items[Number(button.dataset.feature)];item.featured=!item.featured;item.displayOrder=nextOrder(item.featured);setDirty();render()});document.querySelectorAll("[data-edit]").forEach((button)=>button.onclick=()=>openEditor(Number(button.dataset.edit)));document.querySelectorAll("[data-share]").forEach((button)=>button.onclick=async()=>{const item=state.items[Number(button.dataset.share)];await copyText(shareUrl(item));toast("Link de "+item.name+" copiado.")});updateSortHeaders()}
    async function load(){try{const payload=await api("/api/catalog");state.items=payload.items.map((item)=>({...item,enabled:item.enabled!==false,featured:item.featured===true,category:item.category||"Outros",description:item.description||"",displayOrder:Number(item.displayOrder)||0,media:Array.isArray(item.media)?item.media:[]}));setDirty(false);render()}catch(error){byId("rows").innerHTML='<div class="empty">'+escapeHtml(error.message)+'</div>';toast(error.message,true)}}
    function mediaUrl(entry){if(entry.preview)return entry.preview;return portalBase+String(entry.path||"").split("/").map(encodeURIComponent).join("/")+"?v="+Date.now()}
    function renderEditorMedia(){byId("mediaCount").textContent=state.editorMedia.length+" de 3 mídias";byId("chooseMedia").disabled=state.editorMedia.length>=3;byId("mediaList").innerHTML=state.editorMedia.length?state.editorMedia.map((entry,index)=>'<div class="media-item"><img src="'+escapeHtml(mediaUrl(entry))+'" alt=""><input data-media-alt="'+index+'" maxlength="180" placeholder="Descrição acessível da mídia" value="'+escapeHtml(entry.alt||"")+'"><div class="media-actions"><button class="ghost" type="button" data-media-up="'+index+'" title="Mover para cima">↑</button><button class="ghost" type="button" data-media-down="'+index+'" title="Mover para baixo">↓</button><button class="ghost" type="button" data-media-remove="'+index+'">Remover</button></div></div>').join(""):'<div class="empty-media">Nenhuma demonstração adicionada.</div>';document.querySelectorAll("[data-media-alt]").forEach((input)=>input.oninput=()=>{state.editorMedia[Number(input.dataset.mediaAlt)].alt=input.value});document.querySelectorAll("[data-media-remove]").forEach((button)=>button.onclick=()=>{state.editorMedia.splice(Number(button.dataset.mediaRemove),1);renderEditorMedia()});document.querySelectorAll("[data-media-up]").forEach((button)=>button.onclick=()=>{const index=Number(button.dataset.mediaUp);if(index>0){[state.editorMedia[index-1],state.editorMedia[index]]=[state.editorMedia[index],state.editorMedia[index-1]];renderEditorMedia()}});document.querySelectorAll("[data-media-down]").forEach((button)=>button.onclick=()=>{const index=Number(button.dataset.mediaDown);if(index<state.editorMedia.length-1){[state.editorMedia[index+1],state.editorMedia[index]]=[state.editorMedia[index],state.editorMedia[index+1]];renderEditorMedia()}})}
    function readFile(file,mode){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error("Não foi possível ler o arquivo."));if(mode==="data")reader.readAsDataURL(file);else reader.readAsText(file)})}
    async function stageMedia(files){for(const file of files){if(state.editorMedia.length>=3){toast("O limite é de 3 mídias por script.",true);break}if(!["image/png","image/jpeg","image/webp","image/gif"].includes(file.type)){toast("Use PNG, JPG, WebP ou GIF.",true);continue}if(file.size>3*1024*1024){toast(file.name+" ultrapassa 3 MB.",true);continue}const preview=await readFile(file,"data");state.editorMedia.push({data:preview.split(",")[1],fileName:file.name,type:file.type,alt:"",preview})}renderEditorMedia();byId("mediaUpload").value="";toast("Mídia preparada. Ela será enviada somente ao publicar.")}
    function headerValue(content,key){const localized=[key+":pt-BR",key+":pt",key];for(const entry of localized){const expression=new RegExp("^\\/\\/\\s*@"+entry+"\\s+(.+?)\\s*$","mi");const match=String(content||"").match(expression);if(match)return match[1].trim()}return""}
    function sanitizeFileName(value){return String(value||"").replace(/[\\/:*?"<>|]/g," ").replace(/\s+/g," ").trim().slice(0,200)+".user.js"}
    function inferCategory(content,name){const value=(String(name||"")+" "+String(content||"")).toLocaleLowerCase("pt-BR");if(value.includes("tendichat"))return"TendiChat";if(value.includes("maxatendimento")||value.includes("maxdata"))return"MaxAtendimento";return"Outros"}
    function fillFromHeader(showMessage=true){const content=byId("code").value;const name=headerValue(content,"name"),version=headerValue(content,"version"),description=headerValue(content,"description");if(!name&&!version&&!description){if(showMessage)toast("Não encontrei metadados no cabeçalho.",true);return false}if(name)byId("name").value=name;if(version)byId("version").value=version;if(description)byId("description").value=description;if(state.isNew&&name){byId("file").value=sanitizeFileName(name);byId("category").value=inferCategory(content,name)}if(showMessage)toast("Informações preenchidas pelo cabeçalho.");return true}
    async function importScript(file){try{const content=await readFile(file,"text");byId("code").value=content;fillFromHeader(false);if(state.isNew&&file.name.toLowerCase().endsWith(".user.js"))byId("file").value=file.name;toast("Script importado e formulário preenchido.")}catch(error){toast(error.message,true)}finally{byId("scriptUpload").value=""}}
    async function openEditor(index){state.isNew=index<0;state.editing=index;const item=state.isNew?{name:"",file:"",version:"1.0.0",category:"Outros",description:"",enabled:true,featured:false,media:[]}:state.items[index];state.editorMedia=(item.media||[]).map((entry)=>({...entry}));byId("modalTitle").textContent=state.isNew?"Novo script":"Editar script";for(const key of ["name","file","version","category","description"])byId(key).value=item[key]||"";byId("enabled").checked=item.enabled!==false;byId("featured").checked=item.featured===true;byId("file").disabled=!state.isNew;byId("saveMetadata").hidden=state.isNew;byId("code").value="";byId("code").placeholder=state.isNew?"Cole aqui o conteúdo completo do .user.js":"Carregando código…";renderEditorMedia();byId("editor").showModal();if(!state.isNew){try{const payload=await api("/api/script?file="+encodeURIComponent(item.file));byId("code").value=payload.content}catch(error){toast(error.message,true)}}}
    function formItem(){const previous=state.isNew?null:state.items[state.editing];const featured=byId("featured").checked;let displayOrder=previous?previous.displayOrder:0;if(previous&&previous.featured!==featured)displayOrder=nextOrder(featured);return{id:previous?previous.id:"",name:byId("name").value,file:byId("file").value,version:byId("version").value,category:byId("category").value,description:byId("description").value,enabled:byId("enabled").checked,featured,displayOrder,media:state.editorMedia.map((entry)=>entry.data?{data:entry.data,fileName:entry.fileName,type:entry.type,alt:entry.alt||""}:{path:entry.path,alt:entry.alt||"",type:entry.type})}}
    function saveMetadata(){const item=formItem();if(!item.name||!item.file.endsWith(".user.js")){toast("Preencha o nome e um arquivo .user.js válido.",true);return false}if(state.isNew)return true;state.items[state.editing]={...state.items[state.editing],...item};setDirty();render();toast("Metadados prontos para publicar.");return true}
    function organizerItems(featured){return state.items.filter((item)=>item.enabled!==false&&item.featured===featured).sort((left,right)=>(Number(left.displayOrder)||999999)-(Number(right.displayOrder)||999999)||left.name.localeCompare(right.name,"pt-BR"))}
    function openOrganizer(){if(state.dirty){toast("Publique ou recarregue as alterações administrativas antes de organizar o MaxDeck.",true);return}state.organizer.featured=organizerItems(true).map((item)=>item.id);state.organizer.regular=organizerItems(false).map((item)=>item.id);renderOrganizer();byId("organizer").showModal()}
    function moveOrganizer(section,id,targetId){const list=state.organizer[section];const from=list.indexOf(id);if(from<0)return;list.splice(from,1);const target=targetId?list.indexOf(targetId):list.length;list.splice(target<0?list.length:target,0,id);renderOrganizer()}
    function renderOrganizerList(section,element){const ids=state.organizer[section];element.innerHTML=ids.length?ids.map((id,index)=>{const item=state.items.find((entry)=>entry.id===id);return '<div class="organizer-item" draggable="true" data-organizer-id="'+escapeHtml(id)+'" data-organizer-section="'+section+'"><span class="drag-handle" title="Arrastar">⋮⋮</span><span class="position">'+String(index+1).padStart(2,"0")+'</span><div class="organizer-name">'+escapeHtml(item.name)+'<small>'+escapeHtml(item.id)+' · '+escapeHtml(item.category)+'</small></div><div class="organizer-move"><button class="ghost" type="button" data-move-up="'+escapeHtml(id)+'" data-section="'+section+'">↑</button><button class="ghost" type="button" data-move-down="'+escapeHtml(id)+'" data-section="'+section+'">↓</button></div></div>'}).join(""):'<div class="empty-media">Nenhum script ativo nesta seção.</div>';element.querySelectorAll("[data-organizer-id]").forEach((row)=>{row.ondragstart=()=>{state.dragging={id:row.dataset.organizerId,section:row.dataset.organizerSection};row.classList.add("dragging")};row.ondragend=()=>{state.dragging=null;row.classList.remove("dragging")};row.ondragover=(event)=>{if(state.dragging&&state.dragging.section===section)event.preventDefault()};row.ondrop=(event)=>{event.preventDefault();if(state.dragging&&state.dragging.section===section)moveOrganizer(section,state.dragging.id,row.dataset.organizerId)}});element.querySelectorAll("[data-move-up]").forEach((button)=>button.onclick=()=>{const list=state.organizer[button.dataset.section],index=list.indexOf(button.dataset.moveUp);if(index>0){[list[index-1],list[index]]=[list[index],list[index-1]];renderOrganizer()}});element.querySelectorAll("[data-move-down]").forEach((button)=>button.onclick=()=>{const list=state.organizer[button.dataset.section],index=list.indexOf(button.dataset.moveDown);if(index>=0&&index<list.length-1){[list[index+1],list[index]]=[list[index],list[index+1]];renderOrganizer()}});element.ondragover=(event)=>{if(state.dragging&&state.dragging.section===section)event.preventDefault()};element.ondrop=(event)=>{if(event.target===element&&state.dragging&&state.dragging.section===section){event.preventDefault();moveOrganizer(section,state.dragging.id,null)}}}
    function renderOrganizer(){renderOrganizerList("featured",byId("featuredOrganizer"));renderOrganizerList("regular",byId("regularOrganizer"))}
    async function saveOrganizer(){for(const section of ["featured","regular"])state.organizer[section].forEach((id,index)=>{const item=state.items.find((entry)=>entry.id===id);if(item)item.displayOrder=index+1});try{byId("saveOrganizer").disabled=true;byId("saveOrganizer").textContent="Salvando…";const payload=await api("/api/catalog",{method:"PUT",body:JSON.stringify({items:state.items,message:"Organizar exibição pública do MaxDeck"})});state.items=payload.items;setDirty(false);byId("organizer").close();render();toast("Ordem pública salva. O portal será atualizado em instantes.")}catch(error){toast(error.message,true)}finally{byId("saveOrganizer").disabled=false;byId("saveOrganizer").textContent="Salvar ordem no MaxDeck"}}
    byId("search").oninput=(event)=>{state.query=event.target.value;render()};byId("statusFilter").onchange=(event)=>{state.status=event.target.value;render()};byId("featuredFilter").onchange=(event)=>{state.featuredFilter=event.target.value;render()};byId("clearFilters").onclick=()=>{state.query="";state.status="all";state.featuredFilter="all";state.category="Todos";byId("search").value="";byId("statusFilter").value="all";byId("featuredFilter").value="all";document.querySelectorAll(".chip").forEach((chip)=>chip.classList.toggle("active",chip.textContent==="Todos"));render()};
    byId("chooseMedia").onclick=()=>byId("mediaUpload").click();byId("mediaUpload").onchange=(event)=>stageMedia([...event.target.files]);byId("chooseScript").onclick=()=>byId("scriptUpload").click();byId("scriptUpload").onchange=(event)=>{if(event.target.files[0])importScript(event.target.files[0])};byId("parseHeader").onclick=()=>fillFromHeader();byId("code").addEventListener("paste",()=>setTimeout(()=>fillFromHeader(false),0));
    ["Todos","TendiChat","MaxAtendimento","Outros"].forEach((category)=>{const button=document.createElement("button");button.className="chip"+(category==="Todos"?" active":"");button.textContent=category;button.onclick=()=>{state.category=category;document.querySelectorAll(".chip").forEach((chip)=>chip.classList.toggle("active",chip===button));render()};byId("filters").append(button)});
    byId("newScript").onclick=()=>openEditor(-1);byId("closeModal").onclick=()=>byId("editor").close();byId("saveMetadata").onclick=()=>{if(saveMetadata())byId("editor").close()};byId("organizePortal").onclick=openOrganizer;byId("closeOrganizer").onclick=()=>byId("organizer").close();byId("cancelOrganizer").onclick=()=>byId("organizer").close();byId("saveOrganizer").onclick=saveOrganizer;
    byId("publishCatalog").onclick=async()=>{try{byId("publishCatalog").disabled=true;byId("publishCatalog").textContent="Publicando…";const payload=await api("/api/catalog",{method:"PUT",body:JSON.stringify({items:state.items})});state.items=payload.items;setDirty(false);render();toast("Catálogo publicado com sucesso.")}catch(error){setDirty();toast(error.message,true)}finally{byId("publishCatalog").textContent="Publicar alterações"}};
    byId("publishScript").onclick=async()=>{if(!saveMetadata())return;const item=formItem(),content=byId("code").value;if(!/^\/\/\s*==UserScript==\s*$/m.test(content)||!/^\/\/\s*==\/UserScript==\s*$/m.test(content)){toast("O código não tem um cabeçalho Tampermonkey completo.",true);return}try{byId("publishScript").disabled=true;byId("publishScript").textContent="Publicando…";await api("/api/script",{method:state.isNew?"POST":"PUT",body:JSON.stringify({...item,content})});byId("editor").close();await load();toast("Script e catálogo publicados juntos com sucesso.")}catch(error){toast(error.message,true)}finally{byId("publishScript").disabled=false;byId("publishScript").textContent="Publicar script"}};
    load();
  </script>
</body>
</html>`;
