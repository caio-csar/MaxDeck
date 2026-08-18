// ==UserScript==
// @name         MaxAtendimento - Frases Prontas Cancelamento
// @namespace    maxdata-caio
// @version      1.5
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Frases%20Prontas%20Cancelamento.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Frases%20Prontas%20Cancelamento.user.js
// @description  Adiciona botões de frases prontas à esquerda dos botões Novo e Gravar
// @match        *://externo.maxdatasistema.com.br/Atendimentos/Atendimento*
// @match        *://externo.maxdatasistema.com.br/Atendimento/Atendimento*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        descricaoPadrao: 'Cancelar atendimento',
        textoTipoSuporteInterno: 'SUPORTE INTERNO',
        prioridadeNaoAtende: '5',
        prioridadeFechar: '6',
        autoGravar: false
    };

    function dispararEventos(el) {
        if (!el) return;

        ['input', 'change', 'blur', 'keyup'].forEach(tipo => {
            el.dispatchEvent(new Event(tipo, {
                bubbles: true
            }));
        });

        if (window.jQuery) {
            window.jQuery(el)
                .trigger('input')
                .trigger('change')
                .trigger('blur')
                .trigger('keyup');
        }
    }

    function setValor(selector, valor) {
        const el = document.querySelector(selector);

        if (!el) {
            console.warn(`[Frases Prontas] Campo não encontrado: ${selector}`);
            return false;
        }

        el.value = valor;
        dispararEventos(el);

        return true;
    }

    function setSelect(selector, valor) {
        const el = document.querySelector(selector);

        if (!el) {
            console.warn(`[Frases Prontas] Select não encontrado: ${selector}`);
            return false;
        }

        const estavaDisabled = el.disabled;

        el.disabled = false;
        el.removeAttribute('disabled');

        el.value = valor;
        dispararEventos(el);

        if (estavaDisabled) {
            el.disabled = true;
            el.setAttribute('disabled', 'disabled');
        }

        return true;
    }

    function pressionarEnter(el) {
        if (!el) return;

        el.focus();

        ['keydown', 'keypress', 'keyup'].forEach(tipo => {
            el.dispatchEvent(new KeyboardEvent(tipo, {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
        });

        if (window.jQuery) {
            const $el = window.jQuery(el);

            ['keydown', 'keypress', 'keyup'].forEach(tipo => {
                $el.trigger(window.jQuery.Event(tipo, {
                    key: 'Enter',
                    code: 'Enter',
                    which: 13,
                    keyCode: 13
                }));
            });
        }
    }

    function tentarClicarOpcaoAutocomplete(texto) {
        const textoBusca = texto.trim().toUpperCase();

        const opcoes = [
            ...document.querySelectorAll(
                '.ui-menu-item, .ui-menu-item-wrapper, .autocomplete-content li, .dropdown-content li'
            )
        ];

        const opcao = opcoes.find(el => {
            const textoOpcao = (
                el.innerText ||
                el.textContent ||
                ''
            ).trim().toUpperCase();

            const estilo = window.getComputedStyle(el);

            const visivel =
                el.offsetParent !== null &&
                estilo.display !== 'none' &&
                estilo.visibility !== 'hidden';

            return visivel && textoOpcao.includes(textoBusca);
        });

        if (!opcao) return false;

        opcao.click();

        return true;
    }

    function localizarEditorRelato() {
        const editores = [
            ...document.querySelectorAll(
                '.note-editable[contenteditable="true"]'
            )
        ];

        return editores.find(editor => {
            const estilo = window.getComputedStyle(editor);

            return (
                editor.offsetParent !== null &&
                estilo.display !== 'none' &&
                estilo.visibility !== 'hidden'
            );
        }) || editores[0];
    }

    function setRelato(texto) {
        const editor = localizarEditorRelato();

        if (!editor) {
            console.warn('[Frases Prontas] Campo de relato não encontrado.');
            return false;
        }

        editor.focus();
        editor.innerHTML = '';

        const paragrafo = document.createElement('p');
        paragrafo.textContent = texto;

        editor.appendChild(paragrafo);

        dispararEventos(editor);

        if (window.jQuery) {
            const $editor = window.jQuery(editor);

            $editor
                .trigger('input')
                .trigger('change')
                .trigger('blur')
                .trigger('keyup');

            const noteEditor = $editor.closest('.note-editor');
            const textarea = noteEditor.prev('textarea');

            if (textarea.length) {
                textarea.val(texto);

                textarea
                    .trigger('input')
                    .trigger('change')
                    .trigger('blur');
            }
        }

        return true;
    }

    function marcarTipoInterno() {
        const tipoAtendimento =
            document.querySelector('#vedTipoAtend');

        const valorInterno =
            document.querySelector('#TatIdEmAtendInterno')?.value;

        if (tipoAtendimento && valorInterno) {
            setSelect('#vedTipoAtend', valorInterno);
        }

        const campoTipoSuporte =
            document.querySelector('#TipoSuporteDesc');

        if (!campoTipoSuporte) {
            console.warn(
                '[Frases Prontas] Campo TipoSuporteDesc não encontrado.'
            );
            return;
        }

        campoTipoSuporte.focus();
        campoTipoSuporte.value = CONFIG.textoTipoSuporteInterno;

        dispararEventos(campoTipoSuporte);

        setTimeout(() => {
            campoTipoSuporte.focus();

            const clicouOpcao = tentarClicarOpcaoAutocomplete(
                CONFIG.textoTipoSuporteInterno
            );

            if (!clicouOpcao) {
                pressionarEnter(campoTipoSuporte);
            }

            dispararEventos(campoTipoSuporte);
        }, 300);
    }

    function preencherAtendimento({ relato, prioridade }) {
        setValor(
            '#vedAtendDescricao',
            CONFIG.descricaoPadrao
        );

        setRelato(relato);
        marcarTipoInterno();

        setSelect(
            '#vedAtendPrioridade',
            prioridade
        );

        mostrarAviso('Campos preenchidos com sucesso.');

        if (CONFIG.autoGravar) {
            setTimeout(() => {
                document.querySelector('#btnGravarOs')?.click();
            }, 700);
        }
    }

    function mostrarAviso(mensagem) {
        let aviso = document.querySelector(
            '#max-frases-prontas-aviso'
        );

        if (!aviso) {
            aviso = document.createElement('div');
            aviso.id = 'max-frases-prontas-aviso';

            Object.assign(aviso.style, {
                position: 'fixed',
                right: '18px',
                bottom: '18px',
                zIndex: '999999',
                background: '#111827',
                color: '#ffffff',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '600',
                boxShadow: '0 4px 14px rgba(0,0,0,.25)',
                opacity: '0',
                transition: 'opacity .2s ease',
                pointerEvents: 'none'
            });

            document.body.appendChild(aviso);
        }

        aviso.textContent = mensagem;
        aviso.style.opacity = '1';

        clearTimeout(window.__maxFrasesAvisoTimer);

        window.__maxFrasesAvisoTimer = setTimeout(() => {
            aviso.style.opacity = '0';
        }, 1800);
    }

    function criarBotao({ id, texto, icone, cor, onClick }) {
        const btn = document.createElement('button');

        btn.type = 'button';
        btn.id = id;
        btn.className = 'btn waves-effect waves-light white-text';

        btn.innerHTML =
            `<i class="material-icons">${icone}</i>` +
            `<span>${texto}</span>`;

        Object.assign(btn.style, {
            backgroundColor: cor,
            height: '30px',
            lineHeight: '30px',
            padding: '0 16px',
            margin: '0 3px',
            border: 'none',
            borderRadius: '2px',
            verticalAlign: 'middle',
            fontSize: '12px',
            fontWeight: '600',
            fontFamily: 'inherit',
            textTransform: 'uppercase',
            whiteSpace: 'nowrap',
            boxShadow:
                '0 2px 2px rgba(0,0,0,.14), ' +
                '0 3px 1px -2px rgba(0,0,0,.12), ' +
                '0 1px 5px rgba(0,0,0,.20)'
        });

        const icon = btn.querySelector('i');

        Object.assign(icon.style, {
            display: 'inline-block',
            float: 'none',
            margin: '0 10px 0 0',
            fontSize: '17px',
            lineHeight: '30px',
            verticalAlign: 'top'
        });

        const span = btn.querySelector('span');

        Object.assign(span.style, {
            display: 'inline-block',
            lineHeight: '30px',
            verticalAlign: 'top'
        });

        btn.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            onClick();
        });

        return btn;
    }

    function normalizarTexto(texto) {
        return String(texto || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    function localizarBotaoNovo() {
        const candidatos = [
            ...document.querySelectorAll(
                'button, a.btn, input[type="button"], input[type="submit"]'
            )
        ];

        return candidatos.find(el => {
            if (
                el.id === 'max-btn-cancelar-pronto' ||
                el.id === 'max-btn-resolvido-pronto'
            ) {
                return false;
            }

            const texto = normalizarTexto(
                el.innerText ||
                el.textContent ||
                el.value
            );

            return (
                texto === 'NOVO' ||
                texto.startsWith('NOVO ') ||
                texto.endsWith(' NOVO')
            );
        });
    }

    function localizarBotaoGravar() {
        return (
            document.querySelector('#btnGravarOs') ||
            [...document.querySelectorAll(
                'button, a.btn, input[type="button"], input[type="submit"]'
            )].find(el => {
                const texto = normalizarTexto(
                    el.innerText ||
                    el.textContent ||
                    el.value
                );

                return (
                    texto === 'GRAVAR' ||
                    texto.startsWith('GRAVAR ') ||
                    texto.endsWith(' GRAVAR')
                );
            })
        );
    }

    function inserirBotoes() {
        const cancelarExistente = document.querySelector(
            '#max-btn-cancelar-pronto'
        );

        const resolvidoExistente = document.querySelector(
            '#max-btn-resolvido-pronto'
        );

        if (cancelarExistente && resolvidoExistente) {
            return true;
        }

        document.querySelector(
            '#max-frases-prontas-container'
        )?.remove();

        const botaoNovo = localizarBotaoNovo();
        const botaoGravar = localizarBotaoGravar();

        const referencia = botaoNovo || botaoGravar;

        if (!referencia) {
            console.warn(
                '[Frases Prontas] Botões Novo ou Gravar ainda não encontrados.'
            );

            return false;
        }

        const container = document.createElement('span');
        container.id = 'max-frases-prontas-container';

        Object.assign(container.style, {
            display: 'inline-block',
            verticalAlign: 'middle',
            marginRight: '2px'
        });

        const btnCancelar = criarBotao({
            id: 'max-btn-cancelar-pronto',
            texto: 'Cancelar atendimento',
            icone: 'phone_disabled',
            cor: '#ef4444',

            onClick: () => preencherAtendimento({
                relato: 'Cliente não atende nem responde',
                prioridade: CONFIG.prioridadeNaoAtende
            })
        });

        const btnResolvido = criarBotao({
            id: 'max-btn-resolvido-pronto',
            texto: 'Cliente resolveu!',
            icone: 'check_circle',
            cor: '#16a34a',

            onClick: () => preencherAtendimento({
                relato: 'Cliente informou que a demanda já foi resolvida!',
                prioridade: CONFIG.prioridadeFechar
            })
        });

        container.appendChild(btnCancelar);
        container.appendChild(btnResolvido);

        referencia.insertAdjacentElement(
            'beforebegin',
            container
        );

        console.log(
            '[Frases Prontas] Botões inseridos antes de:',
            botaoNovo ? 'Novo' : 'Gravar'
        );

        return true;
    }

    function iniciar() {
        let tentativas = 0;

        const tentarInserir = setInterval(() => {
            tentativas++;

            const inseriu = inserirBotoes();

            if (inseriu || tentativas >= 30) {
                clearInterval(tentarInserir);
            }
        }, 500);

        const observer = new MutationObserver(() => {
            clearTimeout(window.__maxFrasesMutationTimer);

            window.__maxFrasesMutationTimer = setTimeout(() => {
                inserirBotoes();
            }, 300);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener(
            'DOMContentLoaded',
            iniciar
        );
    } else {
        iniciar();
    }
})();