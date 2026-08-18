// ==UserScript==
// @name         TendiChat - Auto Abrir MAXDATA Suporte
// @namespace    http://tampermonkey.net/
// @version      1.1
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Auto%20Abrir%20MAXDATA%20Suporte.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Auto%20Abrir%20MAXDATA%20Suporte.user.js
// @description  Seleciona automaticamente MAXDATA e Suporte e clica em Abrir no TendiChat
// @author       Caio
// @match        *://*/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let jaExecutou = false;

    function dispararEventos(elemento) {
        elemento.dispatchEvent(new Event('input', { bubbles: true }));
        elemento.dispatchEvent(new Event('change', { bubbles: true }));
        elemento.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    function selecionarPorTexto(select, textoDesejado) {
        if (!select) return false;

        const option = Array.from(select.options).find(opt =>
            opt.textContent.trim().toLowerCase() === textoDesejado.toLowerCase()
        );

        if (!option) return false;

        if (select.value !== option.value) {
            select.value = option.value;
            dispararEventos(select);
        }

        return true;
    }

    function encontrarCampoPorLabel(textoLabel) {
        const labels = Array.from(document.querySelectorAll('label'));
        const label = labels.find(l =>
            l.textContent.trim().toLowerCase() === textoLabel.toLowerCase()
        );

        if (!label) return null;

        return label.parentElement?.querySelector('select') || null;
    }

    function clicarAbrir() {
        const botoes = Array.from(document.querySelectorAll('button[type="submit"], button'));
        const botaoAbrir = botoes.find(btn =>
            btn.textContent.trim().toLowerCase().includes('abrir')
        );

        if (!botaoAbrir) return false;

        botaoAbrir.click();
        return true;
    }

    function executarAutomacao() {
        if (jaExecutou) return;

        const selectConexao = encontrarCampoPorLabel('Conexão');
        const selectDepartamento = encontrarCampoPorLabel('Departamento');

        if (!selectConexao || !selectDepartamento) return;

        const okConexao = selecionarPorTexto(selectConexao, 'MAXDATA');
        const okDepartamento = selecionarPorTexto(selectDepartamento, 'Suporte');

        if (!okConexao || !okDepartamento) return;

        setTimeout(() => {
            const clicou = clicarAbrir();
            if (clicou) {
                jaExecutou = true;
                console.log('[TendiChat] MAXDATA + Suporte selecionados e botão Abrir clicado.');
            }
        }, 300);
    }

    const observer = new MutationObserver(() => {
        executarAutomacao();
    });

    function iniciar() {
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        executarAutomacao();
        setInterval(executarAutomacao, 1000);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', iniciar);
    } else {
        iniciar();
    }
})();