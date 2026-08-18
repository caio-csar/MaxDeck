// ==UserScript==
// @name         ZZZTendiChat - Layout Fixo
// @namespace    maxdata.tendichat.layout
// @version      1.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/ZZZTendiChat%20-%20Layout%20Fixo.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/ZZZTendiChat%20-%20Layout%20Fixo.user.js
// @description  Mantém o TendiChat fixo abaixo do cabeçalho, com lista e conversa ajustadas à janela.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    /*
     * CONFIGURAÇÕES
     */
    const CONFIG = {
        // Abaixo desta largura, mantém o comportamento móvel original.
        larguraMinimaTela: 620,

        // Largura mínima e máxima da lista de atendimentos.
        larguraMinimaLista: 310,
        larguraMaximaLista: 370,

        // Percentual aproximado ocupado pela lista em telas menores.
        proporcaoLista: 0.44,

        // Espaço opcional entre o app-header e o TendiChat.
        margemAbaixoHeader: 0
    };

    const CSS = `
        /* =====================================================
           ÁREA PRINCIPAL DO TENDICHAT
           ===================================================== */

        main[data-tc-layout-root="1"][data-tc-layout-active="1"] {
            position: fixed !important;

            top: var(--tc-top) !important;
            left: var(--tc-left) !important;
            right: var(--tc-right) !important;
            bottom: 0 !important;

            width: auto !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            display: flex !important;
            align-items: stretch !important;

            overflow: hidden !important;
            box-sizing: border-box !important;

            margin: 0 !important;
            border-radius: 0 !important;

            z-index: 40 !important;
        }

        /* =====================================================
           LISTA DE ATENDIMENTOS
           ===================================================== */

        main[data-tc-layout-active="1"]
        section[data-tc-sidebar="1"] {
            position: relative !important;

            top: auto !important;
            left: auto !important;

            flex: 0 0 var(--tc-sidebar-width) !important;

            width: var(--tc-sidebar-width) !important;
            min-width: var(--tc-sidebar-width) !important;
            max-width: var(--tc-sidebar-width) !important;

            height: 100% !important;
            min-height: 0 !important;
            max-height: none !important;

            display: flex !important;
            flex-direction: column !important;

            transform: translateX(0) !important;

            overflow: hidden !important;
            box-sizing: border-box !important;

            z-index: 30 !important;
        }

        main[data-tc-layout-active="1"]
        section[data-tc-sidebar="1"] > hr {
            flex: 0 0 auto !important;
        }

        /*
         * Área superior da lista:
         * Todos, Pendente, Atendendo, Fechado e pesquisa.
         */
        main[data-tc-layout-active="1"]
        [data-tc-sidebar-tools="1"] {
            position: relative !important;
            top: auto !important;

            flex: 0 0 auto !important;

            z-index: 31 !important;
        }

        /*
         * Contêiner que envolve "Atendimentos".
         */
        main[data-tc-layout-active="1"]
        [data-tc-sidebar-list-wrap="1"] {
            flex: 1 1 auto !important;

            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            overflow: hidden !important;
        }

        /*
         * Área efetivamente rolável da lista.
         */
        main[data-tc-layout-active="1"]
        [data-tc-sidebar-list-scroll="1"] {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            max-height: none !important;

            overflow-x: hidden !important;
            overflow-y: auto !important;
        }

        /* =====================================================
           ÁREA DA CONVERSA
           ===================================================== */

        main[data-tc-layout-active="1"]
        section[data-tc-conversation="1"] {
            position: relative !important;

            flex: 1 1 auto !important;

            width: auto !important;
            min-width: 0 !important;
            max-width: none !important;

            height: 100% !important;
            min-height: 0 !important;
            max-height: none !important;

            display: flex !important;
            flex-direction: column !important;
            justify-content: flex-start !important;

            overflow: hidden !important;
            box-sizing: border-box !important;

            transform: none !important;
        }

        /*
         * Seção que contém:
         * cabeçalho do cliente + mensagens.
         */
        main[data-tc-layout-active="1"]
        [data-tc-chat-content="1"] {
            position: relative !important;

            flex: 1 1 auto !important;

            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            padding-bottom: 0 !important;

            display: flex !important;
            flex-direction: column !important;

            overflow: hidden !important;
        }

        /*
         * Cabeçalho interno da conversa.
         */
        main[data-tc-layout-active="1"]
        [data-tc-chat-header="1"] {
            position: relative !important;
            top: auto !important;

            flex: 0 0 auto !important;

            width: 100% !important;

            z-index: 20 !important;
        }

        /*
         * Histórico das mensagens.
         */
        main[data-tc-layout-active="1"]
        #chatBox {
            position: relative !important;

            flex: 1 1 auto !important;

            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            overflow-x: hidden !important;
            overflow-y: auto !important;

            padding-bottom: 10px !important;
        }

        /*
         * Campo de digitação.
         * Remove principalmente a classe -mt-24.
         */
        main[data-tc-layout-active="1"]
        [data-tc-composer="1"] {
            position: relative !important;

            top: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: auto !important;

            flex: 0 0 auto !important;

            width: 100% !important;

            margin-top: 0 !important;
            margin-bottom: 0 !important;

            transform: none !important;

            z-index: 50 !important;
        }

        /*
         * Evita que elementos flex ultrapassem seus limites.
         */
        main[data-tc-layout-active="1"] *,
        main[data-tc-layout-active="1"] *::before,
        main[data-tc-layout-active="1"] *::after {
            box-sizing: border-box;
        }
    `;

    GM_addStyle(CSS);

    let elementosAtuais = null;
    let atualizacaoAgendada = false;

    function marcarElemento(elemento, atributo) {
        if (!elemento) {
            return;
        }

        if (elemento.getAttribute(atributo) !== '1') {
            elemento.setAttribute(atributo, '1');
        }
    }

    function localizarElementos() {
        const chatBox = document.querySelector('#chatBox');

        if (!chatBox) {
            return null;
        }

        const main = chatBox.closest('main');

        if (!main) {
            return null;
        }

        const secoesPrincipais = Array.from(main.children).filter(
            elemento => elemento.tagName === 'SECTION'
        );

        const conversa = secoesPrincipais.find(secao =>
            secao.contains(chatBox)
        );

        const lista = secoesPrincipais.find(secao => {
            if (secao === conversa) {
                return false;
            }

            const pesquisa = secao.querySelector(
                'input[placeholder="Pesquisar"]'
            );

            const possuiAtendimentos = Array.from(
                secao.querySelectorAll('h1, h2, h3, h4, h5, h6')
            ).some(titulo =>
                titulo.textContent.trim().toLowerCase() === 'atendimentos'
            );

            return Boolean(pesquisa || possuiAtendimentos);
        });

        if (!lista || !conversa) {
            return null;
        }

        const ferramentasLista =
            lista.querySelector(':scope > section');

        const tituloAtendimentos = Array.from(
            lista.querySelectorAll('h1, h2, h3, h4, h5, h6')
        ).find(titulo =>
            titulo.textContent.trim().toLowerCase() === 'atendimentos'
        );

        const rolagemLista =
            tituloAtendimentos?.closest('section') || null;

        const contenedorLista =
            rolagemLista?.parentElement || null;

        const conteudoConversa =
            Array.from(conversa.children).find(elemento =>
                elemento.tagName === 'SECTION' &&
                elemento.contains(chatBox)
            ) || null;

        const cabecalhoConversa =
            conteudoConversa?.querySelector(':scope > article') || null;

        const compositor =
            Array.from(conversa.children).find(elemento =>
                elemento.querySelector?.(
                    'textarea[placeholder="Mensagem..."]'
                )
            ) || null;

        return {
            main,
            lista,
            conversa,
            ferramentasLista,
            contenedorLista,
            rolagemLista,
            conteudoConversa,
            cabecalhoConversa,
            chatBox,
            compositor
        };
    }

    function aplicarMarcacoes(elementos) {
        marcarElemento(
            elementos.main,
            'data-tc-layout-root'
        );

        marcarElemento(
            elementos.lista,
            'data-tc-sidebar'
        );

        marcarElemento(
            elementos.conversa,
            'data-tc-conversation'
        );

        marcarElemento(
            elementos.ferramentasLista,
            'data-tc-sidebar-tools'
        );

        marcarElemento(
            elementos.contenedorLista,
            'data-tc-sidebar-list-wrap'
        );

        marcarElemento(
            elementos.rolagemLista,
            'data-tc-sidebar-list-scroll'
        );

        marcarElemento(
            elementos.conteudoConversa,
            'data-tc-chat-content'
        );

        marcarElemento(
            elementos.cabecalhoConversa,
            'data-tc-chat-header'
        );

        marcarElemento(
            elementos.compositor,
            'data-tc-composer'
        );
    }

    function calcularPosicao(elementos) {
        const header = document.querySelector('.app-header');

        if (!header || !elementos?.main) {
            return;
        }

        const larguraViewport =
            document.documentElement.clientWidth;

        const layoutAtivo =
            larguraViewport >= CONFIG.larguraMinimaTela;

        elementos.main.setAttribute(
            'data-tc-layout-active',
            layoutAtivo ? '1' : '0'
        );

        if (!layoutAtivo) {
            return;
        }

        const headerRect =
            header.getBoundingClientRect();

        /*
         * Usa o pai do main para preservar eventuais margens laterais
         * existentes no layout original.
         */
        const elementoReferencia =
            elementos.main.parentElement || document.documentElement;

        const referenciaRect =
            elementoReferencia.getBoundingClientRect();

        const limiteEsquerdo = Math.max(
            0,
            Math.round(referenciaRect.left)
        );

        const limiteDireito = Math.max(
            0,
            Math.round(
                larguraViewport - referenciaRect.right
            )
        );

        const larguraDisponivel = Math.max(
            0,
            larguraViewport -
                limiteEsquerdo -
                limiteDireito
        );

        const larguraListaCalculada = Math.round(
            larguraDisponivel * CONFIG.proporcaoLista
        );

        const larguraLista = Math.max(
            CONFIG.larguraMinimaLista,
            Math.min(
                CONFIG.larguraMaximaLista,
                larguraListaCalculada
            )
        );

        const topo = Math.max(
            0,
            Math.ceil(
                headerRect.bottom +
                CONFIG.margemAbaixoHeader
            )
        );

        elementos.main.style.setProperty(
            '--tc-top',
            `${topo}px`
        );

        elementos.main.style.setProperty(
            '--tc-left',
            `${limiteEsquerdo}px`
        );

        elementos.main.style.setProperty(
            '--tc-right',
            `${limiteDireito}px`
        );

        elementos.main.style.setProperty(
            '--tc-sidebar-width',
            `${larguraLista}px`
        );
    }

    function aplicarLayout() {
        atualizacaoAgendada = false;

        const encontrados = localizarElementos();

        if (!encontrados) {
            return;
        }

        elementosAtuais = encontrados;

        aplicarMarcacoes(encontrados);
        calcularPosicao(encontrados);
    }

    function agendarAtualizacao() {
        if (atualizacaoAgendada) {
            return;
        }

        atualizacaoAgendada = true;

        requestAnimationFrame(aplicarLayout);
    }

    /*
     * O Vue pode recriar partes da interface.
     * O observer reaplica as marcações quando isso acontecer.
     */
    const observer = new MutationObserver(() => {
        agendarAtualizacao();
    });

    function iniciar() {
        if (!document.documentElement) {
            setTimeout(iniciar, 50);
            return;
        }

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });

        window.addEventListener(
            'resize',
            agendarAtualizacao,
            { passive: true }
        );

        window.addEventListener(
            'orientationchange',
            agendarAtualizacao,
            { passive: true }
        );

        /*
         * Segurança adicional para alterações de zoom,
         * cabeçalho, componentes ou rota.
         */
        setInterval(() => {
            agendarAtualizacao();
        }, 1000);

        agendarAtualizacao();
    }

    iniciar();
})();