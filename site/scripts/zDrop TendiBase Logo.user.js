// ==UserScript==
// @name         zDrop TendiBase Logo
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/zDrop%20TendiBase%20Logo.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/zDrop%20TendiBase%20Logo.user.js
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    function trocarLogo() {
        const logo = document.querySelector('img[src="/images/tendichat.png"], img[src*="tendichat.png"]');

        if (!logo) return;

        const novaLogo = document.createElement("div");
        novaLogo.id = "drop-tendibase-logo";

        novaLogo.innerHTML = `
            <span class="Gustavo">Drop</span>
            <span class=" o ">Tendi</span><span class="Tchola">Base</span>
        `;

        Object.assign(novaLogo.style, {
            fontFamily: '"Segoe UI", Arial, sans-serif',
            fontSize: "22px",
            letterSpacing: "-0.8px",
            display: "inline-flex",
            alignItems: "center",
            padding: "4px 8px",
            borderRadius: "10px",
            background: "transparent",
            cursor: "default",
            fontWeight: "900",
            whiteSpace: "nowrap"
        });

        const style = document.createElement("style");
        style.textContent = `
            #drop-tendibase-logo .drop {
                color: #111827;
                margin-right: 4px;
            }

            #drop-tendibase-logo .tendi {
                color: #111827;
            }

            #drop-tendibase-logo .base {
                color: #f97316;
            }
        `;

        if (!document.getElementById("drop-tendibase-logo-style")) {
            style.id = "drop-tendibase-logo-style";
            document.head.appendChild(style);
        }

        logo.replaceWith(novaLogo);
    }

    setInterval(trocarLogo, 1000);
})();