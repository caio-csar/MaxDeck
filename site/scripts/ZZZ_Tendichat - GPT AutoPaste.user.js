// ==UserScript==
// @name         ZZZ_Tendichat - GPT AutoPaste
// @namespace    http://tampermonkey.net/
// @version      2.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/ZZZ_Tendichat%20-%20GPT%20AutoPaste.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/ZZZ_Tendichat%20-%20GPT%20AutoPaste.user.js
// @description  Cola prompt pela URL, envia automaticamente, aguarda resposta e copia relato com TÍTULO_OS.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /************************************************************
     * CONFIGURAÇÕES
     ************************************************************/
    const CONFIG = {
        MARCADOR_RELATO: "TÍTULO_OS:",
        TEMPO_INICIAL_MS: 1800,
        TEMPO_MAX_CAMPO_MS: 45000,
        TEMPO_MAX_ENVIO_MS: 18000,
        TEMPO_MAX_RESPOSTA_MS: 180000,
        INTERVALO_MONITOR_MS: 1000,
        CICLOS_TEXTO_ESTAVEL: 3,
        COPIAR_APENAS_COM_MARCADOR: true,
        LIMPAR_URL_APOS_COLAR: true,
        DEBUG: true
    };

    /************************************************************
     * CONTROLE INTERNO
     ************************************************************/
    if (window.__TENDICHAT_AUTOPASTE_PRO_ATIVO__) {
        console.log("[TendiChat PRO] Script já estava ativo. Ignorando nova execução.");
        return;
    }

    window.__TENDICHAT_AUTOPASTE_PRO_ATIVO__ = true;

    let promptEnviadoPorScript = false;
    let relatoJaCopiado = false;
    let quantidadeAssistenteAntes = 0;

    /************************************************************
     * UTILITÁRIOS
     ************************************************************/
    function log(...args) {
        if (CONFIG.DEBUG) {
            console.log("[TendiChat PRO]", ...args);
        }
    }

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function estaVisivel(el) {
        if (!el) return false;

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);

        return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
        );
    }

    function dispararInput(el, texto = "") {
        try {
            el.dispatchEvent(new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                inputType: "insertText",
                data: texto
            }));
        } catch {
            el.dispatchEvent(new Event("input", { bubbles: true }));
        }

        el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function mostrarAviso(msg, tipo = "ok") {
        const antigo = document.getElementById("tendichat-copy-toast");
        if (antigo) antigo.remove();

        const cores = {
            ok: "#16a34a",
            erro: "#dc2626",
            aviso: "#ca8a04",
            info: "#2563eb"
        };

        const box = document.createElement("div");
        box.id = "tendichat-copy-toast";
        box.innerText = msg;

        Object.assign(box.style, {
            position: "fixed",
            top: "22px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "9999999",
            background: cores[tipo] || cores.info,
            color: "#fff",
            padding: "12px 18px",
            borderRadius: "12px",
            fontFamily: "Arial, sans-serif",
            fontSize: "14px",
            fontWeight: "bold",
            boxShadow: "0 8px 30px rgba(0,0,0,.35)",
            opacity: "1",
            transition: "opacity .8s ease",
            maxWidth: "90vw",
            textAlign: "center",
            whiteSpace: "pre-wrap"
        });

        document.body.appendChild(box);

        setTimeout(() => {
            box.style.opacity = "0";
            setTimeout(() => box.remove(), 900);
        }, 2300);
    }

    /************************************************************
     * CAPTURA DO PROMPT PELA URL
     *
     * Aceita:
     * https://chatgpt.com/#PROMPT
     * https://chatgpt.com/#prompt=PROMPT
     * https://chatgpt.com/?prompt=PROMPT
     ************************************************************/
    function decodificarSeguro(valor) {
        if (!valor) return "";

        try {
            return decodeURIComponent(valor);
        } catch {
            return valor;
        }
    }

    function pegarPromptDaUrl() {
        let prompt = "";

        if (location.hash) {
            const hashBruto = location.hash.substring(1);
            const hashDecodificado = decodificarSeguro(hashBruto);

            if (hashDecodificado.startsWith("prompt=")) {
                const paramsHash = new URLSearchParams(hashDecodificado);
                prompt = paramsHash.get("prompt") || "";
            } else {
                prompt = hashDecodificado;
            }
        }

        if (!prompt) {
            const params = new URLSearchParams(location.search);
            prompt =
                params.get("prompt") ||
                params.get("q") ||
                params.get("texto") ||
                "";
        }

        return (prompt || "").trim();
    }

    function limparUrl() {
        if (!CONFIG.LIMPAR_URL_APOS_COLAR) return;

        const novaUrl = location.origin + location.pathname + location.search.replace(/[?&](prompt|q|texto)=[^&]*/gi, "");
        history.replaceState(null, "", novaUrl);
    }

    /************************************************************
     * CAMPO DO CHATGPT
     ************************************************************/
    async function esperarCampo(tempoMaximo = CONFIG.TEMPO_MAX_CAMPO_MS) {
        const inicio = Date.now();

        const seletores = [
            "#prompt-textarea",
            "textarea",
            "div[contenteditable='true'][role='textbox']",
            "div[contenteditable='true']",
            ".ProseMirror"
        ];

        while (Date.now() - inicio < tempoMaximo) {
            for (const seletor of seletores) {
                const candidatos = [...document.querySelectorAll(seletor)];
                const campo = candidatos.find(estaVisivel);

                if (campo) {
                    log("Campo encontrado:", seletor);
                    return campo;
                }
            }

            await esperar(400);
        }

        return null;
    }

    function definirValorTextarea(campo, texto) {
        const proto = Object.getPrototypeOf(campo);
        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

        if (descriptor && descriptor.set) {
            descriptor.set.call(campo, texto);
        } else {
            campo.value = texto;
        }

        dispararInput(campo, texto);
    }

    function selecionarTudoNoCampo(campo) {
        const selection = window.getSelection();
        const range = document.createRange();

        range.selectNodeContents(campo);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    async function inserirTextoContentEditable(campo, texto) {
        campo.focus();

        try {
            selecionarTudoNoCampo(campo);
            document.execCommand("delete", false, null);
        } catch {
            campo.innerHTML = "";
        }

        let inseriu = false;

        try {
            inseriu = document.execCommand("insertText", false, texto);
        } catch {
            inseriu = false;
        }

        if (!inseriu) {
            campo.innerHTML = "";
            const linhas = texto.split("\n");

            for (const linha of linhas) {
                const p = document.createElement("p");
                p.textContent = linha || "\u00A0";
                campo.appendChild(p);
            }
        }

        dispararInput(campo, texto);

        await esperar(300);

        const textoAtual = (campo.innerText || campo.textContent || "").trim();

        if (!textoAtual) {
            campo.textContent = texto;
            dispararInput(campo, texto);
        }
    }

    async function inserirPromptNoCampo(campo, prompt) {
        campo.focus();

        const tag = campo.tagName?.toUpperCase();

        if (tag === "TEXTAREA" || tag === "INPUT") {
            definirValorTextarea(campo, prompt);
        } else {
            await inserirTextoContentEditable(campo, prompt);
        }

        await esperar(500);
    }

    /************************************************************
     * BOTÃO DE ENVIAR
     ************************************************************/
    function botaoEstaHabilitado(btn) {
        if (!btn) return false;

        return (
            !btn.disabled &&
            btn.getAttribute("disabled") === null &&
            btn.getAttribute("aria-disabled") !== "true"
        );
    }

    function encontrarBotaoEnviar() {
        const seletoresDiretos = [
            "button[data-testid='send-button']",
            "button[data-testid='fruitjuice-send-button']",
            "button[aria-label*='Send']",
            "button[aria-label*='send']",
            "button[aria-label*='Enviar']",
            "button[aria-label*='enviar']"
        ];

        for (const seletor of seletoresDiretos) {
            const btn = [...document.querySelectorAll(seletor)].find(estaVisivel);
            if (btn) return btn;
        }

        const botoes = [...document.querySelectorAll("button")].filter(estaVisivel);

        return botoes.find(btn => {
            const texto = (btn.innerText || "").toLowerCase();
            const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
            const title = (btn.getAttribute("title") || "").toLowerCase();

            const alvo = `${texto} ${aria} ${title}`;

            return (
                alvo.includes("send") ||
                alvo.includes("enviar") ||
                alvo.includes("enviar mensagem") ||
                alvo.includes("send message") ||
                alvo.includes("send prompt")
            );
        }) || null;
    }

    async function tentarEnviarPorFormulario(campo) {
        const form = campo?.closest?.("form");

        if (!form) return false;

        try {
            if (typeof form.requestSubmit === "function") {
                form.requestSubmit();
            } else {
                form.dispatchEvent(new Event("submit", {
                    bubbles: true,
                    cancelable: true
                }));
            }

            return true;
        } catch (e) {
            log("Falha ao tentar enviar por formulário:", e);
            return false;
        }
    }

    async function clicarEnviar(campo) {
        const inicio = Date.now();

        while (Date.now() - inicio < CONFIG.TEMPO_MAX_ENVIO_MS) {
            const botaoEnviar = encontrarBotaoEnviar();

            if (botaoEnviar && botaoEstaHabilitado(botaoEnviar)) {
                botaoEnviar.click();

                promptEnviadoPorScript = true;
                log("Mensagem enviada pelo botão.");
                mostrarAviso("🚀 Prompt enviado", "info");

                return true;
            }

            await esperar(500);
        }

        log("Botão de enviar não habilitou. Tentando fallback por formulário.");

        const fallback = await tentarEnviarPorFormulario(campo);

        if (fallback) {
            promptEnviadoPorScript = true;
            mostrarAviso("🚀 Prompt enviado por fallback", "info");
            return true;
        }

        mostrarAviso("⚠️ Não consegui enviar automaticamente", "aviso");
        return false;
    }

    /************************************************************
     * DETECÇÃO DE RESPOSTA
     ************************************************************/
    function contarMensagensAssistente() {
        return document.querySelectorAll('[data-message-author-role="assistant"]').length;
    }

    function chatEstaGerando() {
        const botoes = [...document.querySelectorAll("button")];

        return botoes.some(btn => {
            if (!estaVisivel(btn)) return false;

            const texto = (btn.innerText || "").toLowerCase();
            const aria = (btn.getAttribute("aria-label") || "").toLowerCase();
            const title = (btn.getAttribute("title") || "").toLowerCase();

            const alvo = `${texto} ${aria} ${title}`;

            return (
                alvo.includes("stop") ||
                alvo.includes("parar") ||
                alvo.includes("interromper") ||
                alvo.includes("stop generating") ||
                alvo.includes("parar geração")
            );
        });
    }

    function limparTextoResposta(texto) {
        return (texto || "")
            .replace(/ChatGPT pode cometer erros\. Considere verificar informações importantes\./gi, "")
            .replace(/ChatGPT can make mistakes\. Check important info\./gi, "")
            .replace(/\n{3,}/g, "\n\n")
            .trim();
    }

    function pegarUltimaRespostaAssistente() {
        let candidatos = [...document.querySelectorAll('[data-message-author-role="assistant"]')];

        if (!candidatos.length) {
            candidatos = [...document.querySelectorAll("main article")];
        }

        if (!candidatos.length) return "";

        let ultimo;

        if (candidatos.length > quantidadeAssistenteAntes) {
            ultimo = candidatos[candidatos.length - 1];
        } else {
            ultimo = candidatos[candidatos.length - 1];
        }

        return limparTextoResposta(ultimo.innerText || "");
    }

    async function copiarTexto(texto) {
        try {
            await navigator.clipboard.writeText(texto);
            return true;
        } catch (e) {
            log("Falha no clipboard moderno. Tentando fallback.", e);

            try {
                const ta = document.createElement("textarea");
                ta.value = texto;
                ta.setAttribute("readonly", "");
                ta.style.position = "fixed";
                ta.style.top = "-9999px";
                ta.style.left = "-9999px";
                ta.style.opacity = "0";

                document.body.appendChild(ta);

                ta.focus();
                ta.select();

                const ok = document.execCommand("copy");

                ta.remove();

                return ok;
            } catch (erroFallback) {
                log("Fallback de cópia também falhou:", erroFallback);
                return false;
            }
        }
    }

    function respostaPareceValida(texto) {
        if (!texto) return false;

        if (CONFIG.COPIAR_APENAS_COM_MARCADOR) {
            return texto.includes(CONFIG.MARCADOR_RELATO);
        }

        return texto.length > 20;
    }

    async function finalizarECopiarResposta(texto) {
        if (relatoJaCopiado) return;

        if (!respostaPareceValida(texto)) {
            log("Resposta encontrada, mas sem marcador esperado.");
            mostrarAviso(`⚠️ Resposta finalizada, mas não encontrei "${CONFIG.MARCADOR_RELATO}"`, "aviso");
            return;
        }

        relatoJaCopiado = true;

        const ok = await copiarTexto(texto);

        if (ok) {
            mostrarAviso("✅ Relato copiado automaticamente", "ok");
            log("Relato copiado com sucesso.");
        } else {
            mostrarAviso("⚠️ Relato gerado, mas não foi possível copiar", "erro");
            log("Não foi possível copiar o relato.");
        }
    }

    function iniciarMonitoramentoResposta() {
        if (!promptEnviadoPorScript || relatoJaCopiado) return;

        log("Monitoramento iniciado.");

        let jaComecou = false;
        let textoAnterior = "";
        let ciclosEstaveis = 0;
        const inicio = Date.now();

        const timer = setInterval(async () => {
            if (relatoJaCopiado) {
                clearInterval(timer);
                return;
            }

            if (Date.now() - inicio > CONFIG.TEMPO_MAX_RESPOSTA_MS) {
                clearInterval(timer);
                mostrarAviso("⚠️ Tempo máximo de espera atingido", "aviso");
                log("Tempo máximo de monitoramento atingido.");
                return;
            }

            const gerando = chatEstaGerando();
            const textoAtual = pegarUltimaRespostaAssistente();
            const totalAssistenteAgora = contarMensagensAssistente();

            if (gerando) {
                jaComecou = true;
                ciclosEstaveis = 0;
                textoAnterior = textoAtual;
                return;
            }

            if (totalAssistenteAgora > quantidadeAssistenteAntes && textoAtual.length > 0) {
                jaComecou = true;
            }

            if (!jaComecou) {
                return;
            }

            if (!textoAtual) {
                return;
            }

            if (textoAtual === textoAnterior) {
                ciclosEstaveis++;
            } else {
                textoAnterior = textoAtual;
                ciclosEstaveis = 0;
            }

            log("Monitorando resposta:", {
                gerando,
                ciclosEstaveis,
                tamanhoTexto: textoAtual.length,
                temMarcador: textoAtual.includes(CONFIG.MARCADOR_RELATO)
            });

            if (ciclosEstaveis >= CONFIG.CICLOS_TEXTO_ESTAVEL) {
                clearInterval(timer);
                await finalizarECopiarResposta(textoAtual);
            }

        }, CONFIG.INTERVALO_MONITOR_MS);
    }

    /************************************************************
     * FLUXO PRINCIPAL
     ************************************************************/
    async function iniciar() {
        const prompt = pegarPromptDaUrl();

        if (!prompt) {
            log("Nenhum prompt encontrado na URL.");
            return;
        }

        log("Prompt recebido pela URL.");

        mostrarAviso("📋 Prompt detectado. Preparando envio...", "info");

        const campo = await esperarCampo();

        if (!campo) {
            mostrarAviso("❌ Não encontrei o campo do ChatGPT", "erro");
            alert("Não encontrei o campo do ChatGPT.");
            return;
        }

        quantidadeAssistenteAntes = contarMensagensAssistente();

        await inserirPromptNoCampo(campo, prompt);

        log("Prompt inserido no campo.");

        limparUrl();

        await clicarEnviar(campo);
    }

    setTimeout(iniciar, CONFIG.TEMPO_INICIAL_MS);

})();