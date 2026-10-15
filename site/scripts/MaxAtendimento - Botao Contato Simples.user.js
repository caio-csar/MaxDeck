// ==UserScript==
// @name         MaxAtendimento - Botao Contato Simples
// @namespace    maxdeck
// @version      2.0.0
// @downloadURL  https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Botao%20Contato%20Simples.user.js
// @updateURL    https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Botao%20Contato%20Simples.user.js
// @description  Botão de contato no MaxAtendimento + solicitação automática de transferência ao TransferBot pelo chat interno do TendiChat.
// @match        *://externo.maxdatasistema.com.br/Atendimentos/Atendimento*
// @match        https://app.tendichat.com.br/*
// @run-at       document-end
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_setClipboard
// ==/UserScript==


(function () {
    'use strict';

    // =========================================================
    // CONFIGURAÇÕES
    // =========================================================

    const CHAVE = 'maxdata_tendichat_solicitar_chat';

    const DESTINATARIO = 'Transferência';

    const SELETOR_BUSCA =
        'input[placeholder="Buscar usuários..."]';

    const SELETOR_MENSAGEM =
        'input[placeholder="Mensagem..."]';

    let processando = false;
    let ultimoIdProcessado = null;


    // =========================================================
    // UTILITÁRIOS
    // =========================================================

    function esperar(ms) {
        return new Promise(resolve =>
            setTimeout(resolve, ms)
        );
    }


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



    function copiarContato(texto) {
        try {
            GM_setClipboard(texto, 'text');
        } catch (erro) {
            const area = document.createElement('textarea');
            area.value = texto;
            area.style.position = 'fixed';
            area.style.top = '-9999px';
            document.body.appendChild(area);
            area.focus();
            area.select();
            document.execCommand('copy');
            area.remove();
        }
    }


    function extrairNome(texto) {
        return (texto || '')
            .replace(/\+?55/g, '')
            .replace(/\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g, '')
            .replace(/\d+/g, '')
            .replace(/[:\-–—()]+/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }


    function formatarNumero(num) {
        if (num.length === 11) {
            return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`;
        }

        if (num.length === 10) {
            return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`;
        }

        return num;
    }


    function aplicarBotaoContato() {
        const input = document.getElementById('vedAtendContato');
        const label = document.querySelector('label[for="vedAtendContato"]');

        if (!input || !label) {
            return;
        }

        if (label.dataset.contatoBotao === '1') {
            return;
        }

        label.dataset.contatoBotao = '1';
        label.innerText = 'Contato';
        label.title = 'Clique para alternar/copiar. Duplo clique solicita transferência.';

        Object.assign(
            label.style,
            {
                cursor: 'pointer',
                userSelect: 'none',
                background: '#111827',
                color: '#ffffff',
                border: '1px solid #374151',
                fontWeight: 'bold'
            }
        );

        let formatado = false;

        label.addEventListener(
            'click',
            function (event) {
                event.preventDefault();
                event.stopPropagation();

                const valorAtual = input.value || '';
                const nome = extrairNome(valorAtual);
                const numero = limparNumero(valorAtual);

                if (!numero) {
                    return;
                }

                formatado = !formatado;

                const telefone = formatado
                    ? formatarNumero(numero)
                    : numero;

                input.value = nome
                    ? `${nome}: ${telefone}`
                    : telefone;

                input.dispatchEvent(
                    new Event('input', { bubbles: true })
                );

                input.dispatchEvent(
                    new Event('change', { bubbles: true })
                );

                copiarContato(telefone);
            }
        );
    }


    function definirValorInput(input, valor) {

        if (!input) {
            return;
        }

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

            input.value = valor;
        }

        input.dispatchEvent(
            new Event(
                'input',
                {
                    bubbles: true
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


    async function esperarElemento(
        seletor,
        timeout = 6000
    ) {

        const inicio = Date.now();

        while (
            Date.now() - inicio <
            timeout
        ) {

            const elemento =
                document.querySelector(
                    seletor
                );

            if (elemento) {
                return elemento;
            }

            await esperar(100);
        }

        return null;
    }


    async function esperarUsuario(
        nome,
        timeout = 6000
    ) {

        const inicio = Date.now();

        while (
            Date.now() - inicio <
            timeout
        ) {

            const spans = [
                ...document.querySelectorAll(
                    'span'
                )
            ];

            const spanNome =
                spans.find(span =>
                    span.textContent.trim() ===
                    nome
                );

            if (spanNome) {

                const linhaUsuario =
                    spanNome.closest(
                        'div[class*="cursor-pointer"]'
                    );

                if (linhaUsuario) {
                    return linhaUsuario;
                }
            }

            await esperar(100);
        }

        return null;
    }


    function pressionarEnter(elemento) {

        const opcoes = {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        };

        elemento.dispatchEvent(
            new KeyboardEvent(
                'keydown',
                opcoes
            )
        );

        elemento.dispatchEvent(
            new KeyboardEvent(
                'keypress',
                opcoes
            )
        );

        elemento.dispatchEvent(
            new KeyboardEvent(
                'keyup',
                opcoes
            )
        );
    }


    function aviso(mensagem) {

        const antigo =
            document.getElementById(
                'maxdeck-transferencia-aviso'
            );

        if (antigo) {
            antigo.remove();
        }

        const box =
            document.createElement('div');

        box.id =
            'maxdeck-transferencia-aviso';

        box.textContent =
            mensagem;

        Object.assign(
            box.style,
            {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: '999999',
                background:
                    'rgba(15, 23, 42, 0.96)',
                color: '#fff',
                padding: '10px 16px',
                borderRadius: '10px',
                fontSize: '13px',
                fontFamily:
                    'Arial, sans-serif',
                boxShadow:
                    '0 8px 24px rgba(0,0,0,.25)',
                pointerEvents: 'none'
            }
        );

        document.body.appendChild(
            box
        );

        setTimeout(
            () => {

                if (box.isConnected) {
                    box.remove();
                }

            },
            3000
        );
    }


    // =========================================================
    // IDENTIFICA MAXATENDIMENTO
    // =========================================================

    const ehMaxData =
        location.hostname ===
            'externo.maxdatasistema.com.br' &&
        location.pathname.startsWith(
            '/Atendimentos/Atendimento'
        );

    const ehTendiChat =
        location.hostname ===
            'app.tendichat.com.br';


    // =========================================================
    // MAXATENDIMENTO
    //
    // DUPLO CLIQUE NO CONTATO
    // =========================================================

    if (ehMaxData) {

        aplicarBotaoContato();

        document.addEventListener(
            'dblclick',

            function (event) {

                const label =
                    event.target.closest(
                        'label[for="vedAtendContato"]'
                    );

                if (!label) {
                    return;
                }


                const input =
                    document.getElementById(
                        'vedAtendContato'
                    );

                if (!input) {

                    console.warn(
                        '[MAX -> TENDI]',
                        'Campo vedAtendContato não encontrado.'
                    );

                    return;
                }


                const numero =
                    limparNumero(
                        input.value
                    );


                if (numero.length < 6) {

                    console.warn(
                        '[MAX -> TENDI]',
                        'Número possui menos de 6 dígitos.'
                    );

                    return;
                }


                const ultimos6 =
                    numero.slice(-6);


                // Mantém também a cópia
                // para área de transferência.

                GM_setClipboard(
                    ultimos6,
                    'text'
                );


                const pacote = {

                    codigo:
                        ultimos6,

                    id:
                        Date.now() +
                        '_' +
                        Math.random()
                };


                GM_setValue(
                    CHAVE,
                    pacote
                );


                console.log(
                    '[MAX -> TENDI]',
                    'Enviado pela MaxData:',
                    ultimos6,
                    pacote.id
                );
            },

            true
        );
    }


    // =========================================================
    // LOCALIZA BOTÃO DO CHAT INTERNO
    //
    // SVG informado:
    //
    // iconify--heroicons
    //
    // path 1 começa:
    // M4.913 2.658
    //
    // path 2 começa:
    // M15.75 7.5
    // =========================================================

    function localizarBotaoChatInterno() {

        const svgs =
            document.querySelectorAll(
                'svg.iconify--heroicons'
            );


        for (const svg of svgs) {

            const paths =
                svg.querySelectorAll(
                    'path'
                );


            if (paths.length < 2) {
                continue;
            }


            const path1 =
                paths[0].getAttribute(
                    'd'
                ) || '';


            const path2 =
                paths[1].getAttribute(
                    'd'
                ) || '';


            const ehIconeChat =
                path1.includes(
                    'M4.913 2.658'
                ) &&
                path2.includes(
                    'M15.75 7.5'
                );


            if (!ehIconeChat) {
                continue;
            }


            /*
             * Tenta encontrar primeiro
             * um elemento realmente clicável.
             */

            const botao =
                svg.closest(
                    'button'
                );


            if (botao) {
                return botao;
            }


            const roleButton =
                svg.closest(
                    '[role="button"]'
                );


            if (roleButton) {
                return roleButton;
            }


            const cursor =
                svg.closest(
                    '.cursor-pointer'
                );


            if (cursor) {
                return cursor;
            }


            const span =
                svg.closest(
                    'span'
                );


            if (span) {
                return span;
            }


            /*
             * Último recurso:
             * retorna o próprio SVG.
             */

            return svg;
        }


        return null;
    }


    // =========================================================
    // ABRE CHAT INTERNO
    // =========================================================

    async function abrirChatInterno() {

        /*
         * IMPORTANTE:
         *
         * Se "Buscar usuários..."
         * já existe, significa que o painel
         * já está aberto.
         *
         * NÃO clica novamente para evitar
         * fechar o chat.
         */

        const jaAberto =
            document.querySelector(
                SELETOR_BUSCA
            );


        if (jaAberto) {

            console.log(
                '[MAX -> TENDI]',
                'Chat interno já está aberto.'
            );

            return true;
        }


        console.log(
            '[MAX -> TENDI]',
            'Chat interno fechado. Procurando botão...'
        );


        const botao =
            localizarBotaoChatInterno();


        if (!botao) {

            console.warn(
                '[MAX -> TENDI]',
                'Botão do chat interno não encontrado.'
            );

            aviso(
                'Botão do chat interno não encontrado.'
            );

            return false;
        }


        console.log(
            '[MAX -> TENDI]',
            'Botão do chat encontrado. Clicando...'
        );


        botao.click();


        /*
         * Aguarda o painel abrir
         * e aparecer:
         *
         * Buscar usuários...
         */

        const campoBusca =
            await esperarElemento(
                SELETOR_BUSCA,
                6000
            );


        if (!campoBusca) {

            console.warn(
                '[MAX -> TENDI]',
                'O botão foi clicado, mas "Buscar usuários..." não apareceu.'
            );

            aviso(
                'Chat interno não abriu.'
            );

            return false;
        }


        console.log(
            '[MAX -> TENDI]',
            'Chat interno aberto.'
        );


        return true;
    }


    // =========================================================
    // ENVIA SOLICITAÇÃO PARA O TRANSFERBOT
    // =========================================================

    async function solicitarTransferencia(
        inputBusca,
        numero
    ) {

        if (processando) {

            console.warn(
                '[MAX -> TENDI]',
                'Já existe uma solicitação em andamento.'
            );

            return;
        }


        processando = true;


        try {

            aviso(
                'Enviando solicitação para o TransferBot...'
            );


            console.log(
                '[MAX -> TENDI]',
                'Iniciando envio:',
                numero
            );


            // =================================================
            // PESQUISA CONTA DO TRANSFERBOT
            // =================================================

            definirValorInput(
                inputBusca,
                DESTINATARIO
            );


            await esperar(300);


            // =================================================
            // LOCALIZA CONTA DO TRANSFERBOT
            // =================================================

            const usuarioTransferBot =
                await esperarUsuario(
                    DESTINATARIO,
                    6000
                );


            if (!usuarioTransferBot) {

                console.warn(
                    '[MAX -> TENDI]',
                    'Usuário Transferência não encontrado.'
                );


                aviso(
                    'Não foi possível localizar o usuário Transferência.'
                );


                definirValorInput(
                    inputBusca,
                    ''
                );


                inputBusca.focus();


                return;
            }


            console.log(
                '[MAX -> TENDI]',
                'Usuário Transferência localizado.'
            );


            // =================================================
            // ABRE CHAT DO TRANSFERBOT
            // =================================================

            usuarioTransferBot.click();


            // =================================================
            // ESPERA CAMPO MENSAGEM
            // =================================================

            const campoMensagem =
                await esperarElemento(
                    SELETOR_MENSAGEM,
                    6000
                );


            if (!campoMensagem) {

                console.warn(
                    '[MAX -> TENDI]',
                    'Campo "Mensagem..." não encontrado.'
                );


                aviso(
                    'Chat aberto, mas o campo de mensagem não foi encontrado.'
                );


                return;
            }


            await esperar(250);


            // =================================================
            // PREENCHE 6 DÍGITOS
            // =================================================

            campoMensagem.focus();


            definirValorInput(
                campoMensagem,
                numero
            );


            console.log(
                '[MAX -> TENDI]',
                'Mensagem preenchida:',
                numero
            );


            await esperar(150);


            // =================================================
            // ENVIA MENSAGEM
            // =================================================

            pressionarEnter(
                campoMensagem
            );


            aviso(
                'Solicitação enviada: ' +
                numero
            );


            console.log(
                '[MAX -> TENDI]',
                'Mensagem enviada para o TransferBot:',
                numero
            );


        } catch (erro) {

            console.error(
                '[MAX -> TENDI]',
                'Erro ao enviar solicitação:',
                erro
            );


            aviso(
                'Erro ao enviar solicitação.'
            );


        } finally {

            processando = false;
        }
    }


    // =========================================================
    // USO MANUAL ORIGINAL
    //
    // 4 NÚMEROS + ENTER EM:
    //
    // "Buscar usuários..."
    // =========================================================

    if (ehTendiChat) {

    document.addEventListener(
        'keydown',

        function (event) {

            if (event.key !== 'Enter') {
                return;
            }


            const input =
                event.target;


            if (
                !(
                    input instanceof
                    HTMLInputElement
                )
            ) {
                return;
            }


            if (
                !input.matches(
                    SELETOR_BUSCA
                )
            ) {
                return;
            }


            const numero =
                input.value.trim();


            /*
             * Mantém o comportamento
             * original do Script 2.
             *
             * Manual = exatamente 4 números.
             */

            if (
                !/^\d{4}$/.test(
                    numero
                )
            ) {
                return;
            }


            event.preventDefault();

            event.stopPropagation();

            event.stopImmediatePropagation();


            solicitarTransferencia(
                input,
                numero
            );
        },

        true
    );


    // =========================================================
    // RECEBE DA MAXDATA
    // =========================================================

    async function receberDaMaxData(
        valorNovo
    ) {

        if (
            !valorNovo ||
            !valorNovo.codigo
        ) {
            return;
        }


        if (
            valorNovo.id &&
            valorNovo.id ===
                ultimoIdProcessado
        ) {

            return;
        }


        const codigo =
            String(
                valorNovo.codigo
            ).trim();


        if (
            !/^\d{6}$/.test(
                codigo
            )
        ) {

            console.warn(
                '[MAX -> TENDI]',
                'Código recebido não possui exatamente 6 dígitos:',
                codigo
            );

            return;
        }


        console.log(
            '[MAX -> TENDI]',
            'Recebido da MaxData:',
            codigo,
            valorNovo.id
        );


        // =====================================================
        // PASSO 1
        //
        // ABRE CHAT INTERNO
        // =====================================================

        const chatAberto =
            await abrirChatInterno();


        if (!chatAberto) {

            console.warn(
                '[MAX -> TENDI]',
                'Fluxo interrompido porque o chat interno não abriu.'
            );

            return;
        }


        // =====================================================
        // PASSO 2
        //
        // LOCALIZA "BUSCAR USUÁRIOS..."
        // =====================================================

        const inputBusca =
            await esperarElemento(
                SELETOR_BUSCA,
                6000
            );


        if (!inputBusca) {

            console.warn(
                '[MAX -> TENDI]',
                'Campo "Buscar usuários..." não encontrado.'
            );

            return;
        }


        /*
         * Somente marca como processado
         * depois que conseguimos abrir
         * o chat e encontrar o campo.
         */

        ultimoIdProcessado =
            valorNovo.id || null;


        // =====================================================
        // PASSO 3
        //
        // COLOCA OS 6 DÍGITOS NO CAMPO
        // =====================================================

        inputBusca.focus();


        definirValorInput(
            inputBusca,
            codigo
        );


        console.log(
            '[MAX -> TENDI]',
            '6 dígitos colocados em "Buscar usuários...":',
            codigo
        );


        await esperar(150);


        // =====================================================
        // PASSO 4
        //
        // CHAMA DIRETAMENTE A ROTINA DO SCRIPT 2
        //
        // NÃO depende de Enter artificial aqui.
        // =====================================================

        await solicitarTransferencia(
            inputBusca,
            codigo
        );
    }


    // =========================================================
    // PONTE ENTRE AS ABAS
    // =========================================================

    GM_addValueChangeListener(
        CHAVE,

        function (
            nome,
            valorAnterior,
            valorNovo,
            remoto
        ) {

            /*
             * Alteração local:
             * aba do MaxAtendimento.
             *
             * Alteração remota:
             * outra aba onde o mesmo
             * userscript está executando.
             */

            if (!remoto) {
                return;
            }


            console.log(
                '[MAX -> TENDI]',
                'Alteração remota detectada.'
            );


            receberDaMaxData(
                valorNovo
            );
        }
    );

    }

})();