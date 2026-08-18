// ==UserScript==
// @name         Tipo Suporte Interno
// @namespace    http://tampermonkey.net/
// @version      1.2
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Tipo%20Suporte%20Interno.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Tipo%20Suporte%20Interno.user.js
// @match        http://externo.maxdatasistema.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TEXTO_SUPORTE = 'INTERNO/SUPORTE INTERNO';
    const PRIORIDADE_FECHAR = '6';

    function disparar(el, tipo) {
        el.dispatchEvent(new Event(tipo, { bubbles: true }));
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function aplicarVisual(label) {
        label.style.cursor = 'pointer';
        label.style.userSelect = 'none';
        label.style.transition = 'all .15s ease';
        label.style.border = '1px solid #d9534f';
        label.style.borderRadius = '4px';
        label.style.background = '';
        label.style.color = '';
        label.style.fontWeight = 'normal';
        label.title = 'Clique para marcar como suporte interno e fechar';

        label.addEventListener('mouseenter', () => {
            label.style.background = '#f8d7da';
            label.style.color = '#a94442';
        });

        label.addEventListener('mouseleave', () => {
            label.style.background = '';
            label.style.color = '';
        });

        label.addEventListener('mousedown', () => {
            label.style.transform = 'scale(0.97)';
        });

        label.addEventListener('mouseup', () => {
            label.style.transform = 'scale(1)';
        });
    }

    async function selecionarTipoSuporte() {
        const campo = document.getElementById('TipoSuporteDesc');
        if (!campo) return;

        campo.focus();
        campo.value = '';

        disparar(campo, 'input');
        disparar(campo, 'keyup');

        await delay(120);

        campo.value = 'SUPORT';

        disparar(campo, 'input');
        disparar(campo, 'keydown');
        disparar(campo, 'keyup');

        await delay(500);

        const opcoes = Array.from(document.querySelectorAll(
            '.ui-menu-item, .ui-menu-item-wrapper, .tt-suggestion, li, div'
        ));

        const opcao = opcoes.find(el =>
            el.innerText &&
            el.innerText.trim().toUpperCase() === TEXTO_SUPORTE
        );

        if (opcao) {
            opcao.click();
        }

        await delay(150);

        campo.value = TEXTO_SUPORTE;
        disparar(campo, 'input');
        disparar(campo, 'change');
        campo.blur();
    }

    function setarPrioridadeFechar() {
        const prioridade = document.getElementById('vedAtendPrioridade');
        if (!prioridade) return;

        prioridade.value = PRIORIDADE_FECHAR;
        disparar(prioridade, 'change');
    }

    function configurarLabel() {
        const label = document.querySelector(
            'label.input-group-addon.red-text.active[for="TipoSuporteDesc"]'
        );

        if (!label || label.dataset.internoConfigurado) return;

        label.dataset.internoConfigurado = '1';

        aplicarVisual(label);

        label.addEventListener('click', async function (e) {
            e.preventDefault();
            e.stopPropagation();

            await selecionarTipoSuporte();
            setarPrioridadeFechar();
        });
    }

    setInterval(configurarLabel, 1000);
})();