// ==UserScript==
// @name         TendiChat - Relato GPT
// @namespace    http://tampermonkey.net/
// @version      6.9
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Relato%20GPT.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Relato%20GPT.user.js
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

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

    function pegarLinhas() {
        return document.body.innerText
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
        const texto = document.body.innerText;
        const linhas = pegarLinhas();

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
        /*
         * Integração restaurada com o AutoPaste PRO:
         * ele aceita https://chatgpt.com/#PROMPT
         */
        const url = 'https://chatgpt.com/#' + encodeURIComponent(prompt);
        window.open(url, '_blank');
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

        gerar.onclick = async () => {
            const prompt = montarPrompt(extra.value);

            status.textContent = 'Abrindo ChatGPT via AutoPaste...';
            status.style.color = '#2563eb';
            status.style.display = 'block';

            await copiarTextoBackup(prompt);

            abrirChatGPTComPrompt(prompt);
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

        requestAnimationFrame(() => {
            atualizacaoAgendada = false;
            atualizarTudo();
        });
    }

    setTimeout(atualizarTudo, 600);

    const observer = new MutationObserver(() => {
        agendarAtualizacao();
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    setInterval(agendarAtualizacao, 3000);

    window.addEventListener('scroll', agendarAtualizacao, true);
    window.addEventListener('resize', agendarAtualizacao);

})();