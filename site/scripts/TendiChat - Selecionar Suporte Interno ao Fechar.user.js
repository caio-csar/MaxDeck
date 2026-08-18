// ==UserScript==
// @name         TendiChat - Selecionar Suporte Interno ao Fechar
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Selecionar%20Suporte%20Interno%20ao%20Fechar.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Selecionar%20Suporte%20Interno%20ao%20Fechar.user.js
// @description  Seleciona automaticamente Interno/Suporte Interno ao clicar no botão Fechar
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TEXTO_BOTAO = 'Fechar';
    const TEXTO_OPCAO = 'Interno/Suporte Interno';

    let liberandoCliqueOriginal = false;

    function normalizar(texto) {
        return (texto || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function ehBotaoFechar(elemento) {
        const botao = elemento.closest('button');

        if (!botao) return null;

        const textoBotao = normalizar(botao.innerText);
        const textoEsperado = normalizar(TEXTO_BOTAO);

        if (textoBotao === textoEsperado && botao.classList.contains('bg-red-400')) {
            return botao;
        }

        return null;
    }

    function buscarDropdown() {
        const dropdowns = Array.from(document.querySelectorAll(
            'span.p-dropdown-label[role="combobox"], .p-dropdown-label[role="combobox"]'
        ));

        // Prioriza o dropdown que já tenha relação com o texto desejado
        const dropdownExato = dropdowns.find(el => {
            const texto = normalizar(el.innerText);
            const aria = normalizar(el.getAttribute('aria-label'));

            return texto === normalizar(TEXTO_OPCAO) || aria === normalizar(TEXTO_OPCAO);
        });

        if (dropdownExato) return dropdownExato;

        // Fallback: pega o primeiro dropdown encontrado
        return dropdowns[0] || null;
    }

    async function selecionarOpcaoDropdown() {
        const dropdownLabel = buscarDropdown();

        if (!dropdownLabel) {
            console.warn('Dropdown não encontrado.');
            return false;
        }

        const textoAtual = normalizar(dropdownLabel.innerText);
        const ariaAtual = normalizar(dropdownLabel.getAttribute('aria-label'));

        if (
            textoAtual === normalizar(TEXTO_OPCAO) ||
            ariaAtual === normalizar(TEXTO_OPCAO)
        ) {
            console.log('Opção já selecionada:', TEXTO_OPCAO);
            return true;
        }

        const containerDropdown = dropdownLabel.closest('.p-dropdown') || dropdownLabel;

        containerDropdown.click();

        await esperar(300);

        const opcoes = Array.from(document.querySelectorAll(
            'li[role="option"], .p-dropdown-item, [data-pc-section="item"]'
        ));

        const opcaoDesejada = opcoes.find(opcao => {
            return normalizar(opcao.innerText) === normalizar(TEXTO_OPCAO);
        });

        if (!opcaoDesejada) {
            console.warn('Opção não encontrada no dropdown:', TEXTO_OPCAO);
            return false;
        }

        opcaoDesejada.click();

        await esperar(300);

        console.log('Opção selecionada:', TEXTO_OPCAO);
        return true;
    }

    document.addEventListener('click', async function (event) {
        const botaoFechar = ehBotaoFechar(event.target);

        if (!botaoFechar) return;

        if (liberandoCliqueOriginal) return;

        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        await selecionarOpcaoDropdown();

        liberandoCliqueOriginal = true;

        setTimeout(() => {
            botaoFechar.click();

            setTimeout(() => {
                liberandoCliqueOriginal = false;
            }, 500);
        }, 200);

    }, true);

})();