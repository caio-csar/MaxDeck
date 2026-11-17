// ==UserScript==
// @name         MaxRelator | Notificador MaxData
// @namespace    maxdata-maxrelator-local
// @version      3.1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxRelator%20Notificador%20MaxData.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxRelator%20Notificador%20MaxData.user.js
// @description  Alertas nativos; foco na fila apenas se disponível; relato abre a OS automaticamente com aviso temporário.
// @match        https://painel.maxdata.com.br/*
// @match        *://externo.maxdatasistema.com.br/Atendimentos/Atendimento/*
// @run-at       document-start
// @noframes
// @sandbox      JavaScript
// @grant        unsafeWindow
// @grant        window.focus
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_getTabs
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_removeValueChangeListener
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      externo.maxdatasistema.com.br
// ==/UserScript==

(() => {
    'use strict';
    const BASE = 'http://externo.maxdatasistema.com.br/Atendimentos/Atendimento/';
    const TESTE_OS = '1160376';
    const MIN = 60000;
    const LIMITE_RELATO = 30 * MIN;
    const KEY = { analista: 'mr3_analista', comando: 'mr3_comando', ack: 'mr3_ack', avisos: 'mr3_avisos' };
    const log = (...args) => console.log('[MaxRelator]', ...args);
    const warn = (...args) => console.warn('[MaxRelator]', ...args);
    const limpar = s => String(s ?? '').replace(/\s+/g, ' ').trim();
    const nome = s => limpar(s).replace(/^\d+\s*-\s*/, '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
    const id = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const esperar = ms => new Promise(r => setTimeout(r, ms));
    const urlOS = os => BASE + encodeURIComponent(os);
    const osValida = os => /^\d+$/.test(String(os));
    const osNaPagina = () => location.pathname.match(/^\/Atendimentos\/Atendimento\/(\d+)\/?$/i)?.[1] || null;

    // Alertas de fila só podem trazer o painel à frente quando autorizado.
    function nativa({ title, text, tag, os, destacar = false, lembrete = null }) {
        const op = { title, text, tag, silent: false, timeout: 0, highlight: destacar === true };
        if (os && osValida(os)) {
            op.url = urlOS(os); // fallback se o painel for fechado antes do clique
            op.onclick = ev => {
                ev?.preventDefault?.();
                abrirOuFocar(String(os), lembrete).catch(e => warn('Falha ao abrir OS:', e.message));
            };
        }
        try { GM_notification(op); } catch (e) { warn('Falha na notificação:', e.message); }
    }

    // Toast HTML somente na OS correta; sem bloquear os campos nativos.
    let toastTimer, toastFim;
    function mostrarToastRelato(lembrete) {
        if (!lembrete || !osNaPagina()) return;
        const montar = () => {
            if (!document.body) return;
            clearTimeout(toastTimer); clearTimeout(toastFim);
            document.getElementById('mr31-toast-relato')?.remove();
            const host = document.createElement('div');
            host.id = 'mr31-toast-relato';
            Object.assign(host.style, { position:'fixed', right:'24px', bottom:'24px', zIndex:'2147483647', width:'min(380px, calc(100vw - 48px))', pointerEvents:'none' });
            const shadow = host.attachShadow({mode:'open'});
            const style = document.createElement('style');
            style.textContent = `:host{font-family:Arial,sans-serif} .toast{box-sizing:border-box;background:#20252d;color:#fff;border:1px solid #48515e;border-left:5px solid #ef4444;border-radius:9px;box-shadow:0 7px 26px #0005;overflow:hidden;pointer-events:auto;position:relative;opacity:1;transform:translateY(0);transition:opacity .65s ease, transform .65s ease} .content{padding:16px 36px 15px 15px} strong{font-size:14px;letter-spacing:.3px;color:#fca5a5;display:block;margin:0 0 8px} p{margin:5px 0;font-size:13px;line-height:1.4;color:#f1f5f9;overflow-wrap:anywhere} .small{color:#cbd5e1;font-size:12px} button{position:absolute;top:7px;right:7px;border:0;border-radius:4px;background:transparent;color:#fff;font-size:21px;cursor:pointer;line-height:1;padding:4px 7px} button:hover{background:#ffffff20} .bar{height:3px;background:#ef4444;transform-origin:left;animation:mr31-progress 12s linear forwards}@keyframes mr31-progress{to{transform:scaleX(0)}} .out{opacity:0;transform:translateY(10px);pointer-events:none}@media(prefers-reduced-motion:reduce){.toast{transition:none}.bar{animation:none}}`;
            const toast = document.createElement('div'); toast.className='toast'; toast.setAttribute('role','status'); toast.setAttribute('aria-live','polite');
            const content = document.createElement('div'); content.className='content';
            const titulo = document.createElement('strong'); titulo.textContent = '🔴 ⚠ RELATO OBRIGATÓRIO' + (lembrete.teste ? ' · TESTE' : '');
            const os = document.createElement('p'); os.textContent = `OS ${osNaPagina()}${lembrete.cliente ? ' · ' + lembrete.cliente : ''}`;
            const mensagem = document.createElement('p'); mensagem.textContent = `Hora de relatar! ${Number.isFinite(lembrete.minutos) ? lembrete.minutos : 30} minutos sem relato.`;
            const instrucao = document.createElement('p'); instrucao.className='small'; instrucao.textContent = 'Registre o andamento no campo de acompanhamento da OS.';
            const fechar = document.createElement('button'); fechar.type='button'; fechar.setAttribute('aria-label','Fechar aviso'); fechar.textContent='×';
            const barra = document.createElement('div'); barra.className='bar';
            content.append(titulo, os, mensagem, instrucao); toast.append(content, fechar, barra); shadow.append(style,toast); document.body.append(host);
            const sumir = () => { clearTimeout(toastTimer); toast.classList.add('out'); toastFim = setTimeout(() => host.remove(), 700); };
            fechar.addEventListener('click', sumir); toastTimer = setTimeout(sumir, 12000);
        };
        if (document.body) montar(); else document.addEventListener('DOMContentLoaded', montar, {once:true});
    }

    // O fragmento não é enviado ao servidor; é usado apenas para acionar o toast.
    function urlComLembrete(os, lembrete) {
        return lembrete ? `${urlOS(os)}#mr31-relato=${encodeURIComponent(JSON.stringify(lembrete))}` : urlOS(os);
    }
    function lerLembreteURL() {
        const prefixo = '#mr31-relato=';
        if (!location.hash.startsWith(prefixo)) return;
        try {
            const lembrete = JSON.parse(decodeURIComponent(location.hash.slice(prefixo.length)));
            if (lembrete && typeof lembrete === 'object') mostrarToastRelato(lembrete);
        } catch(e) { warn('Aviso da OS:', e.message); }
        try { history.replaceState(history.state, '', location.pathname + location.search); } catch (_) {}
    }

    function registrarGuiaOS() {
        const os = osNaPagina();
        if (!os) return;
        const instancia = id();
        GM_addValueChangeListener(KEY.comando, (_, __, msg) => {
            if (!msg || msg.alvo !== instancia || String(msg.os) !== osNaPagina()) return;
            if (Date.now() - msg.em > 4000) return;
            try {
                window.focus(); // @grant window.focus: foco da guia pelo Tampermonkey
                mostrarToastRelato(msg.lembrete);
                GM_setValue(KEY.ack, msg.id);
            } catch (e) { warn('Falha ao focar guia:', e.message); }
        });
        function marcar() {
            GM_getTab(tab => {
                tab.maxrelator = { tipo: 'os', os, instancia };
                GM_saveTab(tab);
            });
        }
        marcar();
        window.addEventListener('pageshow', marcar);
        log('Guia da OS registrada:', os);
    }
    if (location.hostname === 'externo.maxdatasistema.com.br') {
        registrarGuiaOS();
        lerLembreteURL();
        window.addEventListener('hashchange', lerLembreteURL);
        return;
    }

    function guias() {
        return new Promise(resolve => {
            const t = setTimeout(() => resolve({}), 1200);
            GM_getTabs(tabs => { clearTimeout(t); resolve(tabs || {}); });
        });
    }
    function solicitarFoco(alvo, os, lembrete) {
        return new Promise(resolve => {
            const comando = id();
            let terminou = false;
            let timer, listener;
            function fim(ok) {
                if (terminou) return;
                terminou = true;
                clearTimeout(timer);
                GM_removeValueChangeListener(listener);
                resolve(ok);
            }
            listener = GM_addValueChangeListener(KEY.ack, (_, __, valor) => { if (valor === comando) fim(true); });
            timer = setTimeout(() => fim(false), 4000);
            GM_setValue(KEY.comando, { id: comando, alvo, os, lembrete, em: Date.now() });
        });
    }
    let filaAbertura = Promise.resolve();
    const aberturasRecentes = new Map();
    function abrirOuFocar(os, lembrete = null) {
        if (!osValida(os)) return Promise.reject(new Error('OS inválida'));
        filaAbertura = filaAbertura.catch(() => {}).then(async () => {
            const tabs = await guias();
            const candidatas = Object.values(tabs).map(t => t?.maxrelator)
                .filter(t => t?.tipo === 'os' && String(t.os) === os);
            for (const t of candidatas) {
                if (await solicitarFoco(t.instancia, os, lembrete)) { log('Foco solicitado para guia da OS', os); return; }
            }
            // Evita abrir duas vezes enquanto uma primeira guia ainda carrega.
            const recente = aberturasRecentes.get(os);
            if (recente && Date.now() - recente.em < 10000 && !recente.tab?.closed) {
                try { recente.tab?.focus?.(); } catch (_) {}
                return;
            }
            const tab = GM_openInTab(urlComLembrete(os, lembrete), { active: true, insert: true });
            aberturasRecentes.set(os, { tab, em: Date.now() });
            for (const [chave, r] of aberturasRecentes) if (Date.now() - r.em > 30000) aberturasRecentes.delete(chave);
            log('Nova guia aberta para OS', os);
        });
        return filaAbertura;
    }
    function alertaOS(alerta) {
        nativa({ ...alerta, destacar: false });
        // Não destaca o painel: abre/foca diretamente a OS no disparo, sem exigir clique.
        if (osValida(alerta.os)) abrirOuFocar(String(alerta.os), alerta.lembrete).catch(e => {
            warn('Abertura automática da OS:', e.message);
            nativa({ title:'MaxRelator — abertura da OS', text:`Não consegui abrir a OS ${alerta.os}. Clique aqui para tentar novamente.`, tag:`mr-erro-abrir-${alerta.os}`, os:alerta.os, lembrete:alerta.lembrete });
        });
    }

    // Conservador: só autoriza foco se a tabela correta contiver o nome exato.
    function disponibilidade() {
        if (!configurado) return 'não configurado';
        const tabelas = [...document.querySelectorAll('table')].filter(t => {
            const cab = [...t.querySelectorAll('th')].filter(th => th.closest('table') === t).map(th => nome(th.textContent));
            return cab.includes('ATENDENTE') && cab.includes('TEMPO');
        });
        if (!tabelas.length) return 'não identificada';
        for (const tabela of tabelas) {
            if (/Nenhum Atendente Dispon[ií]vel/i.test(tabela.innerText || tabela.textContent || '')) continue;
            const linhas = [...tabela.querySelectorAll('tr')].filter(tr => tr.closest('table') === tabela);
            for (const tr of linhas) {
                const celulas = [...tr.cells].filter(c => c.tagName === 'TD');
                if (celulas.length >= 2 && nome(celulas[0].innerText || celulas[0].textContent) === nome(configurado)) return 'sim';
            }
        }
        return 'não';
    }
    function alertaFila(alerta) { nativa({ ...alerta, destacar: disponibilidade() === 'sim' }); }


    // ─── Fila pendente: usa DOM, sem incluir o relógio na identidade ───
    // O painel exibido usa HH:mm. Alterar para MM:ss se o formato real mudar.
    const FORMATO_TEMPO = 'HH:mm';
    function tempoSeg(s) {
        const p = s.split(':').map(Number);
        if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
        return FORMATO_TEMPO === 'HH:mm' ? p[0] * 3600 + p[1] * 60 : p[0] * 60 + p[1];
    }
    const tolerancia = FORMATO_TEMPO === 'HH:mm' ? 65 : 5;
    let pendentes = null;
    let ultimoDOM = 0;
    function lerFila() {
        const painel = document.querySelector('#pending_so');
        if (!painel) return null;
        const linhas = [...painel.querySelectorAll('tr')];
        const itens = linhas.map(tr => {
            const t = limpar(tr.innerText);
            const label = t.match(/ATENDIMENTO\s+\d+/i)?.[0];
            const tempo = t.match(/\b\d{1,3}:\d{2}(?::\d{2})?\b/)?.[0];
            if (!label || !tempo) return null;
            const chave = ['data-ticket-id','data-atendimento-id','data-so-id'].map(a => tr.getAttribute(a)).find(Boolean) || null;
            return { chave, label, tempo, seg: tempoSeg(tempo), texto: t };
        }).filter(Boolean);
        if (itens.length) return itens;
        if (/Nenhum Atendimento Pendente/i.test(painel.innerText || '')) return [];
        return null; // estado transitório/HTML não reconhecido
    }
    function reconciliar(atuais, prev, delta, token = id) {
        const rest = [...prev];
        return atuais.map(a => {
            let i = a.chave ? rest.findIndex(b => b.chave === a.chave) : -1;
            if (i < 0 && !a.chave) {
                let melhor = Infinity;
                rest.forEach((b, j) => {
                    if (b.chave || a.seg < b.seg) return;
                    const erro = Math.abs(a.seg - b.seg - delta);
                    if (erro <= tolerancia && erro < melhor) { melhor = erro; i = j; }
                });
            }
            const b = i >= 0 ? rest.splice(i, 1)[0] : null;
            return { ...a, token: b?.token || token(), aviso5: b?.aviso5 || false, novo: !b };
        });
    }
    function verificarFila() {
        const itens = lerFila();
        if (itens === null) return;
        const agora = Date.now();
        if (pendentes === null) {
            pendentes = itens.map(a => ({ ...a, token: id(), aviso5: a.seg >= 300 }));
        } else {
            const delta = (agora - ultimoDOM) / 1000;
            pendentes = reconciliar(itens, pendentes, delta);
            for (const a of pendentes) {
                if (a.novo) alertaFila({ title: '🔔 NOVO ATENDIMENTO', text: `${a.texto}\nNovo atendimento na fila.`, tag: `mr-novo-${a.token}` });
                if (a.seg >= 300 && !a.aviso5) {
                    a.aviso5 = true;
                    alertaFila({ title: '🟠 ATENDIMENTO AGUARDANDO', text: `${a.label}\nTempo de espera: ${a.tempo}\nAguardando há 5 minutos ou mais.`, tag: `mr-fila5-${a.token}` });
                }
            }
        }
        ultimoDOM = agora;
    }

    // ─── Socket: mesmos campos do script de supervisão ───
    const pagina = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    const mensagensVistas = new WeakSet();
    let ativos = new Map(), ultimoPacote = 0;
    let configurado = limpar(GM_getValue(KEY.analista, ''));
    let monitorando = false, ocupado = false;
    let ultimoErro = 0, pausaAte = 0;
    let avisos = {};
    function carregarAvisos() {
        const v = GM_getValue(KEY.avisos, {});
        avisos = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
        for (const k of Object.keys(avisos)) if (!avisos[k] || Date.now() - avisos[k].em > 2 * 86400000) delete avisos[k];
    }
    function salvarAvisos() { GM_setValue(KEY.avisos, avisos); }
    function receber(valor, ev) {
        if (typeof valor !== 'string' || !valor.startsWith('42') || !valor.includes('os_em_atendimento')) return;
        if (ev && typeof ev === 'object') { if (mensagensVistas.has(ev)) return; mensagensVistas.add(ev); }
        const inicio = valor.indexOf('[');
        if (inicio < 0) return;
        let msg;
        try { msg = JSON.parse(valor.slice(inicio)); } catch (_) { return; }
        if (msg?.[0] !== 'data' || !Array.isArray(msg[1]?.os_em_atendimento)) return;
        const agora = Date.now(), novos = new Map();
        for (const item of msg[1].os_em_atendimento) {
            if (!osValida(item?.vedId)) continue;
            const os = String(item.vedId), analista = limpar(item.Analista);
            if (!analista) continue;
            const anterior = ativos.get(os);
            const transf = Date.parse(item.transfDate);
            const de = Number.isFinite(transf) && transf <= agora + MIN ? transf : (anterior && nome(anterior.analista) === nome(analista) ? anterior.de : agora);
            const chave = `${os}|${nome(analista)}|${de}`;
            const mesmo = anterior?.chave === chave;
            novos.set(os, { os, cliente: limpar(item.Fantasia), analista, de, chave,
                proxima: mesmo ? anterior.proxima : de + LIMITE_RELATO,
                ultimo: mesmo ? anterior.ultimo : null });
        }
        ativos = novos;
        ultimoPacote = agora;
    }
    function instalarSocket() {
        try {
            const proto = pagina.MessageEvent?.prototype;
            const desc = proto && Object.getOwnPropertyDescriptor(proto, 'data');
            if (desc?.get && desc.configurable) Object.defineProperty(proto, 'data', {
                ...desc, get() { const dado = desc.get.call(this); try { receber(dado, this); } catch (e) { warn(e.message); } return dado; }
            });
        } catch (e) { warn('MessageEvent:', e.message); }
        try {
            const Nativo = pagina.WebSocket;
            if (typeof Nativo !== 'function') return;
            pagina.WebSocket = new Proxy(Nativo, { construct(target, args, novoAlvo) {
                const ws = Reflect.construct(target, args, novoAlvo);
                ws.addEventListener('message', ev => { try { receber(ev.data, ev); } catch (e) { warn(e.message); } });
                return ws;
            } });
        } catch (e) { warn('WebSocket:', e.message); }
    }
    instalarSocket();

    const automaticos = [/capturou este atendimento/i, /^Mudou (a|o|as|os) /i, /transferiu (este|o) atendimento/i, /^Atendimento (transferido|finalizado|encerrado|reaberto)/i, /^Tempo de atendimento:/i];
    function dataBR(txt) {
        const m = /(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/.exec(txt || '');
        return m ? new Date(+m[3], +m[2] - 1, +m[1], +m[4], +m[5], +(m[6] || 0)).getTime() : null;
    }
    function lerUltimo(html, urlFinal, r, agora = Date.now()) {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const caixa = doc.querySelector('#divAcompanhamento');
        if (!caixa) {
            const erro = new Error(doc.querySelector('input[type="password"]') || /login|account/i.test(urlFinal || '') ? 'Sessão do MaxAtendimento não reconhecida.' : 'Histórico da OS não localizado.');
            erro.login = /sessão/i.test(erro.message); throw erro;
        }
        let ultimo = r.de;
        const vistos = new Set();
        for (const autorEl of caixa.querySelectorAll('.postauthor')) {
            const tr = autorEl.closest('tr');
            if (!tr || vistos.has(tr)) continue;
            vistos.add(tr);
            if (nome(autorEl.textContent) !== nome(r.analista)) continue;
            const daLinha = seletor => [...tr.querySelectorAll(seletor)].find(n => n.closest('tr') === tr);
            const tabela = tr.closest('table');
            const cab = tabela && [...tabela.children].find(c => c.tagName === 'THEAD');
            if (!/^\d+\s*-\s*\S/.test(limpar(autorEl.textContent)) && limpar(cab?.querySelector('th')?.textContent).toLowerCase() !== 'analista') continue;
            const em = dataBR(daLinha('.postdetails')?.textContent);
            if (!em || em < r.de || em > agora + MIN) continue;
            const corpo = daLinha('div.postbody')?.cloneNode(true);
            if (!corpo) continue;
            corpo.querySelectorAll('br').forEach(br => br.replaceWith('\n'));
            const uteis = corpo.textContent.split('\n').map(limpar).filter(t => t && !automaticos.some(rx => rx.test(t)) && /[\p{L}\p{N}]/u.test(t));
            if (uteis.length) ultimo = Math.max(ultimo, em);
        }
        return ultimo;
    }
    function buscarOS(os) {
        return new Promise((resolve, reject) => GM_xmlhttpRequest({
            method: 'GET', url: urlOS(os), anonymous: false, nocache: true, timeout: 20000,
            headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
            onload: r => r.status === 200 ? resolve(r) : reject(new Error(`HTTP ${r.status}`)),
            onerror: () => reject(new Error('Falha de rede')), ontimeout: () => reject(new Error('Tempo esgotado'))
        }));
    }
    function janelaAviso(ultimo, agora) { return Math.floor((agora - ultimo) / LIMITE_RELATO); }
    async function verificarRelatos() {
        if (!monitorando || ocupado || !configurado || Date.now() < pausaAte || Date.now() - ultimoPacote > 45000) return;
        ocupado = true;
        try {
            const minhas = [...ativos.values()].filter(r => nome(r.analista) === nome(configurado) && Date.now() >= r.proxima);
            for (const r of minhas) {
                if (!monitorando || nome(configurado) !== nome(r.analista) || ativos.get(r.os)?.chave !== r.chave || Date.now() - ultimoPacote > 45000) continue;
                let atual = ativos.get(r.os);
                atual.proxima = Date.now() + MIN;
                try {
                    const resp = await buscarOS(r.os);
                    atual = ativos.get(r.os);
                    if (!monitorando || !atual || atual.chave !== r.chave || nome(atual.analista) !== nome(configurado) || Date.now() - ultimoPacote > 45000) continue;
                    const agora = Date.now();
                    const ultimo = lerUltimo(resp.responseText, resp.finalUrl, atual, agora);
                    atual.ultimo = ultimo;
                    const janela = janelaAviso(ultimo, agora);
                    if (janela > 0) {
                        const marca = `${ultimo}|${janela}`;
                        if (avisos[atual.chave]?.marca !== marca) {
                            avisos[atual.chave] = { marca, em: agora };
                            salvarAvisos();
                            alertaOS({ title: '🔴 ⚠ RELATO OBRIGATÓRIO', text: `Cliente: ${atual.cliente || 'Não informado'}\nOS: ${atual.os} • ${Math.floor((agora - ultimo) / MIN)} min sem relato\nA OS será aberta para relatar.`, tag: `mr-relato-${atual.os}`, os: atual.os, lembrete: { cliente: atual.cliente, minutos: Math.floor((agora - ultimo) / MIN) } });
                        }
                    } else {
                        atual.proxima = Math.max(agora + 1000, ultimo + LIMITE_RELATO);
                    }
                } catch (e) {
                    warn('Consulta da OS', r.os, e.message);
                    // Não acusa falta de relato sem conseguir conferir o histórico.
                    pausaAte = Date.now() + 2 * MIN;
                    if (Date.now() - ultimoErro > 5 * MIN) {
                        ultimoErro = Date.now();
                        nativa({title: '⚙ MaxRelator — consulta indisponível', text: 'Não foi possível conferir os relatos. Verifique o login no MaxAtendimento.', tag: 'mr-consulta-erro' });
                    }
                    break;
                } finally { await esperar(1500); }
            }
        } finally { ocupado = false; }
    }

    // Apenas uma guia do painel monitora por vez (Web Locks).
    let lockEmCurso = false, liberarLock = null, timerFila, timerRelato;
    function iniciarMonitor() {
        if (lockEmCurso) return;
        if (!navigator.locks?.request) { warn('Web Locks indisponível; monitor não iniciado para evitar duplicidade.'); return; }
        lockEmCurso = true;
        navigator.locks.request('maxrelator-v3-monitor', async () => {
            monitorando = true; pendentes = null; carregarAvisos();
            configurado = limpar(GM_getValue(KEY.analista, ''));
            timerFila = setInterval(verificarFila, 2000);
            timerRelato = setInterval(verificarRelatos, 10000);
            verificarFila(); verificarRelatos();
            log('Monitor ativo. Analista:', configurado || 'configure pelo menu do Tampermonkey');
            await new Promise(resolve => { liberarLock = resolve; });
            monitorando = false;
            clearInterval(timerFila); clearInterval(timerRelato);
        }).catch(e => warn('Falha ao iniciar monitor:', e.message)).finally(() => { lockEmCurso = false; liberarLock = null; });
    }
    window.addEventListener('pagehide', () => { monitorando = false; liberarLock?.(); });
    window.addEventListener('pageshow', () => { if (!lockEmCurso) iniciarMonitor(); });
    GM_addValueChangeListener(KEY.analista, (_, __, v) => {
        configurado = limpar(v);
        for (const r of ativos.values()) r.proxima = r.de + LIMITE_RELATO;
    });
    GM_registerMenuCommand('Configurar meu nome de analista', () => {
        const nomes = [...new Set([...ativos.values()].map(x => x.analista))].sort((a,b) => a.localeCompare(b, 'pt-BR'));
        const valor = prompt('Digite seu nome exatamente como aparece no painel (vazio desliga os lembretes de relato).\n\nAnalistas em atendimento:\n' + (nomes.join('\n') || 'Ainda não recebidos.'), configurado);
        if (valor === null) return;
        configurado = limpar(valor); GM_setValue(KEY.analista, configurado);
        for (const r of ativos.values()) r.proxima = r.de + LIMITE_RELATO;
        verificarRelatos();
    });
    GM_registerMenuCommand('Testar alerta de novo atendimento', () => alertaFila({title: '🔔 NOVO ATENDIMENTO · TESTE', text: 'Simulação: um atendimento entrou na fila.', tag: 'mr-teste-novo'}));
    GM_registerMenuCommand('Testar alerta de 5 minutos', () => alertaFila({title: '🟠 ATENDIMENTO AGUARDANDO · TESTE', text: 'Simulação: 5 minutos na fila.', tag: 'mr-teste-5'}));
    GM_registerMenuCommand('Testar alerta de relato e abertura da OS', () => {
        const os = prompt('Número da OS para testar a abertura (nenhum relato será publicado):', TESTE_OS);
        if (!os || !osValida(os.trim())) return;
        alertaOS({ title: '🔴 ⚠ RELATO OBRIGATÓRIO · TESTE', text: `OS: ${os.trim()}\nSimulação de 30 minutos sem relato.\nA OS será aberta automaticamente.`, tag: 'mr-teste-relato', os: os.trim(), lembrete: { teste: true, minutos: 30 } });
    });
    GM_registerMenuCommand('Diagnóstico do MaxRelator', () => {
        const segundos = ultimoPacote ? Math.round((Date.now() - ultimoPacote) / 1000) : null;
        const minhas = [...ativos.values()].filter(x => nome(x.analista) === nome(configurado));
        const detalhe = minhas.map(r => `OS ${r.os} — ${r.cliente || 'Cliente não informado'} — ${r.ultimo === null ? 'histórico ainda não conferido' : Math.max(0, Math.floor((Date.now()-r.ultimo)/MIN))+' min desde último relato/início'}`).join('\n');
        alert(`Monitor desta guia: ${monitorando ? 'ATIVO' : 'ESPERA'}\nAnalista: ${configurado || 'não configurado'}\nDisponível: ${disponibilidade()}\nÚltimo pacote: ${segundos === null ? 'não recebido' : segundos + ' s atrás'}\nOS em atendimento: ${ativos.size}\nMinhas OS: ${[...ativos.values()].filter(x => nome(x.analista) === nome(configurado)).length}\nFila: ${pendentes === null ? 'não lida' : pendentes.length}\n\n${detalhe || 'Nenhuma OS própria identificada.'}`);
    });
    iniciarMonitor();
})();
