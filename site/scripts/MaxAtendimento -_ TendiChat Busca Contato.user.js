// ==UserScript==
// @name         MaxAtendimento -> TendiChat Busca Contato
// @namespace    http://tampermonkey.net/
// @version      3.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-_%20TendiChat%20Busca%20Contato.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-_%20TendiChat%20Busca%20Contato.user.js
// @description  Busca os últimos 6 dígitos do contato em Pendente/Atendendo
// @match        *://*/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const CHAVE = 'maxdata_tendichat_busca_contato';

    let pesquisaEmAndamento = false;
    let ultimaPesquisaId = null;


    // =========================================================
    // UTILITÁRIOS
    // =========================================================

    function limparNumero(texto) {

        let num =
            (texto || '').replace(/\D/g, '');

        if (
            num.startsWith('55') &&
            num.length > 11
        ) {
            num = num.slice(2);
        }

        if (num.length > 11) {
            num = num.slice(-11);
        }

        return num;
    }


    function esperar(ms) {

        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }


    function proximoFrame() {

        return new Promise(resolve =>
            requestAnimationFrame(resolve)
        );
    }


    // =========================================================
    // MAXDATA
    // =========================================================

    const ehMaxData =
        location.hostname ===
            'externo.maxdatasistema.com.br' &&
        location.pathname.startsWith(
            '/Atendimentos/Atendimento'
        );


    if (ehMaxData) {

        document.addEventListener(
            'dblclick',
            function (e) {

                const label =
                    e.target.closest(
                        'label[for="vedAtendContato"]'
                    );

                if (!label) return;


                const input =
                    document.getElementById(
                        'vedAtendContato'
                    );

                if (!input) return;


                const numero =
                    limparNumero(
                        input.value
                    );


                if (numero.length < 6) {

                    console.warn(
                        '[MAX -> TENDI]',
                        'Número possui menos de 6 dígitos'
                    );

                    return;
                }


                // =================================================
                // AGORA USA OS ÚLTIMOS 6 DÍGITOS
                // =================================================

                const ultimos6 =
                    numero.slice(-6);


                GM_setClipboard(
                    ultimos6,
                    'text'
                );


                GM_setValue(
                    CHAVE,
                    {
                        codigo: ultimos6,
                        id:
                            Date.now() +
                            '_' +
                            Math.random()
                    }
                );


                console.log(
                    '[MAX -> TENDI]',
                    'Buscando:',
                    ultimos6
                );

            },
            true
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
                    'M22 3H2l8 9.46V19l4 2v-8.54z'
            ) {

                /*
                 * IMPORTANTE:
                 *
                 * Validado manualmente.
                 *
                 * O clique correto é no SPAN,
                 * não diretamente no SVG.
                 */

                return svg.closest(
                    'span'
                );
            }
        }


        return null;
    }


    async function garantirFunilAberto() {

        // Já está aberto
        if (painelFiltros()) {

            console.log(
                '[MAX -> TENDI]',
                'Funil já está aberto'
            );

            return true;
        }


        const span =
            localizarSpanFunil();


        if (!span) {

            console.warn(
                '[MAX -> TENDI]',
                'Funil não encontrado'
            );

            return false;
        }


        console.log(
            '[MAX -> TENDI]',
            'Abrindo funil'
        );


        span.click();


        const inicio =
            performance.now();


        while (
            performance.now() -
                inicio <
            1500
        ) {

            if (painelFiltros()) {

                console.log(
                    '[MAX -> TENDI]',
                    'Funil aberto'
                );

                return true;
            }


            await esperar(20);
        }


        console.warn(
            '[MAX -> TENDI]',
            'Painel do funil não apareceu'
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
                '[MAX -> TENDI]',
                '"Ver todos" não encontrado'
            );

            return false;
        }


        if (verTodosEstaAtivo()) {

            console.log(
                '[MAX -> TENDI]',
                '"Ver todos" já está ativo'
            );

            return true;
        }


        console.log(
            '[MAX -> TENDI]',
            'Ativando "Ver todos"'
        );


        /*
         * Clicar em Ver todos executa
         * uma nova consulta de tickets.
         */

        const carregamento =
            aguardarCicloCarregamento(
                1000,
                6000
            );


        botao.click();


        await carregamento;


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
                '[MAX -> TENDI]',
                'Aba não encontrada:',
                nome
            );

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
    // LISTAGEM NATIVA DE ATENDIMENTOS
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


        /*
         * ESTRUTURA NATIVA DO TENDICHAT:
         *
         * <section>
         *
         *     <h5>Atendimentos</h5>
         *
         *     <div> TICKET </div>
         *     <div> TICKET </div>
         *     <div> TICKET </div>
         *
         *     <div class="...">
         *         Carregar mais
         *     </div>
         *
         *     <div class="...">
         *         Carregando...
         *     </div>
         *
         * </section>
         *
         *
         * O wrapper de cada ticket NÃO possui classe.
         *
         * Portanto buscamos DIVs DIRETAS
         * sem classes.
         */

        return [
            ...secao.children
        ].filter(elemento => {

            if (
                elemento.tagName !==
                'DIV'
            ) {

                return false;
            }


            /*
             * Ticket nativo:
             *
             * <div>
             *    componente do atendimento
             * </div>
             *
             * sem class.
             */

            return (
                elemento.classList.length ===
                0
            );
        });
    }


    function quantidadeResultados() {

        return cardsNaListagem()
            .length;
    }


    function encontrouContato() {

        return (
            quantidadeResultados() >
            0
        );
    }


    // =========================================================
    // LOADING REAL DO TENDICHAT
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


    async function aguardarCicloCarregamento(
        tempoParaComecar = 1600,
        tempoParaTerminar = 7000
    ) {

        /*
         * PRIMEIRO:
         *
         * espera o loading começar.
         */

        const inicio =
            performance.now();


        let viuLoading =
            false;


        while (
            performance.now() -
                inicio <
            tempoParaComecar
        ) {

            if (
                indicadorCarregamento()
            ) {

                viuLoading =
                    true;

                break;
            }


            await esperar(20);
        }


        /*
         * Se o loading apareceu,
         * espera desaparecer.
         */

        if (viuLoading) {

            const inicioFim =
                performance.now();


            while (
                performance.now() -
                    inicioFim <
                tempoParaTerminar
            ) {

                if (
                    !indicadorCarregamento()
                ) {

                    break;
                }


                await esperar(20);
            }
        }


        /*
         * Tempo para o Vue colocar
         * os tickets no DOM.
         */

        await proximoFrame();
        await proximoFrame();

        await esperar(80);
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
                HTMLInputElement.prototype,
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
            new InputEvent(
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
            new Event(
                'change',
                {
                    bubbles: true
                }
            )
        );
    }


    function apertarEnter(input) {

        /*
         * TendiChat executa:
         *
         * onKeyup -> search(input.value)
         */

        input.dispatchEvent(
            new KeyboardEvent(
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
    // PESQUISA NO STATUS ATUAL
    // =========================================================

    async function pesquisarStatusAtual(
        codigo
    ) {

        const status =
            statusAtual();


        if (!status) {

            console.warn(
                '[MAX -> TENDI]',
                'Pendente/Atendendo não está selecionado'
            );

            return false;
        }


        console.log(
            '[MAX -> TENDI]',
            'Pesquisando primeiro em:',
            status
        );


        const campo =
            campoPesquisa();


        if (!campo) {

            return false;
        }


        // -----------------------------------------------------
        // COLA OS 6 DÍGITOS
        // -----------------------------------------------------

        preencherInput(
            campo,
            codigo
        );


        console.log(
            '[MAX -> TENDI]',
            'Número inserido:',
            codigo
        );


        /*
         * IMPORTANTE:
         *
         * Começa a esperar o ciclo ANTES
         * do Enter.
         *
         * search() possui debounce de 400ms.
         */

        const carregamento =
            aguardarCicloCarregamento(
                1800,
                7000
            );


        // -----------------------------------------------------
        // ENTER
        // -----------------------------------------------------

        apertarEnter(
            campo
        );


        console.log(
            '[MAX -> TENDI]',
            'Enter'
        );


        // -----------------------------------------------------
        // ESPERA A CONSULTA TERMINAR
        // -----------------------------------------------------

        await carregamento;


        // -----------------------------------------------------
        // VERIFICA A LISTAGEM
        // -----------------------------------------------------

        const quantidade =
            quantidadeResultados();


        console.log(
            '[MAX -> TENDI]',
            `Resultados em ${status}:`,
            quantidade
        );


        if (
            quantidade > 0
        ) {

            console.log(
                '[MAX -> TENDI]',
                `CONTATO ENCONTRADO EM ${status}`
            );


            /*
             * ACHOU.
             *
             * NÃO MUDA MAIS DE ABA.
             */

            return true;
        }


        return false;
    }


    // =========================================================
    // PESQUISA NO OUTRO STATUS
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
            '[MAX -> TENDI]',
            'Nada em',
            atual,
            '- mudando para:',
            outro
        );


        /*
         * A busca já está armazenada
         * em filtro.contactName.
         *
         * Ao mudar de aba,
         * activateMainTab()
         * executa getTickets()
         * usando o mesmo número.
         */

        const carregamento =
            aguardarCicloCarregamento(
                1200,
                7000
            );


        const selecionou =
            await selecionarAba(
                outro
            );


        if (!selecionou) {

            return false;
        }


        await carregamento;


        // -----------------------------------------------------
        // VERIFICA LISTAGEM DA SEGUNDA ABA
        // -----------------------------------------------------

        const quantidade =
            quantidadeResultados();


        console.log(
            '[MAX -> TENDI]',
            `Resultados em ${outro}:`,
            quantidade
        );


        if (
            quantidade > 0
        ) {

            console.log(
                '[MAX -> TENDI]',
                `CONTATO ENCONTRADO EM ${outro}`
            );


            /*
             * ACHOU.
             *
             * PARA AQUI.
             */

            return true;
        }


        return false;
    }


    // =========================================================
    // FLUXO PRINCIPAL
    // =========================================================

    async function pesquisarNoTendiChat(
        codigo,
        id
    ) {

        if (
            id &&
            id === ultimaPesquisaId
        ) {

            return;
        }


        ultimaPesquisaId =
            id;


        if (
            pesquisaEmAndamento
        ) {

            return;
        }


        pesquisaEmAndamento =
            true;


        try {

            // =================================================
            // CONFIRMA TENDICHAT
            // =================================================

            const campo =
                await esperarCampoPesquisa(
                    1500
                );


            if (!campo) {

                return;
            }


            console.log(
                '[MAX -> TENDI]',
                'Recebido:',
                codigo
            );


            // =================================================
            // PASSO 1
            //
            // ATIVAR FUNIL
            // =================================================

            const funil =
                await garantirFunilAberto();


            if (!funil) {

                console.warn(
                    '[MAX -> TENDI]',
                    'Fluxo cancelado: funil não abriu'
                );

                return;
            }


            // =================================================
            // PASSO 2
            //
            // VER TODOS
            // =================================================

            const todos =
                await garantirVerTodos();


            if (!todos) {

                console.warn(
                    '[MAX -> TENDI]',
                    'Fluxo cancelado: Ver todos indisponível'
                );

                return;
            }


            // =================================================
            // DESCOBRE QUAL STATUS JÁ ESTÁ SELECIONADO
            // =================================================

            let status =
                statusAtual();


            /*
             * Normalmente já estaremos em
             * Pendente ou Atendendo.
             *
             * Se por algum motivo estiver
             * em "Todos" ou "Fechado",
             * usa Pendente como fallback.
             */

            if (!status) {

                console.log(
                    '[MAX -> TENDI]',
                    'Nenhum dos dois status está ativo. Usando Pendente.'
                );


                const carregamento =
                    aguardarCicloCarregamento(
                        1200,
                        7000
                    );


                const selecionou =
                    await selecionarAba(
                        'Pendente'
                    );


                if (!selecionou) {

                    return;
                }


                await carregamento;


                status =
                    'Pendente';
            }


            console.log(
                '[MAX -> TENDI]',
                'Status inicial:',
                status
            );


            // =================================================
            // PASSO 3
            //
            // COLA NÚMERO + ENTER
            // VERIFICA O STATUS QUE JÁ ESTÁ ABERTO
            // =================================================

            const achouPrimeiro =
                await pesquisarStatusAtual(
                    codigo
                );


            if (achouPrimeiro) {

                /*
                 * FIM.
                 *
                 * NÃO MUDA MAIS NADA.
                 */

                return;
            }


            // =================================================
            // PASSO 4
            //
            // NÃO ACHOU.
            //
            // MUDA SOMENTE PARA O OUTRO STATUS
            // E VERIFICA A LISTAGEM.
            // =================================================

            const achouSegundo =
                await pesquisarOutroStatus();


            if (achouSegundo) {

                /*
                 * FIM.
                 *
                 * Mantém exatamente nessa aba.
                 */

                return;
            }


            // =================================================
            // PASSO 5
            //
            // NÃO ACHOU EM NENHUMA
            // =================================================

            console.log(
                '[MAX -> TENDI]',
                'Contato não encontrado:',
                codigo
            );


        } finally {

            pesquisaEmAndamento =
                false;
        }
    }


    // =========================================================
    // ESPERA CAMPO DE PESQUISA
    // =========================================================

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
    // RECEBE DA MAXDATA
    // =========================================================

    GM_addValueChangeListener(
        CHAVE,
        function (
            nome,
            valorAnterior,
            valorNovo,
            remoto
        ) {

            if (!valorNovo) {

                return;
            }


            if (!valorNovo.codigo) {

                return;
            }


            pesquisarNoTendiChat(
                valorNovo.codigo,
                valorNovo.id
            );
        }
    );

})();