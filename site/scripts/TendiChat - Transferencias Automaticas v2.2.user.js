// ==UserScript==
// @name         TendiChat - Transferencias Automaticas v2.4
// @namespace    maxdeck
// @version      2.4
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Transferencias%20Automaticas%20v2.2.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Transferencias%20Automaticas%20v2.2.user.js
// @description  Recebe solicitacoes pelo chat interno e transfere ao analista solicitante, com modo automatico.
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// ==/UserScript==

(function () {
    'use strict';

    const W = unsafeWindow;

    // =========================================================
    // CONFIGURACAO
    // =========================================================

    const MEU_ID = 432; // Caio

    const CHAVE_MODO_AUTO =
        'maxdeck_transferencia_modo_auto';

    const PATH_FUNIL =
        'M22 3H2l8 9.46V19l4 2v-8.54z';

    const PATH_TRANSFERENCIA =
        'm15 12l5-4l-5-4v2.999H2v2h13zm7 3H9v-3l-5 4l5 4v-3h13z';

    // =========================================================
    // ESTADO
    // =========================================================

    let modoAutomatico =
        localStorage.getItem(
            CHAVE_MODO_AUTO
        ) === '1';

    const mensagensProcessadas =
        new Set();

    const fila = [];

    let popupAtual = null;
    let solicitacaoAtual = null;

    let executando = false;

    // =========================================================
    // UTILITARIOS
    // =========================================================

    function esperar(ms) {
        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }

    function proximoFrame() {
        return new Promise(resolve =>
            W.requestAnimationFrame(resolve)
        );
    }

    function visivel(el) {
        return !!(
            el &&
            el.isConnected &&
            el.getClientRects().length
        );
    }

    async function esperarAte(
        callback,
        timeout = 5000,
        intervalo = 20
    ) {
        const inicio =
            performance.now();

        while (
            performance.now() -
            inicio <
            timeout
        ) {
            try {
                const resultado =
                    callback();

                if (resultado) {
                    return resultado;
                }
            } catch (_) {}

            await esperar(intervalo);
        }

        return null;
    }

    function clicarElemento(el) {

        if (!el) {
            return false;
        }

        const alvo =
            el.closest?.(
                'button, [role="button"], a, ' +
                'span.cursor-pointer, div.cursor-pointer'
            ) || el;

        if (
            typeof alvo.click ===
            'function'
        ) {
            alvo.click();

        } else {

            alvo.dispatchEvent(
                new W.Event(
                    'click',
                    {
                        bubbles: true,
                        cancelable: true
                    }
                )
            );
        }

        return true;
    }

    // =========================================================
    // NORMALIZACAO DE NOMES
    // =========================================================

    /*
     * Evita problemas como:
     *
     * João Pedro Gomes
     * Joao Pedro Gomes
     *
     * ou caracteres Unicode visualmente iguais
     * mas internamente diferentes.
     */

    function normalizarNome(texto) {

        return String(
            texto || ''
        )
            .normalize('NFD')
            .replace(
                /[\u0300-\u036f]/g,
                ''
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim()
            .toLowerCase();
    }

    // =========================================================
    // CHAVE AUTO
    // =========================================================

    function salvarModoAutomatico() {

        localStorage.setItem(
            CHAVE_MODO_AUTO,
            modoAutomatico
                ? '1'
                : '0'
        );
    }

    function atualizarVisualChave() {

        const container =
            document.getElementById(
                'maxdeck-auto-transfer'
            );

        if (!container) {
            return;
        }

        const trilho =
            container.querySelector(
                '[data-auto-track]'
            );

        const bolinha =
            container.querySelector(
                '[data-auto-knob]'
            );

        const texto =
            container.querySelector(
                '[data-auto-text]'
            );

        if (
            !trilho ||
            !bolinha ||
            !texto
        ) {
            return;
        }

        if (modoAutomatico) {

            trilho.style.background =
                '#16a34a';

            bolinha.style.transform =
                'translateX(18px)';

            texto.textContent =
                'AUTO';

            texto.style.color =
                '#22c55e';

            container.title =
                'Transferencia automatica ATIVA';

        } else {

            trilho.style.background =
                '#64748b';

            bolinha.style.transform =
                'translateX(0px)';

            texto.textContent =
                'AUTO';

            texto.style.color =
                '#94a3b8';

            container.title =
                'Transferencia automatica DESATIVADA';
        }
    }

    function alterarModoAutomatico() {

        modoAutomatico =
            !modoAutomatico;

        salvarModoAutomatico();

        atualizarVisualChave();

        if (
            modoAutomatico &&
            popupAtual &&
            solicitacaoAtual
        ) {
            const solicitacao =
                solicitacaoAtual;

            popupAtual.remove();

            popupAtual = null;
            solicitacaoAtual = null;

            fila.unshift(
                solicitacao
            );

            processarFila();
        }
    }

    function criarChaveAutomatica() {

        if (
            document.getElementById(
                'maxdeck-auto-transfer'
            )
        ) {
            return true;
        }

        const nav =
            document.querySelector(
                '.nav-tools'
            );

        if (!nav) {
            return false;
        }

        const container =
            document.createElement(
                'div'
            );

        container.id =
            'maxdeck-auto-transfer';

        Object.assign(
            container.style,
            {
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                userSelect: 'none',
                flexShrink: '0'
            }
        );

        const texto =
            document.createElement(
                'span'
            );

        texto.setAttribute(
            'data-auto-text',
            ''
        );

        Object.assign(
            texto.style,
            {
                fontFamily:
                    'Arial, sans-serif',
                fontSize: '10px',
                fontWeight: '800',
                letterSpacing:
                    '0.4px',
                transition:
                    'color .15s ease'
            }
        );

        const trilho =
            document.createElement(
                'div'
            );

        trilho.setAttribute(
            'data-auto-track',
            ''
        );

        Object.assign(
            trilho.style,
            {
                width: '38px',
                height: '20px',
                borderRadius: '999px',
                padding: '2px',
                boxSizing:
                    'border-box',
                transition:
                    'background .15s ease',
                boxShadow:
                    'inset 0 0 0 1px rgba(255,255,255,.15)'
            }
        );

        const bolinha =
            document.createElement(
                'div'
            );

        bolinha.setAttribute(
            'data-auto-knob',
            ''
        );

        Object.assign(
            bolinha.style,
            {
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                background: '#fff',
                boxShadow:
                    '0 1px 4px rgba(0,0,0,.35)',
                transition:
                    'transform .15s ease'
            }
        );

        trilho.appendChild(
            bolinha
        );

        container.append(
            texto,
            trilho
        );

        container.addEventListener(
            'click',
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                alterarModoAutomatico();
            }
        );

        nav.insertBefore(
            container,
            nav.firstElementChild
        );

        atualizarVisualChave();

        return true;
    }

    function instalarChaveHeader() {

        if (
            criarChaveAutomatica()
        ) {
            return;
        }

        const observer =
            new MutationObserver(
                () => {

                    if (
                        criarChaveAutomatica()
                    ) {
                        observer.disconnect();
                    }
                }
            );

        observer.observe(
            document.documentElement,
            {
                childList: true,
                subtree: true
            }
        );
    }

    // =========================================================
    // CAMPO PESQUISA
    // =========================================================

    function campoPesquisa() {

        return document.querySelector(
            'input[placeholder="Pesquisar"]'
        );
    }

    async function esperarCampoPesquisa(
        timeout = 1500
    ) {
        const inicio =
            performance.now();

        while (
            performance.now() -
            inicio <
            timeout
        ) {
            const campo =
                campoPesquisa();

            if (campo) {
                return campo;
            }

            await esperar(20);
        }

        return campoPesquisa();
    }

    // =========================================================
    // FUNIL
    // =========================================================

    function painelFiltros() {

        const articles =
            document.querySelectorAll(
                'article'
            );

        for (
            const article
            of articles
        ) {
            const verTodos =
                article.querySelector(
                    'button[title="Ver todos os tickets"], ' +
                    'button[title="Mostrando todos. Clique para ver apenas os seus."]'
                );

            const lupa =
                article.querySelector(
                    'button svg.iconify--ooui'
                );

            if (
                verTodos &&
                lupa
            ) {
                return article;
            }
        }

        return null;
    }

    function localizarSpanFunil() {

        const svgs =
            document.querySelectorAll(
                'svg.iconify--lucide'
            );

        for (
            const svg
            of svgs
        ) {
            const path =
                svg.querySelector(
                    'path'
                );

            if (
                path &&
                path.getAttribute(
                    'd'
                ) === PATH_FUNIL
            ) {
                return svg.closest(
                    'span'
                );
            }
        }

        return null;
    }

    async function garantirFunilAberto() {

        if (
            painelFiltros()
        ) {
            console.log(
                '[TRANSFER]',
                'Funil ja aberto'
            );

            return true;
        }

        const span =
            localizarSpanFunil();

        if (!span) {

            console.warn(
                '[TRANSFER]',
                'Funil nao encontrado'
            );

            return false;
        }

        span.click();

        const inicio =
            performance.now();

        while (
            performance.now() -
            inicio <
            1500
        ) {
            if (
                painelFiltros()
            ) {
                return true;
            }

            await esperar(20);
        }

        return false;
    }

    // =========================================================
    // VER TODOS
    // =========================================================

    function botaoVerTodos() {

        return [
            ...document.querySelectorAll(
                'button'
            )
        ].find(btn => {

            const texto =
                btn.textContent
                    .replace(
                        /\s+/g,
                        ' '
                    )
                    .trim();

            return (
                texto ===
                    'Ver todos' ||

                btn.title ===
                    'Ver todos os tickets' ||

                btn.title ===
                    'Mostrando todos. Clique para ver apenas os seus.'
            );

        }) || null;
    }

    function verTodosEstaAtivo() {

        const botao =
            botaoVerTodos();

        return !!(
            botao &&
            botao.title ===
                'Mostrando todos. Clique para ver apenas os seus.'
        );
    }

    async function garantirVerTodos() {

        const botao =
            botaoVerTodos();

        if (!botao) {
            return false;
        }

        if (
            verTodosEstaAtivo()
        ) {
            return true;
        }

        const assinaturaAntes =
            assinaturaListagem();

        const atualizacao =
            aguardarListagemAtualizar(
                assinaturaAntes,
                7000
            );

        botao.click();

        await atualizacao;

        return true;
    }

    // =========================================================
    // ABAS
    // =========================================================

    function localizarAba(nome) {

        const textos =
            document.querySelectorAll(
                'p'
            );

        for (
            const p
            of textos
        ) {
            if (
                p.textContent.trim() !==
                nome
            ) {
                continue;
            }

            const container =
                p.parentElement;

            if (!container) {
                continue;
            }

            const clicavel =
                container.querySelector(
                    '.cursor-pointer'
                );

            if (clicavel) {
                return clicavel;
            }
        }

        return null;
    }

    function abaEstaAtiva(nome) {

        const aba =
            localizarAba(nome);

        if (!aba) {
            return false;
        }

        return aba.classList.contains(
            'bg-padrao'
        );
    }

    function statusAtual() {

        if (
            abaEstaAtiva(
                'Pendente'
            )
        ) {
            return 'Pendente';
        }

        if (
            abaEstaAtiva(
                'Atendendo'
            )
        ) {
            return 'Atendendo';
        }

        return null;
    }

    async function selecionarAba(
        nome
    ) {
        if (
            abaEstaAtiva(nome)
        ) {
            return true;
        }

        const aba =
            localizarAba(nome);

        if (!aba) {
            return false;
        }

        aba.click();

        const inicio =
            performance.now();

        while (
            performance.now() -
            inicio <
            1200
        ) {
            if (
                abaEstaAtiva(nome)
            ) {
                return true;
            }

            await esperar(20);
        }

        return abaEstaAtiva(
            nome
        );
    }

    // =========================================================
    // LISTAGEM
    // =========================================================

    function secaoAtendimentos() {

        const titulos =
            document.querySelectorAll(
                'h5'
            );

        for (
            const titulo
            of titulos
        ) {
            if (
                titulo.textContent
                    .trim() ===
                'Atendimentos'
            ) {
                return titulo.closest(
                    'section'
                );
            }
        }

        return null;
    }

    function cardsNaListagem() {

        const secao =
            secaoAtendimentos();

        if (!secao) {
            return [];
        }

        return [
            ...secao.children
        ].filter(
            elemento => {

                if (
                    elemento.tagName !==
                    'DIV'
                ) {
                    return false;
                }

                return (
                    elemento
                        .classList
                        .length === 0
                );
            }
        );
    }

    function quantidadeResultados() {

        return cardsNaListagem()
            .length;
    }

    function assinaturaListagem() {

        return cardsNaListagem()
            .map(
                card =>
                    card.textContent
                        .replace(
                            /\s+/g,
                            ' '
                        )
                        .trim()
            )
            .join('|||');
    }

    // =========================================================
    // LOADING
    // =========================================================

    function indicadorCarregamento() {

        const spinners =
            document.querySelectorAll(
                'svg.animate-spin'
            );

        for (
            const svg
            of spinners
        ) {
            if (
                svg.classList.contains(
                    'bg-root'
                ) &&
                svg.classList.contains(
                    'w-10'
                ) &&
                svg.classList.contains(
                    'h-10'
                )
            ) {
                return svg;
            }
        }

        return null;
    }

    async function aguardarListagemAtualizar(
        assinaturaAntes,
        timeout = 8000
    ) {
        const inicio =
            performance.now();

        let ultimaAssinatura =
            assinaturaAntes;

        let ultimaMudanca =
            performance.now();

        let houveMudanca =
            false;

        let viuLoading =
            false;

        while (
            performance.now() -
            inicio <
            timeout
        ) {
            const loading =
                !!indicadorCarregamento();

            if (loading) {
                viuLoading = true;
            }

            const assinaturaAgora =
                assinaturaListagem();

            if (
                assinaturaAgora !==
                ultimaAssinatura
            ) {
                ultimaAssinatura =
                    assinaturaAgora;

                ultimaMudanca =
                    performance.now();

                houveMudanca =
                    true;
            }

            const estabilizou =
                performance.now() -
                    ultimaMudanca >=
                250;

            if (
                !loading &&
                estabilizou &&
                (
                    houveMudanca ||
                    viuLoading
                )
            ) {
                await proximoFrame();
                await proximoFrame();

                await esperar(80);

                return;
            }

            await esperar(20);
        }

        await proximoFrame();
        await proximoFrame();

        await esperar(100);
    }

    // =========================================================
    // INPUT VUE
    // =========================================================

    function preencherInput(
        input,
        valor
    ) {
        input.focus();

        const descriptor =
            Object.getOwnPropertyDescriptor(
                W.HTMLInputElement
                    .prototype,
                'value'
            );

        if (
            descriptor &&
            descriptor.set
        ) {
            descriptor.set.call(
                input,
                valor
            );

        } else {

            input.value =
                valor;
        }

        input.dispatchEvent(
            new W.InputEvent(
                'input',
                {
                    bubbles: true,
                    inputType:
                        'insertText',
                    data: valor
                }
            )
        );

        input.dispatchEvent(
            new W.Event(
                'change',
                {
                    bubbles: true
                }
            )
        );
    }

    function apertarEnter(
        input
    ) {
        input.dispatchEvent(
            new W.KeyboardEvent(
                'keyup',
                {
                    key: 'Enter',
                    code: 'Enter',
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true
                }
            )
        );
    }

    // =========================================================
    // PESQUISA STATUS ATUAL
    // =========================================================

    async function pesquisarStatusAtual(
        codigo
    ) {
        const status =
            statusAtual();

        if (!status) {
            return false;
        }

        const campo =
            campoPesquisa();

        if (!campo) {
            return false;
        }

        console.log(
            '[TRANSFER]',
            'Pesquisando:',
            codigo,
            'em',
            status
        );

        const assinaturaAntes =
            assinaturaListagem();

        preencherInput(
            campo,
            codigo
        );

        const atualizacao =
            aguardarListagemAtualizar(
                assinaturaAntes,
                8000
            );

        apertarEnter(
            campo
        );

        await atualizacao;

        const quantidade =
            quantidadeResultados();

        console.log(
            '[TRANSFER]',
            'Resultados:',
            quantidade
        );

        return quantidade > 0;
    }

    // =========================================================
    // OUTRO STATUS
    // =========================================================

    async function pesquisarOutroStatus() {

        const atual =
            statusAtual();

        if (!atual) {
            return false;
        }

        const outro =
            atual === 'Pendente'
                ? 'Atendendo'
                : 'Pendente';

        const assinaturaAntes =
            assinaturaListagem();

        const atualizacao =
            aguardarListagemAtualizar(
                assinaturaAntes,
                8000
            );

        const selecionou =
            await selecionarAba(
                outro
            );

        if (!selecionou) {
            return false;
        }

        await atualizacao;

        return (
            quantidadeResultados() >
            0
        );
    }

    // =========================================================
    // RESULTADO UNICO
    // =========================================================

    function validarResultadoUnico() {

        const cards =
            cardsNaListagem();

        if (
            cards.length === 0
        ) {
            throw new Error(
                'Nenhum atendimento encontrado.'
            );
        }

        if (
            cards.length > 1
        ) {
            throw new Error(
                'Foram encontrados ' +
                cards.length +
                ' atendimentos.'
            );
        }

        const article =
            cards[0].querySelector(
                'article'
            );

        if (!article) {
            throw new Error(
                'Atendimento encontrado, mas nao foi possivel abrir o card.'
            );
        }

        return article;
    }

    // =========================================================
    // LOCALIZA CONTATO
    // =========================================================

    async function localizarContato(
        codigo
    ) {
        const campo =
            await esperarCampoPesquisa(
                2000
            );

        if (!campo) {
            throw new Error(
                'Campo Pesquisar nao encontrado.'
            );
        }

        if (
            !await garantirFunilAberto()
        ) {
            throw new Error(
                'Nao foi possivel abrir o funil.'
            );
        }

        if (
            !await garantirVerTodos()
        ) {
            throw new Error(
                'Nao foi possivel ativar Ver todos.'
            );
        }

        let status =
            statusAtual();

        if (!status) {

            const assinaturaAntes =
                assinaturaListagem();

            const atualizacao =
                aguardarListagemAtualizar(
                    assinaturaAntes,
                    7000
                );

            const selecionou =
                await selecionarAba(
                    'Pendente'
                );

            if (!selecionou) {
                throw new Error(
                    'Nao foi possivel selecionar Pendente.'
                );
            }

            await atualizacao;
        }

        const achouPrimeiro =
            await pesquisarStatusAtual(
                codigo
            );

        if (achouPrimeiro) {
            return validarResultadoUnico();
        }

        const achouSegundo =
            await pesquisarOutroStatus();

        if (achouSegundo) {
            return validarResultadoUnico();
        }

        throw new Error(
            'Contato ' +
            codigo +
            ' nao encontrado.'
        );
    }

    // =========================================================
    // TRANSFERENCIA
    // =========================================================

    function localizarIconeTransferencia() {

        const svgs =
            document.querySelectorAll(
                'svg'
            );

        for (
            const svg
            of svgs
        ) {
            if (!visivel(svg)) {
                continue;
            }

            const path =
                svg.querySelector(
                    'path'
                );

            if (
                path &&
                path.getAttribute(
                    'd'
                ) ===
                PATH_TRANSFERENCIA
            ) {
                return svg;
            }
        }

        return null;
    }

    async function abrirTransferencia() {

        const icone =
            await esperarAte(
                localizarIconeTransferencia,
                6000,
                50
            );

        if (!icone) {
            throw new Error(
                'Icone de transferencia nao encontrado.'
            );
        }

        clicarElemento(
            icone
        );

        const campo =
            await esperarAte(
                () => {

                    const input =
                        document.querySelector(
                            'input[placeholder="Selecionar atendente..."]'
                        );

                    return visivel(input)
                        ? input
                        : null;
                },
                5000,
                50
            );

        if (!campo) {
            throw new Error(
                'Campo Selecionar atendente nao apareceu.'
            );
        }

        return campo;
    }

    // =========================================================
    // SELECIONAR ANALISTA
    // =========================================================

    async function selecionarAnalista(
        nome
    ) {

        const campo =
            await esperarAte(
                () => {

                    const input =
                        document.querySelector(
                            'input[placeholder="Selecionar atendente..."]'
                        );

                    return visivel(input)
                        ? input
                        : null;
                },
                3000,
                50
            );

        if (!campo) {
            throw new Error(
                'Campo de atendente nao encontrado.'
            );
        }

        campo.click();
        campo.focus();

        await esperar(100);

        preencherInput(
            campo,
            nome
        );

        const nomeNormalizado =
            normalizarNome(
                nome
            );

        // -----------------------------------------------------
        // PROCURA O ANALISTA
        //
        // Agora compara nomes normalizados.
        //
        // João Pedro Gomes
        // Joao Pedro Gomes
        //
        // passam a ser equivalentes.
        // -----------------------------------------------------

        const botao =
            await esperarAte(
                () => {

                    return [
                        ...document.querySelectorAll(
                            'button[data-indice]'
                        )
                    ].find(
                        btn =>
                            visivel(btn) &&
                            normalizarNome(
                                btn.textContent
                            ) ===
                            nomeNormalizado
                    );

                },
                5000,
                50
            );

        if (!botao) {
            throw new Error(
                'Analista "' +
                nome +
                '" nao apareceu na pesquisa.'
            );
        }

        console.log(
            '[TRANSFER]',
            'Analista localizado:',
            botao.textContent.trim()
        );

        // -----------------------------------------------------
        // PRIMEIRO CLIQUE
        // -----------------------------------------------------

        clicarElemento(
            botao
        );

        // -----------------------------------------------------
        // ESPERA O DROPDOWN FECHAR
        //
        // Antes existia apenas:
        //
        // await esperar(200)
        //
        // Agora confirmamos que a opcao
        // realmente deixou de estar visivel.
        // -----------------------------------------------------

        let selecionado =
            await esperarAte(
                () => {

                    if (
                        !botao.isConnected
                    ) {
                        return true;
                    }

                    if (
                        !visivel(botao)
                    ) {
                        return true;
                    }

                    return false;
                },
                1500,
                50
            );

        // -----------------------------------------------------
        // SE NAO CONFIRMOU, TENTA MAIS UMA VEZ
        // -----------------------------------------------------

        if (!selecionado) {

            console.warn(
                '[TRANSFER]',
                'Primeiro clique nao confirmou a selecao. Tentando novamente:',
                nome
            );

            clicarElemento(
                botao
            );

            selecionado =
                await esperarAte(
                    () => {

                        if (
                            !botao.isConnected
                        ) {
                            return true;
                        }

                        if (
                            !visivel(botao)
                        ) {
                            return true;
                        }

                        return false;
                    },
                    2000,
                    50
                );
        }

        if (!selecionado) {
            throw new Error(
                'O analista "' +
                nome +
                '" apareceu, mas a selecao nao foi confirmada.'
            );
        }

        console.log(
            '[TRANSFER]',
            'Analista selecionado:',
            nome
        );

        await esperar(150);
    }

    // =========================================================
    // CONFIRMAR TRANSFERENCIA
    // =========================================================

    async function confirmarTransferencia() {

        /*
         * Alem de encontrar o botao,
         * agora esperamos ele estar
         * realmente habilitado.
         */

        const botao =
            await esperarAte(
                () => {

                    return [
                        ...document.querySelectorAll(
                            'button'
                        )
                    ].find(
                        btn => {

                            if (
                                !visivel(btn)
                            ) {
                                return false;
                            }

                            if (
                                btn.textContent
                                    .trim() !==
                                'Transferir Atendimento'
                            ) {
                                return false;
                            }

                            if (
                                btn.disabled
                            ) {
                                return false;
                            }

                            if (
                                btn.getAttribute(
                                    'aria-disabled'
                                ) === 'true'
                            ) {
                                return false;
                            }

                            return true;
                        }
                    );
                },
                5000,
                50
            );

        if (!botao) {
            throw new Error(
                'Botao Transferir Atendimento nao ficou disponivel.'
            );
        }

        clicarElemento(
            botao
        );

        await esperar(300);
    }

    // =========================================================
    // FLUXO DE TRANSFERENCIA
    // =========================================================

    async function executarTransferencia(
        solicitacao,
        silencioso = false
    ) {
        if (!silencioso) {
            aviso(
                'Buscando contato ' +
                solicitacao.numero +
                '...'
            );
        }

        const atendimento =
            await localizarContato(
                solicitacao.numero
            );

        if (!silencioso) {
            aviso(
                'Contato encontrado. Abrindo atendimento...'
            );
        }

        atendimento.click();

        const icone =
            await esperarAte(
                localizarIconeTransferencia,
                6000,
                50
            );

        if (!icone) {
            throw new Error(
                'A conversa abriu, mas o icone de transferencia nao apareceu.'
            );
        }

        if (!silencioso) {
            aviso(
                'Abrindo transferencia...'
            );
        }

        await abrirTransferencia();

        if (!silencioso) {
            aviso(
                'Selecionando ' +
                solicitacao.analista +
                '...'
            );
        }

        await selecionarAnalista(
            solicitacao.analista
        );

        if (!silencioso) {
            aviso(
                'Confirmando transferencia...'
            );
        }

        await confirmarTransferencia();

        if (!silencioso) {
            aviso(
                'Transferido para ' +
                solicitacao.analista,
                'sucesso'
            );
        }

        console.log(
            '[TRANSFER]',
            'Finalizada:',
            solicitacao.numero,
            '->',
            solicitacao.analista
        );
    }

    // =========================================================
    // AVISO
    // =========================================================

    function aviso(
        mensagem,
        tipo = 'normal'
    ) {
        const anterior =
            document.getElementById(
                'maxdeck-transfer-toast'
            );

        anterior?.remove();

        const toast =
            document.createElement(
                'div'
            );

        toast.id =
            'maxdeck-transfer-toast';

        toast.textContent =
            mensagem;

        let fundo =
            '#0f172a';

        if (
            tipo === 'erro'
        ) {
            fundo =
                '#7f1d1d';
        }

        if (
            tipo === 'sucesso'
        ) {
            fundo =
                '#14532d';
        }

        Object.assign(
            toast.style,
            {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform:
                    'translateX(-50%)',
                zIndex:
                    '2147483647',
                background:
                    fundo,
                color: '#fff',
                padding:
                    '11px 18px',
                borderRadius:
                    '10px',
                fontSize:
                    '13px',
                fontFamily:
                    'Arial, sans-serif',
                fontWeight:
                    '600',
                boxShadow:
                    '0 8px 25px rgba(0,0,0,.30)'
            }
        );

        document.body.appendChild(
            toast
        );

        setTimeout(
            () => toast.remove(),
            4500
        );
    }

    // =========================================================
    // POPUP MANUAL
    // =========================================================

    function mostrarSolicitacao(
        solicitacao
    ) {
        if (popupAtual) {
            return;
        }

        solicitacaoAtual =
            solicitacao;

        const popup =
            document.createElement(
                'div'
            );

        popupAtual =
            popup;

        Object.assign(
            popup.style,
            {
                position: 'fixed',
                right: '22px',
                top: '90px',
                width: '340px',
                zIndex:
                    '2147483647',
                background:
                    '#0f172a',
                color: '#fff',
                border:
                    '1px solid #334155',
                borderRadius:
                    '14px',
                boxShadow:
                    '0 18px 45px rgba(0,0,0,.38)',
                padding:
                    '18px',
                fontFamily:
                    'Arial, sans-serif'
            }
        );

        const titulo =
            document.createElement(
                'div'
            );

        titulo.textContent =
            '🔄 Transferencia solicitada';

        Object.assign(
            titulo.style,
            {
                fontSize: '15px',
                fontWeight: '700',
                marginBottom:
                    '16px'
            }
        );

        const analista =
            document.createElement(
                'div'
            );

        analista.innerHTML =
            '<span style="opacity:.65">Analista</span><br><strong></strong>';

        analista.querySelector(
            'strong'
        ).textContent =
            solicitacao.analista;

        analista.style.marginBottom =
            '12px';

        const contato =
            document.createElement(
                'div'
            );

        contato.innerHTML =
            '<span style="opacity:.65">Contato</span><br>' +
            '<strong style="font-size:22px"></strong>';

        contato.querySelector(
            'strong'
        ).textContent =
            solicitacao.numero;

        contato.style.marginBottom =
            '18px';

        const botoes =
            document.createElement(
                'div'
            );

        Object.assign(
            botoes.style,
            {
                display: 'flex',
                gap: '8px'
            }
        );

        const aceitar =
            document.createElement(
                'button'
            );

        aceitar.textContent =
            'ACEITAR';

        const recusar =
            document.createElement(
                'button'
            );

        recusar.textContent =
            'RECUSAR';

        for (
            const botao
            of [
                aceitar,
                recusar
            ]
        ) {
            Object.assign(
                botao.style,
                {
                    flex: '1',
                    border: '0',
                    borderRadius:
                        '9px',
                    padding: '10px',
                    color: '#fff',
                    fontWeight:
                        '700',
                    cursor: 'pointer'
                }
            );
        }

        aceitar.style.background =
            '#16a34a';

        recusar.style.background =
            '#475569';

        aceitar.onclick =
            async () => {

                if (executando) {
                    return;
                }

                executando =
                    true;

                aceitar.disabled =
                    true;

                recusar.disabled =
                    true;

                aceitar.textContent =
                    'PROCESSANDO...';

                try {

                    await executarTransferencia(
                        solicitacao,
                        false
                    );

                    fecharPopup();

                } catch (erro) {

                    console.error(
                        '[TRANSFER]',
                        erro
                    );

                    aviso(
                        erro.message ||
                        'Erro na transferencia.',
                        'erro'
                    );

                    aceitar.disabled =
                        false;

                    recusar.disabled =
                        false;

                    aceitar.textContent =
                        'ACEITAR';

                } finally {

                    executando =
                        false;
                }
            };

        recusar.onclick =
            () => {
                fecharPopup();
            };

        botoes.append(
            aceitar,
            recusar
        );

        popup.append(
            titulo,
            analista,
            contato,
            botoes
        );

        document.body.appendChild(
            popup
        );
    }

    function fecharPopup() {

        popupAtual?.remove();

        popupAtual = null;
        solicitacaoAtual = null;

        processarFila();
    }

    // =========================================================
    // FILA
    // =========================================================

    function adicionarSolicitacao(
        solicitacao
    ) {
        fila.push(
            solicitacao
        );

        processarFila();
    }

    async function processarFila() {

        if (modoAutomatico) {

            if (
                executando ||
                fila.length === 0
            ) {
                return;
            }

            const solicitacao =
                fila.shift();

            executando =
                true;

            try {

                await executarTransferencia(
                    solicitacao,
                    true
                );

            } catch (erro) {

                console.error(
                    '[TRANSFER AUTO]',
                    erro
                );

                aviso(
                    'Erro na transferencia de ' +
                    solicitacao.numero +
                    ': ' +
                    (
                        erro.message ||
                        'erro desconhecido'
                    ),
                    'erro'
                );

            } finally {

                executando =
                    false;

                processarFila();
            }

            return;
        }

        if (
            popupAtual ||
            executando ||
            fila.length === 0
        ) {
            return;
        }

        mostrarSolicitacao(
            fila.shift()
        );
    }

    // =========================================================
    // WEBSOCKET
    // =========================================================

    function processarFrame(
        bruto
    ) {
        if (
            typeof bruto !==
            'string'
        ) {
            return;
        }

        const inicioJson =
            bruto.indexOf('[');

        if (
            inicioJson === -1
        ) {
            return;
        }

        let pacote;

        try {

            pacote =
                JSON.parse(
                    bruto.substring(
                        inicioJson
                    )
                );

        } catch (_) {

            return;
        }

        if (
            !Array.isArray(
                pacote
            )
        ) {
            return;
        }

        const evento =
            pacote[1];

        if (
            !evento ||
            evento.type !==
                'internal_chat_new_message'
        ) {
            return;
        }

        const dados =
            evento.data;

        if (!dados) {
            return;
        }

        if (
            Number(
                dados.to
            ) !==
            MEU_ID
        ) {
            return;
        }

        const numero =
            String(
                dados.body ?? ''
            ).trim();

        if (
            !/^(?:\d{4}|\d{6})$/.test(
                numero
            )
        ) {
            return;
        }

        const analista =
            dados.from_user
                ?.name
                ?.trim();

        if (!analista) {
            return;
        }

        const idMensagem =
            dados.id;

        if (
            idMensagem &&
            mensagensProcessadas.has(
                idMensagem
            )
        ) {
            return;
        }

        if (idMensagem) {

            mensagensProcessadas.add(
                idMensagem
            );

            if (
                mensagensProcessadas.size >
                200
            ) {
                const primeiro =
                    mensagensProcessadas
                        .values()
                        .next()
                        .value;

                mensagensProcessadas
                    .delete(
                        primeiro
                    );
            }
        }

        console.log(
            '[TRANSFER]',
            'Solicitacao recebida:',
            {
                numero,
                analista,
                idMensagem,
                automatico:
                    modoAutomatico
            }
        );

        adicionarSolicitacao({
            numero,
            analista,
            analistaId:
                dados.from_user.id,
            idMensagem
        });
    }

    // =========================================================
    // WEBSOCKET INTERCEPT
    // =========================================================

    const WebSocketOriginal =
        W.WebSocket;

    W.WebSocket =
        new Proxy(
            WebSocketOriginal,
            {
                construct(
                    target,
                    args
                ) {
                    const ws =
                        new target(
                            ...args
                        );

                    const url =
                        String(
                            args[0] || ''
                        );

                    if (
                        url.includes(
                            'ws.oncenterchat.com'
                        )
                    ) {
                        ws.addEventListener(
                            'message',
                            event => {

                                processarFrame(
                                    event.data
                                );
                            }
                        );
                    }

                    return ws;
                }
            }
        );

    // =========================================================
    // INICIALIZACAO DA CHAVE
    // =========================================================

    if (
        document.readyState ===
        'loading'
    ) {
        document.addEventListener(
            'DOMContentLoaded',
            instalarChaveHeader,
            {
                once: true
            }
        );

    } else {

        instalarChaveHeader();
    }

})();