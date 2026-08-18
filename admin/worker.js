addEventListener("fetch", (event) => {
  event.respondWith(handleRequest(event.request));
});

const REPOSITORY = "caio-csar/MaxDeck";
const BRANCH = "main";
const CATALOG_PATH = "site/catalog.json";
const SCRIPTS_PATH = "site/scripts";
const PUBLIC_SCRIPT_BASE = "https://caio-csar.github.io/MaxDeck/scripts/";
const textEncoder = new TextEncoder();

async function secureEqual(value, expected) {
  const [valueHash, expectedHash] = await Promise.all([
    crypto.subtle.digest("SHA-256", textEncoder.encode(value)),
    crypto.subtle.digest("SHA-256", textEncoder.encode(expected)),
  ]);
  const left = new Uint8Array(valueHash);
  const right = new Uint8Array(expectedHash);
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
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
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init.headers || {}),
    },
  });
  if (!response.ok) {
    let details = `GitHub respondeu ${response.status}`;
    try {
      const payload = await response.json();
      details = payload.message || details;
    } catch {}
    throw new Error(details);
  }
  return response;
}

function encodeBase64(value) {
  const bytes = textEncoder.encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeBase64(value) {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function readRepositoryFile(path) {
  const response = await github(`/repos/${REPOSITORY}/contents/${encodePath(path)}?ref=${BRANCH}`);
  const payload = await response.json();
  return { content: decodeBase64(payload.content), sha: payload.sha };
}

async function writeRepositoryFile(path, content, message, sha) {
  const payload = {
    message,
    content: encodeBase64(content),
    branch: BRANCH,
  };
  if (sha) payload.sha = sha;
  const response = await github(`/repos/${REPOSITORY}/contents/${encodePath(path)}`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  return response.json();
}

function encodePath(path) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function cleanText(value, maximum = 160) {
  return String(value || "").trim().slice(0, maximum);
}

function normalizeItem(item) {
  const name = cleanText(item.name, 180);
  const file = cleanText(item.file, 220);
  const version = cleanText(item.version, 40) || "1.0.0";
  const categories = ["TendiChat", "MaxAtendimento", "Outros"];
  const category = categories.includes(item.category) ? item.category : "Outros";
  if (!name || !file.endsWith(".user.js") || file.includes("/") || file.includes("\\")) {
    throw new Error("Nome ou arquivo inválido.");
  }
  return {
    name,
    version,
    file,
    description: cleanText(item.description, 280),
    category,
    enabled: item.enabled !== false,
    featured: item.featured === true,
  };
}

function addUpdateMetadata(source, file, version) {
  const publicUrl = `${PUBLIC_SCRIPT_BASE}${encodeURIComponent(file)}`;
  let content = String(source || "").replace(/^\uFEFF/, "");
  if (!content.includes("==UserScript==")) throw new Error("O arquivo não contém um cabeçalho Tampermonkey válido.");
  if (/^\/\/\s*@version\s+.*$/m.test(content)) {
    content = content.replace(/^\/\/\s*@version\s+.*$/m, `// @version      ${version}`);
  }
  content = content.replace(/^\/\/\s*@downloadURL\s+.*$/gm, "").replace(/^\/\/\s*@updateURL\s+.*$/gm, "");
  const lines = `// @downloadURL ${publicUrl}\n// @updateURL ${publicUrl}`;
  if (/^\/\/\s*@version\s+.*$/m.test(content)) {
    return content.replace(/^(\/\/\s*@version\s+.*)$/m, `$1\n${lines}`);
  }
  return content.replace("// ==/UserScript==", `${lines}\n// ==/UserScript==`);
}

async function getCatalog() {
  const file = await readRepositoryFile(CATALOG_PATH);
  return { items: JSON.parse(file.content), sha: file.sha };
}

async function handleApi(request, url) {
  if (url.pathname === "/api/catalog" && request.method === "GET") {
    return json(await getCatalog());
  }

  if (url.pathname === "/api/catalog" && request.method === "PUT") {
    const body = await request.json();
    if (!Array.isArray(body.items) || body.items.length > 250) throw new Error("Catálogo inválido.");
    const items = body.items.map(normalizeItem);
    const current = await readRepositoryFile(CATALOG_PATH);
    await writeRepositoryFile(
      CATALOG_PATH,
      `${JSON.stringify(items, null, 2)}\n`,
      "Atualizar catálogo pelo MaxDeck Admin",
      current.sha,
    );
    return json({ ok: true, items });
  }

  if (url.pathname === "/api/script" && request.method === "GET") {
    const file = cleanText(url.searchParams.get("file"), 220);
    if (!file.endsWith(".user.js") || file.includes("/") || file.includes("\\")) throw new Error("Arquivo inválido.");
    return json(await readRepositoryFile(`${SCRIPTS_PATH}/${file}`));
  }

  if (url.pathname === "/api/script" && request.method === "PUT") {
    const body = await request.json();
    const item = normalizeItem(body);
    const current = await readRepositoryFile(`${SCRIPTS_PATH}/${item.file}`);
    const content = addUpdateMetadata(body.content, item.file, item.version);
    await writeRepositoryFile(
      `${SCRIPTS_PATH}/${item.file}`,
      content,
      `Atualizar ${item.name} para ${item.version}`,
      current.sha,
    );
    return json({ ok: true });
  }

  if (url.pathname === "/api/script" && request.method === "POST") {
    const body = await request.json();
    const item = normalizeItem(body);
    const content = addUpdateMetadata(body.content, item.file, item.version);
    await writeRepositoryFile(`${SCRIPTS_PATH}/${item.file}`, content, `Adicionar ${item.name}`);
    const catalog = await getCatalog();
    if (catalog.items.some((entry) => entry.file === item.file)) throw new Error("Esse script já existe no catálogo.");
    const items = [...catalog.items.map(normalizeItem), item];
    await writeRepositoryFile(
      CATALOG_PATH,
      `${JSON.stringify(items, null, 2)}\n`,
      `Adicionar ${item.name} ao catálogo`,
      catalog.sha,
    );
    return json({ ok: true, item }, 201);
  }

  return json({ error: "Rota não encontrada." }, 404);
}

async function handleRequest(request) {
  if (!(await isAuthorized(request))) return unauthorized();
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith("/api/")) return await handleApi(request, url);
    if (url.pathname !== "/") return new Response("Não encontrado", { status: 404 });
    return new Response(ADMIN_HTML, {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
        "content-security-policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
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
    :root{--bg:#f4f2ec;--surface:#fff;--ink:#17201c;--muted:#68736d;--line:#dfe4df;--green:#176b52;--green2:#e4f4eb;--amber:#9a6700;--danger:#b42318;--shadow:0 18px 50px rgba(25,43,35,.08)}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 Arial,sans-serif}.shell{max-width:1240px;margin:auto;padding:34px 28px 70px}.topbar{display:flex;justify-content:space-between;align-items:center;gap:20px}.brand{display:flex;align-items:center;gap:13px}.mark{display:grid;place-items:center;width:42px;height:42px;border-radius:11px;background:var(--ink);color:#fff;font-weight:900}.brand h1{margin:0;font:500 27px Georgia,serif}.brand p{margin:1px 0 0;color:var(--muted)}button{font:inherit}.primary,.secondary,.ghost,.iconbtn{border:0;border-radius:8px;cursor:pointer;font-weight:700}.primary{padding:11px 16px;background:var(--green);color:white}.secondary{padding:10px 14px;background:var(--ink);color:white}.ghost{padding:9px 12px;background:#eef1ee;color:var(--ink)}.iconbtn{padding:7px 9px;background:transparent}.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:28px 0}.stat{padding:18px;border:1px solid var(--line);border-radius:12px;background:var(--surface)}.stat b{display:block;font-size:26px}.stat span{color:var(--muted);font-size:12px}.panel{border:1px solid var(--line);border-radius:14px;background:var(--surface);box-shadow:var(--shadow);overflow:hidden}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:17px;border-bottom:1px solid var(--line)}.search{flex:1;max-width:430px;padding:11px 13px;border:1px solid var(--line);border-radius:8px;font:inherit}.filters{display:flex;gap:6px;flex-wrap:wrap;padding:13px 17px;border-bottom:1px solid var(--line)}.chip{padding:7px 12px;border:1px solid var(--line);border-radius:99px;background:#fff;cursor:pointer}.chip.active{background:var(--ink);color:#fff;border-color:var(--ink)}.rows{min-height:280px}.row{display:grid;grid-template-columns:minmax(260px,1.7fr) 130px 90px 105px 130px;gap:16px;align-items:center;padding:15px 18px;border-bottom:1px solid #edf0ed}.row:last-child{border-bottom:0}.script h3{margin:0 0 4px;font-size:15px}.script p{margin:0;color:var(--muted);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.badge{width:max-content;padding:5px 8px;border-radius:6px;background:#eff2ef;color:#536058;font-size:11px;font-weight:700}.featured{color:var(--amber);font-size:20px}.switch{position:relative;width:42px;height:24px;border:0;border-radius:99px;background:#bbc3be;cursor:pointer}.switch:after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:.18s}.switch.on{background:var(--green)}.switch.on:after{transform:translateX(18px)}.actions{display:flex;justify-content:flex-end;gap:5px}.footer{display:flex;justify-content:space-between;align-items:center;padding:14px 18px;color:var(--muted)}.dirty{color:var(--amber);font-weight:700}.empty{padding:60px;text-align:center;color:var(--muted)}dialog{width:min(900px,calc(100vw - 32px));max-height:90vh;border:0;border-radius:16px;padding:0;box-shadow:0 30px 100px rgba(0,0,0,.24)}dialog::backdrop{background:rgba(16,24,20,.55)}.modalhead{display:flex;justify-content:space-between;align-items:center;padding:20px 24px;border-bottom:1px solid var(--line)}.modalhead h2{margin:0;font:500 25px Georgia,serif}.modalbody{padding:22px 24px;overflow:auto;max-height:calc(90vh - 140px)}.formgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.field{display:grid;gap:6px}.field.full{grid-column:1/-1}.field label{font-size:12px;font-weight:700}.field input,.field select,.field textarea{width:100%;border:1px solid var(--line);border-radius:8px;padding:10px;font:inherit}.field textarea.code{height:330px;font:12px/1.45 Consolas,monospace;resize:vertical}.modalfoot{display:flex;justify-content:flex-end;gap:9px;padding:16px 24px;border-top:1px solid var(--line)}.toast{position:fixed;right:25px;bottom:25px;padding:13px 16px;border-radius:9px;background:var(--ink);color:#fff;box-shadow:var(--shadow);opacity:0;transform:translateY(12px);pointer-events:none;transition:.2s}.toast.show{opacity:1;transform:none}.toast.error{background:var(--danger)}@media(max-width:800px){.overview{grid-template-columns:1fr 1fr}.toolbar{align-items:stretch;flex-direction:column}.search{max-width:none}.row{grid-template-columns:1fr 80px 85px}.row .category,.row .version{display:none}.actions{justify-content:flex-start}.topbar{align-items:flex-start;flex-direction:column}.formgrid{grid-template-columns:1fr}.field.full{grid-column:auto}}
  </style>
</head>
<body>
  <div class="shell">
    <header class="topbar"><div class="brand"><div class="mark">M</div><div><h1>MaxDeck Admin</h1><p>Controle o catálogo e publique scripts.</p></div></div><button class="primary" id="newScript">+ Novo script</button></header>
    <section class="overview"><div class="stat"><b id="total">—</b><span>Total de scripts</span></div><div class="stat"><b id="online">—</b><span>Visíveis no portal</span></div><div class="stat"><b id="offline">—</b><span>Ocultos</span></div><div class="stat"><b id="featuredCount">—</b><span>Em destaque</span></div></section>
    <section class="panel"><div class="toolbar"><input class="search" id="search" placeholder="Buscar por nome, descrição ou arquivo"><button class="secondary" id="publishCatalog" disabled>Publicar alterações</button></div><div class="filters" id="filters"></div><div class="rows" id="rows"><div class="empty">Carregando catálogo…</div></div><div class="footer"><span id="resultCount"></span><span id="saveState">Tudo publicado</span></div></section>
  </div>
  <dialog id="editor"><div class="modalhead"><h2 id="modalTitle">Editar script</h2><button class="iconbtn" id="closeModal" aria-label="Fechar">✕</button></div><div class="modalbody"><div class="formgrid"><div class="field"><label>Nome</label><input id="name"></div><div class="field"><label>Arquivo</label><input id="file"></div><div class="field"><label>Versão</label><input id="version"></div><div class="field"><label>Categoria</label><select id="category"><option>TendiChat</option><option>MaxAtendimento</option><option>Outros</option></select></div><div class="field full"><label>Descrição</label><input id="description" placeholder="Explique em uma frase o que o script faz"></div><div class="field full"><label>Código Tampermonkey</label><textarea class="code" id="code" spellcheck="false"></textarea></div></div></div><div class="modalfoot"><button class="ghost" id="saveMetadata">Salvar metadados</button><button class="primary" id="publishScript">Publicar script</button></div></dialog>
  <div class="toast" id="toast"></div>
  <script>
    const state={items:[],category:"Todos",query:"",dirty:false,editing:-1,isNew:false};
    const byId=(id)=>document.getElementById(id);
    const escapeHtml=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
    async function api(path,options={}){const response=await fetch(path,{...options,headers:{"content-type":"application/json",...(options.headers||{})}});const payload=await response.json();if(!response.ok)throw new Error(payload.error||"Não foi possível concluir a operação.");return payload}
    function toast(message,error=false){const element=byId("toast");element.textContent=message;element.className="toast show"+(error?" error":"");setTimeout(()=>element.className="toast",3200)}
    function setDirty(value=true){state.dirty=value;byId("publishCatalog").disabled=!value;byId("saveState").textContent=value?"Alterações ainda não publicadas":"Tudo publicado";byId("saveState").className=value?"dirty":""}
    function visibleItems(){const query=state.query.toLowerCase();return state.items.filter((item)=>(state.category==="Todos"||item.category===state.category)&&[item.name,item.description||"",item.file].join(" ").toLowerCase().includes(query))}
    function render(){const items=visibleItems();byId("total").textContent=state.items.length;byId("online").textContent=state.items.filter((item)=>item.enabled!==false).length;byId("offline").textContent=state.items.filter((item)=>item.enabled===false).length;byId("featuredCount").textContent=state.items.filter((item)=>item.featured===true).length;byId("resultCount").textContent=items.length+" script"+(items.length===1?"":"s");byId("rows").innerHTML=items.length?items.map((item)=>{const index=state.items.indexOf(item);return '<div class="row"><div class="script"><h3>'+escapeHtml(item.name)+'</h3><p>'+escapeHtml(item.description||item.file)+'</p></div><span class="badge category">'+escapeHtml(item.category||"Outros")+'</span><span class="version">v'+escapeHtml(item.version)+'</span><button class="iconbtn featured" data-feature="'+index+'" title="Alternar destaque">'+(item.featured?"★":"☆")+'</button><div class="actions"><button class="switch '+(item.enabled!==false?"on":"")+'" data-toggle="'+index+'" aria-label="Alternar visibilidade"></button><button class="ghost" data-edit="'+index+'">Editar</button></div></div>'}).join(""):'<div class="empty">Nenhum script encontrado.</div>';document.querySelectorAll("[data-toggle]").forEach((button)=>button.onclick=()=>{const item=state.items[Number(button.dataset.toggle)];item.enabled=!item.enabled;setDirty();render()});document.querySelectorAll("[data-feature]").forEach((button)=>button.onclick=()=>{const item=state.items[Number(button.dataset.feature)];item.featured=!item.featured;setDirty();render()});document.querySelectorAll("[data-edit]").forEach((button)=>button.onclick=()=>openEditor(Number(button.dataset.edit)))}
    async function load(){try{const payload=await api("/api/catalog");state.items=payload.items.map((item)=>({...item,enabled:item.enabled!==false,featured:item.featured===true,category:item.category||"Outros",description:item.description||""}));render()}catch(error){byId("rows").innerHTML='<div class="empty">'+escapeHtml(error.message)+'</div>';toast(error.message,true)}}
    async function openEditor(index){state.isNew=index<0;state.editing=index;const item=state.isNew?{name:"",file:"",version:"1.0.0",category:"Outros",description:"",enabled:true,featured:false}:state.items[index];byId("modalTitle").textContent=state.isNew?"Novo script":"Editar script";for(const key of ["name","file","version","category","description"])byId(key).value=item[key]||"";byId("file").disabled=!state.isNew;byId("code").value="";byId("code").placeholder="Carregando código…";byId("editor").showModal();if(!state.isNew){try{const payload=await api("/api/script?file="+encodeURIComponent(item.file));byId("code").value=payload.content}catch(error){toast(error.message,true)}}else{byId("code").placeholder="Cole aqui o conteúdo completo do .user.js"}}
    function formItem(){return{name:byId("name").value,file:byId("file").value,version:byId("version").value,category:byId("category").value,description:byId("description").value,enabled:state.isNew?true:state.items[state.editing].enabled,featured:state.isNew?false:state.items[state.editing].featured}}
    function saveMetadata(){const item=formItem();if(!item.name||!item.file.endsWith(".user.js")){toast("Preencha o nome e um arquivo .user.js válido.",true);return false}if(state.isNew)return true;state.items[state.editing]={...state.items[state.editing],...item};setDirty();render();toast("Metadados prontos para publicar.");return true}
    byId("search").oninput=(event)=>{state.query=event.target.value;render()};
    ["Todos","TendiChat","MaxAtendimento","Outros"].forEach((category)=>{const button=document.createElement("button");button.className="chip"+(category==="Todos"?" active":"");button.textContent=category;button.onclick=()=>{state.category=category;document.querySelectorAll(".chip").forEach((chip)=>chip.classList.toggle("active",chip===button));render()};byId("filters").append(button)});
    byId("newScript").onclick=()=>openEditor(-1);byId("closeModal").onclick=()=>byId("editor").close();byId("saveMetadata").onclick=()=>{if(saveMetadata()&&!state.isNew)byId("editor").close()};
    byId("publishCatalog").onclick=async()=>{try{byId("publishCatalog").disabled=true;byId("publishCatalog").textContent="Publicando…";const payload=await api("/api/catalog",{method:"PUT",body:JSON.stringify({items:state.items})});state.items=payload.items;setDirty(false);render();toast("Catálogo publicado com sucesso.")}catch(error){setDirty();toast(error.message,true)}finally{byId("publishCatalog").textContent="Publicar alterações"}};
    byId("publishScript").onclick=async()=>{if(!saveMetadata())return;const item=formItem();const content=byId("code").value;if(!content.includes("==UserScript==")){toast("O código não tem um cabeçalho Tampermonkey válido.",true);return}try{byId("publishScript").disabled=true;byId("publishScript").textContent="Publicando…";await api("/api/script",{method:state.isNew?"POST":"PUT",body:JSON.stringify({...item,content})});if(!state.isNew){state.items[state.editing]={...state.items[state.editing],...item};setDirty()}byId("editor").close();await load();toast("Script publicado com sucesso.")}catch(error){toast(error.message,true)}finally{byId("publishScript").disabled=false;byId("publishScript").textContent="Publicar script"}};
    load();
  </script>
</body>
</html>`;
