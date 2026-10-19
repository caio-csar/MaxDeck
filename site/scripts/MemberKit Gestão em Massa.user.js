// ==UserScript==
// @name         MemberKit | Gestão em Massa
// @namespace    https://maxdata-sistema.memberkit.com.br/
// @version      3.3.2
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MemberKit%20Gest%C3%A3o%20em%20Massa.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MemberKit%20Gest%C3%A3o%20em%20Massa.user.js
// @description  Gestão em massa consolidada: conferência de assinaturas e identificação precisa de sessão expirada.
// @match        https://maxdata-sistema.memberkit.com.br/members*
// @match        https://maxdata-sistema.memberkit.com.br/membership_levels*
// @grant        none
// @run-at       document-idle
// ==/UserScript==
(() => {
  'use strict';
  if (window.__mkBulk19) return;
  window.__mkBulk19 = true;
  const ROOT = location.origin;
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // Ritmo conservador. Não contorna limites do serviço: pausa e desiste se persistirem.
  const PACE_MS = 800; // Intervalo padrão, mantido em operações comuns.
  let nextRequestAt = 0;
  let pacingGate=Promise.resolve(); // agendamento sequencial: 800 ms entre inícios
  const perf = {requests:0,networkMs:0,paceMs:0,server429:0,completed:0,started:0};
  // Diagnóstico apenas em memória: nunca registra URLs completas, tokens ou corpos.
  const flowDiag={read:{count:0,ms:0},save:{count:0,ms:0},verify:{count:0,ms:0},redirects:0,redirectTargets:{},manualOpaque:0};
  let flowPhase=null;
  // Telemetria em memória, sem identificadores, URLs, tokens ou dados pessoais.
  const scheduleDiag={calls:[],members:[],lastRequestStart:null};
  const diagMemberLimit=1000;
  // Métricas passivas em memória, sem requisições adicionais.
  const lab={calls:[],inFlight:0,peakInFlight:0,overlapMs:0,lastEnd:null,timerOvershootMs:0,timerOvershootMaxMs:0,timerOvershootEvents:0};


  const safeDestination=(url)=>{
    try{
      const p=new URL(url,ROOT).pathname;
      if(p==='/members')return '/members';
      if(/^\/members\/\d+\/edit\/?$/.test(p))return '/members/{id}/edit';
      if(/^\/members\/\d+\/?$/.test(p))return '/members/{id}';
      return 'outro caminho interno';
    }catch{return 'não identificado';}
  };
  const stamp=()=> (typeof performance!== 'undefined' ? performance.now() : Date.now());
  // Usa tempo real decorrido. Em abas em segundo plano, um timer pedido para
  // 250 ms pode despertar após 1000+ ms; não se deve cobrar esse atraso de novo.
  const waitInterruptible = async (ms, ignoreStop=false) => {
    const until = stamp() + Math.max(0, ms);
    while(true) {
      if(state.stop && !ignoreStop) throw Error('Operação interrompida pelo usuário');
      const remaining = until - stamp();
      if(remaining <= 0) return;
      const requested=Math.min(remaining, 250);
      const beforeTimer=stamp();
      await wait(requested);
      const extra=Math.max(0, stamp()-beforeTimer-requested);
      if(extra>100) { lab.timerOvershootEvents++;lab.timerOvershootMs+=extra;lab.timerOvershootMaxMs=Math.max(lab.timerOvershootMaxMs,extra); }
    }
  };
  const after429 = (response, attempt) => {
    const raw=response.headers.get('Retry-After');
    let ms=NaN;
    if(raw && /^\d+(?:\.\d+)?$/.test(raw.trim())) ms=Number(raw)*1000;
    else if(raw) {const date=Date.parse(raw);if(Number.isFinite(date))ms=date-Date.now();}
    // Caso não haja cabeçalho, espera longa e crescente, sem sobrecarregar o serviço.
    if(!Number.isFinite(ms)) ms=15000*(attempt+1);
    return Math.max(5000,Math.min(ms,120000));
  };
  const pacedFetch = async (url, opts={}, {allowRetry=true,phase=null,finishCurrent=false}={}) => {
    const u=new URL(url, ROOT);
    if(u.origin!==ROOT)throw Error('URL fora do domínio autorizado');
    const attempts=allowRetry ? 3 : 1;
    for(let attempt=0;attempt<attempts;attempt++) {
      let measuredWait=0;
      const requestedAt=stamp();
      let gateEnteredAt=0;
      const reservation=pacingGate.then(async()=>{
        gateEnteredAt=stamp();
        const paceWait=Math.max(0,nextRequestAt-stamp());
        if(paceWait){const wt=stamp();await waitInterruptible(paceWait,finishCurrent);measuredWait=stamp()-wt;perf.paceMs+=measuredWait;}
        if(state.stop && !finishCurrent)throw Error('Operação interrompida pelo usuário');
        nextRequestAt=stamp()+PACE_MS;
      });
      pacingGate=reservation.catch(()=>{});
      await reservation;
      const began=stamp();
      const queueWait=Math.max(0,gateEnteredAt-requestedAt);
      const totalSchedulingWait=Math.max(0,began-requestedAt);
      const overlap=lab.inFlight>0;
      lab.inFlight++;
      lab.peakInFlight=Math.max(lab.peakInFlight,lab.inFlight);
      const recordedPhase=phase||flowPhase||'other';
      const sincePrevious=scheduleDiag.lastRequestStart===null?null:began-scheduleDiag.lastRequestStart;
      scheduleDiag.lastRequestStart=began;
      let response;
      try { response=await fetch(u.href,{credentials:'same-origin',redirect:'follow',...opts}); }
      finally {lab.inFlight=Math.max(0,lab.inFlight-1);lab.lastEnd=stamp();}
      const duration=stamp()-began;
      perf.requests++;perf.networkMs+=duration;
      if(lab.calls.length<4000)lab.calls.push({phase:recordedPhase,queueMs:Math.round(queueWait),paceMs:Math.round(measuredWait),scheduleMs:Math.round(totalSchedulingWait),networkMs:Math.round(duration),overlap:overlap?1:0,redirectType:response.type==='opaqueredirect'?'opaque':response.redirected?'followed':'direct',gapMs:sincePrevious===null?null:Math.round(sincePrevious)});
      if(scheduleDiag.calls.length<4000)scheduleDiag.calls.push({phase:recordedPhase,waitMs:Math.round(measuredWait),netMs:Math.round(duration),startGapMs:sincePrevious===null?null:Math.round(sincePrevious),status:response.type==='opaqueredirect'?'opaque':response.status});
      if(recordedPhase && flowDiag[recordedPhase]){
        flowDiag[recordedPhase].count++;
        flowDiag[recordedPhase].ms+=duration;
        if(recordedPhase==='save' && response.type==='opaqueredirect'){
          flowDiag.manualOpaque++;
        }
        if(recordedPhase==='save' && response.redirected){
          flowDiag.redirects++;
          const dest=safeDestination(response.url);
          flowDiag.redirectTargets[dest]=(flowDiag.redirectTargets[dest]||0)+1;
        }
      }
      if(response.status!==429)return response;
      perf.server429++;
      if(!allowRetry)throw Error('HTTP 429 ao salvar: envio não repetido por segurança. Confira o membro no portal antes de retomar.');
      if(attempt===attempts-1)throw Error('HTTP 429 persistente: servidor limitou as consultas. Pare e tente novamente mais tarde.');
      const delay=after429(response,attempt);
      log(`HTTP 429 em ${u.pathname}: aguardando ${Math.ceil(delay/1000)}s antes de tentar a leitura novamente (${attempt+1}/2).`);
      nextRequestAt=stamp()+delay;
      await waitInterruptible(delay);
    }
  };
  const $ = (q, el=document) => el.querySelector(q);
  const $$ = (q, el=document) => [...el.querySelectorAll(q)];
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const state = {lastMetrics:null, users:[], checked:[], report:[], levels:[], stop:false, busy:false, complete:false, pages:0, listAt:0, selectedIds:new Set(), selectionMode:"all"};
  // Somente memória da aba; não armazena nomes, tokens, formulários ou dados pessoais.
  const snapshot = new Map();
  const filterCache = new Map(); // Somente IDs e status dos filtros, 10 minutos; nenhuma credencial.
  const FILTER_TTL = 10*60*1000;
  const CACHE_TTL = 10 * 60 * 1000;
  // Dados exclusivamente em memória durante a página atual. Sem localStorage / sessionStorage.
  let currentJob=null;
  const historyRows=[];
  const historyRecords=()=>historyRows;
  function addHistory(row){historyRows.unshift({...row,at:new Date().toISOString()});}
  const jobRead=()=>currentJob;
  function jobWrite(job){currentJob=job;}
  function jobClear(){currentJob=null;}
  function paintJob(){} // Recurso de retomada desativado; não há armazenamento entre páginas.
  function paintHistory(){}
  function storeList(){} // A lista vem diretamente do portal a cada página aberta.
  function restoreList(){return false;}
  function fillLevels(){const sel=get('level'),old=sel.value;sel.replaceChildren(new Option('Selecione uma assinatura',''),...state.levels.map(([id,name])=>new Option(`${name} · ${id}`,id)));if([...sel.options].some(o=>o.value===old))sel.value=old;}
  function refreshMembers(){
    const sel=get('member-id'),search=get('member-search').value.trim().toLocaleLowerCase('pt-BR'),old=sel.value;
    const matches=state.users.filter(u=> !search || u.name.toLocaleLowerCase('pt-BR').includes(search) || u.id.includes(search)).slice(0,150);
    sel.replaceChildren(new Option(search?'Selecione um resultado':'Selecione um membro',''),...matches.map(u=>new Option(`${u.name} · ${u.id}`,u.id)));
    if(matches.some(u=>u.id===old))sel.value=old;
    get('member-hint').textContent=`${matches.length} exibido(s)${matches.length===150?' (refine o nome)':''} · ${state.users.length} na lista`;
  }
  const cacheFresh = id => { const x=snapshot.get(String(id)); return x && Date.now()-x.at<CACHE_TTL ? x : null; };
  function remember(id,doc) {
    const blocked=blockState(doc);
    const levels={};
    for(const m of memberships(doc)) if(/^\d+$/.test(m.id)) levels[m.id]={status:m.status,linked:!!m.link,valid:!!m.fields.status && m.fields.status.tagName==='SELECT',options:[...m.fields.status?.options||[]].map(x=>x.value)};
    snapshot.set(String(id),{at:Date.now(),blocked,levels});
  }
  function identifySnapshot(snap,level,desired) {
    if(snap.blocked==='blocked')return {kind:'blocked',message:'Usuário bloqueado'};
    if(snap.blocked!=='allowed')return {kind:'error',message:'Bloqueio não verificável'};
    const m=snap.levels[level];
    if(!m)return {kind:'error',message:'Assinatura não encontrada'};
    if(!m.valid||!m.options.includes(desired))return {kind:'error',message:'Status não suportado no formulário'};
    if(!m.linked&&!m.status&&desired!=='active')return {kind:'not_linked',message:'Sem vínculo: criação ignorada para '+desired};
    return m.status===desired?{kind:'matched'}:{kind:'pending'};
  }
  const css = document.createElement('style');
  css.textContent = `
#mk-bulk-launch{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:9px 14px;border:1px solid #cdd5df;border-radius:7px;background:var(--card,#fff);color:var(--foreground,#172033);font:600 13px system-ui;cursor:pointer;box-shadow:0 1px 2px #0001}#mk-bulk-launch:hover{border-color:#a00000;color:#a00000}
#mk-bulk-panel{position:fixed;inset:0 0 0 auto;z-index:2147483645;width:min(440px,100vw);height:100dvh;display:flex;flex-direction:column;background:#fafbfe;color:#152238;border-left:1px solid #d9dfe9;box-shadow:-12px 0 45px #0003;font:13px/1.5 system-ui,Arial;transition:transform .2s ease;transform:translateX(102%)}
#mk-bulk-panel.mk-open{transform:translateX(0)}#mk-bulk-panel *{box-sizing:border-box}#mk-bulk-panel .mk-head{background:#111823;color:white;padding:18px 20px;display:flex;align-items:center;justify-content:space-between;gap:12px}#mk-bulk-panel h3{margin:0;font-size:16px;line-height:1.3}#mk-bulk-panel .mk-sub{font-size:11px;color:#b6c0d0}#mk-bulk-panel .mk-content{overflow:auto;flex:1;padding:20px}#mk-bulk-panel p{margin:7px 0;color:#506075}#mk-bulk-panel input.mk-input{width:100%;padding:10px;border:1px solid #ccd5e2;border-radius:7px;color:#152238;background:#fff;margin:5px 0 9px}#mk-bulk-panel select{width:100%;margin:5px 0 9px;padding:10px;border:1px solid #ccd5e2;border-radius:7px;background:#fff;color:#152238}#mk-bulk-panel button{cursor:pointer;border:1px solid #cdd5e2;border-radius:7px;padding:9px 11px;background:#fff;color:#1b2738;font:600 12px system-ui}#mk-bulk-panel .mk-main-action{background:#960000;border-color:#960000;color:#fff}#mk-bulk-panel button:hover:not(:disabled){filter:brightness(.94)}#mk-bulk-panel button:disabled{opacity:.45;cursor:not-allowed}#mk-bulk-panel .mk-head button{background:#26344a;color:#fff;border:1px solid #536078;padding:5px 12px}#mk-bulk-panel .actions{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}#mk-bulk-panel .muted{font-size:12px;color:#5f6f83}#mk-bulk-panel .line{border-top:1px solid #e0e5ec;margin:19px 0}#mk-bulk-panel .notice{white-space:pre-wrap;overflow-wrap:anywhere;background:#edf1f6;border:1px solid #dce3ed;padding:11px;border-radius:8px;max-height:175px;overflow:auto;font:11px/1.6 ui-monospace,monospace;color:#344158}#mk-bulk-panel label{display:block;font-size:12px;font-weight:700;color:#253449}#mk-bulk-panel .mk-info{border-radius:8px;background:#eef3f8;padding:10px 12px;font-size:12px;color:#46566b}#mk-bulk-panel .mk-progress{height:8px;background:#dce3ed;border-radius:100px;overflow:hidden;margin:10px 0}#mk-bulk-panel .mk-progress span{display:block;height:100%;background:#970000;width:0%;transition:width .2s}#mk-bulk-panel .mk-foot{padding:14px 20px;background:#f5f7fa;border-top:1px solid #e2e7ef;color:#69788c;font-size:11px}
@media(max-width:520px){#mk-bulk-panel{width:100vw}}
`;
  css.textContent += `
#mk-bulk-panel .mk-confirm-panel{margin:14px 0;padding:16px;border:1px solid #d0d9e7;border-radius:10px;background:#fff;box-shadow:0 3px 14px #14213d12}
#mk-bulk-panel .mk-confirm-panel[hidden]{display:none}
#mk-bulk-panel .mk-confirm-title{font-size:14px;font-weight:750;color:#152238;margin-bottom:8px}
#mk-bulk-panel .mk-confirm-description{white-space:pre-line;color:#43536b;font-size:12px;line-height:1.65}
#mk-bulk-panel .mk-confirm-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:15px}
#mk-bulk-panel .mk-confirm-actions button{min-width:125px}
`;
  document.head.appendChild(css);
  css.textContent += '\n#mk-bulk-panel .mk-quiet-summary{font-size:12px;color:#66758a;margin-top:16px}#mk-bulk-panel .mk-quiet-summary:empty,#mk-bulk-panel #mk-review:empty{display:none}#mk-bulk-panel .mk-full{width:100%;padding:12px;margin-top:14px;font-size:13px;border-radius:8px}\n#mk-bulk-panel label{margin-top:12px}\n#mk-bulk-panel .mk-info{margin-top:12px}\n#mk-bulk-panel .mk-pick-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin:6px 0}\n#mk-bulk-panel .mk-pick-tools button{padding:5px 8px;font-size:11px}\n#mk-bulk-panel #mk-pick-count{color:#64748b;font-size:11px;margin-left:auto}\n#mk-bulk-panel .mk-pick-list{max-height:195px;overflow:auto;border:1px solid #dce3ed;border-radius:8px;background:white}\n#mk-bulk-panel .mk-pick-list label{font-weight:400;margin:0;padding:8px 10px;border-bottom:1px solid #edf0f4;display:flex;align-items:center;gap:8px;cursor:pointer}\n#mk-bulk-panel .mk-pick-list label:hover{background:#f3f5f9}\n#mk-bulk-panel .mk-pick-list input{accent-color:#950000}\n#mk-bulk-panel .mk-small-note{font-size:11px;color:#607086;margin:10px 0 18px}\n#mk-bulk-panel details{border-top:1px solid #e0e5ec;padding-top:13px}\n#mk-bulk-panel summary{cursor:pointer;color:#64748b;font-size:12px}\n';
  const panel = document.createElement('aside');panel.id='mk-bulk-panel';panel.setAttribute('aria-label','Gestão em massa');
  panel.innerHTML=`<div class="mk-head"><div><h3>Gestão de assinaturas</h3><div class="mk-sub">Universidade MaxData</div></div><button id="mk-close" type="button" aria-label="Fechar">✕</button></div>
  <div class="mk-content">
    <label for="mk-level">Assinatura</label><select id="mk-level"><option value="">Selecione uma assinatura</option></select>
    <label for="mk-status">Definir status</label><select id="mk-status"><option value="active">Ativado</option><option value="inactive">Desativado</option><option value="pending">Pendente</option><option value="expired">Expirado</option></select>
    <label for="mk-audience">Destinatários</label><select id="mk-audience"><option value="all">Todos os membros elegíveis</option><option value="custom">Selecionar membros</option></select>
    <div id="mk-pick-area" hidden><input class="mk-input" type="search" id="mk-pick-search" placeholder="Pesquisar por nome"><div class="mk-pick-tools"><button type="button" id="mk-pick-all">Selecionar todos</button><button type="button" id="mk-pick-none">Limpar</button><span id="mk-pick-count">0 selecionados</span></div><div id="mk-pick-list" class="mk-pick-list"></div><div class="muted">A seleção é feita sobre a lista completa, não apenas sobre a página exibida.</div></div>
    <div id="mk-summary" class="mk-quiet-summary" aria-live="polite"></div>
    <div id="mk-review" class="mk-info" style="margin-top:9px" aria-live="polite"></div>
    <section id="mk-confirm-panel" hidden aria-label="Confirmação das alterações" class="mk-confirm-panel">
      <div class="mk-confirm-title">Revisar alterações</div>
      <div id="mk-confirm-description" class="mk-confirm-description"></div>
      <div class="mk-confirm-actions"><button type="button" id="mk-confirm-cancel">Cancelar</button><button type="button" id="mk-confirm-accept" class="mk-main-action">Confirmar alterações</button></div>
    </section>
    <div class="mk-progress"><span id="mk-progress-fill"></span></div><div id="mk-progress-text" class="muted"></div>
    <button type="button" class="mk-main-action mk-full" id="mk-primary">Aplicar alterações</button>
    <div class="actions" style="justify-content:space-between"><button id="mk-stop" disabled>Interromper</button><button id="mk-export" disabled>Exportar resultado</button></div>
    <div class="mk-small-note">Membros bloqueados são excluídos automaticamente. Alterações somente após sua confirmação.</div>
    <details id="mk-details" hidden><summary>Detalhes</summary>
      <div class="line"></div><div id="mk-job" class="mk-info"></div><div class="actions"><button id="mk-resume" disabled>Retomar lote</button><button id="mk-discard-job" disabled>Descartar lote</button></div>
      <label>Histórico local</label><div id="mk-history" class="notice"></div><div class="actions"><button id="mk-export-history">Exportar histórico</button><button id="mk-clear-history">Limpar histórico</button></div>
      <label>Registro técnico</label><div class="notice" id="mk-log" role="status">Pronto.</div>
    </details>
    <div hidden aria-hidden="true"><button id="mk-find">Atualizar lista</button><button id="mk-clear-list">Limpar lista</button><button id="mk-check">Verificar</button><button id="mk-apply">Aplicar</button><button id="mk-clear-cache">Limpar cache</button><select id="mk-scope"><option value="all">Todos</option><option value="single">Um</option></select><div id="mk-single-controls"><input id="mk-member-search"><select id="mk-member-id"></select><div id="mk-member-hint"></div></div><select id="mk-strategy"><option value="fast">Rápido</option><option value="legacy">Detalhado</option></select><div id="mk-cache"></div><select id="mk-limit"><option value="all">Todos</option></select></div>
  </div>`;
  document.body.appendChild(panel);
  const get = id => $('#mk-'+id, panel);
  const openPanel=()=>{
    panel.classList.add('mk-open');
    // Abrir o painel nunca aguarda a rede; as opções permanecem utilizáveis.
    loadLevelsEarly();
    beginBackgroundLoad();
  };
  let pendingDecision=null;
  const finishDecision = approved => {
    if(!pendingDecision)return;
    const resolve=pendingDecision;
    pendingDecision=null;
    get('confirm-panel').hidden=true;
    resolve(Boolean(approved));
  };
  const askInPanel = (message, acceptLabel='Confirmar alterações') => new Promise(resolve => {
    if(pendingDecision){resolve(false);return;}
    pendingDecision=resolve;
    get('confirm-description').textContent=message;
    get('confirm-accept').textContent=acceptLabel;
    get('confirm-panel').hidden=false;
    get('confirm-panel').scrollIntoView({block:'nearest',behavior:'smooth'});
  });
  get('confirm-cancel').addEventListener('click',()=>finishDecision(false));
  get('confirm-accept').addEventListener('click',()=>finishDecision(true));
  get('close').addEventListener('click',()=>{finishDecision(false);panel.classList.remove('mk-open');});
  document.addEventListener('keydown',e=>{if(e.key==='Escape'){finishDecision(false);panel.classList.remove('mk-open');}});
  function mountLauncher(){
    if(!document.body.contains(panel))document.body.appendChild(panel);
    const old=document.getElementById('mk-bulk-launch');
    if(old && old.isConnected)return;
    const locationPath=location.pathname;
    if(!['/membership_levels','/members'].includes(locationPath))return;
    let header;
    if(locationPath==='/membership_levels')header=$('main#main h1')?.closest('.border-b');
    else header=$('main#main h1')?.closest('.border-b') || $('main#main h1')?.parentElement?.parentElement;
    if(!header)return;
    const button=document.createElement('button');button.id='mk-bulk-launch';button.type='button';button.innerHTML='<span aria-hidden="true">▦</span> Gestão em massa';
    button.addEventListener('click',openPanel);
    // Insere ao lado esquerdo do botão principal nativo (Novo membro / Nova assinatura).
    const primaryAction = header.querySelector('a.btn.btn-primary, button.btn.btn-primary');
    const actionsContainer = primaryAction?.parentElement;
    const line=document.createElement('div');line.id='mk-bulk-launch-wrap';line.style.cssText='display:flex;align-items:center';line.appendChild(button);
    if(actionsContainer && primaryAction){
      actionsContainer.insertBefore(line, primaryAction);
    }else{
      const fallback=document.createElement('div');fallback.id='mk-bulk-launch-fallback';fallback.style.cssText='display:flex;justify-content:flex-end;margin-top:13px';fallback.appendChild(button);
      header.appendChild(fallback);
    }
  }
  mountLauncher();
  document.addEventListener('turbo:load',()=>{if(!document.body.contains(panel))document.body.appendChild(panel);mountLauncher();});
  const log = message => {get('log').textContent = `${new Date().toLocaleTimeString()}  ${message}\n` + get('log').textContent.slice(0,8500);};
  const updateCacheLabel=()=>{const fresh=[...snapshot.keys()].filter(id=>cacheFresh(id)).length;const filters=[...filterCache.values()].filter(x=>Date.now()-x.at<FILTER_TTL).length;get('cache').textContent=`Cache temporário: ${fresh} cadastro(s), ${filters} filtro(s) · até 10 min nesta página.`;};
  const setBusy = (value) => {state.busy=value;if(get('primary'))get('primary').disabled=value; get('find').disabled=value;get('scope').disabled=value;get('member-id').disabled=value;get('member-search').disabled=value;get('level').disabled=value;get('status').disabled=value;get('check').disabled=value || !state.users.length || !state.complete || !get('level').value;get('apply').disabled=value || !state.checked.some(x=>x.kind==='pending') || !state.complete;get('stop').disabled=!value;paintJob();};
  const fetchPage = async (url, opts={}, meta={}) => {
    const u=new URL(url,ROOT);
    if(u.origin!==ROOT) throw Error('URL fora do domínio autorizado');
    const response=await pacedFetch(u.href,{headers:{'Accept':'text/html,application/xhtml+xml'},...opts},meta);
    if(!response.ok) throw Error(`HTTP ${response.status}: ${u.pathname}`);
    if(new URL(response.url).origin!==ROOT) throw Error('Redirecionamento fora do domínio');
    const html=await response.text();
    const doc=new DOMParser().parseFromString(html,'text/html');
    const responsePath=new URL(response.url).pathname;
    // Um campo de senha isolado também pode existir em páginas administrativas válidas.
    // Só identifica sessão expirada por rota de autenticação ou formulário real de login.
    const loginRoute=/(?:^|\/)(?:sign_in|login)(?:\/|$)/i.test(responsePath);
    const loginForm=[...doc.querySelectorAll('form')].some(form=>{
      const action=form.getAttribute('action')||'';
      const actionPath=(()=>{try{return new URL(action,response.url).pathname;}catch{return '';}})();
      return /(?:^|\/)(?:sign_in|login|session|sessions)(?:\/|$)/i.test(actionPath)
        && !!form.querySelector('input[type="password"]');
    });
    if(loginRoute || loginForm)throw Error('Sessão encerrada: faça login novamente antes de continuar.');
    if(!doc.querySelector('form, a[href]')) throw Error('Resposta não contém HTML de cadastro válido');
    return {doc,url:response.url};
  };
  function memberLinks(doc) {
    const users=new Map();
    for(const a of $$('a[href]',doc)) {
      let u;try{u=new URL(a.getAttribute('href'),ROOT);}catch{continue;}
      if(u.origin!==ROOT)continue;
      const m=u.pathname.match(/^\/members\/(\d+)(?:\/edit)?\/?$/);
      if(!m)continue;
      const id=m[1];
      const row=a.closest('tr,li,[data-member-id],.card');
      const name=(row?.querySelector('td, .member-name, [data-name]')?.textContent||a.textContent||'').trim().replace(/\s+/g,' ').slice(0,95);
      if(!users.has(id))users.set(id,{id,name:name||`Membro ${id}`});
    }
    return [...users.values()];
  }
  function nextPage(doc,current) {
    // Nunca adivinha o total ou inventa páginas: segue links explícitos de paginação.
    const links=$$('a[href]',doc);
    for(const a of links){
      const s=[a.getAttribute('rel')||'',a.getAttribute('aria-label')||'',a.textContent||'',a.parentElement?.className||''].join(' ').toLowerCase();
      if(!(/\bnext\b|\bpróxim[ao]\b|\bproxim[ao]\b|pagination-next|page-next|›|»/.test(s)))continue;
      if(/disabled|inativo/.test(a.getAttribute('aria-disabled')||'') || a.closest('.disabled,[aria-disabled="true"]'))continue;
      try {const u=new URL(a.getAttribute('href'),current); if(u.origin===ROOT&&u.pathname==='/members' && u.href!==current)return u.href;}catch{}
    }
    return null;
  }
  async function discover() {
    state.users=[];state.checked=[];state.complete=false;state.stop=false;filterCache.clear();
    get('apply').disabled=true;get('review').textContent='Ainda não simulado.';
    let url=ROOT+'/members', seen=new Set(), ids=new Map(), pages=0;
    while(url&&!state.stop){
      if(seen.has(url))throw Error('Paginação em loop');
      seen.add(url);pages++;
      if(pages>500)throw Error('Limite de 500 páginas atingido; busca incompleta');
      log('Lendo página '+pages+'...');
      const x=await fetchPage(url);const entries=memberLinks(x.doc);
      for(const e of entries)ids.set(e.id,e);
      const next=nextPage(x.doc,x.url);
      if(!entries.length)throw Error(`Página ${pages} sem links de membros: confira o HTML da listagem`);
      if(next && seen.has(next))throw Error('Paginação retornou para uma página já vista');
      url=next;
      // Consulta silenciosa: contagem parcial fica restrita ao registro técnico.

    }
    if(state.stop)throw Error('Busca interrompida; lista incompleta');
    state.users=[...ids.values()];state.pages=pages;state.complete=true;state.listAt=Date.now();for(const id of [...snapshot.keys()])if(!ids.has(id))snapshot.delete(id);updateCacheLabel();
    log(`Busca concluída: ${ids.size} IDs em ${pages} página(s).`);
    // Obtém os nomes na página de gestão de assinaturas, quando disponíveis.
    // Não usa o texto genérico das opções de status como nome de assinatura.
    const ids2=new Map();
    try{
      const listing=await fetchPage('/membership_levels');
      for(const anchor of $$('a[href]',listing.doc)){
        let url;try{url=new URL(anchor.getAttribute('href'),ROOT);}catch{continue;}
        const match=url.pathname.match(/^\/membership_levels\/(\d+)(?:\/edit)?\/?$/);
        if(!match)continue;
        const row=anchor.closest('tr,li,article,[class*="card"]');
        let name='';
        if(row){
          const named=row.querySelector('[class*="name"],[class*="title"],td:first-child,h2,h3,h4');
          name=(named?.textContent||'').trim().replace(/\s+/g,' ');
        }
        if(!name || /^(editar|visualizar|ver|ações|excluir)$/i.test(name)){
          name=(anchor.textContent||'').trim().replace(/\s+/g,' ');
        }
        if(name && !/^(editar|visualizar|ver|ações|excluir|\d+)$/i.test(name))ids2.set(match[1],name.slice(0,100));
      }
    }catch(e){log('Não foi possível consultar lista de assinaturas: '+String(e.message||e));}
    // Complementa nomes usando rótulos dos selects de assinatura no formulário.
    const first=await fetchPage(`/members/${state.users[0].id}/edit`);
    for(const el of $$('select[name$="[membership_level_id]"]',first.doc)){
      for(const option of [...el.options]){
        if(/^\d+$/.test(option.value)&&option.textContent.trim())ids2.set(option.value,option.textContent.trim());
      }
    }
    for(const item of memberships(first.doc)){
      if(!/^\d+$/.test(item.id)||ids2.has(item.id))continue;
      const container=item.fields.membership_level_id?.closest('tr,li,[class*="row"],[class*="membership"],fieldset');
      let label=(container?.querySelector('label,th,[class*="title"],[class*="name"]')?.textContent||'').trim().replace(/\s+/g,' ');
      if(label&&!/^(status|assinatura|nível|plano)$/i.test(label)&&label.length<100)ids2.set(item.id,label);
    }
    if(!ids2.has('38501'))ids2.set('38501','Teste automação');
    // IDs sem nome confirmado continuam selecionáveis e identificados claramente.
    for(const item of memberships(first.doc))if(/^\d+$/.test(item.id)&&!ids2.has(item.id))ids2.set(item.id,`Assinatura ${item.id}`);
    const current=get('level').value;
    const merged=new Map([...state.levels,...ids2]);
    state.levels=[...merged].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    fillLevels();if(current && merged.has(current))get('level').value=current;refreshMembers();storeList();
    get('summary').textContent=`Busca finalizada: ${ids.size} membros em ${pages} página(s). Confirme se a quantidade corresponde ao cadastro do portal.`;
  }
  function memberships(doc){
    const grouped=new Map();
    for(const input of $$('[name*="[memberships_attributes]"]',doc)){
      const m=input.name.match(/\[memberships_attributes\]\[([^\]]+)\]\[([^\]]+)\]$/);
      if(!m)continue;
      if(!grouped.has(m[1]))grouped.set(m[1],{});
      grouped.get(m[1])[m[2]]=input;
    }
    return [...grouped.entries()].map(([index,fields])=>({index,fields,id:fields.membership_level_id?.value||'',status:fields.status?.value||'',link:fields.id?.value||''}));
  }
  // Compara somente assinaturas não-alvo, ignorando a ordem dos campos do HTML.
  // Abortamos a confirmação se uma delas mudou durante a operação.
  function otherMembershipSignature(doc,level){
    const entries=memberships(doc).filter(x=>x.id!==String(level)).map(x=>[x.id,x.link,x.status].join('|'));
    if(entries.some(x=>!x.split('|')[0]))throw Error('Assinatura adicional com identificação incompleta');
    return entries.sort().join('\n');
  }
  function blockState(doc){
    const matches=$$('[name="user[blocked]"]',doc);
    if(!matches.length)return 'unknown';
    const checked=matches.find(el=>el.type==='checkbox' && el.checked);
    if(checked)return ['1','true','on'].includes(String(checked.value).toLowerCase())?'blocked':'unknown';
    const checkbox=matches.find(el=>el.type==='checkbox');
    if(checkbox)return 'allowed';
    const value=matches[matches.length-1].value;
    if(['1','true'].includes(String(value).toLowerCase()))return 'blocked';
    if(['0','false'].includes(String(value).toLowerCase()))return 'allowed';
    return 'unknown';
  }
  const VALID_STATUSES = ['active','inactive','pending','expired'];
  const STATUS_LABELS = {active:'Ativado',inactive:'Desativado',pending:'Pendente',expired:'Expirado'};
  function identify(doc,level,desired){
    const matches=memberships(doc).filter(x=>x.id===level);
    if(matches.length!==1)return {kind:'error',message:matches.length?'Assinatura ambígua':'Assinatura não encontrada no formulário'};
    const item=matches[0];
    if(!item.fields.status || item.fields.status.tagName!=='SELECT'||![...item.fields.status.options].some(x=>x.value===desired))return {kind:'error',message:'Campo de status não oferece '+desired};
    // Sem vínculo e sem status: só se permite criar uma assinatura ativa.
    // Para outros estados, não cria registros artificiais que o portal talvez rejeite.
    if(!item.link && !item.status && desired!=='active')return {kind:'not_linked',message:'Sem vínculo; não será criado apenas para definir '+STATUS_LABELS[desired]};
    return item.status===desired?{kind:'matched',item}:{kind:'pending',item};
  }
  function encodeStatusFilter(level,status){
    return btoa(JSON.stringify({and:[{memberships:{membership_level_id:{eq:Number(level)},status:{eq:status}}}]}));
  }
  async function pagedFilter(label,first){
    const ids=new Set(),seen=new Set();let url=new URL(first,ROOT).href,pages=0;
    while(url){
      if(state.stop)throw Error('Verificação interrompida');
      if(seen.has(url)||++pages>100)throw Error(label+': paginação inconsistente');
      seen.add(url);
      get('review').textContent=`Verificando assinaturas... página ${pages}`;
      const x=await fetchPage(url),found=memberLinks(x.doc);
      if(!found.length && pages>1)throw Error(label+': página adicional sem membros');
      for(const m of found)ids.add(m.id);
      const next=nextPage(x.doc,x.url);
      if(next && !found.length)throw Error(label+': paginação inesperada');
      url=next;
    }
    return {ids,pages};
  }
  async function fastSnapshot(level){
    const existing=filterCache.get(level);
    if(existing && Date.now()-existing.at<FILTER_TTL){log('Filtros reutilizados do cache: zero consultas.');return existing;}
    let requests=0;
    const ban=await pagedFilter('Banidos','/members?tab=blocked');requests+=ban.pages;
    const byStatus={};
    for(const status of VALID_STATUSES){
      const p=await pagedFilter(STATUS_LABELS[status],'/members?filters='+encodeURIComponent(encodeStatusFilter(level,status)));
      byStatus[status]=p.ids;requests+=p.pages;
    }
    const known=new Set(state.users.map(x=>x.id));
    const owners=new Map();
    for(const [status,ids] of Object.entries(byStatus))for(const id of ids){
      if(!known.has(id))throw Error('Filtros incluem membro fora da lista salva ('+id+'). Atualize a lista.');
      if(owners.has(id))throw Error('Membro encontrado em dois status ('+id+'). Consulta rápida cancelada.');
      owners.set(id,status);
    }
    for(const id of ban.ids)if(!known.has(id))throw Error('Filtro banidos contém ID fora da lista salva ('+id+'). Atualize a lista.');
    // A ausência nos filtros não comprova que o vínculo não existe; a gravação sempre revalida.
    const result={at:Date.now(),ban:ban.ids,owners,requests};
    filterCache.set(level,result);
    log(`Filtros completos: ${requests} consultas; ${owners.size} vínculos por status; ${ban.ids.size} bloqueados.`);
    return result;
  }
  async function simulateFast(level,desired){
    const snap=await fastSnapshot(level);
    let matched=0,pending=0,blocked=0,unlinked=0;
    state.checked=state.users.map(u=>{
      let kind,message='';
      if(snap.ban.has(u.id)){kind='blocked';blocked++;message='Identificado no filtro Banidos';}
      else if(snap.owners.get(u.id)===desired){kind='matched';matched++;}
      else if(!snap.owners.has(u.id)&&desired!=='active'){kind='not_linked';unlinked++;message='Ausente nos filtros de status; sem gravação';}
      else {kind='pending';pending++;message='Candidato; estado e bloqueio serão revalidados antes de salvar';}
      return {...u,kind,message};
    });
    get('review').textContent=`Simulação rápida: ${state.users.length} membros · No status ${matched} · Alterações potenciais ${pending} · Bloqueados ${blocked} · Sem status encontrado ${unlinked} · ${snap.requests} consultas na coleta inicial (cache válido por 10 min).`;
    state.report=state.checked.map(x=>({...x}));get('export').disabled=false;
    updateCacheLabel();
    log(`Simulação rápida concluída: ${pending} possíveis alterações. Revalidação individual obrigatória antes de salvar.`);
  }
  async function simulate(){
    state.stop=false;state.checked=[];state.report=[];
    const level=get('level').value, desired=get('status').value;
    if(!VALID_STATUSES.includes(desired))throw Error('Status inválido');
    if(!/^\d+$/.test(level))throw Error('Selecione uma assinatura');
    const single=get('scope').value==='single';
    const id=get('member-id').value.trim();
    if(single && !/^\d+$/.test(id))throw Error('Selecione um membro na lista para o teste individual');
    if(!single && get('strategy').value==='fast')return simulateFast(level,desired);
    const targets=single?state.users.filter(x=>x.id===id):state.users;
    if(!targets.length)throw Error('O ID informado não está na lista de membros encontrada; não consultaremos IDs externos');
    let hits=0,reads=0;
    for(let i=0;i<targets.length;i++){
      if(state.stop)throw Error('Simulação interrompida');
      const u=targets[i];
      try {
        let snap=cacheFresh(u.id);
        if(snap)hits++;
        else {const x=await fetchPage(`/members/${u.id}/edit`);remember(u.id,x.doc);snap=cacheFresh(u.id);reads++;}
        const res=identifySnapshot(snap,level,desired);
        state.checked.push({...u,kind:res.kind,message:res.message||''});
      } catch(e) {state.checked.push({...u,kind:'error',message:String(e.message||e)});}
      if((i+1)%5===0||i===targets.length-1){
        const matched=state.checked.filter(x=>x.kind==='matched').length;
        const pending=state.checked.filter(x=>x.kind==='pending').length;
        const blocked=state.checked.filter(x=>x.kind==='blocked').length;
        const errors=state.checked.filter(x=>x.kind==='error').length;
        get('review').textContent=`Verificados ${i+1}/${targets.length} · No status ${matched} · Alterações ${pending} · Bloqueados ${blocked} · Erros ${errors} · Cache ${hits} · Consultas ${reads}`;
      }
    }
    updateCacheLabel();
    state.report=state.checked.map(x=>({...x}));get('export').disabled=false;
    log(`Simulação (${single?'individual':'completa'}): ${hits} reutilizados do cache; ${reads} consultas; ${state.checked.filter(x=>x.kind==='pending').length} alterações necessárias.`);
  }
  function findForm(doc,target){
    const form=target.item.fields.status.closest('form')||$$('form',doc).find(f=>f.contains(target.item.fields.status));
    if(!form)throw Error('Formulário de edição não encontrado');
    const token=$('input[name="authenticity_token"]',form)?.value;
    if(!token)throw Error('Token CSRF não encontrado no formulário; não enviaremos alteração');
    const action=new URL(form.getAttribute('action')||'',ROOT);
    if(action.origin!==ROOT||!/^\/members\/\d+\/?$/.test(action.pathname))throw Error('Ação do formulário não reconhecida');
    return {form,action};
  }
  async function applyOne(row,level,desired){
    // Consulta atualizada imediatamente antes do POST: não reutiliza HTML de outro momento.
    flowPhase='read';
    let page;
    try{page=await fetchPage(`/members/${row.id}/edit`,{}, {phase:'read'});}finally{flowPhase=null;}
    const ban=blockState(page.doc);if(ban!=='allowed')throw Error(ban==='blocked'?'Usuário bloqueado; ativação impedida':'Bloqueio não verificável; ativação impedida');
    const otherBefore=otherMembershipSignature(page.doc,level);
    const found=identify(page.doc,level,desired);
    if(found.kind==='not_linked')return 'sem vínculo; ignorado para '+STATUS_LABELS[desired];
    if(found.kind==='matched')return 'já estava em '+STATUS_LABELS[desired];
    if(found.kind!=='pending')throw Error(found.message||'Assinatura indisponível');
    if(state.stop)throw Error('Interrompido antes de iniciar o salvamento');
    const {form,action}=findForm(page.doc,found);
    if(action.pathname.replace(/\/$/,'')!==`/members/${row.id}`)throw Error('Formulário aponta para outro membro');
    const select=found.item.fields.status;
    select.value=desired;
    if(select.value!==desired)throw Error('Falha ao definir '+desired);
    const data=new URLSearchParams(new FormData(form));
    data.set(select.name,desired);
    data.set('_method','patch');
    if(!data.has('commit'))data.set('commit','Salvar');
    flowPhase='save';
    let resp;
    let postFailure=null;
    try{resp=await pacedFetch(action.href,{method:'POST',redirect:'manual',headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8','Accept':'text/html,application/xhtml+xml'},body:data.toString()},{allowRetry:false,phase:'save'});}catch(e){postFailure=e;}finally{flowPhase=null;}
    // Com redirect:manual, navegadores podem retornar opaqueredirect (status 0).
    // Isso não é confirmação do salvamento; somente o GET posterior valida o estado.
    if(resp && resp.type!=='opaqueredirect'){
      if(!resp.ok)throw Error(`Falha HTTP ${resp.status} ao salvar`);
      if(resp.url && new URL(resp.url).origin!==ROOT)throw Error('Resposta fora do domínio esperado');
      // Resposta direta (sem redirecionamento) também será verificada no cadastro.
    }
    // Conferência posterior: a confirmação é o status no formulário recarregado.
    flowPhase='verify';
    let check;
    try{
      check=await fetchPage(`/members/${row.id}/edit`,{}, {phase:'verify',finishCurrent:true});
    }catch(e){throw Error('Resultado incerto após POST: não foi possível conferir o cadastro ('+String(e.message||e)+'). Não repetir automaticamente.');}finally{flowPhase=null;}
    remember(row.id,check.doc);
    updateCacheLabel();
    const otherAfter=otherMembershipSignature(check.doc,level);
    if(otherBefore!==otherAfter)throw Error('Atenção: outra assinatura mudou durante a operação. Confira manualmente; lote interrompido.');
    if(blockState(check.doc)!=='allowed')throw Error('Bloqueio mudou durante a operação; revisar cadastro manualmente.');
    const got=identify(check.doc,level,desired);
    if(postFailure)throw Error('POST teve resultado incerto ('+String(postFailure.message||postFailure)+'); status atual '+(got.kind==='matched'?'corresponde ao solicitado':'não corresponde ao solicitado')+'. Verifique manualmente; não repetiremos a gravação.');
    if(got.kind!=='matched')throw Error('Servidor não confirmou status '+desired+' após o salvamento');
    return STATUS_LABELS[desired].toLowerCase()+' e verificado';
  }
  function progress(done,total){get('progress-text').textContent=`${done}/${total} processados · ${Math.round(done/Math.max(total,1)*100)}%`;get('progress-fill').style.width=`${Math.round(done/Math.max(total,1)*100)}%`;}
  // Lote guarda somente IDs e confirmações; nenhuma credencial ou corpo de formulário.
  async function runJob(job){
    state.stop=false;
    const level=job.level,status=job.status;
    let ok=0;
    const startedAt=stamp();
    const before={...perf};
    const diagBefore={read:{...flowDiag.read},save:{...flowDiag.save},verify:{...flowDiag.verify},redirects:flowDiag.redirects,redirectTargets:{...flowDiag.redirectTargets},manualOpaque:flowDiag.manualOpaque};
    scheduleDiag.lastRequestStart=null; // Não incluir intervalos anteriores à execução.
    const reqLogStart=scheduleDiag.calls.length;
    const memberLogStart=scheduleDiag.members.length;
    const labStart=lab.calls.length;
    const labPeakStart=lab.peakInFlight;
    const timerBefore={total:lab.timerOvershootMs,max:lab.timerOvershootMaxMs,events:lab.timerOvershootEvents};
    const idsRemaining=[...new Set(job.ids)].filter(id=>!job.done.includes(id));
    if(new Set(job.ids).size!==job.ids.length)log('IDs duplicados removidos desta tentativa.');
    try{
    for(let i=0;i<idsRemaining.length;i++){
      const itemBegin=stamp(),netBefore=perf.networkMs,waitBefore=perf.paceMs,reqBefore=perf.requests;
      if(state.stop){log('Lote interrompido; nenhuma nova gravação será iniciada.');break;}
      const id=idsRemaining[i];const row=state.checked.find(x=>x.id===id && x.kind==='pending');
      if(!row){log('ID '+id+' não está pendente na simulação atual. Interrompido para revisão.');break;}
      log(`Processando ${job.done.length+1}/${job.ids.length}: ID ${id}...`);
      try{
        const result=await applyOne(row,level,status);
        row.result=result;row.kind='matched';
        const rep=state.report.find(x=>x.id===id);if(rep){rep.kind='matched';rep.result=result;}
        job.done.push(id);jobWrite(job);ok++;
        if(scheduleDiag.members.length<diagMemberLimit)scheduleDiag.members.push({index:i+1,elapsedMs:Math.round(stamp()-itemBegin),netMs:Math.round(perf.networkMs-netBefore),waitMs:Math.round(perf.paceMs-waitBefore),requests:perf.requests-reqBefore,result:'verified'});
        addHistory({id,levelName:job.levelName,status,result,jobId:job.id});
        log('OK '+id+': '+result);
        progress(job.done.length,job.ids.length);
      }catch(e){
        snapshot.delete(String(id));updateCacheLabel();
        row.result='ERRO: '+String(e.message||e);const rep=state.report.find(x=>x.id===id);if(rep){rep.kind='error';rep.result=row.result;}
        if(scheduleDiag.members.length<diagMemberLimit)scheduleDiag.members.push({index:i+1,elapsedMs:Math.round(stamp()-itemBegin),netMs:Math.round(perf.networkMs-netBefore),waitMs:Math.round(perf.paceMs-waitBefore),requests:perf.requests-reqBefore,result:'error'});
        addHistory({id,levelName:job.levelName,status,result:row.result,jobId:job.id});
        log('ERRO '+id+': '+String(e.message||e)+'; lote pausado.');break;
      }
    }
    } finally { /* nenhum trabalho pendente de pré-leitura */ }
    const elapsed=stamp()-startedAt;
    const reqs=perf.requests-before.requests;
    const net=perf.networkMs-before.networkMs;
    const pace=perf.paceMs-before.paceMs;
    const fmt=n=>(n/1000).toFixed(1)+'s';
    state.lastMetrics={at:new Date().toISOString(), confirmed:ok, requested:job.ids.length, requests:reqs, elapsedMs:Math.round(elapsed), networkMs:Math.round(net), pacingMs:Math.round(pace), otherMs:Math.round(Math.max(0,elapsed-net-pace)), http429:perf.server429-before.server429, intervalMs:PACE_MS};
    const flowSnapshot={};
    for(const key of ['read','save','verify'])flowSnapshot[key]={count:flowDiag[key].count-diagBefore[key].count,ms:Math.round(flowDiag[key].ms-diagBefore[key].ms)};
    flowSnapshot.redirects=flowDiag.redirects-diagBefore.redirects;
    flowSnapshot.manualOpaque=flowDiag.manualOpaque-diagBefore.manualOpaque;
    flowSnapshot.targets=Object.fromEntries(Object.entries(flowDiag.redirectTargets).map(([k,v])=>[k,v-(diagBefore.redirectTargets[k]||0)]).filter(([,v])=>v>0));
    state.lastMetrics.flowDiag=flowSnapshot;
    state.lastMetrics.schedule={calls:scheduleDiag.calls.slice(reqLogStart),members:scheduleDiag.members.slice(memberLogStart)};
    const labCalls=lab.calls.slice(labStart);
    const sumLab=k=>labCalls.reduce((a,c)=>a+(c[k]||0),0);
    const totalMemberTime=state.lastMetrics.schedule.members.reduce((a,m)=>a+m.elapsedMs,0);
    const totalNetworkTime=sumLab('networkMs');
    const totalScheduleWait=sumLab('scheduleMs');
    state.lastMetrics.lab={timerDelayedEvents:lab.timerOvershootEvents-timerBefore.events,timerExtraMs:Math.round(lab.timerOvershootMs-timerBefore.total),timerMaxExtraMs:Math.round(lab.timerOvershootMaxMs),calls:labCalls.length, queueMs:sumLab('queueMs'), pacedMs:sumLab('paceMs'), schedulingMs:totalScheduleWait, networkMs:totalNetworkTime, overlapCalls:sumLab('overlap'), peakInFlight:lab.peakInFlight, gaps:labCalls.map(c=>c.gapMs).filter(x=>x!==null), perPhase:Object.fromEntries(['read','save','verify','other'].map(k=>[k,{calls:labCalls.filter(c=>c.phase===k).length,queueMs:labCalls.filter(c=>c.phase===k).reduce((a,c)=>a+c.queueMs,0),paceMs:labCalls.filter(c=>c.phase===k).reduce((a,c)=>a+c.paceMs,0),networkMs:labCalls.filter(c=>c.phase===k).reduce((a,c)=>a+c.networkMs,0)}])),redirects:{manualOpaque:flowSnapshot.manualOpaque,followed:flowSnapshot.redirects},localResidualMs:Math.max(0,Math.round(elapsed-totalNetworkTime-totalScheduleWait)),sumMemberTimeMs:Math.round(totalMemberTime),notes:'Tempos de requisições concorrentes podem se sobrepor; não somar duração de fases para obter tempo de parede.'};
    log(`Diagnóstico: leitura ${fmt(flowSnapshot.read.ms)}, gravação (sem seguir redirecionamento) ${fmt(flowSnapshot.save.ms)}, conferência ${fmt(flowSnapshot.verify.ms)}; POSTs redirecionados ${flowSnapshot.redirects}.`);
    log(`Desempenho: ${ok} confirmado(s), ${reqs} requisição(ões), total ${fmt(elapsed)}, rede ${fmt(net)}, intervalos ${fmt(pace)}, outros ${fmt(Math.max(0,elapsed-net-pace))}, HTTP 429: ${perf.server429-before.server429}.`);
    if(job.done.length===job.ids.length){jobClear();log('Lote integralmente concluído e verificado.');}
    else paintJob();
    get('review').textContent=`Execução encerrada: ${ok} confirmado(s) nesta tentativa; ${job.ids.length-job.done.length} restante(s). Confira o CSV e simule novamente antes de retomar.`;
    state.checked=[];filterCache.delete(level);get('apply').disabled=true;get('export').disabled=false;
  }
  async function apply(){

    const level=get('level').value,desired=get('status').value;
    if(!VALID_STATUSES.includes(desired))throw Error('Status inválido');
    const pend=state.checked.filter(x=>x.kind==='pending');
    if(!pend.length)throw Error('Nenhum membro precisando de alteração');
    const n=get('limit').value==='all'?pend.length:Number(get('limit').value);
    const selected=pend.slice(0,n);
    if(!await askInPanel(`Assinatura: ${get('level').selectedOptions[0].textContent}\nStatus desejado: ${STATUS_LABELS[desired]}\nMembros elegíveis: ${selected.length}\n\nAltera acessos reais. Não há reversão automática.`))return;
    const job={id:String(Date.now()),level,levelName:get('level').selectedOptions[0].textContent,status:desired,ids:[...new Set(selected.map(x=>x.id))],done:[],created:Date.now()};
    jobWrite(job);progress(0,job.ids.length);await runJob(job);
  }
  // A preparação não bloqueia a interface: apenas ações de gravação entram em modo ocupado.
  let listPromise=null;
  let preparingError=null;
  function beginBackgroundLoad(){
    if(listPromise)return listPromise;
    if(state.complete && Date.now()-state.listAt<120000)return Promise.resolve();
    listPromise=(async()=>{
      preparingError=null;
      try {
        await discover();
        renderPickList();
        get('summary').textContent=`${state.users.length} membros disponíveis`; 
      }catch(e){
        state.complete=false;
        preparingError=e;
        get('summary').textContent='Não foi possível carregar os membros. A operação tentará novamente.';
        log('Preparação: '+String(e.message||e));
        throw e;
      }finally{listPromise=null;}
    })();
    // Previne rejeição não tratada quando o carregamento acontece sem clique.
    listPromise.catch(()=>{});
    return listPromise;
  }
  async function ensureFreshList(force=false){
    if(listPromise)await listPromise;
    if(!force && state.complete && Date.now()-state.listAt<120000)return;
    await beginBackgroundLoad();
    if(!state.complete)throw preparingError||Error('Lista de membros indisponível');
  }
  function renderPickList(){
    const query=get('pick-search').value.trim().toLocaleLowerCase('pt-BR');
    const eligible=state.users.filter(u=>u.name.toLocaleLowerCase('pt-BR').includes(query));
    const host=get('pick-list');host.replaceChildren();
    for(const u of eligible){
      const label=document.createElement('label');const cb=document.createElement('input');cb.type='checkbox';cb.checked=state.selectedIds.has(u.id);
      cb.addEventListener('change',()=>{if(cb.checked)state.selectedIds.add(u.id);else state.selectedIds.delete(u.id); invalidate();renderPickCount();});
      label.append(cb,document.createTextNode(u.name||('Membro '+u.id)));host.append(label);
    }
    renderPickCount();
  }
  function renderPickCount(){get('pick-count').textContent=state.selectedIds.size+' selecionado(s)';}
  function invalidate(){state.checked=[];get('apply').disabled=true;get('review').textContent='';}
  get('audience').addEventListener('change',()=>{state.selectionMode=get('audience').value;get('pick-area').hidden=state.selectionMode!=='custom';invalidate();renderPickList();});
  get('pick-search').addEventListener('input',renderPickList);
  get('pick-all').addEventListener('click',()=>{for(const u of state.users)state.selectedIds.add(u.id);invalidate();renderPickList();});
  get('pick-none').addEventListener('click',()=>{state.selectedIds.clear();invalidate();renderPickList();});
  get('level').addEventListener('change',invalidate);
  get('status').addEventListener('change',invalidate);
  let primaryPending=false;
  get('primary').addEventListener('click',async()=>{
    if(state.busy || primaryPending)return;
    const level=get('level').value,status=get('status').value;
    if(!/^\d+$/.test(level)){get('review').textContent='Selecione uma assinatura.';return;}
    if(state.selectionMode==='custom'&&!state.selectedIds.size){get('review').textContent='Selecione ao menos um membro.';return;}
    primaryPending=true;
    try{
      get('review').textContent='Preparando alterações...';
      await ensureFreshList();
      if(!state.complete)throw Error('Lista de membros incompleta');
      if(state.selectionMode==='custom' && [...state.selectedIds].some(id=>!state.users.some(u=>u.id===id)))throw Error('A seleção contém membros que não estão na lista atual. Revise os destinatários.');
      // Uma escolha feita durante a preparação continua valendo nesta operação.
      if(get('level').value!==level || get('status').value!==status)
        throw Error('A seleção mudou durante a preparação. Clique em Aplicar novamente.');
      setBusy(true);get('review').textContent='Preparando alterações...';
      await simulate();
      if(state.selectionMode==='custom') {
        state.checked=state.checked.filter(x=>state.selectedIds.has(x.id));
        state.report=state.report.filter(x=>state.selectedIds.has(x.id));
      }
      const pending=state.checked.filter(x=>x.kind==='pending');
      const blocked=state.checked.filter(x=>x.kind==='blocked').length;
      get('review').textContent=`${pending.length} possível(is) alteração(ões) · ${blocked} bloqueado(s) excluído(s).`;
      if(!pending.length)return;
      const chosen=pending;

      if(!await askInPanel(`Assinatura: ${get('level').selectedOptions[0].textContent}\nStatus desejado: ${STATUS_LABELS[status]}\nMembros elegíveis: ${chosen.length}\nBloqueados excluídos: ${blocked}\n\nCada cadastro será revalidado antes da gravação. A operação modifica acessos reais e não tem reversão automática.`))return;
      // Evita executar uma seleção diferente daquela apresentada para confirmação.
      if(get('level').value!==level || get('status').value!==status ||
        (state.selectionMode==='custom' && chosen.some(x=>!state.selectedIds.has(x.id))))
        throw Error('A seleção mudou. Revise os destinatários e clique em Aplicar novamente.');
      const job={id:String(Date.now()),level,levelName:get('level').selectedOptions[0].textContent,status,ids:[...new Set(chosen.map(x=>x.id))],done:[],created:Date.now()};
      jobWrite(job);progress(0,job.ids.length);await runJob(job);
      get('review').textContent=`${job.done.length} de ${job.ids.length} alteração(ões) confirmada(s). Confira o resultado no painel.`;
    }catch(e){get('review').textContent='Operação não concluída: '+String(e.message||e);log('Ação: '+String(e.message||e));}
    finally{primaryPending=false;setBusy(false);}
  });
  get('find').addEventListener('click',async()=>{if(state.busy)return;setBusy(true);try{await discover();}catch(e){state.complete=false;log('Busca: '+String(e.message||e));get('summary').textContent='Busca incompleta; execução bloqueada.';}finally{setBusy(false);}});
  get('check').addEventListener('click',async()=>{if(state.busy)return;setBusy(true);try{await simulate();}catch(e){state.checked=[];get('apply').disabled=true;log('Simulação: '+String(e.message||e));}finally{setBusy(false);}});
  get('apply').addEventListener('click',async()=>{if(state.busy)return;setBusy(true);try{await apply();}catch(e){log('Execução: '+String(e.message||e));}finally{setBusy(false);}});
  get('resume').addEventListener('click',async()=>{
    if(state.busy)return;
    const job=jobRead();if(!job)return;
    if(!state.complete){log('Retomada exige lista completa.');return;}
    if(get('level').value!==job.level || get('status').value!==job.status){
      get('level').value=job.level;get('status').value=job.status;resetSelection();
      log('Assinatura e status do lote restaurados. Simule novamente e depois retome.');return;
    }
    const remaining=job.ids.filter(id=>!job.done.includes(id));
    if(!remaining.length){jobClear();return;}
    // A nova simulação DEVE confirmar TODOS os IDs restantes; não tentar salvar IDs de fora dela.
    if(remaining.some(id=>!state.checked.some(r=>r.id===id&&r.kind==='pending'))){
      log('Retomada bloqueada: simule novamente. Todos os membros restantes devem aparecer como pendentes.');return;
    }
    if(!await askInPanel(`Retomar ${remaining.length} membro(s) pendente(s)? Cada cadastro será revalidado antes de gravar.`,"Confirmar retomada"))return;
    setBusy(true);try{await runJob(job);}catch(e){log('Retomada: '+String(e.message||e));}finally{setBusy(false);}
  });
  get('discard-job').addEventListener('click',async()=>{if(state.busy)return;if(await askInPanel('Descartar o lote desta página? As alterações já realizadas NÃO serão revertidas.','Descartar lote')){jobClear();log('Lote descartado.');}});
  function downloadCsv(rows,name){const str=rows.map(r=>r.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');const u=URL.createObjectURL(new Blob(['\uFEFF'+str],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
  get('export-history').addEventListener('click',()=>downloadCsv([['Data','ID','Assinatura','Status','Resultado','Lote'],...historyRecords().map(x=>[x.at,x.id,x.levelName,x.status,x.result,x.jobId])],'memberkit-historico.csv'));
  get('clear-history').addEventListener('click',async()=>{if(state.busy)return;if(await askInPanel('Apagar o histórico desta página? Não altera os cadastros do MemberKit.','Apagar histórico')){historyRows.length=0;paintHistory();}});
  get('stop').addEventListener('click',()=>{state.stop=true;log('Parada solicitada: nenhuma nova gravação será iniciada; se já houve POST, a conferência final será concluída.');});
  const resetSelection=()=>{state.checked=[];get('apply').disabled=true;get('review').textContent='';get('check').disabled=!state.complete || !get('level').value;};
  get('level').addEventListener('change',resetSelection);
  get('status').addEventListener('change',resetSelection);
  get('strategy').addEventListener('change',resetSelection);
  get('scope').addEventListener('change',()=>{get('single-controls').hidden=get('scope').value!=='single';resetSelection();});
  get('member-search').addEventListener('input',()=>{refreshMembers();resetSelection();});
  get('member-id').addEventListener('input',resetSelection);
  get('clear-list').addEventListener('click',()=>{if(state.busy)return;filterCache.clear();state.users=[];state.levels=[];state.complete=false;fillLevels();refreshMembers();resetSelection();get('summary').textContent='Lista desta página limpa.';setBusy(false);});
  get('clear-cache').addEventListener('click',()=>{if(state.busy)return;snapshot.clear();filterCache.clear();updateCacheLabel();resetSelection();log('Cache temporário limpo.');});
  updateCacheLabel();
  get('export').addEventListener('click',()=>{
    const rows=[['ID','Nome','Resultado','Detalhe'],...state.report.map(x=>[x.id,x.name,x.kind,x.result||x.message||''])];
    if(state.lastMetrics){
      const m=state.lastMetrics;
      rows.push([],['DESEMPENHO DA ÚLTIMA EXECUÇÃO','Valor'],['Registrado em',m.at],['Confirmados',m.confirmed],['Membros previstos no lote',m.requested],['Requisições',m.requests],['Tempo total (s)',(m.elapsedMs/1000).toFixed(2)],['Tempo de rede (s)',(m.networkMs/1000).toFixed(2)],['Intervalos programados (s)',(m.pacingMs/1000).toFixed(2)],['Outros (s)',(m.otherMs/1000).toFixed(2)],['HTTP 429',m.http429],['Intervalo mínimo configurado (ms)',m.intervalMs],['Proteções v3.3','Confere assinaturas adicionais, sessão e resultado de gravação; não repete POST incerto automaticamente.']);
      if(m.schedule){
        const sc=m.schedule;
        rows.push([],['DIAGNÓSTICO DO AGENDADOR','Medições sem dados pessoais'],['Chamadas medidas',sc.calls.length],['Membros medidos',sc.members.length]);
        rows.push([],['ETAPAS DE REQUISIÇÃO','Chamadas','Espera total (ms)','Rede total (ms)','Tempo médio de rede (ms)','Intervalo médio entre inícios (ms)']);
        for(const phase of ['read','save','verify','other']){
          const list=sc.calls.filter(x=>x.phase===phase);
          if(!list.length)continue;
          const sum=(key)=>list.reduce((a,x)=>a+(x[key]||0),0);
          const gaps=list.filter(x=>x.startGapMs!==null);
          rows.push([phase,list.length,sum('waitMs'),sum('netMs'),(sum('netMs')/list.length).toFixed(1),gaps.length?(gaps.reduce((a,x)=>a+x.startGapMs,0)/gaps.length).toFixed(1):'']);
        }
        rows.push([],['MEMBROS (SEM ID)','Tempo total (ms)','Rede (ms)','Espera (ms)','Outros (ms)','Requisições','Resultado']);
        for(const x of sc.members)rows.push([x.index,x.elapsedMs,x.netMs,x.waitMs,Math.max(0,x.elapsedMs-x.netMs-x.waitMs),x.requests,x.result]);
      }
      if(m.lab){
        const l=m.lab;
        rows.push([],['LABORATÓRIO V3.0 — SEIS DIAGNÓSTICOS','Valor']);
        rows.push(['1. Temporizadores atrasados (>100 ms)',l.timerDelayedEvents],['1. Atrasos de temporizadores acumulados (ms)',l.timerExtraMs],['1. Maior atraso de temporizador (ms)',l.timerMaxExtraMs]);
        rows.push(['1. Agendador — espera em fila (ms)',l.queueMs],['1. Agendador — intervalo (ms)',l.pacedMs],['1. Agendador — espera total até início (ms)',l.schedulingMs]);
        rows.push(['2. Rede — total acumulado de requisições (ms)',l.networkMs],['2. Rede — chamadas',l.calls]);
        rows.push(['3. Concorrência — chamadas iniciadas com outra ativa',l.overlapCalls],['3. Concorrência — pico simultâneo observado',l.peakInFlight]);
        rows.push(['4. Redirecionamento — respostas opacas no POST',l.redirects.manualOpaque],['4. Redirecionamento — redirecionamentos acompanhados',l.redirects.followed]);
        rows.push(['5. Processamento local / tempo não atribuído (ms)',l.localResidualMs],['5. Soma dos tempos individuais por membro (ms)',l.sumMemberTimeMs]);
        const good=m.confirmed||0,per=good?m.elapsedMs/good:null;
        rows.push(['6. Projeção — amostra confirmada',good],['6. Projeção — média observada (ms/membro)',per===null?'':Math.round(per)]);
        for(const target of [50,100,168])rows.push(['6. Projeção linear para '+target+' membros (s)',per===null?'':(target*per/1000).toFixed(1)]);
        rows.push(['Limitação','Projeções não incluem atrasos futuros, limitação HTTP 429 ou variação do servidor; tempos concorrentes podem se sobrepor.']);
        rows.push([],['LAB V3.0 — ETAPAS','Chamadas','Fila (ms)','Ritmo (ms)','Rede (ms)']);
        for(const [name,d] of Object.entries(l.perPhase))rows.push([name,d.calls,d.queueMs,d.paceMs,d.networkMs]);
        const gaps=l.gaps; // Apenas desta execução: primeira chamada não possui intervalo anterior.
        if(gaps.length)rows.push([],['INTERVALOS ENTRE INÍCIOS','Valor (ms)'],['Mínimo',Math.min(...gaps)],['Média',Math.round(gaps.reduce((a,b)=>a+b,0)/gaps.length)],['Máximo',Math.max(...gaps)]);
      }
      if(m.flowDiag){
        rows.push([],['DIAGNÓSTICO DO FLUXO','Chamadas','Tempo total (s)']);
        for(const [key,label] of [['read','GET inicial'],['save','POST sem seguir redirecionamento'],['verify','GET de conferência']]){
          const d=m.flowDiag[key];rows.push([label,d.count,(d.ms/1000).toFixed(2)]);
        }
        rows.push(['Respostas opacas (redirecionamento manual)',m.flowDiag.manualOpaque]);
        rows.push(['Salvamentos com redirecionamento seguido',m.flowDiag.redirects]);
        for(const [dest,count] of Object.entries(m.flowDiag.targets))rows.push(['Destino '+dest,count]);
        rows.push(['Observação','POST usa redirect manual. Resposta opaqueredirect não comprova gravação; GET posterior continua obrigatório.']);
      }
    }
    const text=rows.map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(';')).join('\r\n');
    const url=URL.createObjectURL(new Blob(['\uFEFF'+text],{type:'text/csv;charset=utf-8'}));
    const a=document.createElement('a');a.href=url;a.download='memberkit-relatorio-'+new Date().toISOString().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
  paintHistory();paintJob();
  // Consulta assinaturas de forma independente da varredura de membros.
  // Não espera 17 páginas para liberar o seletor.
  let levelsPromise=null;
  async function loadLevelsEarly(){
    if(levelsPromise)return levelsPromise;
    levelsPromise=(async()=>{
      try{
        const page=await fetchPage('/membership_levels');
        const names=new Map();
        for(const a of $$('a[href]',page.doc)){
          let url;try{url=new URL(a.getAttribute('href'),ROOT);}catch{continue;}
          const match=url.pathname.match(/^\/membership_levels\/(\d+)\/edit\/?$/);
          if(!match)continue;
          const row=a.closest('tr');
          const name=row?.querySelector('td:first-child')?.textContent?.trim().replace(/\s+/g,' ');
          if(name)names.set(match[1],name);
        }
        if(names.size){
          const current=get('level').value;
          state.levels=[...names].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
          fillLevels();
          if(current && names.has(current))get('level').value=current;
          log(`${names.size} assinaturas carregadas independentemente dos membros.`);
        }else{
          get('level').options[0].textContent='Assinaturas indisponíveis — reabra o painel';
          log('Nenhuma assinatura encontrada em /membership_levels.');
        }
      }catch(e){
        log('Não foi possível carregar assinaturas: '+String(e.message||e));
      }
    })();
    return levelsPromise;
  }
  // Exibe nomes das assinaturas desde o HTML atual, sem esperar a lista de membros.
  function seedLevelsFromPage(){
    if(state.levels.length)return;
    const found=new Map();
    for(const a of $$('a[href*="/membership_levels/"]',document)){
      const m=a.getAttribute('href')?.match(/\/membership_levels\/(\d+)\/edit/);
      const name=a.closest('tr')?.querySelector('td')?.textContent?.trim();
      if(m && name)found.set(m[1],name);
    }
    if(found.size){state.levels=[...found];fillLevels();}
  }
  seedLevelsFromPage();
  loadLevelsEarly();
  // Preparação antecipada: não desativa botões nem bloqueia a seleção.
  beginBackgroundLoad();
  log('Gestão de assinaturas carregada.');
})();
