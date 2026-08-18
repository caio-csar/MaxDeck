// ==UserScript==
// @name         MaxAtendimento - Botao Contato Simples
// @namespace    http://tampermonkey.net/
// @version      1.7
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Botao%20Contato%20Simples.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Botao%20Contato%20Simples.user.js
// @match        *://externo.maxdatasistema.com.br/Atendimentos/Atendimento*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function copiar(texto) {
        const area = document.createElement("textarea");
        area.value = texto;
        area.style.position = "fixed";
        area.style.top = "-9999px";
        document.body.appendChild(area);
        area.focus();
        area.select();
        document.execCommand("copy");
        area.remove();
    }

    function limparNumero(texto) {
        let num = (texto || "").replace(/\D/g, "");

        if (num.startsWith("55") && num.length > 11) {
            num = num.slice(2);
        }

        if (num.length > 11) {
            num = num.slice(-11);
        }

        return num;
    }

    function extrairNome(texto) {
        let nome = (texto || "")
            .replace(/\+?55/g, "")
            .replace(/\(?\d{2}\)?[\s.-]?\d{4,5}[\s.-]?\d{4}/g, "")
            .replace(/\d+/g, "")
            .replace(/[:\-–—()]+/g, " ")
            .replace(/\s+/g, " ")
            .trim();

        return nome;
    }

    function formatar(num) {
        if (num.length === 11) {
            return `(${num.slice(0, 2)}) ${num.slice(2, 7)}-${num.slice(7)}`;
        }

        if (num.length === 10) {
            return `(${num.slice(0, 2)}) ${num.slice(2, 6)}-${num.slice(6)}`;
        }

        return num;
    }

    function aplicar() {
        const input = document.getElementById("vedAtendContato");
        const label = document.querySelector('label[for="vedAtendContato"]');

        if (!input || !label) return;
        if (label.dataset.contatoBotao === "1") return;

        label.dataset.contatoBotao = "1";
        label.innerText = "Contato";
        label.title = "Clique para alternar e copiar telefone";

        Object.assign(label.style, {
            cursor: "pointer",
            userSelect: "none",
            background: "#111827",
            color: "#ffffff",
            border: "1px solid #374151",
            fontWeight: "bold"
        });

        let formatado = false;

        label.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();

            const valorAtual = input.value || "";

            const nome = extrairNome(valorAtual);
            const numero = limparNumero(valorAtual);

            if (!numero) return;

            formatado = !formatado;

            const telefone = formatado ? formatar(numero) : numero;

            input.value = nome
                ? `${nome}: ${telefone}`
                : telefone;

            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));

            copiar(telefone);
        });
    }

    aplicar();
})();