// ==UserScript==
// @name         TendiChat - Semáforo de CNPJ por Ticket
// @namespace    maxdata.tendichat.cnpj.ticket
// @version      2.3.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Sem%C3%A1foro%20de%20CNPJ%20por%20Ticket.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Sem%C3%A1foro%20de%20CNPJ%20por%20Ticket.user.js
// @description  Monitora CNPJ válido, destaca o card inteiro e ordena os atendimentos pelo CNPJ mais antigo.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CFG = {
        AMARELO_MIN: 30,
        VERMELHO_MIN: 45,
        ATUALIZA_UI_MS: 10000,
        REVALIDAR_SEM_MUDANCA_MS: 90000,
        MAX_PAGINAS_MENSAGENS: 20,
        CONCORRENCIA: 3,
        STORAGE_KEY: 'tm_cnpj_ticket_cache_v2_1',
        ATTR_TICKET: 'data-tm-cnpj-ticket-id'
    };

    const MINUTO = 60000;

    const estado = {
        auth: null,
        apiOrigin: null,
        tickets: new Map(),
        cache: carregarCache(),
        fila: [],
        emFila: new Set(),
        ativos: 0,
        renderTimer: null
    };

    const originalFetch = typeof window.fetch === 'function'
        ? window.fetch.bind(window)
        : null;

    const xhrOpenOriginal = XMLHttpRequest.prototype.open;
    const xhrSendOriginal = XMLHttpRequest.prototype.send;
    const xhrSetHeaderOriginal = XMLHttpRequest.prototype.setRequestHeader;

    function log(...args) {
        console.log('[TendiChat CNPJ]', ...args);
    }

    function warn(...args) {
        console.warn('[TendiChat CNPJ]', ...args);
    }

    function somenteNumeros(valor) {
        return String(valor || '').replace(/\D/g, '');
    }

    function normalizar(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function validarCNPJ(cnpj) {
        cnpj = somenteNumeros(cnpj);

        if (cnpj.length !== 14) return false;
        if (/^(\d)\1{13}$/.test(cnpj)) return false;

        const calc = (base, pesos) => {
            const soma = base
                .split('')
                .reduce((total, n, i) => total + Number(n) * pesos[i], 0);

            const resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        };

        const base = cnpj.slice(0, 12);
        const d1 = calc(base, [5,4,3,2,9,8,7,6,5,4,3,2]);
        const d2 = calc(base + d1, [6,5,4,3,2,9,8,7,6,5,4,3,2]);

        return cnpj === base + String(d1) + String(d2);
    }

    function extrairCNPJsValidos(texto) {
        const origem = String(texto || '');
        const encontrados = [];
        const vistos = new Set();

        const regex = /(^|[^\d])((?:\d[\s.\-/]*){14})(?![\s.\-/]*\d)/g;
        let match;

        while ((match = regex.exec(origem)) !== null) {
            const cnpj = somenteNumeros(match[2]);

            if (validarCNPJ(cnpj) && !vistos.has(cnpj)) {
                vistos.add(cnpj);
                encontrados.push(cnpj);
            }
        }

        return encontrados;
    }

    function carregarCache() {
        try {
            const bruto = localStorage.getItem(CFG.STORAGE_KEY);
            const dados = bruto ? JSON.parse(bruto) : {};
            return dados && typeof dados === 'object' ? dados : {};
        } catch (e) {
            return {};
        }
    }

    function salvarCache() {
        try {
            localStorage.setItem(CFG.STORAGE_KEY, JSON.stringify(estado.cache));
        } catch (e) {
            warn('Não foi possível salvar o cache local.', e);
        }
    }

    function headersParaObjeto(headers) {
        const saida = {};

        try {
            new Headers(headers || {}).forEach((valor, chave) => {
                saida[chave] = valor;
            });
        } catch (e) {}

        return saida;
    }

    function headersSeguros(headers) {
        const bloqueados = new Set([
            'host', 'content-length', 'origin', 'referer', 'connection',
            'cookie', 'sec-fetch-dest', 'sec-fetch-mode', 'sec-fetch-site',
            'sec-ch-ua', 'sec-ch-ua-mobile', 'sec-ch-ua-platform'
        ]);

        const resultado = {};

        Object.entries(headers || {}).forEach(([chave, valor]) => {
            if (!bloqueados.has(String(chave).toLowerCase())) {
                resultado[chave] = valor;
            }
        });

        if (!Object.keys(resultado).some(k => k.toLowerCase() === 'accept')) {
            resultado.Accept = 'application/json, text/plain, */*';
        }

        return resultado;
    }

    function ehURLTickets(url) {
        try {
            const u = new URL(url, location.href);
            return /\/api\/tickets\/?$/i.test(u.pathname);
        } catch (e) {
            return false;
        }
    }

    function ehURLMessages(url) {
        try {
            const u = new URL(url, location.href);
            return /\/api\/messages\/?$/i.test(u.pathname);
        } catch (e) {
            return false;
        }
    }

    function atualizarAuth(url, headers, credentials) {
        try {
            const u = new URL(url, location.href);
            estado.apiOrigin = u.origin;
        } catch (e) {}

        const limpos = headersSeguros(headers || {});

        estado.auth = {
            headers: {
                ...(estado.auth?.headers || {}),
                ...limpos
            },
            credentials: credentials || estado.auth?.credentials || 'include'
        };
    }

    function interceptarFetch() {
        if (!originalFetch) return;

        window.fetch = async function(input, init) {
            let request = null;
            let url = '';

            try {
                request = input instanceof Request
                    ? input
                    : new Request(input, init);

                url = request.url;

                if (ehURLTickets(url) || ehURLMessages(url)) {
                    atualizarAuth(
                        url,
                        headersParaObjeto(request.headers),
                        request.credentials || 'include'
                    );
                }
            } catch (e) {}

            const response = await originalFetch(input, init);

            if (ehURLTickets(url)) {
                try {
                    const json = await response.clone().json();
                    receberListaTickets(json, url);
                } catch (e) {
                    warn('Falha ao ler resposta de tickets via fetch.', e);
                }
            }

            return response;
        };
    }

    function interceptarXHR() {
        XMLHttpRequest.prototype.open = function(method, url, ...resto) {
            this.__tmCnpj = {
                method,
                url: String(url || ''),
                headers: {}
            };

            return xhrOpenOriginal.call(this, method, url, ...resto);
        };

        XMLHttpRequest.prototype.setRequestHeader = function(chave, valor) {
            if (this.__tmCnpj) {
                this.__tmCnpj.headers[chave] = valor;
            }

            return xhrSetHeaderOriginal.call(this, chave, valor);
        };

        XMLHttpRequest.prototype.send = function(body) {
            const meta = this.__tmCnpj;

            if (meta && (ehURLTickets(meta.url) || ehURLMessages(meta.url))) {
                atualizarAuth(
                    meta.url,
                    meta.headers,
                    this.withCredentials ? 'include' : 'same-origin'
                );
            }

            if (meta && ehURLTickets(meta.url)) {
                this.addEventListener('load', () => {
                    try {
                        const json =
                            typeof this.response === 'object' && this.response
                                ? this.response
                                : JSON.parse(this.responseText);

                        receberListaTickets(json, this.responseURL || meta.url);
                    } catch (e) {
                        warn('Falha ao ler resposta de tickets via XHR.', e);
                    }
                }, { once: true });
            }

            return xhrSendOriginal.call(this, body);
        };
    }

    function receberListaTickets(payload, url) {
        if (!payload || !Array.isArray(payload.data)) return;

        atualizarAuth(
            url,
            estado.auth?.headers || {},
            estado.auth?.credentials || 'include'
        );

        const agora = Date.now();
        const idsVisiveis = new Set();

        payload.data.forEach(ticket => {
            if (!ticket || !ticket.id) return;

            const id = String(ticket.id);
            idsVisiveis.add(id);
            estado.tickets.set(id, ticket);

            const cache = estado.cache[id];
            const mudou = !cache || cache.ticketUpdatedAt !== ticket.updatedAt;
            const expirouRevalidacao =
                !cache?.checkedAt ||
                agora - cache.checkedAt >= CFG.REVALIDAR_SEM_MUDANCA_MS;

            if (mudou || expirouRevalidacao) {
                enfileirarTicket(id);
            }
        });

        for (const id of Array.from(estado.tickets.keys())) {
            if (!idsVisiveis.has(id)) {
                estado.tickets.delete(id);
            }
        }

        salvarCache();
        agendarRender();
        processarFila();
    }

    function enfileirarTicket(id) {
        id = String(id);

        if (estado.emFila.has(id)) return;

        estado.emFila.add(id);
        estado.fila.push(id);
    }

    function processarFila() {
        while (
            estado.ativos < CFG.CONCORRENCIA &&
            estado.fila.length > 0
        ) {
            const id = estado.fila.shift();
            estado.emFila.delete(id);
            estado.ativos++;

            atualizarHistoricoTicket(id)
                .catch(e => warn(`Falha ao analisar ticket ${id}.`, e))
                .finally(() => {
                    estado.ativos--;
                    processarFila();
                });
        }
    }

    async function fazerFetchAPI(url) {
        if (!originalFetch) {
            throw new Error('window.fetch não está disponível.');
        }

        const response = await originalFetch(url, {
            method: 'GET',
            headers: headersSeguros(estado.auth?.headers || {}),
            credentials: estado.auth?.credentials || 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status} em ${url}`);
        }

        return response.json();
    }

    async function buscarCNPJMaisRecente(ticketId) {
        if (!estado.apiOrigin) {
            throw new Error('Origem da API ainda não foi identificada.');
        }

        let pagina = 1;

        while (pagina <= CFG.MAX_PAGINAS_MENSAGENS) {
            const url = new URL('/api/messages', estado.apiOrigin);
            url.searchParams.set('ticketId', ticketId);
            url.searchParams.set('page', String(pagina));

            const payload = await fazerFetchAPI(url.toString());
            const mensagens = Array.isArray(payload?.data) ? payload.data : [];
            const candidatos = [];

            mensagens.forEach(msg => {
                if (!msg || msg.fromMe !== false || msg.is_deleted === true) {
                    return;
                }

                const cnpjs = extrairCNPJsValidos(msg.body);

                if (!cnpjs.length) return;

                const timestamp = Date.parse(msg.createdAt || '');

                if (!Number.isFinite(timestamp)) return;

                candidatos.push({
                    cnpj: cnpjs[0],
                    sentAt: timestamp,
                    createdAt: msg.createdAt,
                    messageId: msg.id || null
                });
            });

            if (candidatos.length) {
                candidatos.sort((a, b) => b.sentAt - a.sentAt);
                return candidatos[0];
            }

            const lastPage = Number(payload?.last_page || pagina);

            if (pagina >= lastPage) break;

            pagina++;
        }

        return null;
    }

    async function atualizarHistoricoTicket(ticketId) {
        const ticket = estado.tickets.get(String(ticketId));

        if (!ticket) return;

        const encontrado = await buscarCNPJMaisRecente(String(ticketId));

        estado.cache[String(ticketId)] = {
            ticketUpdatedAt: ticket.updatedAt || null,
            checkedAt: Date.now(),
            cnpj: encontrado?.cnpj || null,
            cnpjSentAt: encontrado?.sentAt || null,
            messageId: encontrado?.messageId || null
        };

        salvarCache();
        agendarRender();
    }

    function obterNomeCard(article) {
        const img = article.querySelector('img[alt]');

        if (img?.alt?.trim()) {
            return img.alt.trim();
        }

        const titulo = Array.from(article.querySelectorAll('div'))
            .find(el => {
                const txt = (el.textContent || '').trim();
                const cls = String(el.className || '');
                return txt && /font-\[600\]/.test(cls);
            });

        return (titulo?.textContent || '').trim();
    }

    function obterPreviaCard(article) {
        const p = Array.from(article.querySelectorAll('p[title]'))
            .find(el => {
                const t = (el.getAttribute('title') || '').trim();
                return t && !/^\d+$/.test(t);
            });

        return (p?.getAttribute('title') || p?.textContent || '').trim();
    }

    function acharTicketDoCard(article) {
        const nome = normalizar(obterNomeCard(article));
        if (!nome) return null;

        const candidatos = Array.from(estado.tickets.values())
            .filter(ticket => normalizar(ticket?.contact?.name) === nome);

        if (candidatos.length === 1) {
            return candidatos[0];
        }

        if (candidatos.length > 1) {
            const previa = normalizar(obterPreviaCard(article));

            if (previa) {
                const exato = candidatos.find(ticket =>
                    normalizar(ticket.lastMessageText || ticket.lastMessage) === previa
                );

                if (exato) return exato;

                const parcial = candidatos.find(ticket => {
                    const ultima = normalizar(
                        ticket.lastMessageText || ticket.lastMessage
                    );

                    return ultima &&
                        (ultima.includes(previa) || previa.includes(ultima));
                });

                if (parcial) return parcial;
            }

            return candidatos[0];
        }

        return null;
    }

    function classeFaixa(minutos) {
        if (minutos >= CFG.VERMELHO_MIN) return 'tm-cnpj-card-red';
        if (minutos >= CFG.AMARELO_MIN) return 'tm-cnpj-card-yellow';
        return 'tm-cnpj-card-green';
    }

    function rotuloTempo(minutos) {
        if (minutos < 1) return '<1m';
        if (minutos < 60) return `${minutos}m`;

        const h = Math.floor(minutos / 60);
        const m = minutos % 60;

        return m
            ? `${h}h${String(m).padStart(2, '0')}`
            : `${h}h`;
    }

    function formatarData(timestamp) {
        try {
            return new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
            }).format(new Date(timestamp));
        } catch (e) {
            return new Date(timestamp).toLocaleString();
        }
    }

    function definirAtributoSeMudou(elemento, nome, valor) {
        if (!elemento) return;

        const atual = elemento.getAttribute(nome);
        const novo = String(valor);

        if (atual !== novo) {
            elemento.setAttribute(nome, novo);
        }
    }

    function limparCard(article) {
        if (article.hasAttribute(CFG.ATTR_TICKET)) {
            article.removeAttribute(CFG.ATTR_TICKET);
        }

        if (article.hasAttribute('data-tm-cnpj-banner')) {
            article.removeAttribute('data-tm-cnpj-banner');
        }

        article.classList.remove(
            'tm-cnpj-card-green',
            'tm-cnpj-card-yellow',
            'tm-cnpj-card-red',
            'tm-cnpj-highlight'
        );

        if (article.hasAttribute('data-tm-cnpj-monitorado')) {
            article.removeAttribute('data-tm-cnpj-monitorado');
        }
    }

    function atualizarCard(article, ticket) {
        const id = String(ticket.id);
        const cache = estado.cache[id];

        definirAtributoSeMudou(article, CFG.ATTR_TICKET, id);

        if (!cache?.cnpj || !cache?.cnpjSentAt) {
            if (article.hasAttribute('data-tm-cnpj-banner')) {
                article.removeAttribute('data-tm-cnpj-banner');
            }

            article.classList.remove(
                'tm-cnpj-card-green',
                'tm-cnpj-card-yellow',
                'tm-cnpj-card-red',
                'tm-cnpj-highlight'
            );

            article.removeAttribute('data-tm-cnpj-monitorado');
            return;
        }

        const minutos = Math.max(
            0,
            Math.floor((Date.now() - cache.cnpjSentAt) / MINUTO)
        );

        const faixa = classeFaixa(minutos);

        const classes = [
            'tm-cnpj-card-green',
            'tm-cnpj-card-yellow',
            'tm-cnpj-card-red'
        ];

        if (!article.classList.contains('tm-cnpj-highlight')) {
            article.classList.add('tm-cnpj-highlight');
        }

        classes.forEach(classe => {
            article.classList.toggle(classe, classe === faixa);
        });

        definirAtributoSeMudou(
            article,
            'data-tm-cnpj-banner',
            `CNPJ há ${rotuloTempo(minutos)}`
        );

        definirAtributoSeMudou(
            article,
            'data-tm-cnpj-monitorado',
            '1'
        );

        const novoTitulo =
            `CNPJ ${cache.cnpj} recebido em ${formatarData(cache.cnpjSentAt)}`
            + ` — há ${minutos} minuto(s).`;

        if (article.title !== novoTitulo) {
            article.title = novoTitulo;
        }
    }

    function obterWrapperDireto(article, section) {
        let atual = article;

        while (
            atual &&
            atual.parentElement &&
            atual.parentElement !== section
        ) {
            atual = atual.parentElement;
        }

        return atual?.parentElement === section
            ? atual
            : null;
    }

    function ordenarCards(section, itens) {
        if (!section || !itens.length) return;

        if (!section.classList.contains('tm-cnpj-lista-ordenada')) {
            section.classList.add('tm-cnpj-lista-ordenada');
        }

        const comCnpj = [];
        const semCnpj = [];

        itens.forEach(item => {
            const wrapper = obterWrapperDireto(item.article, section);

            if (!wrapper) return;

            const cache = item.ticket
                ? estado.cache[String(item.ticket.id)]
                : null;

            const registro = {
                wrapper,
                indiceOriginal: item.indiceOriginal,
                cnpjSentAt: cache?.cnpjSentAt || null
            };

            if (registro.cnpjSentAt) {
                comCnpj.push(registro);
            } else {
                semCnpj.push(registro);
            }
        });

        /*
         * Timestamp menor = CNPJ mais antigo.
         * Logo, os mais antigos recebem menor order e ficam no topo.
         */
        comCnpj.sort((a, b) => {
            if (a.cnpjSentAt !== b.cnpjSentAt) {
                return a.cnpjSentAt - b.cnpjSentAt;
            }

            return a.indiceOriginal - b.indiceOriginal;
        });

        semCnpj.sort(
            (a, b) => a.indiceOriginal - b.indiceOriginal
        );

        const wrappersAtivos = new Set();

        comCnpj.forEach((item, indice) => {
            wrappersAtivos.add(item.wrapper);

            const ordem = String(100 + indice);

            if (item.wrapper.style.order !== ordem) {
                item.wrapper.style.order = ordem;
            }

            definirAtributoSeMudou(
                item.wrapper,
                'data-tm-cnpj-wrapper',
                '1'
            );
        });

        semCnpj.forEach((item, indice) => {
            wrappersAtivos.add(item.wrapper);

            const ordem = String(10000 + indice);

            if (item.wrapper.style.order !== ordem) {
                item.wrapper.style.order = ordem;
            }

            definirAtributoSeMudou(
                item.wrapper,
                'data-tm-cnpj-wrapper',
                '1'
            );
        });

        Array.from(section.children).forEach((filho, indice) => {
            if (filho.tagName === 'H5') {
                if (filho.style.order !== '-10000') {
                    filho.style.order = '-10000';
                }

                return;
            }

            if (!wrappersAtivos.has(filho)) {
                const ordem = String(50000 + indice);

                if (filho.style.order !== ordem) {
                    filho.style.order = ordem;
                }
            }
        });
    }

    function renderizar() {
        const cards = Array.from(
            document.querySelectorAll(
                'section article[content="Suporte"]'
            )
        ).filter(article => {
            /*
             * Garante que estamos trabalhando com os cards da listagem
             * e não com articles internos do histórico da conversa.
             */
            return !article.closest('div[id^="wamid."]');
        });

        if (!cards.length) return;

        const section = cards[0].closest('section');
        const itens = [];

        cards.forEach((article, indiceOriginal) => {
            const ticket = acharTicketDoCard(article);

            if (!ticket) {
                limparCard(article);

                itens.push({
                    article,
                    ticket: null,
                    indiceOriginal
                });

                return;
            }

            atualizarCard(article, ticket);

            itens.push({
                article,
                ticket,
                indiceOriginal
            });
        });

        ordenarCards(section, itens);
    }

    function agendarRender() {
        clearTimeout(estado.renderTimer);
        estado.renderTimer = setTimeout(renderizar, 100);
    }

    function injetarCSS() {
        if (document.getElementById('tm-cnpj-ticket-style')) return;

        const style = document.createElement('style');
        style.id = 'tm-cnpj-ticket-style';
        style.textContent = `
            section.tm-cnpj-lista-ordenada {
                display: flex !important;
                flex-direction: column !important;
            }

            section.tm-cnpj-lista-ordenada > * {
                flex: 0 0 auto;
                width: 100%;
            }

            article.tm-cnpj-highlight {
                position: relative !important;
                overflow: hidden !important;
                padding-bottom: 28px !important;
                border-width: 1px !important;
                border-style: solid !important;
                transition:
                    background .2s ease,
                    box-shadow .2s ease,
                    border-color .2s ease,
                    transform .2s ease !important;
            }

            article.tm-cnpj-highlight::before {
                content: "";
                position: absolute;
                inset: 0;
                pointer-events: none;
                background:
                    linear-gradient(135deg, rgba(255,255,255,.08), rgba(255,255,255,0) 42%);
                opacity: .9;
            }

            article.tm-cnpj-highlight::after {
                content: attr(data-tm-cnpj-banner);
                position: absolute;
                left: 8px;
                right: 8px;
                bottom: 6px;
                display: flex;
                align-items: center;
                justify-content: center;
                min-height: 18px;
                padding: 3px 8px;
                border-radius: 999px;
                font-size: 11px;
                font-weight: 800;
                letter-spacing: .2px;
                text-align: center;
                white-space: nowrap;
                text-overflow: ellipsis;
                overflow: hidden;
                pointer-events: none;
                box-shadow: 0 4px 12px rgba(0,0,0,.18);
            }

            article.tm-cnpj-card-green {
                background:
                    linear-gradient(135deg, rgba(34,197,94,.28) 0%, rgba(22,163,74,.12) 100%) !important;
                border-color: rgba(34,197,94,.52) !important;
                box-shadow:
                    inset -8px 0 0 rgba(34,197,94,.95),
                    0 6px 18px rgba(34,197,94,.16) !important;
            }

            article.tm-cnpj-card-green::after {
                color: #ffffff;
                background: linear-gradient(90deg, #16a34a 0%, #22c55e 100%);
            }

            article.tm-cnpj-card-yellow {
                background:
                    linear-gradient(135deg, rgba(250,204,21,.34) 0%, rgba(245,158,11,.14) 100%) !important;
                border-color: rgba(250,204,21,.6) !important;
                box-shadow:
                    inset -8px 0 0 rgba(234,179,8,.98),
                    0 6px 18px rgba(234,179,8,.18) !important;
            }

            article.tm-cnpj-card-yellow::after {
                color: #111827;
                background: linear-gradient(90deg, #facc15 0%, #f59e0b 100%);
            }

            article.tm-cnpj-card-red {
                background:
                    linear-gradient(135deg, rgba(248,113,113,.35) 0%, rgba(239,68,68,.15) 100%) !important;
                border-color: rgba(248,113,113,.6) !important;
                box-shadow:
                    inset -8px 0 0 rgba(239,68,68,.98),
                    0 8px 22px rgba(239,68,68,.22) !important;
                animation: tmCnpjPulseCard 1.7s ease-in-out infinite;
            }

            article.tm-cnpj-card-red::after {
                color: #ffffff;
                background: linear-gradient(90deg, #ef4444 0%, #dc2626 100%);
            }

            @keyframes tmCnpjPulseCard {
                0%, 100% {
                    box-shadow:
                        inset -8px 0 0 rgba(239,68,68,.98),
                        0 8px 22px rgba(239,68,68,.22);
                }
                50% {
                    box-shadow:
                        inset -8px 0 0 rgba(239,68,68,.98),
                        0 10px 28px rgba(239,68,68,.35);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                article.tm-cnpj-card-red {
                    animation: none;
                }
            }

            .dark article.tm-cnpj-card-green {
                background:
                    linear-gradient(135deg, rgba(22,163,74,.42) 0%, rgba(21,128,61,.24) 100%) !important;
                border-color: rgba(74,222,128,.52) !important;
            }

            .dark article.tm-cnpj-card-yellow {
                background:
                    linear-gradient(135deg, rgba(202,138,4,.44) 0%, rgba(161,98,7,.24) 100%) !important;
                border-color: rgba(250,204,21,.56) !important;
            }

            .dark article.tm-cnpj-card-red {
                background:
                    linear-gradient(135deg, rgba(185,28,28,.48) 0%, rgba(127,29,29,.26) 100%) !important;
                border-color: rgba(248,113,113,.58) !important;
            }
        `;

        (document.head || document.documentElement).appendChild(style);
    }

    function iniciarUIQuandoPossivel() {
        if (!document.documentElement) {
            setTimeout(iniciarUIQuandoPossivel, 20);
            return;
        }

        injetarCSS();

        const observer = new MutationObserver(mutations => {
            const relevante = mutations.some(mutation => {
                if (mutation.type !== 'childList') {
                    return false;
                }

                const alvo = mutation.target;

                if (
                    alvo instanceof Element &&
                    alvo.closest('.tm-cnpj-highlight')
                ) {
                    return false;
                }

                return true;
            });

            if (relevante) {
                agendarRender();
            }
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        setInterval(renderizar, CFG.ATUALIZA_UI_MS);

        setTimeout(renderizar, 500);
        setTimeout(renderizar, 1500);
    }

    interceptarFetch();
    interceptarXHR();

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            iniciarUIQuandoPossivel,
            { once: true }
        );
    } else {
        iniciarUIQuandoPossivel();
    }

    log('v2.3 carregado. Visual da v2.1 + ordenação + compatibilidade com o botão CNPJ.');
})();
