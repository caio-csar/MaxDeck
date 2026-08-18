// ==UserScript==
// @name         TendiChat - Lista em cima e conversa embaixo
// @namespace    maxdata-tendichat-split
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Lista%20em%20cima%20e%20conversa%20embaixo.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Lista%20em%20cima%20e%20conversa%20embaixo.user.js
// @description  Fixa a lista de atendimentos na metade superior da tela e a conversa aberta na metade inferior.
// @author       Caio
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TOP_HEIGHT = '50vh';
    const BOTTOM_TOP = '50vh';

    let lastPanel = null;
    let lastChat = null;

    function setImportant(el, prop, value) {
        if (!el) return;
        el.style.setProperty(prop, value, 'important');
    }

    function text(el) {
        return (el?.textContent || '').replace(/\s+/g, ' ').trim();
    }

    function isVisible(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 50 && r.height > 50;
    }

    function findTicketPanel() {
        const title = Array.from(document.querySelectorAll('h5, h4, h3, div, span'))
            .find(el => text(el) === 'Atendimentos');

        if (!title) return null;

        let el = title;

        while (el && el !== document.body) {
            const cls = String(el.className || '');

            const looksLikeMainTicketPanel =
                el.tagName === 'SECTION' &&
                (
                    cls.includes('h-[90vh]') ||
                    cls.includes('w-[93vw]') ||
                    cls.includes('transition-transform') ||
                    cls.includes('-translate-x-full') ||
                    cls.includes('md:translate-x-0')
                );

            if (looksLikeMainTicketPanel) return el;

            el = el.parentElement;
        }

        return title.closest('section') || null;
    }

    function scoreChatCandidate(el, ticketPanel) {
        if (!el || el === ticketPanel || el.contains(ticketPanel) || ticketPanel.contains(el)) return -1;
        if (!isVisible(el)) return -1;

        const r = el.getBoundingClientRect();
        let score = r.width * r.height;

        const hasMessageInput = el.querySelector(
            'textarea, input[placeholder*="mensagem" i], input[placeholder*="digite" i], [contenteditable="true"]'
        );

        const hasConversationHints = /mensagem|enviar|digite|atendimento|cliente|whatsapp|finalizar/i.test(text(el));

        if (hasMessageInput) score += 500000;
        if (hasConversationHints) score += 150000;

        return score;
    }

    function findChatPane(ticketPanel) {
        if (!ticketPanel) return null;

        let branch = ticketPanel;
        let parent = ticketPanel.parentElement;
        let best = null;
        let bestScore = -1;

        // Primeiro tenta achar um irmão direto/indireto da lista.
        for (let level = 0; parent && parent !== document.body && level < 8; level++) {
            const siblings = Array.from(parent.children).filter(el => el !== branch);

            for (const sib of siblings) {
                const score = scoreChatCandidate(sib, ticketPanel);
                if (score > bestScore) {
                    bestScore = score;
                    best = sib;
                }
            }

            branch = parent;
            parent = parent.parentElement;
        }

        if (best) return best;

        // Fallback: procura um bloco grande da tela que não seja a lista.
        const candidates = Array.from(document.querySelectorAll('main, section, article, div'));

        for (const el of candidates) {
            const score = scoreChatCandidate(el, ticketPanel);
            if (score > bestScore) {
                bestScore = score;
                best = el;
            }
        }

        return best;
    }

    function adjustTicketListHeight(panel) {
        if (!panel) return;

        const header = Array.from(panel.children).find(el => {
            const cls = String(el.className || '');
            return cls.includes('sticky') || text(el).includes('Todos Pendente Atendendo Fechado');
        });

        const listBox = Array.from(panel.querySelectorAll('div')).find(el => {
            const cls = String(el.className || '');
            return cls.includes('h-[74vh]') || cls.includes('sm:h-[70vh]');
        });

        const headerHeight = header ? Math.ceil(header.getBoundingClientRect().height) + 12 : 170;

        if (listBox) {
            setImportant(listBox, 'height', `calc(${TOP_HEIGHT} - ${headerHeight}px)`);
            setImportant(listBox, 'max-height', `calc(${TOP_HEIGHT} - ${headerHeight}px)`);
            setImportant(listBox, 'min-height', '120px');
            setImportant(listBox, 'overflow', 'hidden');
        }

        const scrollArea = panel.querySelector('.scrollbar, section[class*="overflow-y-auto"]');
        if (scrollArea) {
            setImportant(scrollArea, 'height', '100%');
            setImportant(scrollArea, 'max-height', '100%');
            setImportant(scrollArea, 'overflow-y', 'auto');
            setImportant(scrollArea, 'overflow-x', 'hidden');
        }
    }

    function applyPanelStyle(panel) {
        if (!panel) return;

        panel.dataset.tendiSplitPanel = '1';

        setImportant(panel, 'position', 'fixed');
        setImportant(panel, 'top', '0');
        setImportant(panel, 'left', '0');
        setImportant(panel, 'right', '0');
        setImportant(panel, 'bottom', 'auto');

        setImportant(panel, 'width', '100vw');
        setImportant(panel, 'max-width', '100vw');
        setImportant(panel, 'min-width', '100vw');

        setImportant(panel, 'height', TOP_HEIGHT);
        setImportant(panel, 'max-height', TOP_HEIGHT);
        setImportant(panel, 'min-height', TOP_HEIGHT);

        setImportant(panel, 'z-index', '999999');
        setImportant(panel, 'transform', 'translateX(0)');
        setImportant(panel, 'translate', '0 0');
        setImportant(panel, '--tw-translate-x', '0px');

        setImportant(panel, 'overflow', 'hidden');
        setImportant(panel, 'border-radius', '0');
        setImportant(panel, 'box-shadow', '0 4px 12px rgba(0,0,0,.18)');
        setImportant(panel, 'display', 'block');

        adjustTicketListHeight(panel);
    }

    function applyChatStyle(chat) {
        if (!chat) return;

        chat.dataset.tendiSplitChat = '1';

        setImportant(chat, 'position', 'fixed');
        setImportant(chat, 'top', BOTTOM_TOP);
        setImportant(chat, 'left', '0');
        setImportant(chat, 'right', '0');
        setImportant(chat, 'bottom', '0');

        setImportant(chat, 'width', '100vw');
        setImportant(chat, 'max-width', '100vw');
        setImportant(chat, 'height', '50vh');
        setImportant(chat, 'max-height', '50vh');

        setImportant(chat, 'z-index', '999998');
        setImportant(chat, 'transform', 'none');
        setImportant(chat, 'translate', '0 0');
        setImportant(chat, '--tw-translate-x', '0px');

        setImportant(chat, 'overflow', 'hidden');
        setImportant(chat, 'display', 'flex');
        setImportant(chat, 'flex-direction', 'column');
    }

    function applyGlobalStyle() {
        let style = document.getElementById('tendi-split-style');

        if (!style) {
            style = document.createElement('style');
            style.id = 'tendi-split-style';
            document.head.appendChild(style);
        }

        style.textContent = `
            html, body {
                height: 100% !important;
                overflow: hidden !important;
            }

            [data-tendi-split-panel="1"] * {
                box-sizing: border-box !important;
            }

            [data-tendi-split-chat="1"] {
                background: inherit !important;
            }

            [data-tendi-split-chat="1"] > * {
                max-width: 100vw !important;
            }
        `;
    }

    function applySplit() {
        const panel = findTicketPanel();
        if (!panel) return;

        const chat = findChatPane(panel);

        applyGlobalStyle();
        applyPanelStyle(panel);

        if (chat) {
            applyChatStyle(chat);
            lastChat = chat;
        }

        lastPanel = panel;
    }

    function debounce(fn, delay = 150) {
        let timer;
        return function () {
            clearTimeout(timer);
            timer = setTimeout(fn, delay);
        };
    }

    const debouncedApply = debounce(applySplit, 150);

    applySplit();

    const observer = new MutationObserver(debouncedApply);
    observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style']
    });

    window.addEventListener('resize', debouncedApply);
    window.addEventListener('load', applySplit);

    setInterval(applySplit, 1500);
})();