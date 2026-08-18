// ==UserScript==
// @name         Yuki - Liberar IA React Forte
// @namespace    maxdata-yuki
// @version      1.4
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Yuki%20-%20Liberar%20IA%20React%20Forte.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Yuki%20-%20Liberar%20IA%20React%20Forte.user.js
// @description  Tenta liberar o botão Escrever com IA também nas props internas do React
// @match        *://tendichat.com.br/*
// @match        *://*.tendichat.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const FLAG = '__yukiBotaoIATratado';

    function acharChavesReact(el) {
        return Object.keys(el).filter(k =>
            k.startsWith('__reactProps$') ||
            k.startsWith('__reactFiber$') ||
            k.startsWith('__reactInternalInstance$')
        );
    }

    function tentarLiberarReact(el) {
        const chaves = acharChavesReact(el);

        for (const chave of chaves) {
            const obj = el[chave];

            try {
                if (obj?.disabled !== undefined) obj.disabled = false;
                if (obj?.ariaDisabled !== undefined) obj.ariaDisabled = false;

                if (obj?.memoizedProps) {
                    obj.memoizedProps.disabled = false;
                    obj.memoizedProps['aria-disabled'] = false;
                }

                if (obj?.pendingProps) {
                    obj.pendingProps.disabled = false;
                    obj.pendingProps['aria-disabled'] = false;
                }
            } catch (e) {
                console.warn('[Yuki IA] Não foi possível alterar prop React:', chave, e);
            }
        }
    }

    function liberarVisual(botao) {
        botao.disabled = false;
        botao.removeAttribute('disabled');
        botao.removeAttribute('aria-disabled');

        botao.style.pointerEvents = 'auto';
        botao.style.cursor = 'pointer';
        botao.style.opacity = '1';

        botao.classList.remove('disabled:opacity-50');
    }

    function procurarOnClickReact(el) {
        let atual = el;

        while (atual) {
            const chaves = acharChavesReact(atual);

            for (const chave of chaves) {
                const obj = atual[chave];

                const props = obj?.memoizedProps || obj?.pendingProps || obj;

                if (props && typeof props.onClick === 'function') {
                    return {
                        elemento: atual,
                        onClick: props.onClick,
                        props
                    };
                }
            }

            atual = atual.parentElement;
        }

        return null;
    }

    function forcarClique(botao, eventoOriginal) {
        liberarVisual(botao);

        let atual = botao;
        while (atual) {
            tentarLiberarReact(atual);
            atual = atual.parentElement;
        }

        const reactClick = procurarOnClickReact(botao);

        console.log('[Yuki IA] Botão encontrado:', botao);
        console.log('[Yuki IA] React onClick encontrado:', !!reactClick, reactClick);

        try {
            botao.dispatchEvent(new MouseEvent('mousedown', {
                bubbles: true,
                cancelable: true,
                view: window
            }));

            botao.dispatchEvent(new MouseEvent('mouseup', {
                bubbles: true,
                cancelable: true,
                view: window
            }));

            botao.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                view: window
            }));
        } catch (e) {
            console.error('[Yuki IA] Erro no dispatchEvent:', e);
        }

        if (reactClick) {
            try {
                reactClick.onClick({
                    nativeEvent: eventoOriginal || new MouseEvent('click'),
                    target: reactClick.elemento,
                    currentTarget: reactClick.elemento,
                    preventDefault: () => {},
                    stopPropagation: () => {},
                    isDefaultPrevented: () => false,
                    isPropagationStopped: () => false
                });
            } catch (e) {
                console.error('[Yuki IA] Erro ao chamar onClick React:', e);
            }
        }
    }

    function tratarBotao(botao) {
        liberarVisual(botao);

        if (botao[FLAG]) return;
        botao[FLAG] = true;

        botao.addEventListener('click', function (e) {
            const texto = botao.innerText || '';

            if (!texto.includes('Escrever com IA')) return;

            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();

            forcarClique(botao, e);
        }, true);
    }

    function procurarBotao() {
        const botoes = [...document.querySelectorAll('button')];

        for (const botao of botoes) {
            const texto = botao.innerText || '';

            if (texto.includes('Escrever com IA')) {
                tratarBotao(botao);
            }
        }
    }

    setTimeout(procurarBotao, 1000);

    const observer = new MutationObserver(() => {
        clearTimeout(window.__yukiLiberarIATimer);
        window.__yukiLiberarIATimer = setTimeout(procurarBotao, 400);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    window.yukiForcarIA = function () {
        const botao = [...document.querySelectorAll('button')]
            .find(b => (b.innerText || '').includes('Escrever com IA'));

        if (!botao) {
            console.warn('[Yuki IA] Botão não encontrado.');
            return;
        }

        forcarClique(botao);
    };
})();