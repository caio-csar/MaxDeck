// ==UserScript==
// @name         TendiChat - Diagnóstico de Estrutura
// @namespace    http://tampermonkey.net/
// @version      1.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Diagn%C3%B3stico%20de%20Estrutura.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Diagn%C3%B3stico%20de%20Estrutura.user.js
// @description  Coleta informações técnicas sobre campos, componentes e mudanças do DOM para diagnosticar scripts quebrados no TendiChat.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const APP_NAME = 'TendiDiag';
    const MAX_LOGS = 500;
    const MAX_HTML = 2500;
    const MAX_TEXT = 300;
    const KEYWORDS = [
        'atendente', 'responsável', 'responsavel', 'usuário', 'usuario',
        'setor', 'departamento', 'suporte', 'caio', 'matheus', 'artur',
        'não definido', 'nao definido', 'selecionar'
    ];

    const state = {
        startedAt: new Date().toISOString(),
        events: [],
        errors: [],
        mutations: [],
        snapshots: [],
        inspection: null,
        inspectMode: false,
        observer: null,
        panel: null,
        output: null,
        hovered: null,
        originalOutline: '',
        routeChanges: []
    };

    function now() {
        return new Date().toISOString();
    }

    function truncate(value, max = MAX_TEXT) {
        const text = String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
        return text.length > max ? `${text.slice(0, max)}…` : text;
    }

    function normalize(value) {
        return String(value || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/\s+/g, ' ')
            .trim();
    }

    function containsKeyword(value) {
        const text = normalize(value);
        return KEYWORDS.some(keyword => text.includes(normalize(keyword)));
    }

    function isElement(value) {
        return value && value.nodeType === Node.ELEMENT_NODE;
    }

    function isDiagElement(el) {
        return isElement(el) && Boolean(el.closest?.('#tendi-diag-panel, #tendi-diag-launcher, #tendi-diag-toast'));
    }

    function isVisible(el) {
        if (!isElement(el)) return false;
        const style = getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || 1) !== 0 &&
            rect.width > 0 && rect.height > 0;
    }

    function getAttributes(el) {
        if (!isElement(el)) return {};
        const attrs = {};
        const allowed = [
            'id', 'name', 'class', 'role', 'type', 'placeholder', 'title',
            'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-expanded',
            'aria-controls', 'aria-haspopup', 'data-testid', 'data-test',
            'data-cy', 'autocomplete', 'tabindex', 'for'
        ];

        allowed.forEach(name => {
            if (el.hasAttribute(name)) attrs[name] = truncate(el.getAttribute(name), 500);
        });

        Array.from(el.attributes || [])
            .filter(attr => attr.name.startsWith('data-'))
            .slice(0, 20)
            .forEach(attr => {
                if (!(attr.name in attrs)) attrs[attr.name] = truncate(attr.value, 500);
            });

        return attrs;
    }

    function getSafeText(el) {
        if (!isElement(el)) return '';
        const tag = el.tagName.toLowerCase();
        if (tag === 'textarea' || el.isContentEditable) return '[conteúdo ocultado]';
        if (tag === 'input') return truncate(el.placeholder || el.getAttribute('aria-label') || '', MAX_TEXT);
        return truncate(el.innerText || el.textContent || '', MAX_TEXT);
    }

    function sanitizeClone(el) {
        if (!isElement(el)) return '';
        const clone = el.cloneNode(true);

        clone.querySelectorAll('input').forEach(input => {
            input.removeAttribute('value');
            input.setAttribute('value', '[ocultado]');
        });
        clone.querySelectorAll('textarea').forEach(textarea => {
            textarea.textContent = '[conteúdo ocultado]';
        });
        clone.querySelectorAll('[contenteditable="true"]').forEach(editable => {
            editable.textContent = '[conteúdo ocultado]';
        });
        clone.querySelectorAll('img').forEach(img => {
            if (img.src && img.src.startsWith('data:')) img.src = '[data-url ocultada]';
        });

        return truncate(clone.outerHTML, MAX_HTML);
    }

    function cssEscape(value) {
        if (window.CSS && typeof window.CSS.escape === 'function') {
            return window.CSS.escape(value);
        }
        return String(value).replace(/([ #;?%&,.+*~\':"!^$[\]()=>|/@])/g, '\\$1');
    }

    function getCssPath(el) {
        if (!isElement(el)) return '';
        if (el.id) return `#${cssEscape(el.id)}`;

        const parts = [];
        let current = el;
        let depth = 0;

        while (current && current.nodeType === Node.ELEMENT_NODE && depth < 8) {
            let part = current.tagName.toLowerCase();

            if (current.classList && current.classList.length) {
                const classes = Array.from(current.classList)
                    .filter(cls => cls && cls.length < 60 && !/^[a-zA-Z0-9_-]*\d{5,}/.test(cls))
                    .slice(0, 3);
                if (classes.length) part += `.${classes.map(cssEscape).join('.')}`;
            }

            const parent = current.parentElement;
            if (parent) {
                const sameTag = Array.from(parent.children).filter(child => child.tagName === current.tagName);
                if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
            }

            parts.unshift(part);
            if (part.includes('#')) break;
            current = parent;
            depth++;
        }

        return parts.join(' > ');
    }

    function getLabelTexts(el) {
        if (!isElement(el)) return [];
        const labels = new Set();

        if (el.id) {
            try {
                document.querySelectorAll(`label[for="${cssEscape(el.id)}"]`).forEach(label => {
                    const text = getSafeText(label);
                    if (text) labels.add(text);
                });
            } catch (_) {}
        }

        const parentLabel = el.closest('label');
        if (parentLabel) {
            const text = getSafeText(parentLabel);
            if (text) labels.add(text);
        }

        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
            labelledBy.split(/\s+/).forEach(id => {
                const node = document.getElementById(id);
                const text = getSafeText(node);
                if (text) labels.add(text);
            });
        }

        let parent = el.parentElement;
        for (let i = 0; parent && i < 3; i++, parent = parent.parentElement) {
            const candidate = Array.from(parent.children).find(child =>
                child !== el && /^(LABEL|SPAN|P|DIV)$/i.test(child.tagName) && containsKeyword(getSafeText(child))
            );
            if (candidate) labels.add(getSafeText(candidate));
        }

        return Array.from(labels).slice(0, 10);
    }

    function getFrameworkHints(el) {
        if (!isElement(el)) return [];
        const keys = Object.keys(el);
        return keys.filter(key =>
            key.startsWith('__react') ||
            key.startsWith('_react') ||
            key.startsWith('__vue') ||
            key.startsWith('__svelte') ||
            key.startsWith('__ng')
        ).slice(0, 20);
    }

    function describeElement(el, includeHtml = true) {
        if (!isElement(el)) return null;
        const rect = el.getBoundingClientRect();
        const description = {
            tag: el.tagName.toLowerCase(),
            path: getCssPath(el),
            attributes: getAttributes(el),
            labels: getLabelTexts(el),
            text: getSafeText(el),
            visible: isVisible(el),
            rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
            },
            frameworkHints: getFrameworkHints(el)
        };

        if (el.matches('select')) {
            description.selectedIndex = el.selectedIndex;
            description.selectedValue = truncate(el.value, 500);
            description.options = Array.from(el.options).slice(0, 200).map((option, index) => ({
                index,
                text: truncate(option.textContent, 300),
                value: truncate(option.value, 300),
                selected: option.selected,
                disabled: option.disabled
            }));
        }

        if (includeHtml) description.outerHTML = sanitizeClone(el);
        return description;
    }

    function uniqueElements(elements) {
        return Array.from(new Set(elements.filter(isElement)));
    }

    function queryAllDeep(selector, root = document) {
        const results = [];
        const visited = new Set();

        function walk(currentRoot) {
            if (!currentRoot || visited.has(currentRoot)) return;
            visited.add(currentRoot);

            try {
                results.push(...currentRoot.querySelectorAll(selector));
                currentRoot.querySelectorAll('*').forEach(node => {
                    if (node.shadowRoot) walk(node.shadowRoot);
                });
            } catch (_) {}
        }

        walk(root);
        return uniqueElements(results);
    }

    function collectCandidates() {
        const selectors = [
            'select',
            '[role="combobox"]',
            '[role="listbox"]',
            '[role="option"]',
            '[aria-haspopup="listbox"]',
            '[aria-expanded][aria-controls]',
            'input:not([type="hidden"])',
            'button',
            '[data-testid]',
            '[data-test]',
            '[data-cy]'
        ];

        const all = uniqueElements(selectors.flatMap(selector => queryAllDeep(selector)));
        const relevant = all.filter(el => {
            if (isDiagElement(el)) return false;
            const source = [
                getSafeText(el),
                el.id,
                el.getAttribute('name'),
                el.getAttribute('placeholder'),
                el.getAttribute('aria-label'),
                el.getAttribute('title'),
                getLabelTexts(el).join(' '),
                el.className
            ].filter(Boolean).join(' ');

            if (el.matches('select,[role="combobox"],[role="listbox"],[aria-haspopup="listbox"]')) return true;
            return containsKeyword(source);
        });

        return {
            allControlsCount: all.length,
            relevant: relevant.slice(0, 300).map(el => describeElement(el, true))
        };
    }

    function collectSelects() {
        return queryAllDeep('select').filter(el => !isDiagElement(el)).slice(0, 200).map(select => describeElement(select, true));
    }

    function collectCustomComboboxes() {
        return queryAllDeep('[role="combobox"], [aria-haspopup="listbox"], [role="listbox"], [role="option"]')
            .filter(el => !isDiagElement(el))
            .slice(0, 300)
            .map(el => describeElement(el, true));
    }

    function collectKeywordNodes() {
        const selector = 'label, button, [role="button"], [role="option"], [role="combobox"], [aria-label], [placeholder]';
        return queryAllDeep(selector)
            .filter(el => !isDiagElement(el))
            .filter(el => containsKeyword([getSafeText(el), el.getAttribute('aria-label'), el.getAttribute('placeholder')].filter(Boolean).join(' ')))
            .filter(el => getSafeText(el).length <= 500)
            .slice(0, 300)
            .map(el => describeElement(el, true));
    }

    function collectIds() {
        return queryAllDeep('[id]')
            .filter(el => !isDiagElement(el))
            .slice(0, 2000)
            .map(el => ({
                tag: el.tagName.toLowerCase(),
                id: el.id,
                path: getCssPath(el),
                visible: isVisible(el)
            }));
    }

    function collectIframes() {
        return Array.from(document.querySelectorAll('iframe')).map((frame, index) => {
            const info = {
                index,
                src: truncate(frame.src, 1000),
                title: truncate(frame.title, 300),
                id: frame.id || '',
                name: frame.name || '',
                accessible: false
            };
            try {
                info.accessible = Boolean(frame.contentDocument);
                if (frame.contentDocument) {
                    info.documentTitle = frame.contentDocument.title;
                    info.selectCount = frame.contentDocument.querySelectorAll('select').length;
                    info.comboboxCount = frame.contentDocument.querySelectorAll('[role="combobox"]').length;
                }
            } catch (error) {
                info.error = String(error.message || error);
            }
            return info;
        });
    }

    function collectAppHints() {
        const html = document.documentElement;
        const rootNodes = ['#root', '#app', '#__next', '[ng-version]']
            .flatMap(selector => Array.from(document.querySelectorAll(selector)))
            .map(el => describeElement(el, false));

        const scripts = Array.from(document.scripts).slice(0, 300).map(script => truncate(script.src || '[inline]', 1000));
        const scriptText = scripts.join(' ').toLowerCase();
        const htmlText = html ? html.outerHTML.slice(0, 100000).toLowerCase() : '';

        return {
            roots: rootNodes,
            scriptSources: scripts,
            guesses: {
                react: scriptText.includes('react') || htmlText.includes('__react'),
                vue: scriptText.includes('vue') || htmlText.includes('__vue'),
                angular: Boolean(document.querySelector('[ng-version]')) || scriptText.includes('angular'),
                next: Boolean(document.querySelector('#__next')) || scriptText.includes('_next/static'),
                vite: scriptText.includes('/@vite/') || scriptText.includes('vite')
            }
        };
    }

    function collectPageSummary() {
        return {
            timestamp: now(),
            url: location.href,
            title: document.title,
            readyState: document.readyState,
            userAgent: navigator.userAgent,
            viewport: {
                width: window.innerWidth,
                height: window.innerHeight,
                devicePixelRatio: window.devicePixelRatio
            },
            counts: {
                elements: document.querySelectorAll('*').length,
                selects: queryAllDeep('select').length,
                inputs: queryAllDeep('input').length,
                buttons: queryAllDeep('button').length,
                comboboxes: queryAllDeep('[role="combobox"]').length,
                listboxes: queryAllDeep('[role="listbox"]').length,
                options: queryAllDeep('[role="option"]').length,
                shadowRoots: queryAllDeep('*').filter(el => el.shadowRoot).length,
                iframes: document.querySelectorAll('iframe').length
            }
        };
    }

    function createSnapshot(reason = 'manual') {
        const snapshot = {
            reason,
            page: collectPageSummary(),
            oldScriptChecks: {
                menuHierarquicoExists: Boolean(document.querySelector('#menu-hierarquico')),
                menuHierarquico: document.querySelector('#menu-hierarquico')
                    ? describeElement(document.querySelector('#menu-hierarquico'), true)
                    : null,
                nativeSelectContainingCaioMatheusArtur: queryAllDeep('select')
                    .filter(select => {
                        const texts = Array.from(select.options).map(option => option.textContent || '');
                        return texts.some(text => text.includes('Caio')) &&
                            texts.some(text => text.includes('Matheus')) &&
                            texts.some(text => text.includes('Artur'));
                    })
                    .map(select => describeElement(select, true))
            },
            selects: collectSelects(),
            customComboboxes: collectCustomComboboxes(),
            candidates: collectCandidates(),
            keywordNodes: collectKeywordNodes(),
            ids: collectIds(),
            iframes: collectIframes(),
            appHints: collectAppHints()
        };

        state.snapshots.push(snapshot);
        if (state.snapshots.length > 10) state.snapshots.shift();
        logEvent('snapshot', { reason, counts: snapshot.page.counts });
        renderOutput(snapshot);
        return snapshot;
    }

    function logEvent(type, data) {
        state.events.push({ timestamp: now(), type, data });
        if (state.events.length > MAX_LOGS) state.events.shift();
    }

    function logError(type, error) {
        state.errors.push({
            timestamp: now(),
            type,
            message: truncate(error && (error.message || error.reason || error), 2000),
            stack: truncate(error && error.stack, 5000)
        });
        if (state.errors.length > MAX_LOGS) state.errors.shift();
        updateBadge();
    }

    function summarizeMutation(mutation) {
        const target = isElement(mutation.target) ? describeElement(mutation.target, false) : null;
        const added = Array.from(mutation.addedNodes || [])
            .filter(isElement)
            .slice(0, 10)
            .map(el => describeElement(el, false));
        const removed = Array.from(mutation.removedNodes || [])
            .filter(isElement)
            .slice(0, 10)
            .map(el => describeElement(el, false));

        return {
            timestamp: now(),
            type: mutation.type,
            attributeName: mutation.attributeName || null,
            target,
            added,
            removed
        };
    }

    function startObserver() {
        if (state.observer || !document.documentElement) return;

        state.observer = new MutationObserver(mutations => {
            const relevant = mutations.filter(mutation => {
                if (isElement(mutation.target) && isDiagElement(mutation.target)) return false;

                if (mutation.type === 'attributes') {
                    const target = mutation.target;
                    if (!isElement(target)) return false;
                    return target.matches('select, input, button, [role="combobox"], [role="listbox"], [role="option"], [aria-haspopup="listbox"]') ||
                        containsKeyword([getSafeText(target), target.id, target.getAttribute('name'), target.getAttribute('aria-label')].filter(Boolean).join(' '));
                }

                return Array.from(mutation.addedNodes || []).some(node =>
                    isElement(node) && (
                        node.matches?.('select, input, button, [role="combobox"], [role="listbox"], [role="option"]') ||
                        node.querySelector?.('select, input, button, [role="combobox"], [role="listbox"], [role="option"]')
                    )
                );
            });

            relevant.slice(0, 50).forEach(mutation => state.mutations.push(summarizeMutation(mutation)));
            if (state.mutations.length > MAX_LOGS) {
                state.mutations.splice(0, state.mutations.length - MAX_LOGS);
            }
            if (relevant.length) updateBadge();
        });

        state.observer.observe(document.documentElement, {
            subtree: true,
            childList: true,
            attributes: true,
            attributeFilter: ['id', 'class', 'role', 'aria-expanded', 'aria-controls', 'aria-selected']
        });
    }

    function installEventTracking() {
        ['click', 'change', 'input', 'focusin'].forEach(type => {
            document.addEventListener(type, event => {
                const el = event.target;
                if (!isElement(el) || isDiagElement(el)) return;

                const relevant = el.matches('select, input, button, [role="combobox"], [role="option"], [aria-haspopup="listbox"]') ||
                    containsKeyword([
                        getSafeText(el), el.id, el.getAttribute('name'),
                        el.getAttribute('aria-label'), el.getAttribute('placeholder')
                    ].filter(Boolean).join(' '));

                if (!relevant) return;

                logEvent(`dom:${type}`, {
                    element: describeElement(el, false),
                    key: event.key || null,
                    value: el.matches('select') ? truncate(el.value, 500) : '[não coletado]'
                });
            }, true);
        });
    }

    function installErrorTracking() {
        window.addEventListener('error', event => {
            logError('window.error', event.error || event.message);
        });
        window.addEventListener('unhandledrejection', event => {
            logError('unhandledrejection', event.reason);
        });
    }

    function installRouteTracking() {
        function record(method, from, to) {
            const entry = { timestamp: now(), method, from, to };
            state.routeChanges.push(entry);
            if (state.routeChanges.length > 100) state.routeChanges.shift();
            logEvent('route', entry);
        }

        ['pushState', 'replaceState'].forEach(method => {
            const original = history[method];
            history[method] = function (...args) {
                const from = location.href;
                const result = original.apply(this, args);
                record(method, from, location.href);
                return result;
            };
        });

        window.addEventListener('popstate', () => record('popstate', null, location.href));
        window.addEventListener('hashchange', event => record('hashchange', event.oldURL, event.newURL));
    }

    function fullReport() {
        return {
            generatedAt: now(),
            app: APP_NAME,
            version: '1.0.0',
            privacyNote: 'Valores digitados em inputs, textareas e áreas editáveis não são coletados.',
            page: collectPageSummary(),
            startedAt: state.startedAt,
            routeChanges: state.routeChanges,
            errors: state.errors,
            events: state.events,
            mutations: state.mutations,
            inspection: state.inspection,
            snapshots: state.snapshots
        };
    }

    function formatSummary(snapshot) {
        const old = snapshot.oldScriptChecks;
        const lines = [
            '=== TENDICHAT DIAGNÓSTICO ===',
            `Data: ${snapshot.page.timestamp}`,
            `URL: ${snapshot.page.url}`,
            `Título: ${snapshot.page.title}`,
            '',
            '--- TESTES DO SCRIPT ANTIGO ---',
            `#menu-hierarquico existe: ${old.menuHierarquicoExists ? 'SIM' : 'NÃO'}`,
            `Select com Caio + Matheus + Artur: ${old.nativeSelectContainingCaioMatheusArtur.length ? 'SIM' : 'NÃO'}`,
            '',
            '--- CONTAGENS ---',
            ...Object.entries(snapshot.page.counts).map(([key, value]) => `${key}: ${value}`),
            '',
            '--- COMPONENTES RELEVANTES ---',
            `Selects nativos: ${snapshot.selects.length}`,
            `Comboboxes/listboxes customizados: ${snapshot.customComboboxes.length}`,
            `Candidatos relacionados: ${snapshot.candidates.relevant.length}`,
            `Nós contendo palavras-chave: ${snapshot.keywordNodes.length}`,
            '',
            'Use "Copiar JSON" para enviar o relatório completo.'
        ];
        return lines.join('\n');
    }

    async function copyText(text) {
        try {
            await navigator.clipboard.writeText(text);
            showToast('Relatório copiado.');
            return true;
        } catch (_) {
            const textarea = document.createElement('textarea');
            textarea.value = text;
            textarea.style.position = 'fixed';
            textarea.style.left = '-9999px';
            document.body.appendChild(textarea);
            textarea.select();
            const ok = document.execCommand('copy');
            textarea.remove();
            showToast(ok ? 'Relatório copiado.' : 'Não foi possível copiar.');
            return ok;
        }
    }

    function downloadJson() {
        const json = JSON.stringify(fullReport(), null, 2);
        const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `tendichat-diagnostico-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        showToast('Arquivo JSON gerado.');
    }

    function renderOutput(snapshot) {
        if (!state.output) return;
        state.output.value = formatSummary(snapshot);
    }

    function updateBadge() {
        const badge = document.getElementById('tendi-diag-badge');
        if (!badge) return;
        badge.textContent = String(state.errors.length + state.mutations.length);
    }

    function showToast(message) {
        let toast = document.getElementById('tendi-diag-toast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'tendi-diag-toast';
            Object.assign(toast.style, {
                position: 'fixed',
                right: '18px',
                bottom: '90px',
                zIndex: '2147483647',
                padding: '10px 14px',
                borderRadius: '10px',
                background: '#0f172a',
                color: '#fff',
                font: '600 12px Arial, sans-serif',
                boxShadow: '0 10px 30px rgba(0,0,0,.25)',
                opacity: '0',
                transition: 'opacity .15s ease'
            });
            document.documentElement.appendChild(toast);
        }
        toast.textContent = message;
        toast.style.opacity = '1';
        clearTimeout(toast.__timer);
        toast.__timer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
    }

    function clearHover() {
        if (state.hovered) {
            state.hovered.style.outline = state.originalOutline;
            state.hovered = null;
            state.originalOutline = '';
        }
    }

    function stopInspectMode() {
        state.inspectMode = false;
        clearHover();
        document.removeEventListener('mouseover', inspectMouseOver, true);
        document.removeEventListener('click', inspectClick, true);
        document.removeEventListener('keydown', inspectKeyDown, true);
        document.body && (document.body.style.cursor = '');
        showToast('Modo de inspeção encerrado.');
    }

    function inspectMouseOver(event) {
        if (!state.inspectMode) return;
        const el = event.target;
        if (!isElement(el) || state.panel?.contains(el)) return;
        clearHover();
        state.hovered = el;
        state.originalOutline = el.style.outline;
        el.style.outline = '3px solid #f97316';
    }

    function inspectClick(event) {
        if (!state.inspectMode) return;
        const el = event.target;
        if (!isElement(el) || state.panel?.contains(el)) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const ancestry = [];
        let current = el;
        for (let i = 0; current && i < 6; i++, current = current.parentElement) {
            ancestry.push(describeElement(current, i < 3));
        }

        state.inspection = {
            timestamp: now(),
            selected: describeElement(el, true),
            ancestry
        };
        logEvent('inspection', { selected: state.inspection.selected });

        if (state.output) {
            state.output.value = [
                '=== ELEMENTO INSPECIONADO ===',
                `Seletor: ${state.inspection.selected.path}`,
                `Tag: ${state.inspection.selected.tag}`,
                `Texto: ${state.inspection.selected.text}`,
                `Atributos: ${JSON.stringify(state.inspection.selected.attributes, null, 2)}`,
                '',
                'O elemento foi incluído no relatório JSON completo.'
            ].join('\n');
        }

        stopInspectMode();
        openPanel();
    }

    function inspectKeyDown(event) {
        if (event.key === 'Escape') stopInspectMode();
    }

    function startInspectMode() {
        if (state.inspectMode) return;
        state.inspectMode = true;
        closePanel();
        document.addEventListener('mouseover', inspectMouseOver, true);
        document.addEventListener('click', inspectClick, true);
        document.addEventListener('keydown', inspectKeyDown, true);
        document.body && (document.body.style.cursor = 'crosshair');
        showToast('Clique no campo alterado. ESC cancela.');
    }

    function button(text, handler, primary = false) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = text;
        Object.assign(btn.style, {
            border: primary ? '1px solid #2563eb' : '1px solid #cbd5e1',
            background: primary ? '#2563eb' : '#fff',
            color: primary ? '#fff' : '#0f172a',
            borderRadius: '8px',
            padding: '8px 10px',
            font: '700 11px Arial, sans-serif',
            cursor: 'pointer'
        });
        btn.addEventListener('click', handler);
        return btn;
    }

    function openPanel() {
        if (state.panel) state.panel.style.display = 'block';
    }

    function closePanel() {
        if (state.panel) state.panel.style.display = 'none';
    }

    function createUi() {
        if (!document.body || document.getElementById('tendi-diag-launcher')) return;

        const launcher = document.createElement('button');
        launcher.id = 'tendi-diag-launcher';
        launcher.type = 'button';
        launcher.title = 'Abrir diagnóstico do TendiChat';
        launcher.innerHTML = 'DIAG <span id="tendi-diag-badge">0</span>';
        Object.assign(launcher.style, {
            position: 'fixed',
            right: '18px',
            bottom: '18px',
            zIndex: '2147483646',
            border: 'none',
            borderRadius: '999px',
            padding: '11px 14px',
            background: '#0f172a',
            color: '#fff',
            font: '800 12px Arial, sans-serif',
            cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(0,0,0,.28)'
        });
        launcher.addEventListener('click', () => {
            if (state.panel?.style.display === 'block') closePanel();
            else openPanel();
        });

        const panel = document.createElement('div');
        panel.id = 'tendi-diag-panel';
        state.panel = panel;
        Object.assign(panel.style, {
            position: 'fixed',
            right: '18px',
            bottom: '68px',
            width: '430px',
            maxWidth: 'calc(100vw - 36px)',
            maxHeight: '75vh',
            overflow: 'auto',
            zIndex: '2147483647',
            display: 'none',
            background: '#f8fafc',
            color: '#0f172a',
            border: '1px solid #cbd5e1',
            borderRadius: '14px',
            boxShadow: '0 20px 50px rgba(0,0,0,.28)',
            padding: '14px',
            fontFamily: 'Arial, sans-serif'
        });

        const header = document.createElement('div');
        Object.assign(header.style, {
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '10px'
        });

        const title = document.createElement('div');
        title.innerHTML = '<strong style="font-size:14px">TendiChat — Diagnóstico</strong><br><span style="font-size:11px;color:#64748b">Não coleta textos digitados em conversas.</span>';

        const close = button('✕', closePanel);
        close.style.padding = '5px 8px';
        header.append(title, close);

        const actions = document.createElement('div');
        Object.assign(actions.style, {
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            marginBottom: '10px'
        });

        actions.append(
            button('1. Capturar tela', () => createSnapshot('manual'), true),
            button('2. Inspecionar campo', startInspectMode),
            button('Copiar resumo', () => {
                const snapshot = state.snapshots[state.snapshots.length - 1] || createSnapshot('copy-summary');
                copyText(formatSummary(snapshot));
            }),
            button('Copiar JSON', () => copyText(JSON.stringify(fullReport(), null, 2))),
            button('Baixar JSON', downloadJson),
            button('Limpar logs', () => {
                state.events = [];
                state.errors = [];
                state.mutations = [];
                state.snapshots = [];
                state.inspection = null;
                if (state.output) state.output.value = 'Logs limpos. Clique em “Capturar tela”.';
                updateBadge();
            })
        );

        const output = document.createElement('textarea');
        state.output = output;
        output.readOnly = true;
        output.value = 'Abra a tela onde o script parou de funcionar e clique em “Capturar tela”. Depois use “Inspecionar campo” e clique no seletor de atendente ou setor.';
        Object.assign(output.style, {
            width: '100%',
            minHeight: '220px',
            resize: 'vertical',
            boxSizing: 'border-box',
            border: '1px solid #cbd5e1',
            borderRadius: '10px',
            padding: '10px',
            background: '#fff',
            color: '#0f172a',
            font: '11px/1.45 Consolas, monospace'
        });

        const hint = document.createElement('div');
        hint.textContent = 'Procedimento ideal: capture a tela, abra o campo problemático, capture novamente e inspecione o elemento novo.';
        Object.assign(hint.style, {
            marginTop: '8px',
            color: '#475569',
            fontSize: '11px',
            lineHeight: '1.4'
        });

        panel.append(header, actions, output, hint);
        document.body.append(panel, launcher);
        updateBadge();
    }

    function init() {
        installErrorTracking();
        installRouteTracking();
        installEventTracking();

        const ready = () => {
            startObserver();
            createUi();
            setTimeout(() => createSnapshot('initial'), 1500);
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', ready, { once: true });
        } else {
            ready();
        }
    }

    window.TendiDiag = {
        run: () => createSnapshot('console'),
        report: fullReport,
        copy: () => copyText(JSON.stringify(fullReport(), null, 2)),
        download: downloadJson,
        inspect: startInspectMode,
        open: openPanel,
        stopInspect: stopInspectMode
    };

    init();
})();
