// ==UserScript==
// @name         zZZ_MaxAtendimento - Horario FLEX
// @namespace    http://tampermonkey.net/
// @version      1.3
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/zZZ_MaxAtendimento%20-%20Horario%20FLEX.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/zZZ_MaxAtendimento%20-%20Horario%20FLEX.user.js
// @match        http://externo.maxdatasistema.com.br/*
// @match        https://externo.maxdatasistema.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /*
        BOTÃO ORIGINAL:
        Marca você na OS fixa abaixo.
    */
    const ID_ATENDIMENTO = "1081809";

    /*
        ANALISTAS:
        Cada botão flutuante vai marcar "Em Atendimento"
        na OS correspondente ao analista.
    */
    const ANALISTAS = [
        {
            nome: "Marcio Henrique",
            id: "1060531"
        },
        {
            nome: "Derek",
            id: "1053388"
        },
        {
            nome: "João Gomes",
            id: "1049186"
        },
        {
            nome: "Gustavo",
            id: "1053385"
        },
        {
            nome: "Elias",
            id: "1051529"
        },
        {
            nome: "Hugo",
            id: "1066701"
        },
        {
            nome: "Matheus",
            id: "1056859"
        },
        {
            nome: "Lucas Miranda",
            id: "1062318"
        },
        {
            nome: "Felipe",
            id: "1052658"
        }
    ];

    const FLAG = "max_auto_em_atendimento";
    const TARGET_ID = "max_auto_em_atendimento_id";

    const BTN_ID = "btn-auto-em-atendimento";
    const BTN_ANALISTAS_ID = "btn-auto-em-atendimento-analistas";
    const PAINEL_ANALISTAS_ID = "painel-auto-em-atendimento-analistas";

    let executando = false;

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getUrlAtendimento(id) {
        return location.origin + "/Atendimentos/Atendimento/" + id;
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

        if (!check.checked) {
            check.click();
        }

        check.dispatchEvent(new Event("input", { bubbles: true }));
        check.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function iniciarMarcacao(idAtendimento) {
        localStorage.setItem(FLAG, "1");
        localStorage.setItem(TARGET_ID, idAtendimento);
        window.location.href = getUrlAtendimento(idAtendimento);
    }

    function aplicarEstiloBotaoPrincipal(btn) {
        Object.assign(btn.style, {
            position: "absolute",
            top: "4px",
            zIndex: "9999",
            height: "46px",
            minWidth: "170px",
            padding: "0 24px",
            border: "none",
            borderRadius: "999px",
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
    }

    function criarBotaoHeader() {
        const nav = document.querySelector(".nav-wrapper");
        if (!nav) return;

        nav.style.position = "relative";

        if (!document.getElementById(BTN_ID)) {
            const btn = document.createElement("button");
            btn.id = BTN_ID;
            btn.type = "button";
            btn.innerText = "Horario FLEX";

            aplicarEstiloBotaoPrincipal(btn);

            Object.assign(btn.style, {
                left: "50%",
                transform: "translateX(-50%)",
                background: "linear-gradient(135deg,#0f172a,#111827)"
            });

            btn.onclick = () => {
                iniciarMarcacao(ID_ATENDIMENTO);
            };

            nav.appendChild(btn);
        }

        if (!document.getElementById(BTN_ANALISTAS_ID)) {
            const btnAnalistas = document.createElement("button");
            btnAnalistas.id = BTN_ANALISTAS_ID;
            btnAnalistas.type = "button";
            btnAnalistas.innerText = "Analistas FLEX";

            aplicarEstiloBotaoPrincipal(btnAnalistas);

            Object.assign(btnAnalistas.style, {
                left: "calc(50% + 190px)",
                transform: "translateX(-50%)",
                background: "linear-gradient(135deg,#1d4ed8,#2563eb)"
            });

            btnAnalistas.onclick = () => {
                alternarPainelAnalistas();
            };

            nav.appendChild(btnAnalistas);
        }
    }

    function alternarPainelAnalistas() {
        const painelExistente = document.getElementById(PAINEL_ANALISTAS_ID);

        if (painelExistente) {
            painelExistente.remove();
            return;
        }

        criarPainelAnalistas();
    }

    function criarPainelAnalistas() {
        const painel = document.createElement("div");
        painel.id = PAINEL_ANALISTAS_ID;

        Object.assign(painel.style, {
            position: "fixed",
            top: "82px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "99999",
            width: "calc(100vw - 40px)",
            maxWidth: "760px",
            padding: "16px",
            borderRadius: "20px",
            background: "rgba(15,23,42,.94)",
            boxShadow: "0 12px 40px rgba(0,0,0,.45)",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: "12px",
            backdropFilter: "blur(8px)"
        });

        const titulo = document.createElement("div");
        titulo.innerText = "Selecionar analista";
        Object.assign(titulo.style, {
            gridColumn: "1 / -1",
            color: "#fff",
            fontWeight: "800",
            fontSize: "16px",
            textAlign: "center",
            marginBottom: "4px"
        });
        painel.appendChild(titulo);

        ANALISTAS.forEach(analista => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.innerText = analista.nome;

            Object.assign(btn.style, {
                height: "48px",
                border: "none",
                borderRadius: "14px",
                background: "linear-gradient(135deg,#f8fafc,#e5e7eb)",
                color: "#0f172a",
                fontWeight: "800",
                fontSize: "14px",
                cursor: "pointer",
                boxShadow: "0 4px 12px rgba(0,0,0,.25)"
            });

            btn.onmouseenter = () => {
                btn.style.transform = "scale(1.03)";
            };

            btn.onmouseleave = () => {
                btn.style.transform = "scale(1)";
            };

            btn.onclick = () => {
                painel.remove();
                iniciarMarcacao(analista.id);
            };

            painel.appendChild(btn);
        });

        const btnFechar = document.createElement("button");
        btnFechar.type = "button";
        btnFechar.innerText = "Fechar";

        Object.assign(btnFechar.style, {
            gridColumn: "1 / -1",
            height: "42px",
            border: "none",
            borderRadius: "14px",
            background: "linear-gradient(135deg,#7f1d1d,#991b1b)",
            color: "#fff",
            fontWeight: "800",
            fontSize: "14px",
            cursor: "pointer",
            marginTop: "4px"
        });

        btnFechar.onclick = () => {
            painel.remove();
        };

        painel.appendChild(btnFechar);
        document.body.appendChild(painel);
    }

    async function executarAcao() {
        if (executando) return;
        if (localStorage.getItem(FLAG) !== "1") return;

        const idDestino = localStorage.getItem(TARGET_ID) || ID_ATENDIMENTO;

        const estaNaTelaCerta = location.pathname.includes(
            "/Atendimentos/Atendimento/" + idDestino
        );

        if (!estaNaTelaCerta) return;

        executando = true;

        try {
            let check = null;
            let gravar = null;

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

            if (!check.checked) {
                marcarCheckbox(check);
                await esperar(800);
            }

            if (!check.checked) {
                console.warn("Horario FLEX: checkbox não ficou marcado.");
                executando = false;
                return;
            }

            clicarElemento(gravar);

            await esperar(1200);

            localStorage.removeItem(FLAG);
            localStorage.removeItem(TARGET_ID);

            console.log("Horario FLEX: ação executada na OS " + idDestino + ".");

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