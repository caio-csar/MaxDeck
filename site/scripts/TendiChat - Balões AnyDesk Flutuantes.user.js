// ==UserScript==
// @name         TendiChat - Balões AnyDesk Flutuantes
// @namespace    maxdata.tendichat.anydesk
// @version      2.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Bal%C3%B5es%20AnyDesk%20Flutuantes.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Bal%C3%B5es%20AnyDesk%20Flutuantes.user.js
// @description  Cria um balão para cada código AnyDesk, animado da mensagem até o topo da conversa, arrastável e com retorno automático ao topo.
// @author       Caio
// @match        https://tendichat.com.br/*
// @match        https://*.tendichat.com.br/*
// @match        http://tendichat.com.br/*
// @match        http://*.tendichat.com.br/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const INSTANCE_KEY = '__TM_TENDICHAT_ANYDESK_BALLOONS_V20__';
    const STYLE_ID = 'tm-anydesk-balloon-style';
    const TOAST_ID = 'tm-anydesk-balloon-toast';
    const BALLOON_CLASS = 'tm-anydesk-balloon';
    const HOME_TOP_GAP = 8;
    const BALLOON_SIZE = 46;
    const BALLOON_GAP = 9;
    const EDGE_GAP = 12;

    if (window[INSTANCE_KEY]) return;
    window[INSTANCE_KEY] = true;

    let scanTimer = null;
    let lastSignature = '';
    let activeChatBox = null;
    const balloons = new Map();

    const css = `
        .${BALLOON_CLASS} {
            position: fixed;
            z-index: 999999;
            width: ${BALLOON_SIZE}px;
            height: ${BALLOON_SIZE}px;
            padding: 0;
            border: 1px solid rgba(255, 255, 255, .28);
            border-radius: 50% 50% 48% 48%;
            background: linear-gradient(145deg, #ef4444, #b91c1c);
            color: #fff;
            box-shadow:
                0 8px 20px rgba(0, 0, 0, .28),
                inset 0 1px 1px rgba(255, 255, 255, .25);
            font-family: Arial, sans-serif;
            font-size: 12px;
            font-weight: 800;
            line-height: 1;
            text-align: center;
            cursor: grab;
            user-select: none;
            touch-action: none;
            opacity: .96;
            will-change: left, top, transform;
            transition:
                box-shadow .15s ease,
                filter .15s ease,
                opacity .15s ease;
        }

        .${BALLOON_CLASS}::before {
            content: '';
            position: absolute;
            left: 50%;
            bottom: -5px;
            width: 9px;
            height: 9px;
            background: #b91c1c;
            transform: translateX(-50%) rotate(45deg);
            border-radius: 0 0 2px 0;
            z-index: -1;
        }

        .${BALLOON_CLASS}::after {
            content: '';
            position: absolute;
            top: 8px;
            left: 11px;
            width: 9px;
            height: 5px;
            border-radius: 50%;
            background: rgba(255, 255, 255, .34);
            transform: rotate(-35deg);
            pointer-events: none;
        }

        .${BALLOON_CLASS}:hover {
            filter: brightness(1.08);
            box-shadow:
                0 10px 24px rgba(0, 0, 0, .34),
                inset 0 1px 1px rgba(255, 255, 255, .28);
        }

        .${BALLOON_CLASS}:active,
        .${BALLOON_CLASS}[data-dragging="true"] {
            cursor: grabbing;
            filter: brightness(.96);
        }

        .${BALLOON_CLASS}:focus-visible {
            outline: 2px solid #93c5fd;
            outline-offset: 3px;
        }

        .${BALLOON_CLASS} .tm-anydesk-balloon-code {
            display: block;
            pointer-events: none;
            transform: translateY(1px);
        }

        #${TOAST_ID} {
            position: fixed;
            left: 50%;
            top: 18px;
            z-index: 1000000;
            max-width: min(340px, calc(100vw - 28px));
            padding: 8px 11px;
            border-radius: 8px;
            background: rgba(17, 24, 39, .96);
            color: #fff;
            box-shadow: 0 5px 18px rgba(0, 0, 0, .30);
            font-family: Arial, sans-serif;
            font-size: 12px;
            line-height: 1.35;
            pointer-events: none;
            opacity: 0;
            transform: translate(-50%, -7px);
            transition: opacity .18s ease, transform .18s ease;
        }

        #${TOAST_ID}.show {
            opacity: 1;
            transform: translate(-50%, 0);
        }
    `;

    function injectStyle() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = css;
        document.head.appendChild(style);
    }

    function isVisible(el) {
        if (!el || !(el instanceof Element)) return false;

        const style = window.getComputedStyle(el);

        if (
            style.display === 'none' ||
            style.visibility === 'hidden' ||
            Number(style.opacity) === 0
        ) {
            return false;
        }

        const rect = el.getBoundingClientRect();

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.bottom > 0 &&
            rect.right > 0 &&
            rect.top < window.innerHeight &&
            rect.left < window.innerWidth
        );
    }

    function getOpenConversationRoot() {
        const chatBoxes = Array.from(document.querySelectorAll('#chatBox'));

        return chatBoxes
            .filter(el => {
                if (!isVisible(el)) return false;

                const rect = el.getBoundingClientRect();
                return rect.width > 250 && rect.height > 150;
            })
            .sort((a, b) => {
                const ra = a.getBoundingClientRect();
                const rb = b.getBoundingClientRect();
                return (rb.width * rb.height) - (ra.width * ra.height);
            })[0] || null;
    }

    function getMessageElements(root) {
        if (!root) return [];

        return Array.from(root.querySelectorAll('article p')).filter(el => {
            if (!isVisible(el)) return false;

            if (
                el.closest(`.${BALLOON_CLASS}`) ||
                el.closest(`#${TOAST_ID}`) ||
                el.closest('[data-area-cnpj-tendichat]') ||
                el.closest('[data-botao-cnpj-tendichat]') ||
                el.closest('button') ||
                el.closest('svg') ||
                el.closest('input') ||
                el.closest('textarea') ||
                el.closest('script') ||
                el.closest('style')
            ) {
                return false;
            }

            return Boolean((el.innerText || '').trim());
        });
    }

    function normalizeCode(value) {
        return String(value || '').replace(/\D/g, '');
    }

    function formatCode(code) {
        if (code.length === 9) {
            return code.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
        }

        if (code.length === 10) {
            return code.replace(/(\d{1})(\d{3})(\d{3})(\d{3})/, '$1 $2 $3 $4');
        }

        return code;
    }

    function isGoodContext(text) {
        return /\b(anydesk|any desk|acesso remoto|remoto|id anydesk|código anydesk|codigo anydesk|cod anydesk|cód anydesk)\b/i.test(text);
    }

    function isBadContext(text) {
        return /\b(cpf|cnpj|cgc|telefone|tel|whats|whatsapp|celular|cep|nota|nf|nfe|nfce|pedido|venda|boleto|pix|chave|endereço|endereco|data|hora|horário|horario)\b/i.test(text);
    }

    function looksLikeCnpj(text) {
        const clean = String(text || '');
        return (
            /\b\d{2}\.?\d{3}\.?\d{3}[\/.\-]?\d{4}[.\-]?\d{2}\b/.test(clean) ||
            /\b\d{14}\b/.test(clean)
        );
    }

    function looksLikeCpf(text) {
        const clean = String(text || '');
        return (
            /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/.test(clean) ||
            /\b\d{11}\b/.test(clean)
        );
    }

    function looksLikeDateTime(text) {
        const clean = String(text || '').trim();
        return (
            /\b\d{1,2}[\/.-]\d{1,2}[\/.-]\d{2,4}(?:\s+\d{1,2}(?::\d{2})?)?\b/.test(clean) ||
            /\b\d{1,2}:\d{2}\b/.test(clean)
        );
    }

    function looksLikePhone(text) {
        const clean = String(text || '').trim();
        return (
            /\b(?:\(?\d{2}\)?\s*)?(?:9\s*)?\d{4}[-\s]?\d{4}\b/.test(clean) ||
            /\b\d{2}\s?9?\d{4}\s?\d{4}\b/.test(clean)
        );
    }

    function shouldAcceptCandidate(code, raw, localContext, fullMessage) {
        if (!code || (code.length !== 9 && code.length !== 10)) return false;

        if (
            looksLikeDateTime(raw) ||
            looksLikeDateTime(localContext) ||
            looksLikeCnpj(raw) ||
            looksLikeCnpj(localContext) ||
            looksLikeCpf(raw) ||
            looksLikeCpf(localContext)
        ) {
            return false;
        }

        if (isGoodContext(localContext) || isGoodContext(fullMessage)) {
            return true;
        }

        if (isBadContext(localContext)) return false;

        if (
            looksLikePhone(localContext) &&
            /\b(tel|telefone|whats|whatsapp|celular)\b/i.test(localContext)
        ) {
            return false;
        }

        return true;
    }

    function extractCodes(root) {
        const found = new Map();
        const tokenRegex = /(?:^|[^\d])([0-9][0-9\s.\-/:]{7,30}[0-9])(?=$|[^\d])/g;

        for (const messageEl of getMessageElements(root)) {
            const fullMessage = (messageEl.innerText || '')
                .replace(/\s+/g, ' ')
                .trim();

            if (!fullMessage) continue;

            let match;
            tokenRegex.lastIndex = 0;

            while ((match = tokenRegex.exec(fullMessage)) !== null) {
                const raw = String(match[1] || '').trim();
                const code = normalizeCode(raw);

                if (code.length > 10) continue;

                const rawStart = Math.max(0, match.index);
                const rawEnd = Math.min(
                    fullMessage.length,
                    rawStart + raw.length + 1
                );

                const localContext = fullMessage
                    .slice(
                        Math.max(0, rawStart - 80),
                        Math.min(fullMessage.length, rawEnd + 80)
                    )
                    .replace(/\s+/g, ' ')
                    .trim();

                if (!shouldAcceptCandidate(code, raw, localContext, fullMessage)) {
                    continue;
                }

                if (!found.has(code)) {
                    const messageContainer = messageEl.closest('[id^="wamid."]') ||
                        messageEl.closest('article') ||
                        messageEl;

                    found.set(code, {
                        code,
                        formatted: formatCode(code),
                        messageEl,
                        messageContainer,
                        sourceId: messageContainer.id || ''
                    });
                }
            }
        }

        return Array.from(found.values());
    }

    function createToast() {
        let toast = document.getElementById(TOAST_ID);
        if (toast) return toast;

        toast = document.createElement('div');
        toast.id = TOAST_ID;
        document.body.appendChild(toast);
        return toast;
    }

    function showToast(message) {
        const toast = createToast();
        toast.textContent = message;
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');

        clearTimeout(showToast.timer);
        showToast.timer = setTimeout(() => {
            toast.classList.remove('show');
        }, 1500);
    }

    async function copyText(text) {
        if (typeof GM_setClipboard === 'function') {
            GM_setClipboard(text);
            return;
        }

        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return;
        }

        const temp = document.createElement('textarea');
        temp.value = text;
        temp.style.position = 'fixed';
        temp.style.left = '-9999px';
        temp.style.top = '-9999px';
        document.body.appendChild(temp);
        temp.focus();
        temp.select();
        document.execCommand('copy');
        temp.remove();
    }

    function clamp(value, min, max) {
        return Math.min(Math.max(value, min), max);
    }

    function getChatBounds() {
        const root = activeChatBox || getOpenConversationRoot();

        if (!root) {
            return {
                left: EDGE_GAP,
                right: window.innerWidth - EDGE_GAP,
                top: EDGE_GAP,
                bottom: window.innerHeight - EDGE_GAP
            };
        }

        const rect = root.getBoundingClientRect();

        return {
            left: clamp(rect.left + EDGE_GAP, EDGE_GAP, window.innerWidth - BALLOON_SIZE - EDGE_GAP),
            right: clamp(rect.right - EDGE_GAP, BALLOON_SIZE + EDGE_GAP, window.innerWidth - EDGE_GAP),
            top: clamp(rect.top + HOME_TOP_GAP, EDGE_GAP, window.innerHeight - BALLOON_SIZE - EDGE_GAP),
            bottom: clamp(rect.bottom - EDGE_GAP, BALLOON_SIZE + EDGE_GAP, window.innerHeight - EDGE_GAP)
        };
    }

    function getDefaultHome(index) {
        const bounds = getChatBounds();
        const maxLeft = Math.max(bounds.left, bounds.right - BALLOON_SIZE);
        const desiredLeft = maxLeft - index * (BALLOON_SIZE + BALLOON_GAP);

        return {
            left: clamp(desiredLeft, bounds.left, maxLeft),
            top: bounds.top
        };
    }

    function updateBalloonHome(record, index, preserveHorizontal = true) {
        const defaultHome = getDefaultHome(index);
        const bounds = getChatBounds();
        const maxLeft = Math.max(bounds.left, bounds.right - BALLOON_SIZE);

        if (!preserveHorizontal || typeof record.homeLeft !== 'number') {
            record.homeLeft = defaultHome.left;
        } else {
            record.homeLeft = clamp(record.homeLeft, bounds.left, maxLeft);
        }

        record.homeTop = bounds.top;
    }

    function animateFromMessage(record) {
        const balloon = record.element;
        const source = record.item.messageEl;

        if (!source?.isConnected) return;

        const sourceRect = source.getBoundingClientRect();
        const targetRect = balloon.getBoundingClientRect();

        const sourceX = sourceRect.left + sourceRect.width / 2;
        const sourceY = sourceRect.top + sourceRect.height / 2;
        const targetX = targetRect.left + targetRect.width / 2;
        const targetY = targetRect.top + targetRect.height / 2;

        const deltaX = sourceX - targetX;
        const deltaY = sourceY - targetY;
        const sway = clamp(Math.abs(deltaY) * 0.035, 9, 24);

        return balloon.animate(
            [
                {
                    transform: `translate(${deltaX}px, ${deltaY}px) scale(.12) rotate(-7deg)`,
                    opacity: .12
                },
                {
                    transform: `translate(${deltaX + sway}px, ${deltaY * .72}px) scale(.48) rotate(5deg)`,
                    opacity: .7,
                    offset: .35
                },
                {
                    transform: `translate(${deltaX - sway * .65}px, ${deltaY * .34}px) scale(.82) rotate(-3deg)`,
                    opacity: .92,
                    offset: .72
                },
                {
                    transform: 'translate(0, 0) scale(1) rotate(0)',
                    opacity: .96
                }
            ],
            {
                duration: 1150,
                easing: 'cubic-bezier(.18,.78,.24,1)',
                fill: 'both'
            }
        );
    }

    function animateToHome(record, duration = 650) {
        const balloon = record.element;
        const rect = balloon.getBoundingClientRect();
        const dx = record.homeLeft - rect.left;
        const dy = record.homeTop - rect.top;

        const animation = balloon.animate(
            [
                { transform: 'translate(0, 0) rotate(0deg)' },
                {
                    transform: `translate(${dx * .52}px, ${dy * .58}px) rotate(${dx >= 0 ? 3 : -3}deg)`,
                    offset: .55
                },
                { transform: `translate(${dx}px, ${dy}px) rotate(0deg)` }
            ],
            {
                duration,
                easing: 'cubic-bezier(.18,.78,.24,1)',
                fill: 'forwards'
            }
        );

        animation.onfinish = () => {
            balloon.style.left = `${record.homeLeft}px`;
            balloon.style.top = `${record.homeTop}px`;
            balloon.style.transform = '';
            animation.cancel();
            startIdleFloat(record);
        };
    }

    function startIdleFloat(record) {
        record.idleAnimation?.cancel();

        record.idleAnimation = record.element.animate(
            [
                { transform: 'translateY(0) rotate(-1deg)' },
                { transform: 'translateY(-4px) rotate(1deg)' },
                { transform: 'translateY(0) rotate(-1deg)' }
            ],
            {
                duration: 2300 + Math.round(Math.random() * 500),
                iterations: Infinity,
                easing: 'ease-in-out'
            }
        );
    }

    function enableDrag(record) {
        const balloon = record.element;
        let dragging = false;
        let moved = false;
        let startX = 0;
        let startY = 0;
        let startLeft = 0;
        let startTop = 0;

        balloon.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;

            balloon.dataset.spawning = 'false';
            const rect = balloon.getBoundingClientRect();

            record.idleAnimation?.cancel();
            balloon.getAnimations().forEach(animation => animation.cancel());
            balloon.style.transform = '';
            balloon.style.left = `${rect.left}px`;
            balloon.style.top = `${rect.top}px`;

            dragging = true;
            moved = false;
            startX = event.clientX;
            startY = event.clientY;
            startLeft = rect.left;
            startTop = rect.top;
            balloon.dataset.dragging = 'true';

            balloon.setPointerCapture(event.pointerId);
            event.preventDefault();
        });

        balloon.addEventListener('pointermove', event => {
            if (!dragging) return;

            const deltaX = event.clientX - startX;
            const deltaY = event.clientY - startY;

            if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                moved = true;
            }

            const maxLeft = Math.max(0, window.innerWidth - BALLOON_SIZE);
            const maxTop = Math.max(0, window.innerHeight - BALLOON_SIZE);

            balloon.style.left = `${clamp(startLeft + deltaX, 0, maxLeft)}px`;
            balloon.style.top = `${clamp(startTop + deltaY, 0, maxTop)}px`;
            event.preventDefault();
        });

        function finishDrag(event) {
            if (!dragging) return;

            dragging = false;
            balloon.dataset.dragging = 'false';

            if (balloon.hasPointerCapture(event.pointerId)) {
                balloon.releasePointerCapture(event.pointerId);
            }

            const rect = balloon.getBoundingClientRect();
            const bounds = getChatBounds();
            const maxLeft = Math.max(bounds.left, bounds.right - BALLOON_SIZE);

            // Mantém a posição horizontal escolhida, mas sempre volta ao topo.
            record.homeLeft = clamp(rect.left, bounds.left, maxLeft);
            record.homeTop = bounds.top;

            if (moved) {
                animateToHome(record);
            } else {
                startIdleFloat(record);
            }
        }

        balloon.addEventListener('pointerup', finishDrag);
        balloon.addEventListener('pointercancel', finishDrag);

        balloon.addEventListener(
            'click',
            event => {
                if (!moved) return;
                event.preventDefault();
                event.stopImmediatePropagation();
                moved = false;
            },
            true
        );
    }

    function createBalloon(item, index) {
        const balloon = document.createElement('button');
        balloon.type = 'button';
        balloon.className = BALLOON_CLASS;
        balloon.dataset.code = item.code;
        balloon.dataset.dragging = 'false';
        balloon.dataset.spawning = 'true';

        const label = document.createElement('span');
        label.className = 'tm-anydesk-balloon-code';
        label.textContent = item.code.slice(-3);
        balloon.appendChild(label);

        balloon.title = `AnyDesk ${item.formatted} — clique para copiar`;
        balloon.setAttribute(
            'aria-label',
            `AnyDesk ${item.formatted}. Clique para copiar. Arraste e solte para voltar ao topo.`
        );

        const record = {
            item,
            element: balloon,
            homeLeft: null,
            homeTop: null,
            idleAnimation: null
        };

        updateBalloonHome(record, index, false);
        balloon.style.left = `${record.homeLeft}px`;
        balloon.style.top = `${record.homeTop}px`;

        balloon.addEventListener('click', async () => {
            try {
                await copyText(item.code);
                showToast(`AnyDesk copiado: ${item.formatted}`);
            } catch (error) {
                console.error('[TendiChat AnyDesk] Falha ao copiar:', error);
                showToast('Não foi possível copiar o AnyDesk.');
            }
        });

        document.body.appendChild(balloon);
        record.element = balloon;
        enableDrag(record);

        requestAnimationFrame(() => {
            const spawnAnimation = animateFromMessage(record);

            const finishSpawn = () => {
                balloon.dataset.spawning = 'false';
                balloon.style.transform = '';
                startIdleFloat(record);
            };

            if (spawnAnimation) {
                spawnAnimation.onfinish = () => {
                    spawnAnimation.cancel();
                    finishSpawn();
                };
            } else {
                finishSpawn();
            }
        });

        balloons.set(item.code, record);
        return record;
    }

    function removeBalloon(code) {
        const record = balloons.get(code);
        if (!record) return;

        record.idleAnimation?.cancel();
        record.element.getAnimations().forEach(animation => animation.cancel());
        record.element.remove();
        balloons.delete(code);
    }

    function clearBalloons() {
        for (const code of Array.from(balloons.keys())) {
            removeBalloon(code);
        }
    }

    function syncBalloons(items) {
        const activeCodes = new Set(items.map(item => item.code));

        for (const code of Array.from(balloons.keys())) {
            if (!activeCodes.has(code)) removeBalloon(code);
        }

        items.forEach((item, index) => {
            let record = balloons.get(item.code);

            if (!record) {
                record = createBalloon(item, index);
                return;
            }

            record.item = item;
            updateBalloonHome(record, index, true);

            const rect = record.element.getBoundingClientRect();
            const farFromTop = Math.abs(rect.top - record.homeTop) > 7;

            if (
                farFromTop &&
                record.element.dataset.dragging !== 'true' &&
                record.element.dataset.spawning !== 'true'
            ) {
                animateToHome(record, 420);
            }
        });
    }

    function repositionAll() {
        const records = Array.from(balloons.values());

        records.forEach((record, index) => {
            updateBalloonHome(record, index, true);

            if (
                record.element.dataset.dragging === 'true' ||
                record.element.dataset.spawning === 'true'
            ) {
                return;
            }

            const rect = record.element.getBoundingClientRect();
            const distanceX = Math.abs(rect.left - record.homeLeft);
            const distanceY = Math.abs(rect.top - record.homeTop);

            if (distanceX > 7 || distanceY > 7) {
                animateToHome(record, 360);
            }
        });
    }

    function scan() {
        const root = getOpenConversationRoot();

        if (root !== activeChatBox) {
            activeChatBox = root;
            lastSignature = '';
            clearBalloons();
        }

        if (!root) {
            clearBalloons();
            return;
        }

        const items = extractCodes(root);
        const signature = items
            .map(item => `${item.code}@${item.sourceId}`)
            .join('|');

        if (signature === lastSignature) {
            repositionAll();
            return;
        }

        lastSignature = signature;
        syncBalloons(items);
    }

    function scheduleScan() {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(scan, 350);
    }

    function startObserver() {
        injectStyle();
        scan();

        const observer = new MutationObserver(scheduleScan);
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        window.addEventListener('resize', scheduleScan);
        window.addEventListener('scroll', scheduleScan, true);
        setInterval(scan, 2500);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startObserver, { once: true });
    } else {
        startObserver();
    }
})();
