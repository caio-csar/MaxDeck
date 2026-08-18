// ==UserScript==
// @name         TendiChat - Botão Código AnyDesk
// @namespace    maxdata-tendichat-anydesk
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Bot%C3%A3o%20C%C3%B3digo%20AnyDesk.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Bot%C3%A3o%20C%C3%B3digo%20AnyDesk.user.js
// @description  Adiciona botão para mensagem automática solicitando código de acesso AnyDesk no TendiChat
// @author       Caio
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const MENSAGEM_ANYDESK = 'Me envia o código do AnyDesk, por gentileza.';
    const BTN_ID = 'btn-anydesk-codigo-auto';

    function dispararEventos(el) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    function preencherMensagem(textarea) {
        textarea.focus();

        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLTextAreaElement.prototype,
            'value'
        )?.set;

        if (setter) {
            setter.call(textarea, MENSAGEM_ANYDESK);
        } else {
            textarea.value = MENSAGEM_ANYDESK;
        }

        dispararEventos(textarea);
    }

    function enviarMensagem(textarea) {
        const form = textarea.closest('form');

        if (form) {
            const submitEvent = new Event('submit', {
                bubbles: true,
                cancelable: true
            });

            form.dispatchEvent(submitEvent);
        }

        textarea.dispatchEvent(new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            which: 13,
            keyCode: 13,
            bubbles: true,
            cancelable: true
        }));

        textarea.dispatchEvent(new KeyboardEvent('keyup', {
            key: 'Enter',
            code: 'Enter',
            which: 13,
            keyCode: 13,
            bubbles: true,
            cancelable: true
        }));
    }

    function criarBotao() {
        const btn = document.createElement('button');
        btn.id = BTN_ID;
        btn.type = 'button';
        btn.title = 'Solicitar código AnyDesk';
        btn.textContent = '🖥️';

        btn.style.cssText = `
            border: none;
            background: transparent;
            cursor: pointer;
            font-size: 19px;
            line-height: 1;
            padding: 0;
            margin: 0 2px;
            display: inline-flex;
            align-items: center;
            justify-content: center;
        `;

        btn.addEventListener('click', function () {
            const article = btn.closest('article');
            const textarea = article?.querySelector('textarea[placeholder="Mensagem..."]')
                || document.querySelector('textarea[placeholder="Mensagem..."]');

            if (!textarea) {
                alert('Campo de mensagem não encontrado.');
                return;
            }

            preencherMensagem(textarea);

            setTimeout(() => {
                enviarMensagem(textarea);
            }, 150);
        });

        return btn;
    }

    function inserirBotao() {
        const textarea = document.querySelector('textarea[placeholder="Mensagem..."]');
        if (!textarea) return;

        const article = textarea.closest('article.flex.items-center.w-full');
        if (!article) return;

        if (article.querySelector(`#${BTN_ID}`)) return;

        const areaBotoesEsquerda = article.querySelector('div.flex.items-center.gap-2');
        if (!areaBotoesEsquerda) return;

        const botao = criarBotao();

        const botaoSaudacao = areaBotoesEsquerda.querySelector('[data-saudacao-auto="1"]');

        if (botaoSaudacao) {
            botaoSaudacao.insertAdjacentElement('afterend', botao);
        } else {
            areaBotoesEsquerda.prepend(botao);
        }
    }

    const observer = new MutationObserver(() => {
        inserirBotao();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    inserirBotao();
})();