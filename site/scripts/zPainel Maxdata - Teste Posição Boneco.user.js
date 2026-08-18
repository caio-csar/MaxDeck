// ==UserScript==
// @name         zPainel Maxdata - Teste Posição Boneco
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/zPainel%20Maxdata%20-%20Teste%20Posi%C3%A7%C3%A3o%20Boneco.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/zPainel%20Maxdata%20-%20Teste%20Posi%C3%A7%C3%A3o%20Boneco.user.js
// @description  Mostra uma barra vertical onde o boneco ficaria no painel de atendimentos pendentes
// @match        https://painel.maxdata.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const SELETOR_PAINEL = '#pending_so';

    function inserirEstilo() {
        if (document.getElementById('testeBonecoCSS')) return;

        const style = document.createElement('style');
        style.id = 'testeBonecoCSS';

        style.textContent = `
            #teste-posicao-boneco {
                width: 100%;
                height: 95px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: flex-start;
                margin-top: 10px;
                pointer-events: none;
            }

            #teste-posicao-boneco .barra-boneco {
                width: 10px;
                height: 70px;
                border-radius: 10px;
                background: red;
                box-shadow: 0 0 14px red;
            }

            #teste-posicao-boneco .texto-boneco {
                margin-top: 6px;
                font-size: 11px;
                font-weight: bold;
                color: white;
                text-shadow: 0 0 6px black;
                letter-spacing: 1px;
            }
        `;

        document.head.appendChild(style);
    }

    function inserirMarcador() {
        const painel = document.querySelector(SELETOR_PAINEL);
        if (!painel) return;

        if (document.getElementById('teste-posicao-boneco')) return;

        const marcador = document.createElement('div');
        marcador.id = 'teste-posicao-boneco';

        marcador.innerHTML = `
            <div class="barra-boneco"></div>
            <div class="texto-boneco">BONECO AQUI</div>
        `;

        painel.insertAdjacentElement('afterend', marcador);
    }

    function iniciar() {
        inserirEstilo();
        inserirMarcador();

        const observer = new MutationObserver(() => {
            inserirMarcador();
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    setTimeout(iniciar, 1000);
})();