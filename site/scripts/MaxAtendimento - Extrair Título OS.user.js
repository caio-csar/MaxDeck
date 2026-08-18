// ==UserScript==
// @name         MaxAtendimento - Extrair Título OS
// @namespace    http://tampermonkey.net/
// @version      1.7
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Extrair%20T%C3%ADtulo%20OS.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20Extrair%20T%C3%ADtulo%20OS.user.js
// @match        http://externo.maxdatasistema.com.br/Atendimentos/Atendimento/*
// @match        https://externo.maxdatasistema.com.br/Atendimentos/Atendimento/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /*
     * Aceita:
     * TÍTULO_OS:
     * TITULO_OS:
     * TÍTULO OS:
     * TITULO OS:
     * TÍTULO-OS:
     * TITULO-OS:
     * TÍTULO DA OS:
     * TITULO DA OS:
     * TÍTULO:
     * TITULO:
     */
    const REGEX_TITULO = /^\s*T[ÍI]TULO(?:\s*(?:_|-)\s*OS|\s+OS|\s+DA\s+OS)?\s*:\s*(.*?)\s*$/i;

    function dispararEventos(el) {
        if (!el) return;

        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("blur", { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent("keyup", { bubbles: true }));
    }

    function acharEditorRelato() {
        return document.querySelector(".note-editable[contenteditable='true']");
    }

    function normalizarTexto(texto) {
        return (texto || "")
            .replace(/\u00A0/g, " ")
            .replace(/\r/g, "")
            .trim();
    }

    function obterTextoVisivel(el) {
        return normalizarTexto(el.innerText || el.textContent || "");
    }

    function extrairTituloDeLinha(linha) {
        const texto = normalizarTexto(linha);
        const match = texto.match(REGEX_TITULO);

        if (!match) return null;

        return normalizarTexto(match[1]);
    }

    function ehBr(node) {
        return (
            node &&
            node.nodeType === Node.ELEMENT_NODE &&
            node.tagName === "BR"
        );
    }

    function possuiConteudoVisual(node) {
        if (!node || node.nodeType !== Node.ELEMENT_NODE) return false;

        return !!node.querySelector(
            "img, table, video, iframe, hr, input, button, select, textarea"
        );
    }

    function ehNoVazio(node) {
        if (!node) return false;

        if (node.nodeType === Node.COMMENT_NODE) {
            return true;
        }

        if (node.nodeType === Node.TEXT_NODE) {
            return normalizarTexto(node.textContent) === "";
        }

        if (ehBr(node)) {
            return true;
        }

        if (node.nodeType === Node.ELEMENT_NODE) {
            return (
                normalizarTexto(node.textContent) === "" &&
                !possuiConteudoVisual(node)
            );
        }

        return false;
    }

    function limparQuebrasIniciais(container) {
        while (container.firstChild && ehNoVazio(container.firstChild)) {
            container.removeChild(container.firstChild);
        }
    }

    function removerAtePrimeiroBr(elemento) {
        while (elemento.firstChild) {
            const atual = elemento.firstChild;
            elemento.removeChild(atual);

            if (ehBr(atual)) {
                break;
            }
        }

        limparQuebrasIniciais(elemento);

        if (
            normalizarTexto(elemento.textContent) === "" &&
            !possuiConteudoVisual(elemento)
        ) {
            elemento.remove();
        }
    }

    function obterCandidatosBloco(editor) {
        const seletores = [
            "p",
            "div",
            "li",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "blockquote",
            "pre"
        ].join(",");

        return [
            ...new Set([
                ...editor.children,
                ...editor.querySelectorAll(seletores)
            ])
        ].filter(el => el !== editor);
    }

    function localizarTituloNoEditor(editor) {
        const blocos = obterCandidatosBloco(editor);

        for (const bloco of blocos) {
            const textoBloco = obterTextoVisivel(bloco);

            const tituloBlocoInteiro = extrairTituloDeLinha(textoBloco);

            if (tituloBlocoInteiro !== null) {
                return {
                    titulo: tituloBlocoInteiro,
                    origem: bloco,
                    remover: () => bloco.remove()
                };
            }

            const linhas = textoBloco
                .split("\n")
                .map(normalizarTexto)
                .filter(Boolean);

            if (linhas.length && bloco.querySelector("br")) {
                const tituloPrimeiraLinha = extrairTituloDeLinha(linhas[0]);

                if (tituloPrimeiraLinha !== null) {
                    return {
                        titulo: tituloPrimeiraLinha,
                        origem: bloco,
                        remover: () => removerAtePrimeiroBr(bloco)
                    };
                }
            }
        }

        const nosDiretos = [...editor.childNodes];

        for (const node of nosDiretos) {
            if (node.nodeType !== Node.TEXT_NODE) continue;

            const textoNode = node.textContent || "";
            const linhas = textoNode.split("\n");

            for (let i = 0; i < linhas.length; i++) {
                const titulo = extrairTituloDeLinha(linhas[i]);

                if (titulo !== null) {
                    return {
                        titulo,
                        origem: editor,
                        remover: () => {
                            linhas.splice(i, 1);
                            node.textContent = linhas.join("\n");
                        }
                    };
                }
            }
        }

        return null;
    }

    function acharTextareaOriginal(editor) {
        const noteEditor = editor.closest(".note-editor");

        if (noteEditor) {
            let anterior = noteEditor.previousElementSibling;

            while (anterior) {
                if (
                    anterior.matches &&
                    anterior.matches("textarea, input[type='hidden']")
                ) {
                    return anterior;
                }

                anterior = anterior.previousElementSibling;
            }
        }

        return (
            document.querySelector("textarea[name='Acompanhamento']") ||
            document.getElementById("Acompanhamento") ||
            document.querySelector("textarea.note-codable")
        );
    }

    function sincronizarEditor(editor) {
        const htmlAtual = editor.innerHTML;
        const textareaOriginal = acharTextareaOriginal(editor);

        let sincronizadoPorSummernote = false;

        if (
            textareaOriginal &&
            !textareaOriginal.classList.contains("note-codable") &&
            window.jQuery &&
            window.jQuery.fn &&
            typeof window.jQuery.fn.summernote === "function"
        ) {
            try {
                window.jQuery(textareaOriginal).summernote("code", htmlAtual);
                sincronizadoPorSummernote = true;
            } catch (e) {
                sincronizadoPorSummernote = false;
            }
        }

        if (!sincronizadoPorSummernote && textareaOriginal) {
            textareaOriginal.value = htmlAtual;
            dispararEventos(textareaOriginal);
        }

        dispararEventos(editor);
    }

    function mostrarAviso(msg, tipo = "ok") {
        const antigo = document.getElementById("titulo-os-toast");
        if (antigo) antigo.remove();

        const cores = {
            ok: "#16a34a",
            aviso: "#ca8a04",
            erro: "#dc2626"
        };

        const box = document.createElement("div");
        box.id = "titulo-os-toast";
        box.innerText = msg;

        Object.assign(box.style, {
            position: "fixed",
            top: "22px",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: "9999999",
            background: cores[tipo] || cores.ok,
            color: "#fff",
            padding: "10px 16px",
            borderRadius: "10px",
            fontFamily: "Arial, sans-serif",
            fontSize: "14px",
            fontWeight: "bold",
            boxShadow: "0 8px 25px rgba(0,0,0,.35)",
            opacity: "1",
            transition: "opacity .7s ease"
        });

        document.body.appendChild(box);

        setTimeout(() => {
            box.style.opacity = "0";
            setTimeout(() => box.remove(), 800);
        }, 2200);
    }

    function obterRetanguloSeguro(el, fallback) {
        if (!el) return fallback.getBoundingClientRect();

        const rect = el.getBoundingClientRect();

        if (rect.width > 0 && rect.height > 0) {
            return rect;
        }

        return fallback.getBoundingClientRect();
    }

    function animarTituloParaDescricao(titulo, origemEl, destinoEl) {
        return new Promise(resolve => {
            const origemRect = obterRetanguloSeguro(origemEl, destinoEl);
            const destinoRect = destinoEl.getBoundingClientRect();

            const fantasma = document.createElement("div");
            fantasma.innerText = titulo;

            const largura = Math.min(
                Math.max(origemRect.width, 220),
                520
            );

            Object.assign(fantasma.style, {
                position: "fixed",
                left: origemRect.left + "px",
                top: origemRect.top + "px",
                width: largura + "px",
                maxWidth: "520px",
                zIndex: "99999999",
                background: "#0f172a",
                color: "#fff",
                padding: "9px 13px",
                borderRadius: "10px",
                fontFamily: "Arial, sans-serif",
                fontSize: "14px",
                fontWeight: "bold",
                boxShadow: "0 10px 30px rgba(0,0,0,.35)",
                pointerEvents: "none",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                opacity: "1",
                transform: "translate(0, 0) scale(1)",
                transition: "transform .72s cubic-bezier(.2,.85,.25,1.15), opacity .72s ease"
            });

            document.body.appendChild(fantasma);

            const destinoX = destinoRect.left + 8;
            const destinoY = destinoRect.top + (destinoRect.height / 2) - (fantasma.offsetHeight / 2);

            const deltaX = destinoX - origemRect.left;
            const deltaY = destinoY - origemRect.top;

            requestAnimationFrame(() => {
                fantasma.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(.82)`;
                fantasma.style.opacity = ".88";
            });

            let finalizou = false;

            function finalizar() {
                if (finalizou) return;
                finalizou = true;

                fantasma.style.opacity = "0";

                setTimeout(() => {
                    fantasma.remove();
                    resolve();
                }, 180);
            }

            fantasma.addEventListener("transitionend", finalizar, { once: true });

            setTimeout(finalizar, 900);
        });
    }

    async function aplicarTitulo() {
        const campoDescricao = document.getElementById("vedAtendDescricao");
        const editor = acharEditorRelato();

        if (!campoDescricao || !editor) {
            alert("Campo de descrição ou relato não encontrado.");
            return;
        }

        const resultado = localizarTituloNoEditor(editor);

        if (!resultado) {
            alert("Nenhum TÍTULO_OS encontrado no relato.");
            return;
        }

        if (!resultado.titulo) {
            alert("O marcador de título foi encontrado, mas está vazio.");
            return;
        }

        await animarTituloParaDescricao(
            resultado.titulo,
            resultado.origem || editor,
            campoDescricao
        );

        campoDescricao.value = resultado.titulo.substring(0, 49);
        dispararEventos(campoDescricao);

        resultado.remover();

        limparQuebrasIniciais(editor);
        sincronizarEditor(editor);

        mostrarAviso("Título extraído com sucesso.");
    }

    function aplicarBotao() {
        const label = document.querySelector('label[for="vedAtendDescricao"]');

        if (!label) return;

        if (label.dataset.tituloOs === "1") return;

        label.dataset.tituloOs = "1";

        label.title = "Clique para extrair TÍTULO_OS do relato";

        label.style.cursor = "pointer";
        label.style.background = "#0f172a";
        label.style.color = "#fff";
        label.style.fontWeight = "bold";

        label.addEventListener("click", function (e) {
            e.preventDefault();
            e.stopPropagation();
            aplicarTitulo();
        });
    }

    setInterval(aplicarBotao, 1000);

})();