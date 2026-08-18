// ==UserScript==
// @name         Painel Maxdata - Boneco Pendentes Estavel
// @namespace    http://tampermonkey.net/
// @version      5.1
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Painel%20Maxdata%20-%20Boneco%20Pendentes%20Estavel.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Painel%20Maxdata%20-%20Boneco%20Pendentes%20Estavel.user.js
// @description  Boneco proporcional com animação inicial por troca de imagens, sem depender de preload total
// @match        https://painel.maxdata.com.br/*
// @run-at       document-end
// @grant        GM_getResourceURL
// @resource     BONECO_1  file:///C:/Users/murillo/Documents/tamperpainel/1.png
// @resource     BONECO_2  file:///C:/Users/murillo/Documents/tamperpainel/2.png
// @resource     BONECO_3  file:///C:/Users/murillo/Documents/tamperpainel/3.png
// @resource     BONECO_4  file:///C:/Users/murillo/Documents/tamperpainel/4.png
// @resource     BONECO_5  file:///C:/Users/murillo/Documents/tamperpainel/5.png
// @resource     BONECO_6  file:///C:/Users/murillo/Documents/tamperpainel/6.png
// @resource     BONECO_7  file:///C:/Users/murillo/Documents/tamperpainel/7.png
// @resource     BONECO_8  file:///C:/Users/murillo/Documents/tamperpainel/8.png
// @resource     BONECO_9  file:///C:/Users/murillo/Documents/tamperpainel/9.png
// @resource     BONECO_10 file:///C:/Users/murillo/Documents/tamperpainel/10.png
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_SELECTOR = '#pending_so';
    const EMPTY_TEXT = 'Nenhum Atendimento Pendente';

    /*
     * AJUSTES VISUAIS
     */
    const TOP_OFFSET = -2;
    const BOTTOM_GAP = 0;
    const X_OFFSET = 0;
    const SCALE = 1;

    /*
     * ANIMAÇÃO INICIAL POR TROCA DE IMAGENS
     */
    const INTRO_ENABLED = true;
    const INTRO_FRAME_MS = 45;

    /*
     * COMPORTAMENTO
     */
    const HIDE_WHEN_ZERO = false;

    const IMAGES = [
        GM_getResourceURL('BONECO_1'),
        GM_getResourceURL('BONECO_2'),
        GM_getResourceURL('BONECO_3'),
        GM_getResourceURL('BONECO_4'),
        GM_getResourceURL('BONECO_5'),
        GM_getResourceURL('BONECO_6'),
        GM_getResourceURL('BONECO_7'),
        GM_getResourceURL('BONECO_8'),
        GM_getResourceURL('BONECO_9'),
        GM_getResourceURL('BONECO_10')
    ];

    let box = null;
    let img = null;
    let observer = null;
    let currentPanel = null;
    let raf = 0;

    let currentIndex = -1;
    let targetIndex = 0;
    let introDone = false;
    let introRunning = false;
    let introTimer = null;

    function injectCSS() {
        if (document.getElementById('maxdata-boneco-estavel-css')) return;

        const style = document.createElement('style');
        style.id = 'maxdata-boneco-estavel-css';

        style.textContent = `
            #maxdata-boneco-estavel-box {
                position: fixed !important;
                z-index: 999990 !important;
                pointer-events: none !important;
                user-select: none !important;
                display: none;
                overflow: visible !important;
                background: transparent !important;
                border: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                width: 0 !important;
            }

            #maxdata-boneco-estavel-img {
                position: absolute !important;
                top: 0 !important;
                left: 50% !important;
                transform: translateX(-50%) !important;
                height: 100% !important;
                width: auto !important;
                max-width: none !important;
                max-height: none !important;
                object-fit: contain !important;
                object-position: top center !important;
                display: block !important;
                background: transparent !important;
                border: 0 !important;
                padding: 0 !important;
                margin: 0 !important;
                pointer-events: none !important;
                user-select: none !important;
                -webkit-user-drag: none !important;
            }
        `;

        document.head.appendChild(style);
    }

    function ensureElements() {
        if (!box) {
            box = document.createElement('div');
            box.id = 'maxdata-boneco-estavel-box';
            document.body.appendChild(box);
        }

        if (!img) {
            img = document.createElement('img');
            img.id = 'maxdata-boneco-estavel-img';
            img.alt = '';

            img.onerror = () => {
                img.style.visibility = 'hidden';
            };

            img.onload = () => {
                img.style.visibility = 'visible';
                if (box) box.style.display = 'block';
            };

            box.appendChild(img);
        }
    }

    function getPanel() {
        return document.querySelector(PANEL_SELECTOR);
    }

    function getTable(panel) {
        return panel ? panel.querySelector('table') : null;
    }

    function countPending(panel) {
        if (!panel) return 0;

        const text = (panel.innerText || '').replace(/\s+/g, ' ').trim();

        if (!text || text.includes(EMPTY_TEXT)) {
            return 0;
        }

        const rows = Array.from(panel.querySelectorAll('tr'));

        return rows.filter(row => {
            if (row.classList.contains('table-header')) return false;

            const rowText = (row.innerText || '').replace(/\s+/g, ' ').trim();

            if (!rowText) return false;
            if (rowText.includes(EMPTY_TEXT)) return false;
            if (rowText.includes('Ordem') && rowText.includes('Tempo')) return false;

            const cells = row.querySelectorAll('td');

            if (!cells.length) return false;
            if (cells.length === 1 && cells[0].hasAttribute('colspan')) return false;

            return true;
        }).length;
    }

    function indexByCount(count) {
        // 0 pendentes = 1.png
        // 1 pendente  = 2.png
        // ...
        // 9 ou mais   = 10.png
        return Math.min(Math.max(count, 0), 9);
    }

    function showImage(index) {
        if (index < 0 || index >= IMAGES.length) return;

        if (currentIndex === index) {
            box.style.display = 'block';
            return;
        }

        currentIndex = index;
        img.style.visibility = 'visible';
        img.src = IMAGES[index];
        box.style.display = 'block';
    }

    function positionBoneco(panel, table) {
        const panelRect = panel.getBoundingClientRect();
        const tableRect = table.getBoundingClientRect();

        const top = Math.round(tableRect.bottom + TOP_OFFSET);
        const bottom = Math.round(window.innerHeight - BOTTOM_GAP);
        const height = Math.max(40, Math.round((bottom - top) * SCALE));

        const centerX = Math.round(panelRect.left + panelRect.width / 2 + X_OFFSET);

        box.style.left = `${centerX}px`;
        box.style.top = `${top}px`;
        box.style.height = `${height}px`;
    }

    function stopIntro() {
        if (introTimer) {
            clearTimeout(introTimer);
            introTimer = null;
        }

        introRunning = false;
    }

    function runIntro(finalIndex) {
        if (!INTRO_ENABLED || introDone || introRunning) return;

        introRunning = true;

        let frame = 9;

        function nextFrame() {
            const panel = getPanel();
            const table = getTable(panel);

            if (!panel || !table) {
                stopIntro();
                return;
            }

            positionBoneco(panel, table);
            showImage(frame);

            if (frame <= finalIndex) {
                introDone = true;
                introRunning = false;
                showImage(finalIndex);
                return;
            }

            frame--;

            introTimer = setTimeout(nextFrame, INTRO_FRAME_MS);
        }

        nextFrame();
    }

    function update() {
        ensureElements();

        const panel = getPanel();
        const table = getTable(panel);

        if (!panel || !table) {
            box.style.display = 'none';
            return;
        }

        const count = countPending(panel);

        if (HIDE_WHEN_ZERO && count === 0) {
            box.style.display = 'none';
            return;
        }

        targetIndex = indexByCount(count);

        positionBoneco(panel, table);

        if (!introDone && !introRunning) {
            runIntro(targetIndex);
            return;
        }

        if (introRunning) return;

        showImage(targetIndex);
    }

    function scheduleUpdate() {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(update);
    }

    function bindPanelObserver() {
        const panel = getPanel();

        if (!panel) return false;
        if (panel === currentPanel && observer) return true;

        currentPanel = panel;

        if (observer) {
            observer.disconnect();
            observer = null;
        }

        observer = new MutationObserver(scheduleUpdate);

        observer.observe(panel, {
            childList: true,
            subtree: true,
            characterData: true
        });

        return true;
    }

    function waitForPanel() {
        if (bindPanelObserver()) {
            scheduleUpdate();
            return;
        }

        const bodyObserver = new MutationObserver(() => {
            if (bindPanelObserver()) {
                bodyObserver.disconnect();
                scheduleUpdate();
            }
        });

        bodyObserver.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    function startRebindWatcher() {
        setInterval(() => {
            const panel = getPanel();

            if (!panel || panel !== currentPanel || !currentPanel.isConnected) {
                bindPanelObserver();
                scheduleUpdate();
            }
        }, 2500);
    }

    function start() {
        injectCSS();
        ensureElements();

        waitForPanel();
        startRebindWatcher();

        window.addEventListener('resize', scheduleUpdate, { passive: true });
        window.addEventListener('load', scheduleUpdate, { passive: true });

        scheduleUpdate();
    }

    start();

})();