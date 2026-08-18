// ==UserScript==
// @name         TendiChat - Botão Contatos Permanente
// @namespace    caio.maxdata.tendichat
// @version      1.1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Bot%C3%A3o%20Contatos%20Permanente.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Bot%C3%A3o%20Contatos%20Permanente.user.js
// @description  Mantém o botão Contatos sempre disponível no cabeçalho.
// @match        https://app.tendichat.com.br/*
// @run-at       document-start
// @grant        GM_addStyle
// ==/UserScript==

(function () {
    'use strict';

    const ID_BOTAO = 'tc-contatos-permanente';
    const URL_CONTATOS = '/app/contactos';

    GM_addStyle(`
        #${ID_BOTAO} {
            position: relative !important;

            width: 34px !important;
            height: 34px !important;
            min-width: 34px !important;
            min-height: 34px !important;

            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;

            flex: 0 0 34px !important;

            margin: 0 !important;
            padding: 0 !important;

            border: 0 !important;
            border-radius: 9999px !important;

            color: rgb(15, 23, 42) !important;
            background: rgb(241, 245, 249) !important;

            text-decoration: none !important;
            cursor: pointer !important;

            box-shadow:
                0 1px 3px rgba(0, 0, 0, 0.15),
                inset 0 0 0 1px rgba(148, 163, 184, 0.25);

            transition:
                transform 150ms ease,
                background-color 150ms ease !important;

            z-index: 99999 !important;
        }

        #${ID_BOTAO}:hover {
            background: rgb(226, 232, 240) !important;
            transform: scale(1.08) !important;
        }

        #${ID_BOTAO}[aria-current="page"] {
            color: white !important;
            background: linear-gradient(
                135deg,
                rgb(124, 58, 237),
                rgb(79, 70, 229)
            ) !important;
        }

        #${ID_BOTAO} svg {
            width: 20px !important;
            height: 20px !important;
            display: block !important;
        }

        .dark #${ID_BOTAO} {
            color: white !important;
            background: rgb(15, 23, 42) !important;
        }

        .dark #${ID_BOTAO}[aria-current="page"] {
            background: linear-gradient(
                135deg,
                rgb(124, 58, 237),
                rgb(79, 70, 229)
            ) !important;
        }

        /*
         * Plano B caso o cabeçalho não seja encontrado.
         */
        #${ID_BOTAO}[data-tc-fallback="1"] {
            position: fixed !important;
            top: 10px !important;
            left: 100px !important;
            z-index: 2147483646 !important;
        }
    `);

    let atualizacaoPendente = false;

    function atualizarEstado(botao) {
        const paginaAtual =
            location.pathname === URL_CONTATOS ||
            location.pathname.startsWith(`${URL_CONTATOS}/`);

        if (paginaAtual) {
            botao.setAttribute('aria-current', 'page');
            botao.title = 'Contatos aberto';
        } else {
            botao.removeAttribute('aria-current');
            botao.title = 'Abrir Contatos';
        }
    }

    function criarBotao() {
        let botao = document.getElementById(ID_BOTAO);

        if (botao) {
            atualizarEstado(botao);
            return botao;
        }

        botao = document.createElement('a');

        botao.id = ID_BOTAO;
        botao.href = URL_CONTATOS;
        botao.title = 'Abrir Contatos';
        botao.setAttribute('aria-label', 'Abrir Contatos');

        /*
         * Mesmo ícone usado pelo menu Contatos do TendiChat.
         */
        botao.innerHTML = `
            <svg
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                viewBox="0 0 2048 2048"
            >
                <path
                    fill="currentColor"
                    d="M1632 1462q66 33 119 81t90 107t58 128t21 142h-128q0-79-30-149t-82-122t-123-83t-149-30q-80 0-149 30t-122 82t-83 123t-30 149H896q0-73 20-142t58-128t91-107t119-81q-75-54-117-135t-43-175q0-79-30-149t-82-122t-123-83t-149-30q-80 0-149 30t-122 82t-83 123t-30 149H128q0-73 20-142t58-128t91-107t119-81q-75-54-117-135t-43-175q0-79 30-149t82-122t122-83T640 0q79 0 149 30t122 82t83 123t30 149q0 94-42 175T864 694q76 38 136 98t98 136q54-75 135-117t175-43q79 0 149 30t122 82t83 123t30 149q0 94-42 175t-118 135M640 640q53 0 99-20t82-55t55-81t20-100q0-53-20-99t-55-82t-81-55t-100-20q-53 0-99 20t-82 55t-55 81t-20 100q0 53 20 99t55 82t81 55t100 20m768 768q53 0 99-20t82-55t55-81t20-100q0-53-20-99t-55-82t-81-55t-100-20q-53 0-99 20t-82 55t-55 81t-20 100q0 53 20 99t55 82t81 55t100 20m128-1152h-384V128h512v512h-128z"
                ></path>
            </svg>
        `;

        atualizarEstado(botao);

        return botao;
    }

    function localizarGrupoDoCabecalho(header) {
        const home = header.querySelector(
            'a[href="/app/home"]'
        );

        if (home?.parentElement) {
            return {
                grupo: home.parentElement,
                home
            };
        }

        const grupo = Array.from(
            header.querySelectorAll('.flex.items-center')
        ).find(elemento => elemento.querySelector('a'));

        return {
            grupo: grupo || null,
            home: null
        };
    }

    function posicionarBotao() {
        atualizacaoPendente = false;

        const botao = criarBotao();
        const header = document.querySelector('.app-header');

        if (!header) {
            botao.dataset.tcFallback = '1';

            if (!botao.isConnected && document.body) {
                document.body.appendChild(botao);
            }

            return;
        }

        const { grupo, home } =
            localizarGrupoDoCabecalho(header);

        if (!grupo) {
            botao.dataset.tcFallback = '1';

            if (!botao.isConnected) {
                document.body.appendChild(botao);
            }

            return;
        }

        delete botao.dataset.tcFallback;

        /*
         * Coloca o botão logo depois do Home.
         */
        if (home) {
            if (home.nextElementSibling !== botao) {
                home.insertAdjacentElement(
                    'afterend',
                    botao
                );
            }
        } else if (botao.parentElement !== grupo) {
            grupo.prepend(botao);
        }

        atualizarEstado(botao);
    }

    function agendarAtualizacao() {
        if (atualizacaoPendente) {
            return;
        }

        atualizacaoPendente = true;
        requestAnimationFrame(posicionarBotao);
    }

    const observer = new MutationObserver(
        agendarAtualizacao
    );

    function iniciar() {
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
            'popstate',
            agendarAtualizacao
        );

        setInterval(agendarAtualizacao, 1500);

        agendarAtualizacao();
    }

    iniciar();
})();