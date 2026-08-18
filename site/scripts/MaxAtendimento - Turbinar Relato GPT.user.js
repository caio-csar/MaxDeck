// ==UserScript==
// @name         MaxAtendimento - Turbinar Relato GPT
// @namespace    http://tampermonkey.net/
// @version      1.2
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Turbinar%20Relato%20GPT.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Turbinar%20Relato%20GPT.user.js
// @description  Captura o relato do MaxAtendimento, abre janela de diretriz extra e envia para o ChatGPT turbinar o texto.
// @match        *://externo.maxdatasistema.com.br/*
// @match        *://*.maxdatasistema.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        BOTAO_ID: 'max-turbinar-relato-btn',
        MODAL_ID: 'max-turbinar-relato-modal',
        STYLE_ID: 'max-turbinar-relato-style',
        TOAST_ID: 'max-turbinar-relato-toast',
        CHATGPT_URL: 'https://chatgpt.com/#',
        DEBUG: true
    };

    if (window.__MAX_TURBINAR_RELATO_GPT_ATIVO__) {
        console.log('[Max Turbinar Relato] Script já ativo.');
        return;
    }

    window.__MAX_TURBINAR_RELATO_GPT_ATIVO__ = true;

    let atualizacaoAgendada = false;

    function log(...args) {
        if (CONFIG.DEBUG) {
            console.log('[Max Turbinar Relato]', ...args);
        }
    }

    function estaVisivel(el) {
        if (!el) return false;

        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
        );
    }

    function textoLimpo(valor) {
        return String(valor || '')
            .replace(/\r/g, '')
            .replace(/\n{4,}/g, '\n\n')
            .trim();
    }

    function normalizarBusca(txt) {
        return String(txt || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function obterTextoCampo(el) {
        if (!el) return '';

        if ('value' in el) {
            return textoLimpo(el.value);
        }

        return textoLimpo(el.innerText || el.textContent || '');
    }

    function obterRotuloCampo(el) {
        if (!el) return '';

        const partes = [];

        if (el.id) {
            try {
                const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
                if (label) partes.push(label.innerText);
            } catch {}
        }

        const aria = el.getAttribute('aria-label');
        const placeholder = el.getAttribute('placeholder');
        const name = el.getAttribute('name');
        const title = el.getAttribute('title');

        if (aria) partes.push(aria);
        if (placeholder) partes.push(placeholder);
        if (name) partes.push(name);
        if (title) partes.push(title);

        const parent = el.closest('.form-group, .mb-3, .col, .row, div');
        if (parent) {
            const labelProximo = parent.querySelector('label');
            if (labelProximo) partes.push(labelProximo.innerText);
        }

        return textoLimpo(partes.join(' ')).toLowerCase();
    }

    function pontuarCampoRelato(el) {
        if (!el || !estaVisivel(el)) return -999;

        const tag = el.tagName?.toLowerCase();
        const texto = obterTextoCampo(el);

        const meta = normalizarBusca([
            el.id,
            el.name,
            el.placeholder,
            el.title,
            el.getAttribute('aria-label'),
            obterRotuloCampo(el)
        ].join(' '));

        let score = 0;

        if (tag === 'textarea') score += 30;
        if (el.isContentEditable) score += 20;

        const palavrasFortes = [
            'relato',
            'situacao',
            'analise',
            'resolucao',
            'solucao',
            'descricao',
            'observacao',
            'historico',
            'atendimento',
            'ocorrencia',
            'parecer',
            'conclusao',
            'demanda',
            'problema'
        ];

        const palavrasNegativas = [
            'titulo',
            'cpf',
            'cnpj',
            'cliente',
            'contato',
            'telefone',
            'email',
            'codigo',
            'produto',
            'cep',
            'cidade',
            'endereco',
            'bairro',
            'numero',
            'senha',
            'login',
            'usuario'
        ];

        for (const p of palavrasFortes) {
            if (meta.includes(p)) score += 18;
        }

        for (const p of palavrasNegativas) {
            if (meta.includes(p)) score -= 20;
        }

        if (texto.length > 20) score += 15;
        if (texto.length > 80) score += 20;
        if (texto.length > 250) score += 25;

        if (texto.includes('Situação') || texto.includes('Situacao')) score += 25;
        if (texto.includes('Análise') || texto.includes('Analise')) score += 25;
        if (texto.includes('Resolução') || texto.includes('Resolucao')) score += 25;
        if (texto.includes('TÍTULO_OS') || texto.includes('TITULO_OS')) score += 25;

        return score;
    }

    function localizarCampoRelatoPrincipal() {
        const candidatos = [
            ...document.querySelectorAll('textarea'),
            ...document.querySelectorAll('[contenteditable="true"]')
        ].filter(estaVisivel);

        if (!candidatos.length) return null;

        const ordenados = candidatos
            .map(el => ({
                el,
                score: pontuarCampoRelato(el),
                texto: obterTextoCampo(el)
            }))
            .filter(x => x.score > -50)
            .sort((a, b) => b.score - a.score);

        log('Campos candidatos:', ordenados.map(x => ({
            score: x.score,
            texto: x.texto.slice(0, 80),
            id: x.el.id,
            name: x.el.name,
            placeholder: x.el.placeholder
        })));

        return ordenados[0]?.el || null;
    }

    function capturarRelato() {
        const campo = localizarCampoRelatoPrincipal();

        return {
            campo,
            texto: campo ? obterTextoCampo(campo) : ''
        };
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
                area.style.opacity = '0';

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

    function mostrarToast(msg, tipo = 'info') {
        const antigo = document.getElementById(CONFIG.TOAST_ID);
        if (antigo) antigo.remove();

        const cores = {
            info: '#2563eb',
            ok: '#16a34a',
            erro: '#dc2626',
            aviso: '#ca8a04'
        };

        const box = document.createElement('div');
        box.id = CONFIG.TOAST_ID;
        box.textContent = msg;

        Object.assign(box.style, {
            position: 'fixed',
            top: '22px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '2147483647',
            background: cores[tipo] || cores.info,
            color: '#fff',
            padding: '12px 18px',
            borderRadius: '12px',
            fontFamily: 'Arial, sans-serif',
            fontSize: '14px',
            fontWeight: '700',
            boxShadow: '0 8px 30px rgba(0,0,0,.35)',
            maxWidth: '90vw',
            textAlign: 'center',
            whiteSpace: 'pre-wrap'
        });

        document.body.appendChild(box);

        setTimeout(() => {
            box.style.opacity = '0';
            box.style.transition = 'opacity .5s ease';
            setTimeout(() => box.remove(), 600);
        }, 2400);
    }

    function montarPrompt(relatoOriginal, diretrizExtra) {
        return `# TURBINAR RELATO TÉCNICO DE SUPORTE

Você receberá um relato técnico já escrito por um analista no MaxAtendimento.

Sua tarefa é melhorar esse relato para ficar mais profissional, claro, objetivo e útil para uma OS.

O foco é:
- corrigir português, pontuação e organização;
- remover informalidades;
- melhorar a clareza técnica;
- complementar a estrutura quando o relato estiver mal escrito;
- manter o texto enxuto;
- gerar um título curto para OS;
- preservar exatamente os fatos informados;
- não inventar informações;
- não aumentar a história;
- não dizer que analisou texto, conversa, histórico ou relato original.

Gere obrigatoriamente a primeira linha neste formato:
TÍTULO_OS: [título curto com no máximo 4 palavras]

Formato padrão esperado:

**Situação:**
[descreva brevemente o motivo do atendimento]

**Análise/Resolução:**
[descreva o que foi analisado, orientado, resolvido, ajustado ou encaminhado]

Regras:
- Se o relato original já indicar continuidade, pendência, retorno, encaminhamento ou aguardando cliente/técnico, mantenha essa informação.
- Se não houver menção de continuidade, pendência ou agendamento, finalize com "sem mais demandas".
- Se a diretriz extra pedir tópico único, gere apenas um único parágrafo/tópico, sem separar em Situação e Análise/Resolução.
- Se o relato original estiver incompleto, melhore apenas com base no que estiver escrito.
- Não inclua CNPJ, cliente ou atendente se isso não estiver no relato original.
- Responda somente com o relato final, sem explicações.

-----------------------------------
DIRETRIZ EXTRA DO ANALISTA
-----------------------------------

${textoLimpo(diretrizExtra) || 'Nenhuma diretriz extra informada.'}

-----------------------------------
RELATO ORIGINAL
-----------------------------------

${textoLimpo(relatoOriginal)}`;
    }

    function abrirChatGPTComPrompt(prompt) {
        const url = CONFIG.CHATGPT_URL + encodeURIComponent(prompt);
        window.open(url, '_blank');
    }

    function injetarCss() {
        if (document.getElementById(CONFIG.STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = CONFIG.STYLE_ID;

        style.textContent = `
            #${CONFIG.BOTAO_ID} {
                background-color: #d32f2f !important;
                color: #ffffff !important;
                border: none !important;
                border-radius: 2px !important;
                height: 36px !important;
                min-height: 36px !important;
                line-height: 36px !important;
                padding: 0 14px !important;
                font-size: 13px !important;
                font-weight: 700 !important;
                cursor: pointer !important;
                display: inline-flex !important;
                align-items: center !important;
                justify-content: center !important;
                white-space: nowrap !important;
                flex: 0 0 auto !important;
                width: auto !important;
                min-width: max-content !important;
                max-width: none !important;
                overflow: visible !important;
                text-transform: none !important;
                box-shadow: 0 2px 5px rgba(0,0,0,.25) !important;
                vertical-align: middle !important;
                margin: 0 !important;
            }

            #${CONFIG.BOTAO_ID}:hover {
                background-color: #b71c1c !important;
            }

            #${CONFIG.BOTAO_ID} i,
            #${CONFIG.BOTAO_ID} .material-icons {
                font-size: 18px !important;
                line-height: 1 !important;
                margin-right: 6px !important;
                display: inline-flex !important;
                align-items: center !important;
            }

            #${CONFIG.MODAL_ID} {
                position: fixed !important;
                inset: 0 !important;
                z-index: 2147483647 !important;
                display: none;
                align-items: center;
                justify-content: center;
                background: rgba(0,0,0,.58);
                font-family: Arial, Helvetica, sans-serif;
            }

            #max-turbinar-relato-box {
                width: min(680px, calc(100vw - 32px));
                background: #ffffff;
                color: #111827;
                border-radius: 16px;
                padding: 18px;
                box-shadow: 0 18px 60px rgba(0,0,0,.45);
            }

            #max-turbinar-relato-box h2 {
                margin: 0 0 8px 0;
                font-size: 19px;
                font-weight: 900;
            }

            #max-turbinar-relato-box p {
                margin: 0 0 14px 0;
                font-size: 13px;
                color: #4b5563;
                line-height: 1.4;
            }

            #max-turbinar-relato-box label {
                display: block;
                margin: 12px 0 7px 0;
                font-size: 13px;
                font-weight: 800;
                color: #374151;
            }

            #max-turbinar-extra,
            #max-turbinar-preview {
                width: 100%;
                box-sizing: border-box;
                border: 1px solid #d1d5db;
                border-radius: 10px;
                padding: 10px;
                font-size: 14px;
                outline: none;
                color: #111827;
                background: #ffffff;
                font-family: Arial, Helvetica, sans-serif;
            }

            #max-turbinar-extra {
                height: 105px;
                resize: vertical;
            }

            #max-turbinar-preview {
                height: 135px;
                resize: vertical;
                background: #f9fafb;
            }

            #max-turbinar-actions {
                display: flex;
                justify-content: flex-end;
                gap: 10px;
                margin-top: 14px;
                flex-wrap: wrap;
            }

            #max-turbinar-actions button {
                border: 0;
                border-radius: 10px;
                padding: 10px 14px;
                font-size: 13px;
                font-weight: 900;
                cursor: pointer;
            }

            #max-turbinar-cancelar {
                background: #e5e7eb;
                color: #111827;
            }

            #max-turbinar-gerar {
                background: #d32f2f;
                color: #ffffff;
            }

            #max-turbinar-recapturar {
                background: #2563eb;
                color: #ffffff;
            }

            #max-turbinar-status {
                margin-top: 10px;
                font-size: 12px;
                font-weight: 800;
                display: none;
            }
        `;

        document.head.appendChild(style);
    }

    function garantirModal() {
        let modal = document.getElementById(CONFIG.MODAL_ID);
        if (modal) return modal;

        modal = document.createElement('div');
        modal.id = CONFIG.MODAL_ID;

        modal.innerHTML = `
            <div id="max-turbinar-relato-box">
                <h2>⚡ Turbinar relato</h2>
                <p>Vou pegar o texto do relato, melhorar a estrutura, corrigir a escrita e gerar o título da OS no padrão.</p>

                <label for="max-turbinar-extra">Diretriz extra do analista</label>
                <textarea id="max-turbinar-extra" placeholder="Ex: tópico único, ainda em análise, aguardando retorno do técnico, manter bem enxuto..."></textarea>

                <label for="max-turbinar-preview">Relato capturado</label>
                <textarea id="max-turbinar-preview" placeholder="O conteúdo do relato aparecerá aqui antes de enviar ao GPT."></textarea>

                <div id="max-turbinar-actions">
                    <button id="max-turbinar-cancelar" type="button">CANCELAR</button>
                    <button id="max-turbinar-recapturar" type="button">RECAPTURAR</button>
                    <button id="max-turbinar-gerar" type="button">TURBINAR NO GPT</button>
                </div>

                <div id="max-turbinar-status"></div>
            </div>
        `;

        document.body.appendChild(modal);

        const extra = modal.querySelector('#max-turbinar-extra');
        const preview = modal.querySelector('#max-turbinar-preview');
        const cancelar = modal.querySelector('#max-turbinar-cancelar');
        const recapturar = modal.querySelector('#max-turbinar-recapturar');
        const gerar = modal.querySelector('#max-turbinar-gerar');
        const status = modal.querySelector('#max-turbinar-status');

        cancelar.onclick = () => {
            modal.style.display = 'none';
            status.style.display = 'none';
        };

        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.style.display = 'none';
                status.style.display = 'none';
            }
        };

        recapturar.onclick = () => {
            const captura = capturarRelato();
            preview.value = captura.texto;

            if (captura.texto) {
                status.textContent = 'Relato recapturado com sucesso.';
                status.style.color = '#16a34a';
                status.style.display = 'block';
            } else {
                status.textContent = 'Não consegui localizar texto no campo de relato.';
                status.style.color = '#dc2626';
                status.style.display = 'block';
            }
        };

        gerar.onclick = async () => {
            const relato = textoLimpo(preview.value);
            const diretriz = textoLimpo(extra.value);

            if (!relato) {
                status.textContent = 'Não há relato capturado para turbinar.';
                status.style.color = '#dc2626';
                status.style.display = 'block';
                return;
            }

            const prompt = montarPrompt(relato, diretriz);

            status.textContent = 'Abrindo ChatGPT via AutoPaste...';
            status.style.color = '#2563eb';
            status.style.display = 'block';

            await copiarTextoBackup(prompt);
            abrirChatGPTComPrompt(prompt);

            mostrarToast('Prompt enviado ao ChatGPT.', 'ok');
        };

        return modal;
    }

    function abrirModal(e) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
        }

        const modal = garantirModal();
        const extra = modal.querySelector('#max-turbinar-extra');
        const preview = modal.querySelector('#max-turbinar-preview');
        const status = modal.querySelector('#max-turbinar-status');

        const captura = capturarRelato();

        preview.value = captura.texto;
        status.style.display = 'none';

        modal.style.display = 'flex';

        setTimeout(() => {
            if (!captura.texto) {
                status.textContent = 'Não encontrei texto no relato. Você pode colar ou digitar manualmente no campo "Relato capturado".';
                status.style.color = '#ca8a04';
                status.style.display = 'block';
                preview.focus();
            } else {
                extra.focus();
            }
        }, 80);
    }

    function criarBotao() {
        const botao = document.createElement('button');
        botao.id = CONFIG.BOTAO_ID;
        botao.type = 'button';
        botao.className = 'btn waves-effect waves-light white-text text-nowrap';
        botao.title = 'Melhorar relato técnico com GPT';
        botao.innerHTML = '<i class="material-icons left">flash_on</i>Turbinar relato';
        botao.onclick = abrirModal;
        return botao;
    }

    function removerResquiciosVersaoAntiga() {
        const idsAntigos = [
            'max-turbinar-relato-float',
            'max-turbinar-relato-btn-old',
            'max-turbinar-relato-btn-legacy'
        ];

        for (const id of idsAntigos) {
            const antigo = document.getElementById(id);
            if (antigo) antigo.remove();
        }
    }

    function ajustarContainerDoPublicar(btnPublicar, botao) {
        const wrapperInterno = btnPublicar.parentElement;
        const coluna = btnPublicar.closest('.col-lg-2, .col-md-2, .col-sm-2, .col-xs-12') || btnPublicar.closest('[class*="col-"]');
        const row = btnPublicar.closest('.row');

        if (row) {
            row.style.display = 'flex';
            row.style.flexWrap = 'wrap';
            row.style.alignItems = 'center';
        }

        if (coluna) {
            coluna.style.flex = '0 0 auto';
            coluna.style.width = 'auto';
            coluna.style.maxWidth = 'none';
            coluna.style.minWidth = 'fit-content';
        }

        if (wrapperInterno) {
            wrapperInterno.style.display = 'flex';
            wrapperInterno.style.alignItems = 'center';
            wrapperInterno.style.flexWrap = 'nowrap';
            wrapperInterno.style.gap = '8px';
            wrapperInterno.style.width = 'max-content';
            wrapperInterno.style.maxWidth = 'none';
            wrapperInterno.style.overflow = 'visible';
        }

        btnPublicar.style.flex = '0 0 auto';
        btnPublicar.style.whiteSpace = 'nowrap';
        btnPublicar.style.width = 'auto';
        btnPublicar.style.maxWidth = 'none';
        btnPublicar.style.overflow = 'visible';

        botao.style.flex = '0 0 auto';
    }

    function garantirBotaoAoLadoDoPublicar() {
        removerResquiciosVersaoAntiga();

        const btnPublicar = document.getElementById('btnPublicar');

        if (!btnPublicar) {
            const botaoExistente = document.getElementById(CONFIG.BOTAO_ID);
            if (botaoExistente) botaoExistente.remove();
            return;
        }

        let botao = document.getElementById(CONFIG.BOTAO_ID);
        if (!botao) {
            botao = criarBotao();
        }

        const wrapperInterno = btnPublicar.parentElement;
        if (!wrapperInterno) return;

        ajustarContainerDoPublicar(btnPublicar, botao);

        if (botao.parentElement !== wrapperInterno || btnPublicar.nextElementSibling !== botao) {
            btnPublicar.insertAdjacentElement('afterend', botao);
        }
    }

    function atualizarTudo() {
        injetarCss();
        garantirModal();
        garantirBotaoAoLadoDoPublicar();
    }

    function agendarAtualizacao() {
        if (atualizacaoAgendada) return;

        atualizacaoAgendada = true;

        requestAnimationFrame(() => {
            atualizacaoAgendada = false;
            atualizarTudo();
        });
    }

    setTimeout(atualizarTudo, 700);

    const observer = new MutationObserver(() => {
        agendarAtualizacao();
    });

    observer.observe(document.body || document.documentElement, {
        childList: true,
        subtree: true
    });

    setInterval(agendarAtualizacao, 3000);
})();