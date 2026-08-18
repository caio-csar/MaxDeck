// ==UserScript==
// @name         TendiChat - Atendente e Setor Padrão
// @namespace    http://tampermonkey.net/
// @version      1.5
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Atendente%20e%20Setor%20Padr%C3%A3o.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Atendente%20e%20Setor%20Padr%C3%A3o.user.js
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const MEU_NOME = "Caio";
    const SETOR_PADRAO = "Suporte";
    const MAX_SUGESTOES = 10;

    function normalizarNome(texto) {
        return (texto || "")
            .replace(/[🟢🔴]/g, "")
            .trim()
            .toLowerCase()
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "");
    }

    function nomeLimpo(texto) {
        return (texto || "")
            .replace(/[🟢🔴]/g, "")
            .replace(/\s+/g, " ")
            .trim();
    }

    function dispararEventos(el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function selecionarAtendente(select, option, manual = false) {
        if (!select || !option) return;

        if (manual) {
            select.dataset.usuarioAlterouAtendente = "1";
        }

        select.value = option.value;
        dispararEventos(select);
    }

    function ordenarSelect(select) {
        if (!select || select.dataset.ordenadoAtendentes === "1") return;

        const options = Array.from(select.options);

        if (options.length < 5) return;

        const primeira = options.find(o =>
            normalizarNome(o.textContent).includes("nao definido")
        );

        const demais = options
            .filter(o => o !== primeira)
            .sort((a, b) =>
                normalizarNome(a.textContent).localeCompare(
                    normalizarNome(b.textContent),
                    "pt-BR"
                )
            );

        select.innerHTML = "";

        if (primeira) select.appendChild(primeira);
        demais.forEach(o => select.appendChild(o));

        select.dataset.ordenadoAtendentes = "1";
    }

    function encontrarSelectAtendentes() {
        const selects = Array.from(document.querySelectorAll("select"));

        return selects.find(sel => {
            const textos = Array.from(sel.options).map(o => o.textContent || "");

            return textos.some(t => t.includes("Caio")) &&
                   textos.some(t => t.includes("Matheus")) &&
                   textos.some(t => t.includes("Artur"));
        });
    }

    function aplicarSetorPadrao() {
        const selectSetor = document.querySelector("#menu-hierarquico");
        if (!selectSetor) return;

        if (selectSetor.value) return;

        const optSuporte = Array.from(selectSetor.options).find(opt =>
            normalizarNome(opt.textContent) === normalizarNome(SETOR_PADRAO)
        );

        if (!optSuporte) return;

        selectSetor.value = optSuporte.value;
        dispararEventos(selectSetor);
    }

    function aplicarAtendentePadrao(select) {
        if (!select) return;

        if (select.dataset.usuarioAlterouAtendente === "1") return;

        const optAtual = Array.from(select.options).find(o => o.value === select.value);
        const textoAtual = normalizarNome(optAtual ? optAtual.textContent : "");

        const estaVazioOuNaoDefinido =
            !select.value ||
            textoAtual.includes("nao definido") ||
            textoAtual.includes("selecionar");

        if (!estaVazioOuNaoDefinido) return;

        const optMeuNome = Array.from(select.options).find(o =>
            normalizarNome(o.textContent) === normalizarNome(MEU_NOME)
        );

        if (!optMeuNome) return;

        selecionarAtendente(select, optMeuNome, false);
    }

    function prepararLinha(select) {
        const container =
            select.closest(".relative") ||
            select.parentElement;

        if (!container || !container.parentElement) return null;

        const linha = container.parentElement;

        Object.assign(linha.style, {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flexWrap: "nowrap"
        });

        return {
            container,
            linha
        };
    }

    function criarComboBusca(select) {
        if (!select || select.dataset.comboBuscaCriado === "1") return;

        const estrutura = prepararLinha(select);
        if (!estrutura) return;

        const { container } = estrutura;

        select.dataset.comboBuscaCriado = "1";
        select.style.display = "none";

        const wrapper = document.createElement("div");
        wrapper.id = "combo-busca-atendente-tendichat";

        Object.assign(wrapper.style, {
            position: "relative",
            width: "240px",
            maxWidth: "240px",
            minWidth: "200px",
            display: "inline-block",
            flex: "0 0 auto",
            zIndex: "999998"
        });

        const input = document.createElement("input");
        input.type = "text";
        input.placeholder = "Selecionar atendente...";
        input.autocomplete = "off";

        Object.assign(input.style, {
            width: "100%",
            height: "36px",
            padding: "0 34px 0 10px",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            background: "#ffffff",
            color: "#0f172a",
            fontSize: "12px",
            fontWeight: "700",
            outline: "none",
            boxSizing: "border-box",
            cursor: "text"
        });

        const seta = document.createElement("span");
        seta.innerText = "▾";

        Object.assign(seta.style, {
            position: "absolute",
            right: "11px",
            top: "8px",
            color: "#475569",
            fontSize: "14px",
            pointerEvents: "none"
        });

        const lista = document.createElement("div");

        Object.assign(lista.style, {
            position: "absolute",
            top: "40px",
            left: "0",
            width: "100%",
            maxHeight: "260px",
            overflowY: "auto",
            background: "#ffffff",
            border: "1px solid #cbd5e1",
            borderRadius: "10px",
            boxShadow: "0 10px 25px rgba(15,23,42,.18)",
            zIndex: "999999",
            display: "none",
            padding: "4px",
            boxSizing: "border-box"
        });

        let sugestoes = [];
        let indiceSelecionado = -1;

        function optionSelecionadaAtual() {
            return Array.from(select.options).find(o => o.value === select.value);
        }

        function atualizarTextoAtual() {
            const atual = optionSelecionadaAtual();

            if (atual) {
                input.value = nomeLimpo(atual.textContent);
            }
        }

        function fecharLista() {
            lista.style.display = "none";
            indiceSelecionado = -1;
        }

        function abrirLista() {
            lista.style.display = "block";
        }

        function destacarItem() {
            const itens = Array.from(lista.querySelectorAll("button"));

            itens.forEach((item, index) => {
                if (index === indiceSelecionado) {
                    item.style.background = "#e2e8f0";
                    item.scrollIntoView({ block: "nearest" });
                } else {
                    item.style.background = "#ffffff";
                }
            });
        }

        function obterSugestoes() {
            const termo = normalizarNome(input.value);
            const options = Array.from(select.options);

            if (!termo) {
                return options
                    .filter(opt => nomeLimpo(opt.textContent))
                    .slice(0, MAX_SUGESTOES);
            }

            return options
                .filter(opt => {
                    const texto = normalizarNome(opt.textContent);
                    return texto.startsWith(termo);
                })
                .slice(0, MAX_SUGESTOES);
        }

        function renderizarSugestoes() {
            lista.innerHTML = "";
            sugestoes = obterSugestoes();
            indiceSelecionado = -1;

            if (!sugestoes.length) {
                const vazio = document.createElement("div");
                vazio.innerText = "Nenhum atendente encontrado";

                Object.assign(vazio.style, {
                    padding: "8px 10px",
                    color: "#64748b",
                    fontSize: "12px",
                    fontWeight: "600"
                });

                lista.appendChild(vazio);
                abrirLista();
                return;
            }

            sugestoes.forEach((opt, index) => {
                const item = document.createElement("button");
                item.type = "button";
                item.innerText = nomeLimpo(opt.textContent);

                Object.assign(item.style, {
                    display: "block",
                    width: "100%",
                    textAlign: "left",
                    padding: "8px 10px",
                    border: "none",
                    borderRadius: "8px",
                    background: "#ffffff",
                    color: "#0f172a",
                    fontSize: "12px",
                    fontWeight: "700",
                    cursor: "pointer"
                });

                item.onmouseenter = () => {
                    indiceSelecionado = index;
                    destacarItem();
                };

                item.onclick = () => {
                    selecionarAtendente(select, opt, true);
                    input.value = nomeLimpo(opt.textContent);
                    fecharLista();
                };

                lista.appendChild(item);
            });

            abrirLista();
        }

        input.addEventListener("focus", () => {
            input.select();
            renderizarSugestoes();
        });

        input.addEventListener("input", () => {
            renderizarSugestoes();
        });

        input.addEventListener("keydown", (e) => {
            if (e.key === "ArrowDown") {
                e.preventDefault();

                if (lista.style.display === "none") {
                    renderizarSugestoes();
                }

                if (!sugestoes.length) return;

                indiceSelecionado++;

                if (indiceSelecionado >= sugestoes.length) {
                    indiceSelecionado = 0;
                }

                destacarItem();
                return;
            }

            if (e.key === "ArrowUp") {
                e.preventDefault();

                if (!sugestoes.length) return;

                indiceSelecionado--;

                if (indiceSelecionado < 0) {
                    indiceSelecionado = sugestoes.length - 1;
                }

                destacarItem();
                return;
            }

            if (e.key === "Enter") {
                e.preventDefault();

                let opt = null;

                if (indiceSelecionado >= 0 && sugestoes[indiceSelecionado]) {
                    opt = sugestoes[indiceSelecionado];
                } else if (sugestoes.length === 1) {
                    opt = sugestoes[0];
                }

                if (opt) {
                    selecionarAtendente(select, opt, true);
                    input.value = nomeLimpo(opt.textContent);
                    fecharLista();
                }

                return;
            }

            if (e.key === "Escape") {
                fecharLista();
                atualizarTextoAtual();
                input.blur();
            }
        });

        document.addEventListener("click", (e) => {
            if (!wrapper.contains(e.target)) {
                fecharLista();
                atualizarTextoAtual();
            }
        });

        select.addEventListener("change", atualizarTextoAtual);

        wrapper.appendChild(input);
        wrapper.appendChild(seta);
        wrapper.appendChild(lista);

        container.appendChild(wrapper);

        atualizarTextoAtual();
    }

    function aplicar() {
        aplicarSetorPadrao();

        const select = encontrarSelectAtendentes();
        if (!select) return;

        ordenarSelect(select);
        aplicarAtendentePadrao(select);
        criarComboBusca(select);
    }

    setInterval(aplicar, 800);
})();