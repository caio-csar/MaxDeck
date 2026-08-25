// ==UserScript==
// @name         TendiChat - Transferencias Automaticas v2.2
// @namespace    maxdeck
// @version      2.2
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Transferencias%20Automaticas%20v2.2.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Transferencias%20Automaticas%20v2.2.user.js
// @description  Recebe solicitacoes pelo chat interno, localiza o atendimento e transfere ao analista solicitante.
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

    const PATH_FUNIL =
        'M22 3H2l8 9.46V19l4 2v-8.54z';

    const PATH_TRANSFERENCIA =
        'm15 12l5-4l-5-4v2.999H2v2h13zm7 3H9v-3l-5 4l5 4v-3h13z';

    // =========================================================
    // ESTADO
    // =========================================================

    const mensagensProcessadas = new Set();
    const fila = [];

    let popupAtual = null;
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
        const inicio = performance.now();

        while (
            performance.now() - inicio < timeout
        ) {
            try {
                const resultado = callback();

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

        if (typeof alvo.click === 'function') {
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
        const inicio = performance.now();

        while (
            performance.now() - inicio < timeout
        ) {
            const campo = campoPesquisa();

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

        for (const article of articles) {

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

        for (const svg of svgs) {

            const path =
                svg.querySelector('path');

            if (
                path &&
                path.getAttribute('d') ===
                    PATH_FUNIL
            ) {
                return svg.closest('span');
            }
        }

        return null;
    }

    async function garantirFunilAberto() {

        if (painelFiltros()) {

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

        console.log(
            '[TRANSFER]',
            'Abrindo funil'
        );

        span.click();

        const inicio =
            performance.now();

        while (
            performance.now() - inicio < 1500
        ) {
            if (painelFiltros()) {
                return true;
            }

            await esperar(20);
        }

        console.warn(
            '[TRANSFER]',
            'Painel do funil nao apareceu'
        );

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
                    .replace(/\s+/g, ' ')
                    .trim();

            return (
                texto === 'Ver todos' ||

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

            console.warn(
                '[TRANSFER]',
                '"Ver todos" nao encontrado'
            );

            return false;
        }

        if (verTodosEstaAtivo()) {

            console.log(
                '[TRANSFER]',
                '"Ver todos" ja ativo'
            );

            return true;
        }

        console.log(
            '[TRANSFER]',
            'Ativando "Ver todos"'
        );

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

        for (const p of textos) {

            if (
                p.textContent.trim() !== nome
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
            abaEstaAtiva('Pendente')
        ) {
            return 'Pendente';
        }

        if (
            abaEstaAtiva('Atendendo')
        ) {
            return 'Atendendo';
        }

        return null;
    }

    async function selecionarAba(nome) {

        if (
            abaEstaAtiva(nome)
        ) {
            return true;
        }

        const aba =
            localizarAba(nome);

        if (!aba) {

            console.warn(
                '[TRANSFER]',
                'Aba nao encontrada:',
                nome
            );

            return false;
        }

        aba.click();

        const inicio =
            performance.now();

        while (
            performance.now() - inicio < 1200
        ) {
            if (
                abaEstaAtiva(nome)
            ) {
                return true;
            }

            await esperar(20);
        }

        return abaEstaAtiva(nome);
    }

    // =========================================================
    // LISTAGEM REAL
    // =========================================================

    function secaoAtendimentos() {

        const titulos =
            document.querySelectorAll(
                'h5'
            );

        for (const titulo of titulos) {

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
        ].filter(elemento => {

            if (
                elemento.tagName !==
                'DIV'
            ) {
                return false;
            }

            return (
                elemento.classList.length === 0
            );
        });
    }

    function quantidadeResultados() {
        return cardsNaListagem().length;
    }

    // =========================================================
    // ASSINATURA DA LISTAGEM
    // =========================================================

    function assinaturaListagem() {

        return cardsNaListagem()
            .map(card =>
                card.textContent
                    .replace(/\s+/g, ' ')
                    .trim()
            )
            .join('|||');
    }

    // =========================================================
    // LOADING REAL
    // =========================================================

    function indicadorCarregamento() {

        const spinners =
            document.querySelectorAll(
                'svg.animate-spin'
            );

        for (const svg of spinners) {

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

    // =========================================================
    // ESPERA CONSULTA TERMINAR
    // =========================================================

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
            performance.now() - inicio <
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

                houveMudanca = true;
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
                W.HTMLInputElement.prototype,
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
            input.value = valor;
        }

        input.dispatchEvent(
            new W.InputEvent(
                'input',
                {
                    bubbles: true,
                    inputType: 'insertText',
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

    function apertarEnter(input) {

        /*
         * TendiChat usa onKeyup
         * para executar search().
         */

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

            console.warn(
                '[TRANSFER]',
                'Pendente/Atendendo nao selecionado'
            );

            return false;
        }

        console.log(
            '[TRANSFER]',
            'Pesquisando primeiro em:',
            status
        );

        const campo =
            campoPesquisa();

        if (!campo) {
            return false;
        }

        const assinaturaAntes =
            assinaturaListagem();

        preencherInput(
            campo,
            codigo
        );

        console.log(
            '[TRANSFER]',
            'Numero inserido:',
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

        console.log(
            '[TRANSFER]',
            'Enter enviado'
        );

        console.log(
            '[TRANSFER]',
            'Aguardando consulta terminar...'
        );

        await atualizacao;

        const quantidade =
            quantidadeResultados();

        console.log(
            '[TRANSFER]',
            `Consulta finalizada em ${status}. Resultados:`,
            quantidade
        );

        return quantidade > 0;
    }

    // =========================================================
    // PESQUISA OUTRO STATUS
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

        console.log(
            '[TRANSFER]',
            'Nada em',
            atual,
            '- mudando para:',
            outro
        );

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

            console.warn(
                '[TRANSFER]',
                'Nao conseguiu selecionar:',
                outro
            );

            return false;
        }

        console.log(
            '[TRANSFER]',
            'Aba selecionada:',
            outro
        );

        await atualizacao;

        const quantidade =
            quantidadeResultados();

        console.log(
            '[TRANSFER]',
            `Varredura finalizada em ${outro}. Resultados:`,
            quantidade
        );

        return quantidade > 0;
    }

    // =========================================================
    // VALIDA RESULTADO
    // =========================================================

    function validarResultadoUnico() {

        const cards =
            cardsNaListagem();

        console.log(
            '[TRANSFER]',
            'Validando resultado final:',
            cards.length
        );

        if (
            cards.length === 0
        ) {
            throw new Error(
                'A consulta terminou, mas nenhum atendimento foi encontrado.'
            );
        }

        if (
            cards.length > 1
        ) {
            throw new Error(
                'Foram encontrados ' +
                cards.length +
                ' atendimentos. Transferencia cancelada por seguranca.'
            );
        }

        const card =
            cards[0];

        const article =
            card.querySelector(
                'article'
            );

        if (!article) {
            throw new Error(
                'Atendimento encontrado, mas o ARTICLE nao foi localizado.'
            );
        }

        return article;
    }

    // =========================================================
    // BUSCA COMPLETA
    // =========================================================

    async function localizarContato(
        codigo
    ) {
        console.log(
            '[TRANSFER]',
            '===================================='
        );

        console.log(
            '[TRANSFER]',
            'INICIANDO BUSCA:',
            codigo
        );

        const campo =
            await esperarCampoPesquisa(
                2000
            );

        if (!campo) {
            throw new Error(
                'Campo Pesquisar nao encontrado.'
            );
        }

        // PASSO 1 - FUNIL

        if (
            !await garantirFunilAberto()
        ) {
            throw new Error(
                'Nao foi possivel abrir o funil.'
            );
        }

        // PASSO 2 - VER TODOS

        if (
            !await garantirVerTodos()
        ) {
            throw new Error(
                'Nao foi possivel ativar Ver todos.'
            );
        }

        // PASSO 3 - STATUS

        let status =
            statusAtual();

        if (!status) {

            console.log(
                '[TRANSFER]',
                'Nenhuma aba valida ativa. Indo para Pendente.'
            );

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

            status = 'Pendente';
        }

        console.log(
            '[TRANSFER]',
            'Status inicial:',
            status
        );

        // PASSO 4 - PRIMEIRA ABA

        const achouPrimeiro =
            await pesquisarStatusAtual(
                codigo
            );

        if (achouPrimeiro) {

            console.log(
                '[TRANSFER]',
                'Encontrado na primeira aba.'
            );

            return validarResultadoUnico();
        }

        // PASSO 5 - OUTRA ABA

        console.log(
            '[TRANSFER]',
            'Nao encontrado na primeira aba.'
        );

        const achouSegundo =
            await pesquisarOutroStatus();

        if (achouSegundo) {

            console.log(
                '[TRANSFER]',
                'Encontrado na segunda aba.'
            );

            return validarResultadoUnico();
        }

        throw new Error(
            'Contato ' +
            codigo +
            ' nao encontrado em Pendente nem Atendendo.'
        );
    }

    // =========================================================
    // ICONE DE TRANSFERENCIA
    // =========================================================

    function localizarIconeTransferencia() {

        const svgs =
            document.querySelectorAll(
                'svg'
            );

        for (const svg of svgs) {

            if (!visivel(svg)) {
                continue;
            }

            const path =
                svg.querySelector(
                    'path'
                );

            if (
                path &&
                path.getAttribute('d') ===
                    PATH_TRANSFERENCIA
            ) {
                return svg;
            }
        }

        return null;
    }

    // =========================================================
    // ABRE TRANSFERENCIA
    // =========================================================

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

        console.log(
            '[TRANSFER]',
            'Clicando no icone de transferencia'
        );

        clicarElemento(
            icone
        );

        /*
         * Agora esperamos o elemento REAL
         * que abre/filtra a lista de atendentes.
         */

        const campoAtendente =
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

        if (!campoAtendente) {
            throw new Error(
                'Campo "Selecionar atendente" nao apareceu.'
            );
        }

        console.log(
            '[TRANSFER]',
            'Campo de atendente encontrado'
        );

        return campoAtendente;
    }

    // =========================================================
    // SELECIONA ANALISTA
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

        console.log(
            '[TRANSFER]',
            'Pesquisando analista:',
            nome
        );

        /*
         * Clica primeiro para garantir
         * a abertura do dropdown.
         */

        campo.click();
        campo.focus();

        await esperar(100);

        /*
         * Digita exatamente o nome
         * recebido pelo WebSocket.
         */

        preencherInput(
            campo,
            nome
        );

        /*
         * Espera especificamente o
         * resultado com o mesmo nome.
         */

        const botao =
            await esperarAte(
                () => {

                    return [
                        ...document.querySelectorAll(
                            'button[data-indice]'
                        )
                    ].find(btn => {

                        return (
                            visivel(btn) &&
                            btn.textContent
                                .trim() ===
                                nome
                        );
                    });
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
            'Analista encontrado:',
            nome
        );

        botao.click();

        await esperar(200);

        console.log(
            '[TRANSFER]',
            'Analista selecionado:',
            nome
        );
    }

    // =========================================================
    // CONFIRMA TRANSFERENCIA
    // =========================================================

    async function confirmarTransferencia() {

        const botao =
            await esperarAte(
                () => {

                    return [
                        ...document.querySelectorAll(
                            'button'
                        )
                    ].find(btn => {

                        return (
                            visivel(btn) &&
                            btn.textContent
                                .trim() ===
                                'Transferir Atendimento'
                        );
                    });
                },
                5000,
                50
            );

        if (!botao) {
            throw new Error(
                'Botao Transferir Atendimento nao encontrado.'
            );
        }

        console.log(
            '[TRANSFER]',
            'Confirmando transferencia'
        );

        botao.click();

        await esperar(300);
    }

    // =========================================================
    // FLUXO COMPLETO
    // =========================================================

    async function executarTransferencia(
        solicitacao
    ) {
        aviso(
            'Buscando contato ' +
            solicitacao.numero +
            '...'
        );

        // -----------------------------------------------------
        // LOCALIZA
        // -----------------------------------------------------

        const atendimento =
            await localizarContato(
                solicitacao.numero
            );

        console.log(
            '[TRANSFER]',
            'Atendimento localizado:',
            atendimento
        );

        // -----------------------------------------------------
        // ABRE A CONVERSA
        // -----------------------------------------------------

        aviso(
            'Contato encontrado. Abrindo atendimento...'
        );

        atendimento.click();

        // -----------------------------------------------------
        // ESPERA A CONVERSA CARREGAR
        // -----------------------------------------------------

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

        // -----------------------------------------------------
        // ABRE O PAINEL
        // -----------------------------------------------------

        aviso(
            'Abrindo transferencia...'
        );

        await abrirTransferencia();

        // -----------------------------------------------------
        // FILTRA/SELECIONA ANALISTA
        // -----------------------------------------------------

        aviso(
            'Selecionando ' +
            solicitacao.analista +
            '...'
        );

        await selecionarAnalista(
            solicitacao.analista
        );

        // -----------------------------------------------------
        // CONFIRMA
        // -----------------------------------------------------

        aviso(
            'Confirmando transferencia...'
        );

        await confirmarTransferencia();

        aviso(
            'Transferido para ' +
            solicitacao.analista,
            'sucesso'
        );

        console.log(
            '[TRANSFER]',
            'TRANSFERENCIA FINALIZADA'
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
                zIndex: '2147483647',
                background: fundo,
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
            3500
        );
    }

    // =========================================================
    // POPUP
    // =========================================================

    function mostrarSolicitacao(
        solicitacao
    ) {
        if (popupAtual) {
            return;
        }

        const popup =
            document.createElement(
                'div'
            );

        popupAtual = popup;

        Object.assign(
            popup.style,
            {
                position: 'fixed',
                right: '22px',
                top: '90px',
                width: '340px',
                zIndex: '2147483647',
                background: '#0f172a',
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
                fontSize:
                    '15px',
                fontWeight:
                    '700',
                marginBottom:
                    '16px'
            }
        );

        const analista =
            document.createElement(
                'div'
            );

        analista.innerHTML =
            '<span style="opacity:.65">Analista</span><br>' +
            '<strong></strong>';

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

        for (const botao of [
            aceitar,
            recusar
        ]) {
            Object.assign(
                botao.style,
                {
                    flex: '1',
                    border: '0',
                    borderRadius:
                        '9px',
                    padding:
                        '10px',
                    color:
                        '#fff',
                    fontWeight:
                        '700',
                    cursor:
                        'pointer'
                }
            );
        }

        aceitar.style.background =
            '#16a34a';

        recusar.style.background =
            '#475569';

        // =====================================================
        // ACEITAR
        // =====================================================

        aceitar.onclick =
            async () => {

                if (executando) {
                    return;
                }

                executando = true;

                aceitar.disabled =
                    true;

                recusar.disabled =
                    true;

                aceitar.textContent =
                    'PROCESSANDO...';

                try {

                    await executarTransferencia(
                        solicitacao
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

        // =====================================================
        // RECUSAR
        // =====================================================

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

        processarFila();
    }

    function processarFila() {

        if (
            popupAtual ||
            fila.length === 0
        ) {
            return;
        }

        mostrarSolicitacao(
            fila.shift()
        );
    }

    function adicionarSolicitacao(
        solicitacao
    ) {
        fila.push(
            solicitacao
        );

        processarFila();
    }

    // =========================================================
    // WEBSOCKET
    // =========================================================

    function processarFrame(bruto) {

        if (
            typeof bruto !==
            'string'
        ) {
            return;
        }

        const inicioJson =
            bruto.indexOf(
                '['
            );

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

        // Somente mensagens para Caio

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

        // Somente exatamente 4 digitos

        if (
            !/^\d{4}$/.test(
                numero
            )
        ) {
            return;
        }

        // Nome vem direto no frame

        const analista =
            dados.from_user
                ?.name
                ?.trim();

        if (!analista) {
            return;
        }

        // Evita duplicidade

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

                mensagensProcessadas.delete(
                    primeiro
                );
            }
        }

        console.log(
            '[TRANSFER]',
            'SOLICITACAO RECEBIDA:',
            {
                numero,
                analista,
                idMensagem
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
    // INTERCEPTA SOMENTE O WEBSOCKET DO CHAT
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

})();