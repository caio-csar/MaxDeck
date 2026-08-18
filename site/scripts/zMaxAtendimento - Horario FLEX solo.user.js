// ==UserScript==
// @name         zMaxAtendimento - Horario FLEX solo
// @namespace    http://tampermonkey.net/
// @version      1.2
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/zMaxAtendimento%20-%20Horario%20FLEX%20solo.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/zMaxAtendimento%20-%20Horario%20FLEX%20solo.user.js
// @match        http://externo.maxdatasistema.com.br/*
// @match        https://externo.maxdatasistema.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ID_ATENDIMENTO = "1081809";
    const URL_DESTINO = location.origin + "/Atendimentos/Atendimento/" + ID_ATENDIMENTO;
    const FLAG = "max_auto_em_atendimento";
    const BTN_ID = "btn-auto-em-atendimento";

    let executando = false;

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function elementoVisivel(el) {
        return !!(el && el.offsetParent !== null);
    }

    function clicarElemento(el) {
        if (!el) return;

        el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
        el.dispatchEvent(new MouseEvent("click", { bubbles: true }));

        if (typeof el.click === "function") {
            el.click();
        }
    }

    function marcarCheckbox(check) {
        if (!check) return;

        // Melhor do que forçar checked = true,
        // porque alguns sistemas só reconhecem a marcação pelo clique real.
        if (!check.checked) {
            check.click();
        }

        check.dispatchEvent(new Event("input", { bubbles: true }));
        check.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function criarBotaoHeader() {
        if (document.getElementById(BTN_ID)) return;

        const nav = document.querySelector(".nav-wrapper");
        if (!nav) return;

        const btn = document.createElement("button");
        btn.id = BTN_ID;
        btn.type = "button";
        btn.innerText = "Horario FLEX";

        Object.assign(btn.style, {
            position: "absolute",
            left: "50%",
            top: "4px",
            transform: "translateX(-50%)",
            zIndex: "9999",
            height: "46px",
            minWidth: "170px",
            padding: "0 24px",
            border: "none",
            borderRadius: "999px",
            background: "linear-gradient(135deg,#0f172a,#111827)",
            color: "#fff",
            fontWeight: "700",
            fontSize: "14px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            lineHeight: "1",
            textAlign: "center",
            cursor: "pointer",
            boxShadow: "0 4px 14px rgba(0,0,0,.30)"
        });

        btn.onclick = () => {
            localStorage.setItem(FLAG, "1");
            window.location.href = URL_DESTINO;
        };

        nav.style.position = "relative";
        nav.appendChild(btn);
    }

    async function executarAcao() {
        if (executando) return;
        if (localStorage.getItem(FLAG) !== "1") return;

        const estaNaTelaCerta = location.pathname.includes(
            "/Atendimentos/Atendimento/" + ID_ATENDIMENTO
        );

        if (!estaNaTelaCerta) return;

        executando = true;

        try {
            let check = null;
            let gravar = null;

            // Aguarda até 20 segundos a tela carregar de verdade
            for (let i = 0; i < 40; i++) {
                check = document.getElementById("EmAtendimento");
                gravar = document.getElementById("btnGravarOs");

                if (
                    check &&
                    gravar &&
                    elementoVisivel(gravar) &&
                    !gravar.disabled
                ) {
                    break;
                }

                await esperar(500);
            }

            if (!check || !gravar || gravar.disabled) {
                console.warn("Horario FLEX: elementos ainda não disponíveis.");
                executando = false;
                return;
            }

            // Marca "Em Atendimento"
            if (!check.checked) {
                marcarCheckbox(check);
                await esperar(800);
            }

            // Confere novamente antes de gravar
            if (!check.checked) {
                console.warn("Horario FLEX: checkbox não ficou marcado.");
                executando = false;
                return;
            }

            // Clica em gravar
            clicarElemento(gravar);

            // Só remove a flag depois de tentar gravar
            await esperar(1200);
            localStorage.removeItem(FLAG);

            console.log("Horario FLEX: ação executada.");

        } catch (e) {
            console.error("Erro no Horario FLEX:", e);
            executando = false;
        }
    }

    const observer = new MutationObserver(() => {
        criarBotaoHeader();
        executarAcao();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

    setInterval(() => {
        criarBotaoHeader();
        executarAcao();
    }, 1000);

    criarBotaoHeader();
    executarAcao();

})();