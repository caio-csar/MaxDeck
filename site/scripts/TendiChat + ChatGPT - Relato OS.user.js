// ==UserScript==
// @name         TendiChat + ChatGPT - Relato OS
// @namespace    http://tampermonkey.net/
// @version      1.2.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20%2B%20ChatGPT%20-%20Relato%20OS.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20%2B%20ChatGPT%20-%20Relato%20OS.user.js
// @description  Gera o prompt no TendiChat e envia rapidamente ao ChatGPT, sem copiar automaticamente a resposta.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const host = window.location.hostname.toLowerCase();

    const estaNoTendiChat =
        host === 'tendichat.com.br' ||
        host.endsWith('.tendichat.com.br');

    const estaNoChatGPT =
        host === 'chatgpt.com' ||
        host.endsWith('.chatgpt.com') ||
        host === 'chat.openai.com';

    if (estaNoTendiChat) {
        iniciarModuloTendiChat();
        return;
    }

    if (estaNoChatGPT) {
        iniciarModuloChatGPT();
    }

    /************************************************************
     * MÓDULO 1: TENDICHAT
     ************************************************************/
    function iniciarModuloTendiChat() {


            if (window.__TENDICHAT_IA_HELPER_69_ATIVO__) {
                console.log('[TendiChat IA Helper] Já ativo.');
                return;
            }

            window.__TENDICHAT_IA_HELPER_69_ATIVO__ = true;

            const BTN_ORIGINAL_ID = 'helper-btn-ia';
            const BTN_LIVRE_ID = 'helper-btn-ia-livre';
            const MODAL_ID = 'helper-ia-modal';
            const STYLE_ID = 'helper-ia-style';

            let atualizacaoAgendada = false;

            function removerLegadoPesado() {
                const rootAntigo = document.getElementById('tendichat-ia-helper-root');
                if (rootAntigo) rootAntigo.remove();
            }

            function pegarLinhas(texto) {
                return texto
                    .split('\n')
                    .map(x => x.trim())
                    .filter(Boolean)
                    .filter(x => ![
                        '🤖 GERAR RELATO PARA OS',
                        'GERAR',
                        'CANCELAR',
                        'Diretriz extra do analista',
                        'Ex: cliente não respondeu mais, encaminhado ao fiscal...',
                        'Prompt copiado. Cole no ChatGPT.',
                        'Abrindo ChatGPT...'
                    ].includes(x));
            }

            function extrairDados() {
                // Uma única leitura do texto da página reduz o trabalho em conversas longas.
                const texto = document.body.innerText;
                const linhas = pegarLinhas(texto);

                const cnpj =
                    texto.match(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g)?.[0]
                    || texto.match(/\b\d{14}\b/g)?.[0]
                    || 'Não encontrado';

                const aceites = [...texto.matchAll(/Atendimento aceito por ([^\n]+)/g)];
                const atendente = aceites.length
                    ? aceites[aceites.length - 1][1].trim()
                    : 'Não identificado';

                let cliente = 'Não identificado';
                const idxFechar = linhas.indexOf('Fechar');

                if (idxFechar > 0) {
                    cliente = linhas[idxFechar - 1];
                } else {
                    const idxAtendimentos = linhas.indexOf('Atendimentos');

                    if (idxAtendimentos >= 0 && linhas[idxAtendimentos + 1]) {
                        cliente = linhas[idxAtendimentos + 1];
                    }
                }

                return {
                    cliente,
                    atendente,
                    cnpj,
                    conversa: linhas.slice(-120).join('\n')
                };
            }

            function montarPrompt(diretrizExtra) {
                const dados = extrairDados();

                return `# ANALISAR ATENDIMENTO TENDICHAT

        Analise este atendimento do TendiChat e gere um relato técnico de suporte.

        O relato padrão deve ser **profissional, enxuto e objetivo**.

        Gere também, obrigatoriamente, a primeira linha no formato:
        TÍTULO_OS: [título curto com no máximo 4 palavras]

        -----------------------------------
        DIRETRIZ EXTRA DO ANALISTA
        -----------------------------------

        ${diretrizExtra?.trim() || 'Nenhuma diretriz extra informada.'}

        A diretriz extra acima deve ter prioridade sobre o formato padrão quando houver conflito.
        Exemplo: se for informado "tópico único", gere apenas um único tópico/conclusão, sem separar em Situação e Análise/Resolução.

        -----------------------------------
        FORMATO PADRÃO
        -----------------------------------

        **Situação:**
        [descreva de forma extremamente breve o motivo do atendimento]

        **Análise/Resolução:**
        [descreva o que foi analisado, orientado, resolvido ou encaminhado]

        -----------------------------------
        REGRAS
        -----------------------------------
        - **Se não houver menção de continuidade ou agendamento, diga ao final 'sem mais demandas'.**
        - **Não invente informações.**
        - **Não aumente a história.**
        - **Não use tópicos no lugar do formato solicitado.**
        - **Não inclua dados que não estejam no atendimento ou na diretriz extra.**
        - **Não cite que analisou conversa, chat ou histórico.**

        -----------------------------------
        DADOS DO ATENDIMENTO
        -----------------------------------

        Cliente: ${dados.cliente}
        Atendente: ${dados.atendente}
        CNPJ: ${dados.cnpj}

        -----------------------------------
        CONVERSA
        -----------------------------------

        ${dados.conversa}`;
            }

            function abrirChatGPTComPrompt(prompt) {
                const url = 'https://chatgpt.com/#' + encodeURIComponent(prompt);

                // É chamado diretamente durante o clique para evitar bloqueio de pop-up.
                return window.open(url, '_blank');
            }

            async function copiarTextoBackup(texto) {
                try {
                    await navigator.clipboard.writeText(texto);
                    return true;
                } catch {
                    try {
                        const area = document.createElement('textarea');
                        area.value = texto;
                        area.style.position = 'fixed';
                        area.style.left = '-9999px';
                        area.style.top = '-9999px';
                        document.body.appendChild(area);
                        area.focus();
                        area.select();

                        const ok = document.execCommand('copy');
                        area.remove();

                        return ok;
                    } catch {
                        return false;
                    }
                }
            }

            function injetarCss() {
                if (document.getElementById(STYLE_ID)) return;

                const style = document.createElement('style');
                style.id = STYLE_ID;

                style.textContent = `
                    #${BTN_ORIGINAL_ID},
                    #${BTN_LIVRE_ID} {
                        width: 30px !important;
                        height: 30px !important;
                        min-width: 30px !important;
                        padding: 0 !important;
                        border-radius: 8px !important;
                        display: inline-flex !important;
                        align-items: center !important;
                        justify-content: center !important;
                        font-size: 19px !important;
                        cursor: pointer !important;
                        line-height: 1 !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        pointer-events: auto !important;
                    }

                    #${BTN_ORIGINAL_ID} {
                        border: none !important;
                        background: transparent !important;
                        color: #0f172a !important;
                    }

                    #${BTN_LIVRE_ID} {
                        position: fixed !important;
                        z-index: 2147483647 !important;
                        border: 2px solid #ffffff !important;
                        background: #111827 !important;
                        color: #ffffff !important;
                        box-shadow: 0 4px 14px rgba(0,0,0,.35) !important;
                    }

                    #${MODAL_ID} {
                        position: fixed !important;
                        inset: 0 !important;
                        z-index: 2147483647 !important;
                        display: none;
                        align-items: center;
                        justify-content: center;
                        background: rgba(0,0,0,.55);
                        pointer-events: auto !important;
                        font-family: Arial, Helvetica, sans-serif;
                    }

                    #helper-ia-box {
                        width: min(560px, calc(100vw - 32px));
                        background: #ffffff;
                        color: #111827;
                        border-radius: 14px;
                        padding: 18px;
                        box-shadow: 0 18px 60px rgba(0,0,0,.45);
                    }

                    #helper-ia-box h2 {
                        margin: 0 0 12px 0;
                        font-size: 18px;
                        font-weight: 800;
                    }

                    #helper-ia-box label {
                        display: block;
                        margin-bottom: 8px;
                        font-size: 13px;
                        font-weight: 700;
                        color: #374151;
                    }

                    #helper-ia-extra {
                        width: 100%;
                        height: 120px;
                        resize: vertical;
                        border: 1px solid #d1d5db;
                        border-radius: 10px;
                        padding: 10px;
                        font-size: 14px;
                        outline: none;
                        color: #111827;
                        background: #ffffff;
                    }

                    #helper-ia-actions {
                        display: flex;
                        justify-content: flex-end;
                        gap: 10px;
                        margin-top: 14px;
                    }

                    #helper-ia-actions button {
                        border: 0;
                        border-radius: 10px;
                        padding: 10px 14px;
                        font-size: 13px;
                        font-weight: 800;
                        cursor: pointer;
                    }

                    #helper-ia-cancelar {
                        background: #e5e7eb;
                        color: #111827;
                    }

                    #helper-ia-gerar {
                        background: #111827;
                        color: #ffffff;
                    }

                    #helper-ia-status {
                        margin-top: 10px;
                        font-size: 12px;
                        font-weight: 700;
                        display: none;
                    }
                `;

                document.head.appendChild(style);
            }

            function localizarTextareaMensagem() {
                const textareas = [...document.querySelectorAll('textarea')];

                return textareas.find(t => {
                    const placeholder = (t.placeholder || '').toLowerCase();
                    const maxlength = String(t.getAttribute('maxlength') || '');
                    const form = t.closest('form');

                    if (!form) return false;

                    const pareceCampoMensagem =
                        maxlength === '4096'
                        || placeholder.includes('conversa encerrada')
                        || placeholder.includes('mensagem');

                    const pareceAreaEnvio =
                        form.querySelector('#message_file')
                        || form.querySelector('input[type="file"]');

                    return pareceCampoMensagem && pareceAreaEnvio;
                }) || null;
            }

            function estaComBloqueioDeConversaEncerrada() {
                const textarea = localizarTextareaMensagem();

                if (!textarea) return null;

                const placeholder = (textarea.placeholder || '').toLowerCase();

                if (!placeholder.includes('conversa encerrada')) {
                    return null;
                }

                const article = textarea.closest('article');

                if (!article) return null;

                const classe = String(article.getAttribute('class') || '');
                const classBloqueada = classe.includes('pointer-events-none');
                const styleBloqueado = getComputedStyle(article).pointerEvents === 'none';

                if (!classBloqueada && !styleBloqueado) {
                    return null;
                }

                return textarea;
            }

            function garantirBotaoOriginalVisual() {
                const textarea = localizarTextareaMensagem();
                let botao = document.getElementById(BTN_ORIGINAL_ID);

                if (!textarea || !textarea.parentElement) {
                    if (botao) botao.remove();
                    return null;
                }

                if (!botao) {
                    botao = document.createElement('button');
                    botao.id = BTN_ORIGINAL_ID;
                    botao.type = 'button';
                    botao.title = 'Gerar relato para OS';
                    botao.textContent = '🤖';
                    botao.onclick = abrirModal;
                }

                const parent = textarea.parentElement;
                const botaoBusca = parent.querySelector('#tm-btn-busca');

                if (botao.parentElement !== parent) {
                    if (botaoBusca) {
                        parent.insertBefore(botao, botaoBusca);
                    } else {
                        parent.appendChild(botao);
                    }
                }

                return botao;
            }

            function garantirModal() {
                let modal = document.getElementById(MODAL_ID);
                if (modal) return modal;

                modal = document.createElement('div');
                modal.id = MODAL_ID;

                modal.innerHTML = `
                    <div id="helper-ia-box">
                        <h2>Gerar relato técnico</h2>

                        <label for="helper-ia-extra">Diretriz extra do analista</label>
                        <textarea id="helper-ia-extra" placeholder="Ex: cliente não respondeu mais, encaminhado ao fiscal..."></textarea>

                        <div id="helper-ia-actions">
                            <button id="helper-ia-cancelar" type="button">CANCELAR</button>
                            <button id="helper-ia-gerar" type="button">GERAR</button>
                        </div>

                        <div id="helper-ia-status"></div>
                    </div>
                `;

                document.body.appendChild(modal);

                const extra = modal.querySelector('#helper-ia-extra');
                const cancelar = modal.querySelector('#helper-ia-cancelar');
                const gerar = modal.querySelector('#helper-ia-gerar');
                const status = modal.querySelector('#helper-ia-status');

                cancelar.onclick = () => {
                    modal.style.display = 'none';
                    extra.value = '';
                    status.style.display = 'none';
                };

                modal.onclick = (e) => {
                    if (e.target === modal) {
                        modal.style.display = 'none';
                        status.style.display = 'none';
                    }
                };

                gerar.onclick = () => {
                    const prompt = montarPrompt(extra.value);

                    status.textContent = 'Abrindo ChatGPT via AutoPaste...';
                    status.style.color = '#2563eb';
                    status.style.display = 'block';

                    // Abre primeiro e faz a cópia de segurança em paralelo.
                    const novaAba = abrirChatGPTComPrompt(prompt);
                    void copiarTextoBackup(prompt);

                    if (novaAba) {
                        modal.style.display = 'none';
                        extra.value = '';
                        status.style.display = 'none';
                    } else {
                        status.textContent = 'O navegador bloqueou a nova aba. Libere pop-ups para o TendiChat.';
                        status.style.color = '#dc2626';
                    }
                };

                return modal;
            }

            function abrirModal(e) {
                if (e) {
                    e.preventDefault();
                    e.stopPropagation();
                }

                const modal = garantirModal();
                const extra = modal.querySelector('#helper-ia-extra');
                const status = modal.querySelector('#helper-ia-status');

                status.style.display = 'none';
                modal.style.display = 'flex';

                setTimeout(() => extra.focus(), 50);
            }

            function removerBotaoLivre() {
                const botaoLivre = document.getElementById(BTN_LIVRE_ID);
                if (botaoLivre) botaoLivre.remove();
            }

            function garantirBotaoLivre() {
                const textareaBloqueado = estaComBloqueioDeConversaEncerrada();

                if (!textareaBloqueado) {
                    removerBotaoLivre();
                    return;
                }

                const botaoOriginal = document.getElementById(BTN_ORIGINAL_ID) || garantirBotaoOriginalVisual();
                const alvo = botaoOriginal || textareaBloqueado;

                if (!alvo) {
                    removerBotaoLivre();
                    return;
                }

                const rect = alvo.getBoundingClientRect();

                if (!rect.width || !rect.height) {
                    removerBotaoLivre();
                    return;
                }

                if (rect.bottom < 0 || rect.top > window.innerHeight) {
                    removerBotaoLivre();
                    return;
                }

                let botaoLivre = document.getElementById(BTN_LIVRE_ID);

                if (!botaoLivre) {
                    botaoLivre = document.createElement('button');
                    botaoLivre.id = BTN_LIVRE_ID;
                    botaoLivre.type = 'button';
                    botaoLivre.title = 'Gerar relato para OS';
                    botaoLivre.textContent = '🤖';
                    botaoLivre.onclick = abrirModal;
                    document.body.appendChild(botaoLivre);
                }

                let left = rect.left;
                let top = rect.top;

                if (alvo.tagName === 'TEXTAREA') {
                    left = rect.right - 38;
                    top = rect.top + Math.max(0, (rect.height - 30) / 2);
                }

                botaoLivre.style.left = `${Math.round(left)}px`;
                botaoLivre.style.top = `${Math.round(top)}px`;
            }

            function atualizarTudo() {
                removerLegadoPesado();
                injetarCss();
                garantirModal();
                garantirBotaoOriginalVisual();
                garantirBotaoLivre();
            }

            function agendarAtualizacao() {
                if (atualizacaoAgendada) return;

                atualizacaoAgendada = true;

                // Pequeno throttle para agrupar várias mutações consecutivas da interface.
                setTimeout(() => {
                    requestAnimationFrame(() => {
                        atualizacaoAgendada = false;
                        atualizarTudo();
                    });
                }, 60);
            }

            setTimeout(atualizarTudo, 100);

            const observer = new MutationObserver(() => {
                agendarAtualizacao();
            });

            observer.observe(document.body || document.documentElement, {
                childList: true,
                subtree: true
            });

            setInterval(agendarAtualizacao, 5000);

            window.addEventListener('scroll', agendarAtualizacao, { capture: true, passive: true });
            window.addEventListener('resize', agendarAtualizacao, { passive: true });
    }

    /************************************************************
     * MÓDULO 2: CHATGPT AUTOPASTE
     ************************************************************/
    function iniciarModuloChatGPT() {


            /************************************************************
             * CONFIGURAÇÕES
             ************************************************************/
            const CONFIG = {
                TEMPO_INICIAL_MS: 80,
                TEMPO_MAX_CAMPO_MS: 45000,
                TEMPO_MAX_ENVIO_MS: 12000,
                INTERVALO_CAMPO_MS: 120,
                INTERVALO_ENVIO_MS: 100,
                LIMPAR_URL_APOS_COLAR: true,
                DEBUG: false
            };

            /************************************************************
             * CONTROLE INTERNO
             ************************************************************/
            if (window.__TENDICHAT_AUTOPASTE_PRO_ATIVO__) {
                console.log("[TendiChat PRO] Script já estava ativo. Ignorando nova execução.");
                return;
            }

            window.__TENDICHAT_AUTOPASTE_PRO_ATIVO__ = true;


            /************************************************************
             * UTILITÁRIOS
             ************************************************************/
            function log(...args) {
                if (CONFIG.DEBUG) {
                    console.log("[TendiChat PRO]", ...args);
                }
            }

            function esperar(ms) {
                return new Promise(resolve => setTimeout(resolve, ms));
            }

            function estaVisivel(el) {
                if (!el) return false;

                const rect = el.getBoundingClientRect();
                const style = window.getComputedStyle(el);

                return (
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.visibility !== "hidden" &&
                    style.display !== "none"
                );
            }

            function dispararInput(el, texto = "") {
                try {
                    el.dispatchEvent(new InputEvent("input", {
                        bubbles: true,
                        cancelable: true,
                        inputType: "insertText",
                        data: texto
                    }));
                } catch {
                    el.dispatchEvent(new Event("input", { bubbles: true }));
                }

                el.dispatchEvent(new Event("change", { bubbles: true }));
            }

            function mostrarAviso(msg, tipo = "ok") {
                const antigo = document.getElementById("tendichat-copy-toast");
                if (antigo) antigo.remove();

                const cores = {
                    ok: "#16a34a",
                    erro: "#dc2626",
                    aviso: "#ca8a04",
                    info: "#2563eb"
                };

                const box = document.createElement("div");
                box.id = "tendichat-copy-toast";
                box.innerText = msg;

                Object.assign(box.style, {
                    position: "fixed",
                    top: "22px",
                    left: "50%",
                    transform: "translateX(-50%)",
                    zIndex: "9999999",
                    background: cores[tipo] || cores.info,
                    color: "#fff",
                    padding: "12px 18px",
                    borderRadius: "12px",
                    fontFamily: "Arial, sans-serif",
                    fontSize: "14px",
                    fontWeight: "bold",
                    boxShadow: "0 8px 30px rgba(0,0,0,.35)",
                    opacity: "1",
                    transition: "opacity .8s ease",
                    maxWidth: "90vw",
                    textAlign: "center",
                    whiteSpace: "pre-wrap"
                });

                document.body.appendChild(box);

                setTimeout(() => {
                    box.style.opacity = "0";
                    setTimeout(() => box.remove(), 900);
                }, 2300);
            }

            /************************************************************
             * CAPTURA DO PROMPT PELA URL
             *
             * Aceita:
             * https://chatgpt.com/#PROMPT
             * https://chatgpt.com/#prompt=PROMPT
             * https://chatgpt.com/?prompt=PROMPT
             ************************************************************/
            function decodificarSeguro(valor) {
                if (!valor) return "";

                try {
                    return decodeURIComponent(valor);
                } catch {
                    return valor;
                }
            }

            function pegarPromptDaUrl() {
                let prompt = "";

                if (location.hash) {
                    const hashBruto = location.hash.substring(1);
                    const hashDecodificado = decodificarSeguro(hashBruto);

                    if (hashDecodificado.startsWith("prompt=")) {
                        const paramsHash = new URLSearchParams(hashDecodificado);
                        prompt = paramsHash.get("prompt") || "";
                    } else {
                        prompt = hashDecodificado;
                    }
                }

                if (!prompt) {
                    const params = new URLSearchParams(location.search);
                    prompt =
                        params.get("prompt") ||
                        params.get("q") ||
                        params.get("texto") ||
                        "";
                }

                return (prompt || "").trim();
            }

            function limparUrl() {
                if (!CONFIG.LIMPAR_URL_APOS_COLAR) return;

                const novaUrl = location.origin + location.pathname + location.search.replace(/[?&](prompt|q|texto)=[^&]*/gi, "");
                history.replaceState(null, "", novaUrl);
            }

            /************************************************************
             * CAMPO DO CHATGPT
             ************************************************************/
            function encontrarCampoChatGPT() {
                const seletores = [
                    "#prompt-textarea",
                    "textarea",
                    "div[contenteditable='true'][role='textbox']",
                    ".ProseMirror",
                    "div[contenteditable='true']"
                ];

                for (const seletor of seletores) {
                    const candidatos = [...document.querySelectorAll(seletor)];
                    const campo = candidatos.find(estaVisivel);

                    if (campo) {
                        log("Campo encontrado:", seletor);
                        return campo;
                    }
                }

                return null;
            }

            function esperarCampo(tempoMaximo = CONFIG.TEMPO_MAX_CAMPO_MS) {
                const campoImediato = encontrarCampoChatGPT();
                if (campoImediato) return Promise.resolve(campoImediato);

                return new Promise(resolve => {
                    let finalizado = false;
                    let observer = null;
                    let intervalo = null;
                    let timeout = null;

                    const finalizar = campo => {
                        if (finalizado) return;
                        finalizado = true;

                        if (observer) observer.disconnect();
                        if (intervalo) clearInterval(intervalo);
                        if (timeout) clearTimeout(timeout);

                        resolve(campo || null);
                    };

                    const verificar = () => {
                        const campo = encontrarCampoChatGPT();
                        if (campo) finalizar(campo);
                    };

                    observer = new MutationObserver(verificar);
                    observer.observe(document.body || document.documentElement, {
                        childList: true,
                        subtree: true
                    });

                    intervalo = setInterval(verificar, CONFIG.INTERVALO_CAMPO_MS);
                    timeout = setTimeout(() => finalizar(null), tempoMaximo);

                    verificar();
                });
            }

            function definirValorTextarea(campo, texto) {
                const proto = Object.getPrototypeOf(campo);
                const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

                if (descriptor && descriptor.set) {
                    descriptor.set.call(campo, texto);
                } else {
                    campo.value = texto;
                }

                dispararInput(campo, texto);
            }

            function selecionarTudoNoCampo(campo) {
                const selection = window.getSelection();
                const range = document.createRange();

                range.selectNodeContents(campo);
                selection.removeAllRanges();
                selection.addRange(range);
            }

            async function inserirTextoContentEditable(campo, texto) {
                campo.focus();

                try {
                    selecionarTudoNoCampo(campo);
                    document.execCommand("delete", false, null);
                } catch {
                    campo.innerHTML = "";
                }

                let inseriu = false;

                try {
                    inseriu = document.execCommand("insertText", false, texto);
                } catch {
                    inseriu = false;
                }

                if (!inseriu) {
                    campo.innerHTML = "";
                    const linhas = texto.split("\n");

                    for (const linha of linhas) {
                        const p = document.createElement("p");
                        p.textContent = linha || "\u00A0";
                        campo.appendChild(p);
                    }
                }

                dispararInput(campo, texto);

                await esperar(80);

                const textoAtual = (campo.innerText || campo.textContent || "").trim();

                if (!textoAtual) {
                    campo.textContent = texto;
                    dispararInput(campo, texto);
                }
            }

            async function inserirPromptNoCampo(campo, prompt) {
                campo.focus();

                const tag = campo.tagName?.toUpperCase();

                if (tag === "TEXTAREA" || tag === "INPUT") {
                    definirValorTextarea(campo, prompt);
                } else {
                    await inserirTextoContentEditable(campo, prompt);
                }

                await esperar(120);
            }

            /************************************************************
             * BOTÃO DE ENVIAR
             ************************************************************/
            function botaoEstaHabilitado(btn) {
                if (!btn) return false;

                return (
                    !btn.disabled &&
                    btn.getAttribute("disabled") === null &&
                    btn.getAttribute("aria-disabled") !== "true"
                );
            }

            function encontrarBotaoEnviar() {
                const seletoresDiretos = [
                    "button[data-testid='send-button']",
                    "button[data-testid='fruitjuice-send-button']",
                    "button[aria-label*='Send']",
                    "button[aria-label*='send']",
                    "button[aria-label*='Enviar']",
                    "button[aria-label*='enviar']"
                ];

                for (const seletor of seletoresDiretos) {
                    const btn = [...document.querySelectorAll(seletor)].find(estaVisivel);
                    if (btn) return btn;
                }

                const botoes = [...document.querySelectorAll("button")].filter(estaVisivel);

                return botoes.find(btn => {
                    const texto = (btn.innerText || "").toLowerCase();
                    const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
                    const title = (btn.getAttribute("title") || "").toLowerCase();

                    const alvo = `${texto} ${aria} ${title}`;

                    return (
                        alvo.includes("send") ||
                        alvo.includes("enviar") ||
                        alvo.includes("enviar mensagem") ||
                        alvo.includes("send message") ||
                        alvo.includes("send prompt")
                    );
                }) || null;
            }

            async function tentarEnviarPorFormulario(campo) {
                const form = campo?.closest?.("form");

                if (!form) return false;

                try {
                    if (typeof form.requestSubmit === "function") {
                        form.requestSubmit();
                    } else {
                        form.dispatchEvent(new Event("submit", {
                            bubbles: true,
                            cancelable: true
                        }));
                    }

                    return true;
                } catch (e) {
                    log("Falha ao tentar enviar por formulário:", e);
                    return false;
                }
            }

            async function clicarEnviar(campo) {
                const inicio = Date.now();

                while (Date.now() - inicio < CONFIG.TEMPO_MAX_ENVIO_MS) {
                    const botaoEnviar = encontrarBotaoEnviar();

                    if (botaoEnviar && botaoEstaHabilitado(botaoEnviar)) {
                        botaoEnviar.click();

                        log("Mensagem enviada pelo botão.");
                        mostrarAviso("🚀 Prompt enviado", "info");

                        return true;
                    }

                    await esperar(CONFIG.INTERVALO_ENVIO_MS);
                }

                log("Botão de enviar não habilitou. Tentando fallback por formulário.");

                const fallback = await tentarEnviarPorFormulario(campo);

                if (fallback) {
                    mostrarAviso("🚀 Prompt enviado por fallback", "info");
                    return true;
                }

                mostrarAviso("⚠️ Não consegui enviar automaticamente", "aviso");
                return false;
            }

            /************************************************************
             * RESPOSTA DO CHATGPT
             *
             * O script não monitora, seleciona nem copia a resposta.
             * Após o envio do prompt, o usuário decide o que copiar.
             ************************************************************/

            /************************************************************
             * FLUXO PRINCIPAL
             ************************************************************/
            async function iniciar() {
                const prompt = pegarPromptDaUrl();

                if (!prompt) {
                    log("Nenhum prompt encontrado na URL.");
                    return;
                }

                log("Prompt recebido pela URL.");

                mostrarAviso("📋 Prompt detectado. Preparando envio...", "info");

                const campo = await esperarCampo();

                if (!campo) {
                    mostrarAviso("❌ Não encontrei o campo do ChatGPT", "erro");
                    alert("Não encontrei o campo do ChatGPT.");
                    return;
                }

                await inserirPromptNoCampo(campo, prompt);

                log("Prompt inserido no campo.");

                limparUrl();

                await clicarEnviar(campo);
            }

            setTimeout(iniciar, CONFIG.TEMPO_INICIAL_MS);
    }
})();
