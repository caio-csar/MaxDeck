// ==UserScript==
// @name         MaxData | Supervisão de Atendimentos
// @namespace    maxdata-supervisao-local
// @version      0.2.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxData%20Supervis%C3%A3o%20de%20Atendimentos.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxData%20Supervis%C3%A3o%20de%20Atendimentos.user.js
// @description  Pendentes, acompanhamentos, tokens de 30 minutos, relatos persistentes e histórico de encerrados.
// @match        https://painel.maxdata.com.br/*
// @run-at       document-idle
// @grant        GM_getValue
// @grant        GM_setValue
// ==/UserScript==

(() => {
  'use strict';

  if (window.__maxdataSupervisao30minAtiva) return;
  window.__maxdataSupervisao30minAtiva = true;

  const CONFIG = Object.freeze({
    intervaloMinutos: 30,
    varreduraMs: 5000,
    toleranciaAusenciaMs: 2 * 60 * 1000,
    // Vazio significa monitorar todas as equipes. Ex.: ['MAX-FARMA/AGRO'].
    equipesMonitoradas: [],
    maxHistoricoRenderizado: 150,
  });
  const STORAGE_KEY = 'maxdata-supervisao-30min-v2';
  const TITLE_BASE = (document.title || 'Painel MaxData')
    .replace(/^\(\d+\)\s*/, '')
    .replace(/\s*[•|-]\s*Supervisão\s*$/, '');

  function estadoVazio() {
    return { versao: 2, ativos: {}, encerrados: [] };
  }
  function carregarEstado() {
    try {
      const salvo = GM_getValue(STORAGE_KEY, null);
      const dado = typeof salvo === 'string' ? JSON.parse(salvo) : salvo;
      if (!dado || dado.versao !== 2 || !dado.ativos || !Array.isArray(dado.encerrados)) return estadoVazio();
      return dado;
    } catch (erro) {
      console.error('[MaxData Supervisão] Erro lendo registros:', erro);
      return estadoVazio();
    }
  }
  let estado = carregarEstado();
  let aba = 'pendentes';
  let filtroAcompanhamento = 'ativos';
  let painelAberto = false;
  let selecionado = null;
  let salvamentoFalhou = false;
  let rascunhos = {};
  const ausencias = new Map();

  function persistir() {
    try {
      GM_setValue(STORAGE_KEY, JSON.stringify(estado));
      salvamentoFalhou = false;
      return true;
    } catch (erro) {
      salvamentoFalhou = true;
      console.error('[MaxData Supervisão] Não foi possível salvar:', erro);
      return false;
    }
  }
  function texto(el) { return (el?.textContent || '').replace(/\s+/g, ' ').trim(); }
  function normalizarCliente(nome) {
    return nome.replace(/\s*\|\s*\(\s*\d+\s*\)\s*$/, '').replace(/\s*[*#]+\s*$/, '').trim();
  }
  function tempoEmMinutos(valor) {
    const partes = /^(\d{1,4}):([0-5]\d)$/.exec(valor);
    return partes ? Number(partes[1]) * 60 + Number(partes[2]) : null;
  }
  function hhmm(minutos) {
    const n = Math.max(0, Math.floor(Number(minutos) || 0));
    return `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
  }
  function relogio(ms) { return hhmm(Math.floor(Math.max(0, Date.now() - (ms || Date.now())) / 60000)); }
  function dataHora(ts) {
    return ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
  }
  function tokens(registro) { return Math.max(0, Math.floor((registro.ultimoMinuto || 0) / CONFIG.intervaloMinutos)); }
  function plural(n, singular, pluralizado) { return `${n} ${n === 1 ? singular : pluralizado}`; }
  function escapatoria(str) {
    return String(str ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  }
  function lerAtendimentos() {
    const tabela = document.querySelector('#going_so table');
    if (!tabela) return null; // Sem tabela: carregamento/incompatibilidade. Nunca encerrar registros.
    const ocorrencias = new Map();
    const resultados = [];
    for (const linha of tabela.querySelectorAll('tr.table-row')) {
      const colunas = linha.querySelectorAll('td');
      if (colunas.length < 4) continue;
      const cliente = normalizarCliente(texto(colunas[0]));
      const equipe = texto(colunas[1]);
      const analista = texto(colunas[2]);
      const minutos = tempoEmMinutos(texto(colunas[3]));
      if (!cliente || !analista || minutos === null) continue;
      if (CONFIG.equipesMonitoradas.length && !CONFIG.equipesMonitoradas.some(nome =>
        equipe.toLocaleLowerCase('pt-BR').includes(nome.toLocaleLowerCase('pt-BR')))) continue;
      // Aproximação necessária porque a tabela recebida não expõe ID único.
      const identificacao = JSON.stringify([cliente, equipe, analista]);
      const repeticao = (ocorrencias.get(identificacao) || 0) + 1;
      ocorrencias.set(identificacao, repeticao);
      resultados.push({ chave: `${identificacao}#${repeticao}`, cliente, equipe, analista, minutos });
    }
    return resultados;
  }
  function novoRegistro(item, agora) {
    return {
      id: `${agora}-${Math.random().toString(36).slice(2, 10)}`,
      chave: item.chave,
      cliente: item.cliente,
      equipe: item.equipe,
      analista: item.analista,
      primeiroVistoEm: agora,
      inicioEstimadoEm: agora - item.minutos * 60000,
      ultimoVistoEm: agora,
      ultimoMinuto: item.minutos,
      status: 'pendente',
      acompanhadoDesde: null,
      ultimaRevisaoToken: 0,
      notas: [],
    };
  }
  function encerrarRegistro(registro, agora) {
    estado.encerrados.unshift({ ...registro, statusAnterior: registro.status, status: 'encerrado', encerradoEm: agora });
    if (selecionado === registro.id) selecionado = null;
    delete rascunhos[registro.id];
  }
  function verificar() {
    const itens = lerAtendimentos();
    if (itens === null) { atualizarResumo(); return; }
    const agora = Date.now();
    const vistos = new Set();
    let alterou = false;
    for (const item of itens) {
      vistos.add(item.chave);
      let registro = estado.ativos[item.chave];
      if (registro && item.minutos + 2 < registro.ultimoMinuto) {
        // O cronômetro caiu: mesmo cliente/analista começou um atendimento novo.
        encerrarRegistro(registro, agora);
        delete estado.ativos[item.chave];
        registro = null;
        alterou = true;
      }
      if (!registro) {
        registro = novoRegistro(item, agora);
        estado.ativos[item.chave] = registro;
        alterou = true;
      }
      // Grava o progresso por minuto, não a cada varredura de 5 segundos.
      if (registro.ultimoMinuto !== item.minutos) alterou = true;
      Object.assign(registro, {
        cliente: item.cliente, equipe: item.equipe, analista: item.analista,
        ultimoMinuto: item.minutos, ultimoVistoEm: agora,
      });
      ausencias.delete(item.chave);
    }
    for (const [chave, registro] of Object.entries(estado.ativos)) {
      if (vistos.has(chave)) continue;
      const ausencia = ausencias.get(chave) || { desde: agora, verificacoes: 0 };
      ausencia.verificacoes++;
      ausencias.set(chave, ausencia);
      if (agora - ausencia.desde >= CONFIG.toleranciaAusenciaMs && ausencia.verificacoes >= 3) {
        encerrarRegistro(registro, agora);
        delete estado.ativos[chave];
        ausencias.delete(chave);
        alterou = true;
      }
    }
    if (alterou) persistir();
    renderizar();
  }
  function ativos() { return Object.values(estado.ativos); }
  function pendentes() {
    return ativos().filter(r => r.status === 'pendente' && tokens(r) >= 1)
      .sort((a, b) => b.ultimoMinuto - a.ultimoMinuto || a.analista.localeCompare(b.analista));
  }
  function acompanhando() {
    return ativos().filter(r => r.status === 'acompanhando')
      .sort((a, b) => Number(revisaoNecessaria(b)) - Number(revisaoNecessaria(a)) || b.ultimoMinuto - a.ultimoMinuto);
  }
  function encerradosAcompanhados() {
    return estado.encerrados.filter(r => r.acompanhadoDesde || (r.notas || []).length);
  }
  function revisaoNecessaria(r) { return r.status === 'acompanhando' && tokens(r) > (r.ultimaRevisaoToken || 0); }
  function totalAlertas() { return pendentes().length + acompanhando().filter(revisaoNecessaria).length; }
  function acompanhar(id) {
    const registro = ativos().find(r => r.id === id);
    if (!registro) return;
    registro.status = 'acompanhando';
    registro.acompanhadoDesde ||= Date.now();
    registro.ultimaRevisaoToken = tokens(registro);
    persistir();
    aba = 'acompanhando';
    filtroAcompanhamento = 'ativos';
    selecionado = id;
    renderizar();
  }
  function voltarPendente(id) {
    const registro = ativos().find(r => r.id === id);
    if (!registro || !window.confirm('Voltar este atendimento para Pendentes? Os relatos existentes serão preservados.')) return;
    registro.status = 'pendente';
    persistir();
    selecionado = null;
    aba = 'pendentes';
    renderizar();
  }
  function salvarRelato(id) {
    const registro = ativos().find(r => r.id === id);
    const relato = (rascunhos[id] || '').trim();
    if (!registro || !relato) return;
    registro.notas ||= [];
    registro.notas.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, em: Date.now(), texto: relato });
    registro.ultimaRevisaoToken = tokens(registro);
    if (persistir()) {
      rascunhos[id] = '';
      renderizar(true);
    } else {
      alert('Não foi possível gravar o relato. O texto continua na caixa; exporte um backup ou verifique o Tampermonkey.');
    }
  }

  const host = document.createElement('div');
  host.id = 'maxdata-supervisao-30min';
  host.style.cssText = 'position:fixed;bottom:18px;right:18px;z-index:2147483646;';
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      * { box-sizing: border-box; }
      :host { color-scheme: light; }
      button,textarea { font-family: inherit; }
      button { cursor:pointer; }
      button:focus-visible,textarea:focus-visible { outline:2px solid #2563eb;outline-offset:2px; }
      .botao { background:#172438;color:#fff;border:none;border-radius:11px;padding:11px 14px;font:700 13px/1.4 system-ui,Segoe UI,sans-serif;box-shadow:0 4px 18px #0004; }
      .botao:hover { background:#2b4260; }
      .contador { display:inline-flex;justify-content:center;align-items:center;min-width:22px;height:22px;padding:0 6px;margin-left:8px;border-radius:50px;background:#cf3030;color:white; }
      .contador.zerado { background:#66788d; }
      .painel { display:none;width:min(505px,calc(100vw - 36px));max-height:min(740px,83vh);margin-bottom:10px;overflow:hidden;border:1px solid #ccd5e0;border-radius:14px;background:white;box-shadow:0 14px 40px #0005;color:#1d2b3b;font:13px/1.5 system-ui,Segoe UI,sans-serif; }
      .painel.aberto { display:flex;flex-direction:column; }
      .cabecalho { background:#f5f7fb;padding:13px 15px 10px;border-bottom:1px solid #e0e6ee; }
      .titulo { display:flex;align-items:center;justify-content:space-between;gap:10px;font-size:15px;font-weight:750; }
      .descricao { margin:3px 0 0;color:#627083;font-size:11px; }
      .ações { display:flex;gap:5px; }
      .mini { border:1px solid #bcc8d6;background:white;color:#233a56;border-radius:6px;padding:5px 8px;font-size:11px;font-weight:650; }
      .mini:hover { background:#eef4fb; }
      .abas { display:flex;gap:5px;padding:9px 12px;background:#fff;border-bottom:1px solid #e5ebf2; }
      .aba { flex:1;border:1px solid #d5dde7;border-radius:8px;padding:8px;color:#526176;background:#f7f9fc;font-weight:700;font-size:12px; }
      .aba.ativa { background:#243957;color:white;border-color:#243957; }
      .aba b { margin-left:5px;font-size:11px; }
      .subnav { display:flex;gap:8px;align-items:center;padding:7px 14px;border-bottom:1px solid #e6e9ef;background:#fafbfd; }
      .subnav[hidden] { display:none; }
      .subnav button { background:transparent;border:0;color:#4b5d70;padding:3px 5px;font-weight:700;font-size:11px; }
      .subnav button.ativo { color:#152b46;border-bottom:2px solid #1d4c77; }
      .lista { min-height:70px;overflow:auto;overscroll-behavior:contain; }
      .cartao { border-bottom:1px solid #e7ebf1; }
      .linha { display:flex;gap:12px;justify-content:space-between;align-items:flex-start;padding:12px 14px; }
      .nome { font-size:13px;font-weight:750;overflow-wrap:anywhere; }
      .muted { color:#627083;font-size:11px;overflow-wrap:anywhere; }
      .tempo { margin-top:5px;font-weight:700;color:#7d3a1d;font-size:12px; }
      .token { display:inline-block;margin-left:7px;background:#e9eff6;color:#24425f;border-radius:5px;padding:2px 6px;font-size:11px;font-weight:700; }
      .direita { flex:none;display:flex;flex-direction:column;align-items:flex-end;gap:6px; }
      .acao { background:#243957;border:1px solid #243957;color:white;padding:7px 10px;font-weight:750;border-radius:7px;font-size:11px; }
      .acao:hover { background:#34557d; }
      .acao.secundaria { background:white;color:#243957;border-color:#bac8d8; }
      .acao.secundaria:hover { background:#f0f5fa; }
      .alerta { color:#a52e20;font-size:11px;font-weight:750; }
      .ok { color:#3b7053;font-size:11px;font-weight:700; }
      .abrir { display:block;width:100%;text-align:left;border:0;background:transparent;color:inherit;padding:0; }
      .abrir:hover .nome { text-decoration:underline; }
      .detalhes { margin:0 13px 13px;padding:12px;border:1px solid #d9e1eb;background:#f8fafc;border-radius:9px; }
      .metadados { display:grid;grid-template-columns:1fr 1fr;gap:5px 10px;margin-bottom:11px;font-size:11px;color:#526176; }
      .secao { font-size:12px;font-weight:750;margin:8px 0 7px;color:#26384f; }
      .nota { background:white;border:1px solid #e1e7ef;border-radius:7px;padding:9px;margin-bottom:7px;overflow-wrap:anywhere;white-space:pre-wrap; }
      .data { font-size:10px;font-weight:750;color:#738093;margin-bottom:3px; }
      textarea { display:block;width:100%;min-height:80px;max-height:230px;resize:vertical;padding:9px;border:1px solid #bdc8d7;border-radius:7px;background:white;color:#16283b;font-size:12px; }
      .rodapeacoes { display:flex;justify-content:space-between;gap:8px;margin-top:9px; }
      .vazio { padding:22px 13px;text-align:center;color:#617086;font-size:12px; }
      .rodape { background:#fafbfd;color:#64758a;font-size:10px;padding:9px 13px;border-top:1px solid #e4e9ef; }
      .erro { color:#aa2525;font-weight:700; }
      @media(max-width:520px) { .linha { flex-direction:column;gap:7px; }.direita { flex-direction:row;align-items:center; } .metadados { grid-template-columns:1fr; } }
    </style>
    <section class="painel" id="painel" aria-label="Painel de supervisão">
      <div class="cabecalho">
        <div class="titulo">
          <span>Supervisão de atendimentos</span>
          <div class="ações"><button class="mini" id="exportar" title="Salvar backup dos relatos em JSON">Exportar</button><button class="mini" id="importar" title="Restaurar backup em JSON">Importar</button></div>
        </div>
        <p class="descricao" id="descricao">1 token a cada 30 minutos de atendimento</p>
      </div>
      <div class="abas">
        <button type="button" class="aba" data-aba="pendentes" id="aba-pendentes">Pendentes <b id="n-pendentes">0</b></button>
        <button type="button" class="aba" data-aba="acompanhando" id="aba-acompanhando">Acompanhando <b id="n-acompanhando">0</b></button>
      </div>
      <div class="subnav" id="subnav" hidden>
        <button type="button" data-filtro="ativos">Ativos</button>
        <button type="button" data-filtro="encerrados">Encerrados</button>
      </div>
      <div class="lista" id="lista"></div>
      <div class="rodape" id="rodape">Dados salvos neste navegador pelo Tampermonkey. Use Exportar para fazer backup.</div>
    </section>
    <button type="button" class="botao" id="alternar" aria-label="Abrir supervisão">Supervisão <span class="contador zerado" id="contador">0</span></button>
    <input type="file" id="arquivo" accept="application/json,.json" hidden>
  `;
  document.body.appendChild(host);
  const $ = seletor => shadow.querySelector(seletor);

  $('#alternar').addEventListener('click', () => {
    painelAberto = !painelAberto;
    $('#painel').classList.toggle('aberto', painelAberto);
    $('#alternar').setAttribute('aria-expanded', String(painelAberto));
    renderizar(true);
  });
  shadow.querySelectorAll('[data-aba]').forEach(botao => botao.addEventListener('click', () => {
    aba = botao.dataset.aba;
    selecionado = null;
    renderizar(true);
  }));
  shadow.querySelectorAll('[data-filtro]').forEach(botao => botao.addEventListener('click', () => {
    filtroAcompanhamento = botao.dataset.filtro;
    selecionado = null;
    renderizar(true);
  }));
  $('#exportar').addEventListener('click', exportarBackup);
  $('#importar').addEventListener('click', () => $('#arquivo').click());
  $('#arquivo').addEventListener('change', async event => {
    const arquivo = event.target.files?.[0];
    event.target.value = '';
    if (arquivo) await importarBackup(arquivo);
  });

  function atualizarResumo() {
    const p = pendentes().length;
    const a = acompanhando().length;
    const alertas = totalAlertas();
    document.title = alertas ? `(${alertas}) ${TITLE_BASE} • Supervisão` : TITLE_BASE;
    $('#contador').textContent = String(alertas);
    $('#contador').classList.toggle('zerado', !alertas);
    $('#n-pendentes').textContent = String(p);
    $('#n-acompanhando').textContent = String(a);
    $('#aba-pendentes').classList.toggle('ativa', aba === 'pendentes');
    $('#aba-acompanhando').classList.toggle('ativa', aba === 'acompanhando');
    $('#subnav').hidden = aba !== 'acompanhando';
    $('#subnav').querySelectorAll('[data-filtro]').forEach(b => b.classList.toggle('ativo', b.dataset.filtro === filtroAcompanhamento));
    $('#descricao').textContent = `${plural(alertas, 'verificação necessária', 'verificações necessárias')} · 1 token / 30 min`;
    $('#rodape').innerHTML = salvamentoFalhou
      ? '<span class="erro">Falha ao salvar. Faça backup do conteúdo e confira o Tampermonkey.</span>'
      : 'Registros persistentes neste navegador. Exportar cria um backup JSON.';
  }
  function renderizar(forcar = false) {
    atualizarResumo();
    if (!painelAberto) return;
    // Não apagar/recriar o textarea enquanto o gerente está digitando.
    if (!forcar && shadow.activeElement?.tagName === 'TEXTAREA') return;
    const lista = $('#lista');
    const scroll = lista.scrollTop;
    lista.replaceChildren();
    const itens = aba === 'pendentes' ? pendentes()
      : filtroAcompanhamento === 'ativos' ? acompanhando() : encerradosAcompanhados().slice(0, CONFIG.maxHistoricoRenderizado);
    if (!itens.length) {
      lista.innerHTML = `<div class="vazio">${aba === 'pendentes' ? 'Nenhum atendimento pendente de acompanhamento.' : filtroAcompanhamento === 'ativos' ? 'Nenhum atendimento em acompanhamento.' : 'Nenhum acompanhamento encerrado registrado.'}</div>`;
      return;
    }
    for (const registro of itens) {
      const cartao = document.createElement('article');
      cartao.className = 'cartao';
      const bloco = document.createElement('div');
      bloco.className = 'linha';
      const informacoes = document.createElement('div');
      informacoes.style.cssText = 'flex:1;min-width:0';
      const t = tokens(registro);
      const ehPendente = aba === 'pendentes';
      const emRevisao = revisaoNecessaria(registro);
      const nomeHtml = `<div class="nome">${escapatoria(registro.analista)}</div>
        <div class="muted">${escapatoria(registro.cliente)}</div>
        <div class="muted">${escapatoria(registro.equipe)}</div>
        <div class="tempo">${hhmm(registro.ultimoMinuto)} de atendimento <span class="token">${plural(t, 'token', 'tokens')}</span></div>`;
      if (ehPendente) {
        informacoes.innerHTML = nomeHtml;
      } else {
        const abrir = document.createElement('button');
        abrir.type = 'button';
        abrir.className = 'abrir';
        abrir.innerHTML = nomeHtml;
        abrir.title = 'Abrir relatos e informações do atendimento';
        abrir.setAttribute('aria-expanded', String(selecionado === registro.id));
        abrir.addEventListener('click', () => {
          selecionado = selecionado === registro.id ? null : registro.id;
          renderizar(true);
        });
        informacoes.appendChild(abrir);
      }
      bloco.appendChild(informacoes);
      const direita = document.createElement('div');
      direita.className = 'direita';
      if (ehPendente) {
        const b = document.createElement('button');
        b.className = 'acao';
        b.type = 'button';
        b.textContent = 'Acompanhar';
        b.addEventListener('click', () => acompanhar(registro.id));
        direita.appendChild(b);
      } else if (registro.status === 'encerrado') {
        const etiqueta = document.createElement('span');
        etiqueta.className = 'muted';
        etiqueta.textContent = 'Encerrado';
        direita.appendChild(etiqueta);
      } else {
        const etiqueta = document.createElement('span');
        etiqueta.className = emRevisao ? 'alerta' : 'ok';
        etiqueta.textContent = emRevisao ? 'Nova verificação' : 'Em acompanhamento';
        direita.appendChild(etiqueta);
        const desde = document.createElement('span');
        desde.className = 'muted';
        desde.textContent = `Há ${relogio(registro.acompanhadoDesde)}`;
        direita.appendChild(desde);
      }
      bloco.appendChild(direita);
      cartao.appendChild(bloco);
      if (!ehPendente && selecionado === registro.id) cartao.appendChild(detalhesRegistro(registro));
      lista.appendChild(cartao);
    }
    lista.scrollTop = scroll;
  }
  function detalhesRegistro(registro) {
    const encerrado = registro.status === 'encerrado';
    const area = document.createElement('div');
    area.className = 'detalhes';
    area.innerHTML = `
      <div class="metadados">
        <div><strong>Analista:</strong> ${escapatoria(registro.analista)}</div>
        <div><strong>Tempo total:</strong> ${hhmm(registro.ultimoMinuto)}</div>
        <div><strong>Acompanhamento:</strong> ${encerrado ? hhmm(Math.floor(Math.max(0, ((registro.ultimoVistoEm || registro.encerradoEm) - (registro.acompanhadoDesde || registro.encerradoEm)) / 60000))) : relogio(registro.acompanhadoDesde)}</div>
        <div><strong>Iniciado em:</strong> ${dataHora(registro.acompanhadoDesde)}</div>
        ${encerrado ? `<div><strong>Finalizado em:</strong> ${dataHora(registro.encerradoEm)}</div>` : ''}
        <div><strong>Tokens:</strong> ${tokens(registro)}</div>
      </div>
      <div class="secao">Relatos registrados (${(registro.notas || []).length})</div>
    `;
    if (!(registro.notas || []).length) {
      const vazio = document.createElement('div');
      vazio.className = 'muted';
      vazio.textContent = 'Nenhum relato salvo ainda.';
      area.appendChild(vazio);
    }
    for (const nota of (registro.notas || []).slice().reverse()) {
      const n = document.createElement('div');
      n.className = 'nota';
      const horario = document.createElement('div');
      horario.className = 'data';
      horario.textContent = dataHora(nota.em);
      const corpo = document.createElement('div');
      corpo.textContent = nota.texto;
      n.append(horario, corpo);
      area.appendChild(n);
    }
    if (!encerrado) {
      const titulo = document.createElement('div');
      titulo.className = 'secao';
      titulo.textContent = 'Novo relato';
      const campo = document.createElement('textarea');
      campo.placeholder = 'O que foi verificado, orientado ou realizado?';
      campo.value = rascunhos[registro.id] || '';
      campo.addEventListener('input', () => { rascunhos[registro.id] = campo.value; });
      const acoes = document.createElement('div');
      acoes.className = 'rodapeacoes';
      const voltar = document.createElement('button');
      voltar.type = 'button';
      voltar.className = 'acao secundaria';
      voltar.textContent = 'Voltar a pendentes';
      voltar.addEventListener('click', () => voltarPendente(registro.id));
      const salvar = document.createElement('button');
      salvar.type = 'button';
      salvar.className = 'acao';
      salvar.textContent = 'Salvar relato';
      salvar.addEventListener('click', () => salvarRelato(registro.id));
      acoes.append(voltar, salvar);
      area.append(titulo, campo, acoes);
      if (revisaoNecessaria(registro)) {
        const aviso = document.createElement('div');
        aviso.className = 'alerta';
        aviso.style.marginTop = '8px';
        aviso.textContent = 'Novo marco de 30 minutos: salvar um relato confirma esta revisão.';
        area.appendChild(aviso);
      }
    }
    return area;
  }
  function exportarBackup() {
    try {
      const json = JSON.stringify({ formato: 'maxdata-supervisao-backup', exportadoEm: new Date().toISOString(), ...estado }, null, 2);
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `MaxData_Supervisao_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch (erro) {
      console.error('[MaxData Supervisão] Falha no backup:', erro);
      alert('Falha ao gerar backup. Consulte o console do navegador.');
    }
  }
  async function importarBackup(arquivo) {
    try {
      if (arquivo.size > 30 * 1024 * 1024) throw new Error('Arquivo de backup muito grande.');
      const json = JSON.parse(await arquivo.text());
      if (json?.versao !== 2 || !json.ativos || typeof json.ativos !== 'object' || Array.isArray(json.ativos) || !Array.isArray(json.encerrados)) {
        throw new Error('Arquivo incompatível: não é um backup de supervisão v2.');
      }
      if (!window.confirm(`Importar este backup?\n\nAtivos: ${Object.keys(json.ativos).length}\nHistórico: ${json.encerrados.length}\n\nOs registros locais atuais serão SUBSTITUÍDOS. Faça uma exportação antes, se necessário.`)) return;
      const anterior = estado;
      estado = { versao: 2, ativos: json.ativos, encerrados: json.encerrados };
      if (!persistir()) { estado = anterior; throw new Error('Falha ao gravar backup importado.'); }
      selecionado = null;
      rascunhos = {};
      ausencias.clear();
      renderizar(true);
      alert('Backup importado com sucesso.');
    } catch (erro) {
      console.error('[MaxData Supervisão] Falha ao importar:', erro);
      alert(`Não foi possível importar: ${erro.message}`);
    }
  }

  renderizar();
  verificar();
  window.setInterval(verificar, CONFIG.varreduraMs);
})();
