// ==UserScript==
// @name         TendiChat - Layout Vertical 20%
// @namespace    caio.maxdata.tendichat
// @version      2.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Layout%20Vertical%2020%25.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Layout%20Vertical%2020%25.user.js
// @description  Coloca a lista de atendimentos acima da conversa em monitores verticais.
// @match        https://app.tendichat.com.br/app/chatz*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        /*
         * Percentual da área disponível destinado à lista.
         * 22% funciona melhor porque inclui filtros, pesquisa
         * e pelo menos um atendimento.
         */
        percentualLista: 36,

        /*
         * Limites para impedir que a lista fique pequena
         * ou grande demais.
         */
        alturaMinimaLista: 350,
        alturaMaximaLista: 450,

        /*
         * Margens laterais do TendiChat.
         */
        margemLateral: 8,

        /*
         * Distância opcional após o cabeçalho.
         */
        margemAbaixoHeader: 0
    };

    const STYLE_ID = 'tcv-layout-vertical-style';

    const CSS = `
        /* =====================================================
           CONTÊINER PRINCIPAL
           ===================================================== */

        html body main[data-tcv-root="1"] {
            position: fixed !important;

            top: var(--tcv-top, 53px) !important;
            left: var(--tcv-lateral, 8px) !important;
            right: var(--tcv-lateral, 8px) !important;
            bottom: 0 !important;

            width: auto !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            margin: 0 !important;
            padding: 0 !important;

            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            justify-content: flex-start !important;

            overflow: hidden !important;
            box-sizing: border-box !important;

            transform: none !important;
            z-index: 40 !important;
        }

        /* =====================================================
           LISTA DE ATENDIMENTOS — PARTE SUPERIOR
           ===================================================== */

        html body main[data-tcv-root="1"]
        > section[data-tcv-sidebar="1"] {
            position: relative !important;

            top: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: auto !important;

            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;

            height: var(--tcv-list-height, 270px) !important;
            min-height: var(--tcv-list-height, 270px) !important;
            max-height: var(--tcv-list-height, 270px) !important;

            flex: 0 0 var(--tcv-list-height, 270px) !important;

            display: flex !important;
            flex-direction: column !important;

            transform: none !important;
            translate: none !important;

            overflow: hidden !important;
            box-sizing: border-box !important;

            border-bottom: 2px solid rgba(148, 163, 184, 0.45) !important;

            z-index: 30 !important;
        }

        /*
         * Bloco com:
         * Todos, Pendente, Atendendo, Fechado e pesquisa.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-sidebar-tools="1"] {
            position: relative !important;
            top: auto !important;

            width: 100% !important;
            height: auto !important;

            flex: 0 0 auto !important;

            z-index: 31 !important;
        }

        /*
         * Compacta a linha dos filtros para economizar altura.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-sidebar-tools="1"]
        > article:first-child {
            margin-top: 2px !important;
            padding: 3px 10px !important;
            gap: 4px !important;
        }

        /*
         * Compacta a linha de pesquisa.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-sidebar-tools="1"]
        > article:nth-child(2) {
            padding: 3px 10px 5px !important;
        }

        html body main[data-tcv-root="1"]
        section[data-tcv-sidebar="1"]
        > hr {
            flex: 0 0 auto !important;
            margin: 0 !important;
        }

        /*
         * Contêiner externo da listagem.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-sidebar-list-wrap="1"] {
            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            flex: 1 1 auto !important;

            overflow: hidden !important;
        }

        /*
         * Área rolável dos atendimentos.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-sidebar-list-scroll="1"] {
            width: 100% !important;
            height: 100% !important;
            min-height: 0 !important;
            max-height: none !important;

            overflow-x: hidden !important;
            overflow-y: auto !important;
        }

        /*
         * Reduz o título "Atendimentos", que originalmente
         * ocupava 64 px.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-sidebar-list-scroll="1"]
        > h5 {
            height: auto !important;
            min-height: 0 !important;

            margin: 0 !important;
            padding: 5px 12px !important;

            font-size: 14px !important;
            line-height: 22px !important;
        }

        /* =====================================================
           CONVERSA — PARTE INFERIOR
           ===================================================== */

        html body main[data-tcv-root="1"]
        > section[data-tcv-conversation="1"] {
            position: relative !important;

            top: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: auto !important;

            width: 100% !important;
            min-width: 0 !important;
            max-width: none !important;

            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            flex: 1 1 0 !important;

            display: flex !important;
            flex-direction: column !important;
            align-items: stretch !important;
            justify-content: flex-start !important;

            overflow: hidden !important;
            box-sizing: border-box !important;

            transform: none !important;
        }

        /*
         * Seção com cabeçalho do cliente e mensagens.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-chat-content="1"] {
            position: relative !important;

            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            flex: 1 1 0 !important;

            display: flex !important;
            flex-direction: column !important;

            padding: 0 !important;

            overflow: hidden !important;
        }

        /*
         * Cabeçalho da conversa.
         * Com a largura total ele ficará bem menos alto.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-chat-header="1"] {
            position: relative !important;
            top: auto !important;

            width: 100% !important;
            height: auto !important;

            flex: 0 0 auto !important;

            z-index: 20 !important;
        }

        /*
         * Histórico das mensagens.
         */
        html body main[data-tcv-root="1"]
        #chatBox {
            position: relative !important;

            width: 100% !important;
            height: auto !important;
            min-height: 0 !important;
            max-height: none !important;

            flex: 1 1 0 !important;

            overflow-x: hidden !important;
            overflow-y: auto !important;

            padding-bottom: 8px !important;
        }

        /*
         * Campo de mensagem.
         * Neutraliza a classe -mt-24 original.
         */
        html body main[data-tcv-root="1"]
        [data-tcv-composer="1"] {
            position: relative !important;

            top: auto !important;
            right: auto !important;
            bottom: auto !important;
            left: auto !important;

            width: 100% !important;
            height: auto !important;

            flex: 0 0 auto !important;

            margin: 0 !important;
            padding: 0 !important;

            transform: none !important;

            z-index: 50 !important;
        }

        html body main[data-tcv-root="1"]
        [data-tcv-composer="1"] form {
            width: 100% !important;
            min-width: 0 !important;
        }

        html body main[data-tcv-root="1"]
        [data-tcv-composer="1"] textarea {
            width: 100% !important;
            min-width: 0 !important;
        }

        /*
         * Padronização das dimensões.
         */
        html body main[data-tcv-root="1"],
        html body main[data-tcv-root="1"] *,
        html body main[data-tcv-root="1"] *::before,
        html body main[data-tcv-root="1"] *::after {
            box-sizing: border-box;
        }
    `;

    let atualizacaoPendente = false;
    let elementosAtuais = null;
    let primeiraAplicacao = true;

    function adicionarCSS() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;

        (document.head || document.documentElement).appendChild(style);
    }

    function encontrarTituloAtendimentos(raiz) {
        if (!raiz) {
            return null;
        }

        return Array.from(
            raiz.querySelectorAll('h1, h2, h3, h4, h5, h6')
        ).find(elemento =>
            elemento.textContent
                .trim()
                .toLowerCase() === 'atendimentos'
        ) || null;
    }

    function encontrarFilhoDiretoQueContem(elemento, ancestral) {
        if (!elemento || !ancestral) {
            return null;
        }

        let atual = elemento;

        while (
            atual &&
            atual.parentElement &&
            atual.parentElement !== ancestral
        ) {
            atual = atual.parentElement;
        }

        return atual?.parentElement === ancestral
            ? atual
            : null;
    }

    function localizarElementos() {
        const chatBox = document.querySelector('#chatBox');

        const textarea =
            document.querySelector(
                'textarea[placeholder="Mensagem..."]'
            ) ||
            document.querySelector('textarea');

        if (!chatBox || !textarea) {
            return null;
        }

        const main =
            chatBox.closest('main');

        if (!main) {
            return null;
        }

        const filhosMain =
            Array.from(main.children);

        const conversa =
            filhosMain.find(elemento =>
                elemento.contains(chatBox)
            );

        const pesquisa =
            main.querySelector(
                'input[placeholder="Pesquisar"]'
            );

        const tituloAtendimentos =
            encontrarTituloAtendimentos(main);

        const sidebar =
            filhosMain.find(elemento =>
                elemento !== conversa &&
                (
                    elemento.contains(pesquisa) ||
                    elemento.contains(tituloAtendimentos)
                )
            );

        if (!sidebar || !conversa) {
            return null;
        }

        const sidebarTools =
            Array.from(sidebar.children).find(elemento =>
                pesquisa && elemento.contains(pesquisa)
            ) || null;

        const listScroll =
            tituloAtendimentos?.closest('section') || null;

        const listWrap =
            listScroll &&
            listScroll.parentElement !== sidebar
                ? listScroll.parentElement
                : listScroll;

        const chatContent =
            encontrarFilhoDiretoQueContem(
                chatBox,
                conversa
            );

        const composer =
            encontrarFilhoDiretoQueContem(
                textarea,
                conversa
            );

        const chatHeader =
            chatContent
                ? Array.from(chatContent.children).find(
                    elemento =>
                        elemento.tagName === 'ARTICLE'
                )
                : null;

        return {
            main,
            sidebar,
            sidebarTools,
            listWrap,
            listScroll,
            conversa,
            chatContent,
            chatHeader,
            chatBox,
            composer,
            textarea
        };
    }

    function marcar(elemento, atributo) {
        if (!elemento) {
            return;
        }

        if (elemento.getAttribute(atributo) !== '1') {
            elemento.setAttribute(atributo, '1');
        }
    }

    function aplicarMarcacoes(elementos) {
        marcar(elementos.main, 'data-tcv-root');
        marcar(elementos.sidebar, 'data-tcv-sidebar');
        marcar(
            elementos.sidebarTools,
            'data-tcv-sidebar-tools'
        );
        marcar(
            elementos.listWrap,
            'data-tcv-sidebar-list-wrap'
        );
        marcar(
            elementos.listScroll,
            'data-tcv-sidebar-list-scroll'
        );
        marcar(
            elementos.conversa,
            'data-tcv-conversation'
        );
        marcar(
            elementos.chatContent,
            'data-tcv-chat-content'
        );
        marcar(
            elementos.chatHeader,
            'data-tcv-chat-header'
        );
        marcar(
            elementos.composer,
            'data-tcv-composer'
        );
    }

    function removerMarcacoesAntigas(elementos) {
        /*
         * Remove atributos deixados pela versão horizontal antiga.
         */
        const atributosAntigos = [
            'data-tc-layout-root',
            'data-tc-layout-active',
            'data-tc-sidebar',
            'data-tc-conversation',
            'data-tc-sidebar-tools',
            'data-tc-sidebar-list-wrap',
            'data-tc-sidebar-list-scroll',
            'data-tc-chat-content',
            'data-tc-chat-header',
            'data-tc-composer'
        ];

        Object.values(elementos).forEach(elemento => {
            if (!(elemento instanceof Element)) {
                return;
            }

            atributosAntigos.forEach(atributo => {
                elemento.removeAttribute(atributo);
            });
        });

        document
            .querySelectorAll(
                atributosAntigos
                    .map(atributo => `[${atributo}]`)
                    .join(',')
            )
            .forEach(elemento => {
                atributosAntigos.forEach(atributo => {
                    elemento.removeAttribute(atributo);
                });
            });

        /*
         * Remove o painel do diagnóstico, caso ainda exista.
         */
        document
            .getElementById('tc-diagnostico-painel')
            ?.remove();

        document
            .getElementById('tc-diagnostico-modal')
            ?.remove();
    }

    function limitar(numero, minimo, maximo) {
        return Math.max(
            minimo,
            Math.min(maximo, numero)
        );
    }

    function calcularDimensoes(elementos) {
        const header =
            document.querySelector('.app-header');

        if (!header) {
            return;
        }

        const headerRect =
            header.getBoundingClientRect();

        const topo = Math.ceil(
            headerRect.bottom +
            CONFIG.margemAbaixoHeader
        );

        const alturaDisponivel =
            window.innerHeight - topo;

        const alturaCalculada =
            Math.round(
                alturaDisponivel *
                (CONFIG.percentualLista / 100)
            );

        const alturaLista =
            limitar(
                alturaCalculada,
                CONFIG.alturaMinimaLista,
                CONFIG.alturaMaximaLista
            );

        elementos.main.style.setProperty(
            '--tcv-top',
            `${topo}px`
        );

        elementos.main.style.setProperty(
            '--tcv-lateral',
            `${CONFIG.margemLateral}px`
        );

        elementos.main.style.setProperty(
            '--tcv-list-height',
            `${alturaLista}px`
        );
    }

    function aplicarLayout() {
        atualizacaoPendente = false;

        const elementos =
            localizarElementos();

        if (!elementos) {
            return;
        }

        elementosAtuais = elementos;

        const estavaPertoDoFim =
            elementos.chatBox.scrollHeight -
            elementos.chatBox.scrollTop -
            elementos.chatBox.clientHeight < 100;

        removerMarcacoesAntigas(elementos);
        aplicarMarcacoes(elementos);
        calcularDimensoes(elementos);

        requestAnimationFrame(() => {
            /*
             * Mantém a conversa no final quando ela já estava
             * no final ou na primeira execução do script.
             */
            if (
                primeiraAplicacao ||
                estavaPertoDoFim
            ) {
                elementos.chatBox.scrollTop =
                    elementos.chatBox.scrollHeight;
            }

            primeiraAplicacao = false;
        });
    }

    function agendarAtualizacao() {
        if (atualizacaoPendente) {
            return;
        }

        atualizacaoPendente = true;

        requestAnimationFrame(aplicarLayout);
    }

    function iniciar() {
        adicionarCSS();

        const observer =
            new MutationObserver(() => {
                agendarAtualizacao();
            });

        observer.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );

        window.addEventListener(
            'resize',
            agendarAtualizacao,
            { passive: true }
        );

        window.visualViewport?.addEventListener(
            'resize',
            agendarAtualizacao,
            { passive: true }
        );

        /*
         * Recalcula caso o Vue altere algum componente
         * sem disparar redimensionamento.
         */
        setInterval(
            agendarAtualizacao,
            1500
        );

        agendarAtualizacao();
    }

    iniciar();
})();