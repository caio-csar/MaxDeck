// ==UserScript==
// @name         TendiChat - Solicitar chat
// @namespace    maxdeck
// @version      1.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Solicitar%20chat.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Solicitar%20chat.user.js
// @description  Ao digitar 4 numeros na busca de usuarios e pressionar Enter, envia os numeros por chat interno para Caio.
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const DESTINATARIO = 'Caio';

    const SELETOR_BUSCA = 'input[placeholder="Buscar usuários..."]';
    const SELETOR_MENSAGEM = 'input[placeholder="Mensagem..."]';

    let processando = false;

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function definirValorInput(input, valor) {
        const setter = Object.getOwnPropertyDescriptor(
            HTMLInputElement.prototype,
            'value'
        ).set;

        setter.call(input, valor);

        input.dispatchEvent(new Event('input', {
            bubbles: true
        }));

        input.dispatchEvent(new Event('change', {
            bubbles: true
        }));
    }

    async function esperarElemento(seletor, timeout = 5000) {
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

    async function esperarUsuario(nome, timeout = 5000) {
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

    async function solicitarTransferencia(inputBusca, numero) {
        if (processando) {
            return;
        }

        processando = true;

        try {
            aviso('Enviando solicitação para Caio...');

            // Pesquisa por Caio
            definirValorInput(inputBusca, DESTINATARIO);

            await esperar(300);

            // Localiza exatamente o usuário Caio
            const usuarioCaio = await esperarUsuario(
                DESTINATARIO,
                6000
            );

            if (!usuarioCaio) {
                aviso('Não foi possível localizar o usuário Caio.');

                definirValorInput(inputBusca, '');
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

                return;
            }

            await esperar(250);

            // Preenche os 4 números
            campoMensagem.focus();

            definirValorInput(
                campoMensagem,
                numero
            );

            await esperar(150);

            // Envia
            pressionarEnter(campoMensagem);

            aviso(
                'Solicitação enviada: ' + numero
            );

        } catch (erro) {
            console.error(
                '[MaxDeck Transferencia]',
                erro
            );

            aviso(
                'Erro ao enviar solicitação.'
            );

        } finally {
            processando = false;
        }
    }

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

            // Só interfere se forem exatamente 4 números
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

})();