// ==UserScript==
// @name         TendiChat - Saudação Automática
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Sauda%C3%A7%C3%A3o%20Autom%C3%A1tica.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Sauda%C3%A7%C3%A3o%20Autom%C3%A1tica.user.js
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function saudacaoPorHorario() {
        const hora = new Date().getHours();

        if (hora >= 5 && hora < 12) {
            return "Bom dia";
        }

        if (hora >= 12 && hora < 18) {
            return "Boa tarde";
        }

        return "Boa noite";
    }

    function mensagemSaudacao() {
        return `${saudacaoPorHorario()}! Como posso ajudar?`;
    }

    function acharCampoMensagem() {
        return document.querySelector('textarea[placeholder="Mensagem..."]');
    }

    function preencherEEnviar() {
        const campo = acharCampoMensagem();

        if (!campo) {
            alert("Campo de mensagem não encontrado.");
            return;
        }

        if (campo.disabled) {
            alert("Campo de mensagem está desabilitado.");
            return;
        }

        campo.focus();
        campo.value = mensagemSaudacao();

        campo.dispatchEvent(new Event("input", { bubbles: true }));
        campo.dispatchEvent(new Event("change", { bubbles: true }));

        setTimeout(() => {
            campo.dispatchEvent(new KeyboardEvent("keydown", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));

            campo.dispatchEvent(new KeyboardEvent("keyup", {
                key: "Enter",
                code: "Enter",
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
        }, 150);
    }

    function localizarBotaoWhatsapp() {
        const campo = acharCampoMensagem();
        if (!campo) return null;

        const barra = campo.closest("article");
        if (!barra) return null;

        const icones = [...barra.querySelectorAll("svg.iconify--ic")];

        return icones.find(svg => {
            const path = svg.querySelector("path");
            return path && path.getAttribute("d")?.includes("19.05 4.91");
        });
    }

    function aplicar() {
        const svg = localizarBotaoWhatsapp();
        if (!svg) return;

        const botao = svg.closest("span");
        if (!botao) return;

        if (botao.dataset.saudacaoAuto === "1") return;

        botao.dataset.saudacaoAuto = "1";
        botao.title = "Enviar saudação automática";
        botao.style.color = "#16a34a";

        botao.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            preencherEEnviar();
        }, true);
    }

    setInterval(aplicar, 800);

})();