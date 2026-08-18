// ==UserScript==
// @name         Remover USRP Button
// @namespace    maxdeck
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Remover%20USRP%20Button.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Remover%20USRP%20Button.user.js
// @description  Remove o botão/ícone USRP da página
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function remover() {
        document.querySelectorAll('svg.usrp-button-icon-svg').forEach(svg => {
            const botao = svg.closest('button');

            if (botao) {
                botao.remove();
            } else {
                svg.remove();
            }
        });
    }

    remover();

    new MutationObserver(remover).observe(document.documentElement, {
        childList: true,
        subtree: true
    });
})();