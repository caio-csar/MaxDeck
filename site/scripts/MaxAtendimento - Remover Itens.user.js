// ==UserScript==
// @name         MaxAtendimento - Remover Itens
// @namespace    maxdata-atendimento
// @version      1.4
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Remover%20Itens.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Remover%20Itens.user.js
// @match        *://externo.maxdatasistema.com.br/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function ocultar() {
        const seletores = [
            'a[href="#veiculo"]',
            'a[href="#vinculosatendimentos"]',
            'a[href="#previewImp"]',
            '#veiculo',
            '#vinculosatendimentos',
            '#previewImp',
            '#btnImprimir',
            '#btnSms'
        ];

        seletores.forEach(sel => {
            document.querySelectorAll(sel).forEach(el => {
                const li = el.closest && el.closest('li.tab');

                if (li) {
                    li.style.setProperty('display', 'none', 'important');
                    li.remove();
                }

                el.style.setProperty('display', 'none', 'important');
                el.remove();
            });
        });

        document.querySelectorAll('ul.tabs li.tab').forEach(li => {
            const texto = li.innerText.trim().toUpperCase();

            if (
                texto.includes('VEÍCULOS') ||
                texto.includes('VINCULADOS') ||
                texto.includes('PREVIEW')
            ) {
                li.style.setProperty('display', 'none', 'important');
                li.remove();
            }
        });

        document.querySelectorAll('button').forEach(btn => {
            const texto = btn.innerText.trim().toUpperCase();

            if (texto === 'O.S.' || texto === 'SMS') {
                btn.style.setProperty('display', 'none', 'important');
                btn.remove();
            }
        });
    }

    ocultar();
    setInterval(ocultar, 500);
})();