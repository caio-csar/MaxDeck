// ==UserScript==
// @name         MaxAtendimento -> TendiChat Solicitar Chat
// @namespace    maxdeck
// @version      1.0.1
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20TendiChat%20Solicitar%20Chat.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20TendiChat%20Solicitar%20Chat.user.js
// @description  Ao dar duplo clique no contato no MaxAtendimento, envia automaticamente os últimos 6 dígitos pelo chat interno do TendiChat para Caio.
// @match        *://*/*
// @grant        GM_setValue
// @grant        GM_addValueChangeListener
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const CHAVE = 'maxdata_tendichat_solicitar_chat';
    const DESTINATARIO = 'Caio';

    const SELETOR_BUSCA = 'input[placeholder="Buscar usuários..."]';
    const SELETOR_MENSAGEM = 'input[placeholder="Mensagem..."]';

    let processando = false;
    let ultimoIdProcessado = null;

    // =========================================================
    // UTILITÁRIOS
    // =========================================================

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function limparNumero(texto) {
        let num = (texto || '').replace(/\D/g, '');

        if (num.startsWith('55') && num.length > 11) {
            num = num.slice(2);
        }

        if (num.length > 11) {
            num = num.slice(-11);
        }

        return num;
    }

    function definirValorInput(input, valor) {
        const descriptor = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
        );

        if (descriptor && descriptor.set) {
            descriptor.set.call(input, valor);
        } else {
            input.value = valor;
        }

        input.dispatchEvent(new Event('input', {
            bubbles: true
        }));

        input.dispatchEvent(new Event('change', {
            bubbles: true
        }));
    }

    async function esperarElemento(seletor, timeout = 6000) {
        const inicio = Date.now();

        while (Date.now() - inicio < timeout) {
            const elemento = document.querySelector(seletor);

            if (elemento) {
                return elemento;
            }

            await esperar(100);
        }

        return null;
    }

    async function esperarUsuario(nome, timeout = 6000) {
        const inicio = Date.now();

        while (Date.now() - inicio < timeout) {
            const spans = [...document.querySelectorAll('span')];

            const spanNome = spans.find(span =>
                span.textContent.trim() === nome
            );

            if (spanNome) {
                const linhaUsuario = spanNome.closest(
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

        elemento.dispatchEvent(new KeyboardEvent('keydown', opcoes));
        elemento.dispatchEvent(new KeyboardEvent('keypress', opcoes));
        elemento.dispatchEvent(new KeyboardEvent('keyup', opcoes));
    }

    function aviso(mensagem) {
        const antigo = document.getElementById(
            'maxdeck-transferencia-aviso'
        );

        if (antigo) {
            antigo.remove();
        }

        const box = document.createElement('div');

        box.id = 'maxdeck-transferencia-aviso';
        box.textContent = mensagem;

        Object.assign(box.style, {
            position: 'fixed',
            top: '20px',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: '999999',
            background: 'rgba(15, 23, 42, 0.96)',
            color: '#fff',
            padding: '10px 16px',
            borderRadius: '10px',
            fontSize: '13px',
            fontFamily: 'Arial, sans-serif',
            boxShadow: '0 8px 24px rgba(0,0,0,.25)',
            pointerEvents: 'none'
        });

        document.body.appendChild(box);

        setTimeout(() => {
            if (box.isConnected) {
                box.remove();
            }
        }, 3000);
    }

    // =========================================================
    // MAXATENDIMENTO
    // DUPLO CLIQUE NO CONTATO -> ENVIA OS ÚLTIMOS 6 DÍGITOS
    // =========================================================

    const ehMaxData =
        location.hostname === 'externo.maxdatasistema.com.br' &&
        location.pathname.startsWith('/Atendimentos/Atendimento');

    if (ehMaxData) {
        document.addEventListener(
            'dblclick',
            function (event) {
                const label = event.target.closest(
                    'label[for="vedAtendContato"]'
                );

                if (!label) {
                    return;
                }

                const input = document.getElementById(
                    'vedAtendContato'
                );

                if (!input) {
                    console.warn(
                        '[MAX -> TENDI]',
                        'Campo vedAtendContato não encontrado.'
                    );
                    return;
                }

                const numero = limparNumero(input.value);

                if (numero.length < 6) {
                    console.warn(
                        '[MAX -> TENDI]',
                        'Número possui menos de 6 dígitos.'
                    );
                    return;
                }

                const ultimos6 = numero.slice(-6);

                GM_setClipboard(
                    ultimos6,
                    'text'
                );

                const pacote = {
                    codigo: ultimos6,
                    id: Date.now() + '_' + Math.random()
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
    // TENDICHAT
    // ROTINA ORIGINAL DO SCRIPT 2
    // =========================================================

    async function solicitarTransferencia(inputBusca, numero) {
        if (processando) {
            console.warn(
                '[MAX -> TENDI]',
                'Já existe uma solicitação em andamento.'
            );
            return;
        }

        processando = true;

        try {
            aviso('Enviando solicitação para Caio...');

            console.log(
                '[MAX -> TENDI]',
                'Iniciando envio para Caio:',
                numero
            );

            // Pesquisa por Caio no campo "Buscar usuários..."
            definirValorInput(
                inputBusca,
                DESTINATARIO
            );

            await esperar(300);

            // Localiza exatamente o usuário Caio
            const usuarioCaio = await esperarUsuario(
                DESTINATARIO,
                6000
            );

            if (!usuarioCaio) {
                aviso('Não foi possível localizar o usuário Caio.');

                console.warn(
                    '[MAX -> TENDI]',
                    'Usuário Caio não encontrado.'
                );

                definirValorInput(
                    inputBusca,
                    ''
                );

                inputBusca.focus();
                return;
            }

            // Abre o chat de Caio
            usuarioCaio.click();

            // Aguarda o campo de mensagem
            const campoMensagem = await esperarElemento(
                SELETOR_MENSAGEM,
                6000
            );

            if (!campoMensagem) {
                aviso(
                    'Chat aberto, mas o campo de mensagem não foi encontrado.'
                );

                console.warn(
                    '[MAX -> TENDI]',
                    'Campo Mensagem não encontrado.'
                );

                return;
            }

            await esperar(250);

            // Coloca os 6 dígitos na mensagem
            campoMensagem.focus();

            definirValorInput(
                campoMensagem,
                numero
            );

            await esperar(150);

            // Enter aqui é o envio da mensagem,
            // exatamente como no script 2.
            pressionarEnter(
                campoMensagem
            );

            aviso(
                'Solicitação enviada: ' + numero
            );

            console.log(
                '[MAX -> TENDI]',
                'Mensagem enviada para Caio:',
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
    // USO MANUAL ORIGINAL DO SCRIPT 2
    // 4 NÚMEROS + ENTER NO CAMPO "BUSCAR USUÁRIOS..."
    // =========================================================

    document.addEventListener(
        'keydown',
        function (event) {
            if (event.key !== 'Enter') {
                return;
            }

            const input = event.target;

            if (!(input instanceof HTMLInputElement)) {
                return;
            }

            if (!input.matches(SELETOR_BUSCA)) {
                return;
            }

            const numero = input.value.trim();

            // Mantém o comportamento manual original:
            // somente 4 números.
            if (!/^\d{4}$/.test(numero)) {
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
    // RECEBE A SOLICITAÇÃO VINDO DA MAXDATA
    // =========================================================

    async function receberDaMaxData(valorNovo) {
        if (!valorNovo || !valorNovo.codigo) {
            return;
        }

        if (
            valorNovo.id &&
            valorNovo.id === ultimoIdProcessado
        ) {
            return;
        }

        const codigo = String(
            valorNovo.codigo
        ).trim();

        if (!/^\d{6}$/.test(codigo)) {
            console.warn(
                '[MAX -> TENDI]',
                'Código recebido não possui exatamente 6 dígitos:',
                codigo
            );
            return;
        }

        console.log(
            '[MAX -> TENDI]',
            'Pacote recebido de outra aba:',
            codigo,
            valorNovo.id
        );

        // Procura o campo do script 2 no TendiChat.
        const inputBusca = await esperarElemento(
            SELETOR_BUSCA,
            10000
        );

        if (!inputBusca) {
            console.warn(
                '[MAX -> TENDI]',
                'Campo "Buscar usuários..." não foi encontrado nesta aba.'
            );
            return;
        }

        ultimoIdProcessado = valorNovo.id || null;

        // Coloca os 6 dígitos no mesmo campo
        // onde eram digitados os 4 números.
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

        // Não depende mais de um Enter artificial
        // para acionar outra parte do próprio script.
        // Chama diretamente a mesma rotina.
        await solicitarTransferencia(
            inputBusca,
            codigo
        );
    }

    // =========================================================
    // PONTE ENTRE MAXATENDIMENTO E TENDICHAT
    // =========================================================

    GM_addValueChangeListener(
        CHAVE,
        function (
            nome,
            valorAnterior,
            valorNovo,
            remoto
        ) {
            // A alteração feita na própria aba da MaxData é ignorada.
            // A outra aba, TendiChat, recebe como alteração remota.
            if (!remoto) {
                return;
            }

            receberDaMaxData(
                valorNovo
            );
        }
    );

})();