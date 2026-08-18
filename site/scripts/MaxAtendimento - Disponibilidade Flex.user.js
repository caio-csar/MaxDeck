// ==UserScript==
// @name         MaxAtendimento - Disponibilidade Flex
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Disponibilidade%20Flex.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Disponibilidade%20Flex.user.js
// @match        http://externo.maxdatasistema.com.br/*
// @match        https://externo.maxdatasistema.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const WRAP_ID = "max-status-luz-wrap";
    const STYLE_ID = "max-status-luz-style";
    const STORAGE_STATUS = "max_status_luz_atual";

    const BTN_HORARIO_FLEX_ANTIGO = "btn-auto-em-atendimento";

    const STATUS = [
        {
            valor: "0",
            nome: "Disponível",
            classe: "verde",
            cor: "#22c55e"
        },
        {
            valor: "2",
            nome: "Plantão",
            classe: "amarelo",
            cor: "#facc15"
        },
        {
            valor: "1",
            nome: "Indisponível",
            classe: "vermelho",
            cor: "#ef4444"
        }
    ];

    let executando = false;

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function instalarEstilo() {
        if (document.getElementById(STYLE_ID)) return;

        const style = document.createElement("style");
        style.id = STYLE_ID;

        style.textContent = `
            #${BTN_HORARIO_FLEX_ANTIGO} {
                display: none !important;
            }

            #${WRAP_ID} {
                position: absolute;
                top: 7px;
                left: 50%;
                transform: translateX(-50%);
                z-index: 99999;
                height: 32px;
                padding: 0 11px;
                border: 1px solid rgba(255,255,255,.88);
                border-radius: 999px;
                background: rgba(255,255,255,.08);
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 11px;
                box-shadow:
                    0 2px 8px rgba(0,0,0,.18),
                    inset 0 0 8px rgba(255,255,255,.10);
                backdrop-filter: blur(3px);
            }

            #${WRAP_ID}.salvando {
                opacity: .72;
                pointer-events: none;
            }

            #${WRAP_ID}.erro {
                animation: maxStatusErro .35s ease-in-out 2;
                border-color: rgba(239,68,68,.95);
            }

            .max-status-luz-dot {
                width: 16px;
                height: 16px;
                min-width: 16px;
                min-height: 16px;
                padding: 0;
                margin: 0;
                border: none;
                border-radius: 50%;
                cursor: pointer;
                font-size: 0;
                line-height: 0;
                color: transparent;
                outline: none;
                opacity: .38;
                transform: scale(.92);
                transition:
                    opacity .18s ease,
                    transform .18s ease,
                    box-shadow .18s ease,
                    filter .18s ease;
                box-shadow:
                    inset 0 1px 3px rgba(255,255,255,.70),
                    inset 0 -2px 4px rgba(0,0,0,.35),
                    0 0 0 1px rgba(0,0,0,.20);
            }

            .max-status-luz-dot:hover {
                opacity: .85;
                transform: scale(1.04);
            }

            .max-status-luz-dot.ativo {
                opacity: 1;
                transform: scale(1.12);
                filter: brightness(1.18);
            }

            .max-status-luz-dot.verde {
                background: radial-gradient(circle at 35% 30%, #dcfce7 0%, #86efac 18%, #22c55e 48%, #15803d 100%);
            }

            .max-status-luz-dot.amarelo {
                background: radial-gradient(circle at 35% 30%, #fef9c3 0%, #fde047 20%, #facc15 48%, #ca8a04 100%);
            }

            .max-status-luz-dot.vermelho {
                background: radial-gradient(circle at 35% 30%, #fee2e2 0%, #fca5a5 18%, #ef4444 48%, #991b1b 100%);
            }

            .max-status-luz-dot.verde.ativo {
                box-shadow:
                    inset 0 1px 3px rgba(255,255,255,.85),
                    inset 0 -2px 4px rgba(0,0,0,.35),
                    0 0 7px 2px rgba(34,197,94,.85),
                    0 0 18px 5px rgba(34,197,94,.42);
            }

            .max-status-luz-dot.amarelo.ativo {
                box-shadow:
                    inset 0 1px 3px rgba(255,255,255,.85),
                    inset 0 -2px 4px rgba(0,0,0,.35),
                    0 0 7px 2px rgba(250,204,21,.90),
                    0 0 18px 5px rgba(250,204,21,.45);
            }

            .max-status-luz-dot.vermelho.ativo {
                box-shadow:
                    inset 0 1px 3px rgba(255,255,255,.85),
                    inset 0 -2px 4px rgba(0,0,0,.35),
                    0 0 7px 2px rgba(239,68,68,.92),
                    0 0 20px 6px rgba(239,68,68,.50);
            }

            @keyframes maxStatusErro {
                0% { transform: translateX(-50%) translateX(0); }
                25% { transform: translateX(-50%) translateX(-4px); }
                50% { transform: translateX(-50%) translateX(4px); }
                75% { transform: translateX(-50%) translateX(-3px); }
                100% { transform: translateX(-50%) translateX(0); }
            }
        `;

        document.head.appendChild(style);
    }

    function removerBotaoAntigo() {
        const antigo = document.getElementById(BTN_HORARIO_FLEX_ANTIGO);
        if (antigo) antigo.style.display = "none";
    }

    function getValorAtualSalvo() {
        return localStorage.getItem(STORAGE_STATUS) || "";
    }

    function setValorAtual(valor) {
        localStorage.setItem(STORAGE_STATUS, String(valor));

        const wrap = document.getElementById(WRAP_ID);
        if (!wrap) return;

        wrap.querySelectorAll(".max-status-luz-dot").forEach(btn => {
            btn.classList.toggle("ativo", btn.dataset.valor === String(valor));
        });
    }

    function criarBotao() {
        instalarEstilo();
        removerBotaoAntigo();

        const nav = document.querySelector(".nav-wrapper");
        if (!nav) return;

        nav.style.position = "relative";

        if (document.getElementById(WRAP_ID)) return;

        const wrap = document.createElement("div");
        wrap.id = WRAP_ID;

        STATUS.forEach(status => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "max-status-luz-dot " + status.classe;
            btn.dataset.valor = status.valor;
            btn.title = status.nome;
            btn.setAttribute("aria-label", status.nome);

            btn.onclick = () => alterarDisponibilidade(status.valor);

            wrap.appendChild(btn);
        });

        nav.appendChild(wrap);

        const atual = getValorAtualSalvo();
        if (atual) setValorAtual(atual);

        lerStatusDaTelaAtual();
    }

    function lerStatusDaTelaAtual() {
        const select = document.getElementById("Disponibilidade");
        if (!select) return;

        const valor = select.value;
        if (["0", "1", "2"].includes(valor)) {
            setValorAtual(valor);
        }
    }

    async function buscarStatusReal() {
        try {
            const resp = await fetch(location.origin + "/Atendimentos/meus-atendimentos", {
                method: "GET",
                credentials: "same-origin",
                cache: "no-store"
            });

            if (!resp.ok) return;

            const html = await resp.text();
            const doc = new DOMParser().parseFromString(html, "text/html");
            const select = doc.getElementById("Disponibilidade");

            if (!select) return;

            const valor = select.value;

            if (["0", "1", "2"].includes(valor)) {
                setValorAtual(valor);
            }
        } catch (e) {
            console.warn("Status Luz: não foi possível buscar status real.", e);
        }
    }

    async function alterarDisponibilidade(valor) {
        if (executando) return;

        const anterior = getValorAtualSalvo();
        const wrap = document.getElementById(WRAP_ID);

        executando = true;

        if (wrap) {
            wrap.classList.remove("erro");
            wrap.classList.add("salvando");
        }

        setValorAtual(valor);

        try {
            const url = location.origin + "/Atendimentos/meus-atendimentos/disponibilidade/" + valor;

            const resp = await fetch(url, {
                method: "POST",
                credentials: "same-origin",
                headers: {
                    "X-Requested-With": "XMLHttpRequest"
                }
            });

            if (!resp.ok) {
                throw new Error("HTTP " + resp.status);
            }

            setValorAtual(valor);

            console.log("Status Luz: disponibilidade alterada para", valor);

        } catch (e) {
            console.error("Status Luz: erro ao alterar disponibilidade.", e);

            if (anterior) setValorAtual(anterior);

            if (wrap) {
                wrap.classList.add("erro");
                await esperar(800);
                wrap.classList.remove("erro");
            }
        } finally {
            if (wrap) {
                wrap.classList.remove("salvando");
            }

            executando = false;
        }
    }

    const observer = new MutationObserver(() => {
        criarBotao();
        removerBotaoAntigo();
        lerStatusDaTelaAtual();
    });

    function iniciar() {
        if (!document.body) {
            setTimeout(iniciar, 300);
            return;
        }

        criarBotao();

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        setInterval(() => {
            criarBotao();
            removerBotaoAntigo();
            lerStatusDaTelaAtual();
        }, 1000);

        buscarStatusReal();
    }

    iniciar();

})();