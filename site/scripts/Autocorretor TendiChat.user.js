// ==UserScript==
// @name         Autocorretor TendiChat
// @namespace    maxdata.tendichat.autocorretor
// @version      2.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Autocorretor%20TendiChat.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Autocorretor%20TendiChat.user.js
// @description  Corrige automaticamente mensagens antes do envio e mantém um dicionário personalizado
// @include      /^https?:\/\/[^/]*(tendichat|tencichat)[^/]*\/.*$/
// @grant        GM_xmlhttpRequest
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_registerMenuCommand
// @connect      api.languagetool.org
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    /*
     * ============================================================
     * CONFIGURAÇÕES
     * ============================================================
     */

    const CONFIG = {
        languageToolUrl: 'https://api.languagetool.org/v2/check',
        idioma: 'pt-BR',

        /*
         * Aguarda este tempo após alterar o texto antes de reenviar
         * o Enter. Isso ajuda sistemas feitos em React, Vue e Angular
         * a processarem o evento input.
         */
        atrasoAntesDeEnviar: 180,

        /*
         * Tempo máximo da consulta ao LanguageTool.
         */
        timeoutLanguageTool: 12000,

        /*
         * Se o LanguageTool falhar, a mensagem será enviada mesmo assim,
         * mas ainda receberá as correções do dicionário pessoal.
         */
        enviarSeLanguageToolFalhar: true,

        /*
         * Evita analisar mensagens muito grandes.
         */
        limiteCaracteres: 10000,

        /*
         * Quando true, utiliza automaticamente a primeira sugestão
         * retornada pelo LanguageTool.
         */
        aplicarPrimeiraSugestao: true,

        /*
         * Categorias que podem ser aplicadas automaticamente.
         *
         * TYPOGRAPHY:
         * Pontuação, espaços e formatação.
         *
         * TYPOS:
         * Erros de digitação.
         *
         * CASING:
         * Maiúsculas e minúsculas.
         *
         * GRAMMAR:
         * Gramática e concordância.
         */
        categoriasPermitidas: [
            'TYPOS',
            'CASING',
            'GRAMMAR',
            'TYPOGRAPHY',
            'MISC'
        ],

        /*
         * Termos técnicos que não devem ser alterados.
         */
        termosIgnorados: [
            'TendiChat',
            'Tencichat',
            'Maxdata',
            'MaxManager',
            'Max_Manager2',
            'MaxPDV',
            'MaxFood',
            'AnyDesk',
            'SNGPC',
            'SEFAZ',
            'NFC-e',
            'NFCe',
            'NF-e',
            'NFe',
            'NFS-e',
            'NFSe',
            'CFOP',
            'CSOSN',
            'CST',
            'CEST',
            'NCM',
            'ICMS',
            'FCP',
            'IBS',
            'CBS',
            'PIX',
            'Sicoob',
            'SQL',
            'JSON',
            'API',
            'PDV',
            'ERP',
            'XML',
            'SPED',
            'DANFE',
            'CNPJ',
            'CPF',
            'RDP',
            'WMI',
            'OLE',
            'max.ini'
        ],

        /*
         * Regras específicas do LanguageTool que devem ser ignoradas.
         * Exemplo:
         *
         * regrasIgnoradas: [
         *     'UPPERCASE_SENTENCE_START'
         * ]
         */
        regrasIgnoradas: []
    };

    const CHAVE_DICIONARIO = 'autocorretor_dicionario_v2';

    /*
     * ============================================================
     * ESTADO
     * ============================================================
     */

    let processandoEnvio = false;
    let campoEmProcessamento = null;
    let ultimoCampoEditado = null;

    /*
     * ============================================================
     * DICIONÁRIO
     * ============================================================
     */

    function carregarDicionario() {
        const salvo = GM_getValue(CHAVE_DICIONARIO, {});

        if (
            salvo &&
            typeof salvo === 'object' &&
            !Array.isArray(salvo)
        ) {
            return salvo;
        }

        return {};
    }

    function salvarDicionario(dicionario) {
        GM_setValue(CHAVE_DICIONARIO, dicionario);
    }

    function adicionarCorrecao(palavraOriginal, palavraCorreta) {
        const original = palavraOriginal.trim();
        const correta = palavraCorreta.trim();

        if (!original || !correta) {
            return false;
        }

        const dicionario = carregarDicionario();

        dicionario[original.toLocaleLowerCase('pt-BR')] = {
            original,
            correta,
            criadoEm: new Date().toISOString()
        };

        salvarDicionario(dicionario);

        return true;
    }

    function removerCorrecao(palavra) {
        const dicionario = carregarDicionario();
        const chave = palavra.trim().toLocaleLowerCase('pt-BR');

        if (!dicionario[chave]) {
            return false;
        }

        delete dicionario[chave];
        salvarDicionario(dicionario);

        return true;
    }

    function manterCapitalizacao(original, corrigida) {
        if (!original) {
            return corrigida;
        }

        if (original === original.toLocaleUpperCase('pt-BR')) {
            return corrigida.toLocaleUpperCase('pt-BR');
        }

        const primeiraMaiuscula =
            original.charAt(0) ===
            original.charAt(0).toLocaleUpperCase('pt-BR');

        const restanteMinusculo =
            original.slice(1) ===
            original.slice(1).toLocaleLowerCase('pt-BR');

        if (primeiraMaiuscula && restanteMinusculo) {
            return (
                corrigida.charAt(0).toLocaleUpperCase('pt-BR') +
                corrigida.slice(1)
            );
        }

        return corrigida;
    }

    function escaparRegex(texto) {
        return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }

    function aplicarDicionario(texto) {
        const dicionario = carregarDicionario();
        let resultado = texto;

        const registros = Object.values(dicionario)
            .filter((registro) => {
                return registro?.original && registro?.correta;
            })
            .sort((a, b) => {
                return b.original.length - a.original.length;
            });

        for (const registro of registros) {
            const termo = escaparRegex(registro.original);

            /*
             * Evita substituir uma palavra dentro de outra.
             */
            const regex = new RegExp(
                `(^|[^\\p{L}\\p{N}_])(${termo})(?=$|[^\\p{L}\\p{N}_])`,
                'giu'
            );

            resultado = resultado.replace(
                regex,
                (correspondencia, prefixo, palavraEncontrada) => {
                    return (
                        prefixo +
                        manterCapitalizacao(
                            palavraEncontrada,
                            registro.correta
                        )
                    );
                }
            );
        }

        return resultado;
    }

    /*
     * ============================================================
     * IDENTIFICAÇÃO DO CAMPO
     * ============================================================
     */

    function elementoEhEditavel(elemento) {
        if (!elemento || !(elemento instanceof Element)) {
            return false;
        }

        if (elemento instanceof HTMLTextAreaElement) {
            return !elemento.disabled && !elemento.readOnly;
        }

        if (elemento instanceof HTMLInputElement) {
            return (
                ['text', 'search'].includes(elemento.type) &&
                !elemento.disabled &&
                !elemento.readOnly
            );
        }

        return elemento.isContentEditable;
    }

    function encontrarCampoEditavel(elemento) {
        if (!elemento || !(elemento instanceof Element)) {
            return null;
        }

        if (elementoEhEditavel(elemento)) {
            return elemento;
        }

        const campo = elemento.closest(
            [
                'textarea',
                'input[type="text"]',
                'input[type="search"]',
                '[contenteditable="true"]',
                '[contenteditable="plaintext-only"]'
            ].join(',')
        );

        return elementoEhEditavel(campo) ? campo : null;
    }

    function obterTexto(campo) {
        if (
            campo instanceof HTMLTextAreaElement ||
            campo instanceof HTMLInputElement
        ) {
            return campo.value;
        }

        return campo.innerText ?? campo.textContent ?? '';
    }

    function definirValorNativo(campo, texto) {
        const prototipo =
            campo instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;

        const descritor = Object.getOwnPropertyDescriptor(
            prototipo,
            'value'
        );

        if (descritor?.set) {
            descritor.set.call(campo, texto);
        } else {
            campo.value = texto;
        }
    }

    function dispararEventosDeAlteracao(campo, texto) {
        try {
            campo.dispatchEvent(
                new InputEvent('input', {
                    bubbles: true,
                    cancelable: false,
                    inputType: 'insertText',
                    data: texto
                })
            );
        } catch {
            campo.dispatchEvent(
                new Event('input', {
                    bubbles: true
                })
            );
        }

        campo.dispatchEvent(
            new Event('change', {
                bubbles: true
            })
        );
    }

    function selecionarTodoConteudo(campo) {
        const selecao = window.getSelection();
        const intervalo = document.createRange();

        intervalo.selectNodeContents(campo);

        selecao.removeAllRanges();
        selecao.addRange(intervalo);
    }

    function posicionarCursorNoFim(campo) {
        campo.focus();

        if (
            campo instanceof HTMLTextAreaElement ||
            campo instanceof HTMLInputElement
        ) {
            const posicao = campo.value.length;

            try {
                campo.setSelectionRange(posicao, posicao);
            } catch {
                // Alguns inputs não aceitam seleção.
            }

            return;
        }

        const selecao = window.getSelection();
        const intervalo = document.createRange();

        intervalo.selectNodeContents(campo);
        intervalo.collapse(false);

        selecao.removeAllRanges();
        selecao.addRange(intervalo);
    }

    function definirTexto(campo, texto) {
        if (
            campo instanceof HTMLTextAreaElement ||
            campo instanceof HTMLInputElement
        ) {
            definirValorNativo(campo, texto);
            dispararEventosDeAlteracao(campo, texto);
            posicionarCursorNoFim(campo);

            return;
        }

        campo.focus();
        selecionarTodoConteudo(campo);

        let alterado = false;

        try {
            alterado = document.execCommand(
                'insertText',
                false,
                texto
            );
        } catch {
            alterado = false;
        }

        if (!alterado) {
            campo.innerText = texto;
        }

        dispararEventosDeAlteracao(campo, texto);
        posicionarCursorNoFim(campo);
    }

    /*
     * ============================================================
     * LANGUAGETOOL
     * ============================================================
     */

    function consultarLanguageTool(texto) {
        return new Promise((resolve, reject) => {
            const dados = new URLSearchParams();

            dados.set('text', texto);
            dados.set('language', CONFIG.idioma);
            dados.set('enabledOnly', 'false');

            GM_xmlhttpRequest({
                method: 'POST',
                url: CONFIG.languageToolUrl,

                headers: {
                    'Content-Type':
                        'application/x-www-form-urlencoded; charset=UTF-8'
                },

                data: dados.toString(),
                timeout: CONFIG.timeoutLanguageTool,

                onload: (resposta) => {
                    if (
                        resposta.status < 200 ||
                        resposta.status >= 300
                    ) {
                        reject(
                            new Error(
                                `LanguageTool retornou HTTP ${resposta.status}.`
                            )
                        );

                        return;
                    }

                    try {
                        resolve(JSON.parse(resposta.responseText));
                    } catch {
                        reject(
                            new Error(
                                'Resposta inválida do LanguageTool.'
                            )
                        );
                    }
                },

                ontimeout: () => {
                    reject(
                        new Error(
                            'A consulta ao LanguageTool expirou.'
                        )
                    );
                },

                onerror: () => {
                    reject(
                        new Error(
                            'Falha ao acessar o LanguageTool.'
                        )
                    );
                }
            });
        });
    }

    function normalizar(texto) {
        return String(texto || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLocaleLowerCase('pt-BR')
            .trim();
    }

    const termosIgnorados = new Set(
        CONFIG.termosIgnorados.map(normalizar)
    );

    const regrasIgnoradas = new Set(
        CONFIG.regrasIgnoradas.map((regra) => {
            return String(regra).toLocaleUpperCase('pt-BR');
        })
    );

    const categoriasPermitidas = new Set(
        CONFIG.categoriasPermitidas.map((categoria) => {
            return String(categoria).toLocaleUpperCase('pt-BR');
        })
    );

    function pareceCodigoTecnico(trecho) {
        if (!trecho) {
            return false;
        }

        if (/^(https?:\/\/|www\.)/i.test(trecho)) {
            return true;
        }

        if (/^[a-z]:\\/i.test(trecho)) {
            return true;
        }

        if (/^[A-Z0-9_.:/\\-]{2,}$/.test(trecho)) {
            return true;
        }

        return false;
    }

    function deveAplicarErro(texto, erro) {
        if (!erro?.replacements?.length) {
            return false;
        }

        if (
            !Number.isInteger(erro.offset) ||
            !Number.isInteger(erro.length)
        ) {
            return false;
        }

        if (erro.length <= 0) {
            return false;
        }

        const trecho = texto.slice(
            erro.offset,
            erro.offset + erro.length
        );

        if (termosIgnorados.has(normalizar(trecho))) {
            return false;
        }

        if (pareceCodigoTecnico(trecho)) {
            return false;
        }

        const regraId = String(
            erro.rule?.id || ''
        ).toLocaleUpperCase('pt-BR');

        if (regrasIgnoradas.has(regraId)) {
            return false;
        }

        const categoriaId = String(
            erro.rule?.category?.id || ''
        ).toLocaleUpperCase('pt-BR');

        if (
            categoriaId &&
            categoriasPermitidas.size > 0 &&
            !categoriasPermitidas.has(categoriaId)
        ) {
            return false;
        }

        return true;
    }

    function aplicarCorrecoesLanguageTool(texto, matches) {
        if (!CONFIG.aplicarPrimeiraSugestao) {
            return texto;
        }

        let resultado = texto;

        const correcoes = matches
            .filter((erro) => {
                return deveAplicarErro(texto, erro);
            })
            .map((erro) => {
                return {
                    inicio: erro.offset,
                    fim: erro.offset + erro.length,
                    sugestao: erro.replacements[0].value
                };
            })
            .sort((a, b) => {
                return b.inicio - a.inicio;
            });

        /*
         * Evita aplicar correções sobrepostas.
         */
        let ultimoInicio = Infinity;

        for (const correcao of correcoes) {
            if (correcao.fim > ultimoInicio) {
                continue;
            }

            resultado =
                resultado.slice(0, correcao.inicio) +
                correcao.sugestao +
                resultado.slice(correcao.fim);

            ultimoInicio = correcao.inicio;
        }

        return resultado;
    }

    /*
     * ============================================================
     * ENVIO AUTOMÁTICO
     * ============================================================
     */

    function criarEventoEnter(eventoOriginal) {
        return new KeyboardEvent('keydown', {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,

            bubbles: true,
            cancelable: true,

            shiftKey: false,
            ctrlKey: eventoOriginal.ctrlKey,
            altKey: eventoOriginal.altKey,
            metaKey: eventoOriginal.metaKey
        });
    }

    function reenviarEnter(campo, eventoOriginal) {
        processandoEnvio = true;

        campo.focus();

        const novoEvento = criarEventoEnter(eventoOriginal);
        campo.dispatchEvent(novoEvento);

        /*
         * Libera o bloqueio no próximo ciclo.
         */
        window.setTimeout(() => {
            processandoEnvio = false;
            campoEmProcessamento = null;
        }, 300);
    }

    async function corrigirEEnviar(campo, eventoOriginal) {
        const textoOriginal = obterTexto(campo);

        if (!textoOriginal.trim()) {
            reenviarEnter(campo, eventoOriginal);
            return;
        }

        if (textoOriginal.length > CONFIG.limiteCaracteres) {
            mostrarToast(
                'Mensagem grande demais para correção automática. Enviando sem consultar o LanguageTool.'
            );

            const textoLocal = aplicarDicionario(textoOriginal);

            if (textoLocal !== textoOriginal) {
                definirTexto(campo, textoLocal);
            }

            await aguardar(CONFIG.atrasoAntesDeEnviar);
            reenviarEnter(campo, eventoOriginal);

            return;
        }

        campoEmProcessamento = campo;
        mostrarIndicador(campo, true);

        let textoCorrigido = aplicarDicionario(textoOriginal);

        try {
            const resposta = await consultarLanguageTool(
                textoCorrigido
            );

            textoCorrigido = aplicarCorrecoesLanguageTool(
                textoCorrigido,
                resposta.matches || []
            );
        } catch (erro) {
            console.error('[Autocorretor TendiChat]', erro);

            if (!CONFIG.enviarSeLanguageToolFalhar) {
                mostrarIndicador(campo, false);

                mostrarToast(
                    'Não foi possível consultar o LanguageTool. A mensagem não foi enviada.'
                );

                campoEmProcessamento = null;
                return;
            }

            mostrarToast(
                'LanguageTool indisponível. Aplicadas apenas as correções pessoais.'
            );
        }

        if (textoCorrigido !== textoOriginal) {
            definirTexto(campo, textoCorrigido);
        }

        mostrarIndicador(campo, false);

        await aguardar(CONFIG.atrasoAntesDeEnviar);

        reenviarEnter(campo, eventoOriginal);
    }

    document.addEventListener(
        'keydown',
        (evento) => {
            if (processandoEnvio) {
                return;
            }

            if (evento.key !== 'Enter') {
                return;
            }

            /*
             * Shift + Enter continua criando uma nova linha.
             */
            if (evento.shiftKey) {
                return;
            }

            if (evento.isComposing) {
                return;
            }

            const campo = encontrarCampoEditavel(evento.target);

            if (!campo) {
                return;
            }

            /*
             * Evita capturar Enter em campos da interface do script.
             */
            if (campo.closest('#ac-tendichat-interface')) {
                return;
            }

            evento.preventDefault();
            evento.stopPropagation();
            evento.stopImmediatePropagation();

            corrigirEEnviar(campo, evento).catch((erro) => {
                console.error('[Autocorretor TendiChat]', erro);

                mostrarIndicador(campo, false);
                processandoEnvio = false;
                campoEmProcessamento = null;

                mostrarToast(
                    'Ocorreu um erro ao corrigir a mensagem.'
                );
            });
        },
        true
    );

    /*
     * ============================================================
     * CADASTRO POR DUPLO CLIQUE
     * ============================================================
     */

    document.addEventListener(
        'focusin',
        (evento) => {
            const campo = encontrarCampoEditavel(evento.target);

            if (campo) {
                ultimoCampoEditado = campo;
            }
        },
        true
    );

    document.addEventListener(
        'dblclick',
        (evento) => {
            const campo = encontrarCampoEditavel(evento.target);

            if (!campo) {
                return;
            }

            window.setTimeout(() => {
                const palavra = obterPalavraSelecionada(campo);

                if (!palavra) {
                    mostrarToast(
                        'Selecione ou dê duplo clique sobre uma palavra.'
                    );

                    return;
                }

                abrirCadastroCorrecao(palavra);
            }, 20);
        },
        true
    );

    function obterPalavraSelecionada(campo) {
        if (
            campo instanceof HTMLTextAreaElement ||
            campo instanceof HTMLInputElement
        ) {
            const inicio = campo.selectionStart;
            const fim = campo.selectionEnd;

            if (
                Number.isInteger(inicio) &&
                Number.isInteger(fim) &&
                fim > inicio
            ) {
                return limparPalavra(
                    campo.value.slice(inicio, fim)
                );
            }

            return obterPalavraNaPosicao(
                campo.value,
                inicio ?? 0
            );
        }

        const selecao = window.getSelection();

        if (!selecao || selecao.rangeCount === 0) {
            return '';
        }

        const textoSelecionado = selecao.toString().trim();

        if (textoSelecionado) {
            return limparPalavra(textoSelecionado);
        }

        const no = selecao.anchorNode;
        const posicao = selecao.anchorOffset;

        if (!no || no.nodeType !== Node.TEXT_NODE) {
            return '';
        }

        return obterPalavraNaPosicao(
            no.textContent || '',
            posicao
        );
    }

    function obterPalavraNaPosicao(texto, posicao) {
        if (!texto) {
            return '';
        }

        const ehParteDaPalavra = (caractere) => {
            return /[\p{L}\p{M}\p{N}_-]/u.test(caractere);
        };

        let inicio = Math.max(
            0,
            Math.min(posicao, texto.length)
        );

        let fim = inicio;

        while (
            inicio > 0 &&
            ehParteDaPalavra(texto.charAt(inicio - 1))
        ) {
            inicio--;
        }

        while (
            fim < texto.length &&
            ehParteDaPalavra(texto.charAt(fim))
        ) {
            fim++;
        }

        return limparPalavra(texto.slice(inicio, fim));
    }

    function limparPalavra(texto) {
        return String(texto || '')
            .trim()
            .replace(
                /^[^\p{L}\p{M}\p{N}_-]+|[^\p{L}\p{M}\p{N}_-]+$/gu,
                ''
            );
    }

    function abrirCadastroCorrecao(palavraOriginal) {
        fecharInterface();

        const overlay = document.createElement('div');
        overlay.id = 'ac-tendichat-interface';

        overlay.innerHTML = `
            <div class="ac-modal">
                <div class="ac-cabecalho">
                    <strong>Adicionar correção</strong>

                    <button
                        type="button"
                        class="ac-fechar"
                        title="Fechar"
                    >
                        ×
                    </button>
                </div>

                <div class="ac-conteudo">
                    <label>
                        Palavra digitada
                    </label>

                    <input
                        type="text"
                        class="ac-original"
                        autocomplete="off"
                    >

                    <label>
                        Corrigir para
                    </label>

                    <input
                        type="text"
                        class="ac-correta"
                        autocomplete="off"
                    >

                    <div class="ac-exemplo"></div>
                </div>

                <div class="ac-rodape">
                    <button
                        type="button"
                        class="ac-cancelar"
                    >
                        Cancelar
                    </button>

                    <button
                        type="button"
                        class="ac-salvar"
                    >
                        Salvar correção
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);

        const original = overlay.querySelector('.ac-original');
        const correta = overlay.querySelector('.ac-correta');
        const exemplo = overlay.querySelector('.ac-exemplo');

        original.value = palavraOriginal;
        correta.value = '';

        function atualizarExemplo() {
            exemplo.textContent =
                `${original.value || 'palavra'} → ` +
                `${correta.value || 'correção'}`;
        }

        original.addEventListener('input', atualizarExemplo);
        correta.addEventListener('input', atualizarExemplo);

        overlay
            .querySelector('.ac-fechar')
            .addEventListener('click', fecharInterface);

        overlay
            .querySelector('.ac-cancelar')
            .addEventListener('click', fecharInterface);

        overlay
            .querySelector('.ac-salvar')
            .addEventListener('click', () => {
                const origem = original.value.trim();
                const destino = correta.value.trim();

                if (!origem || !destino) {
                    mostrarToast(
                        'Informe a palavra original e a correção.'
                    );

                    return;
                }

                adicionarCorrecao(origem, destino);
                fecharInterface();

                mostrarToast(
                    `Correção salva: ${origem} → ${destino}`
                );
            });

        overlay.addEventListener('mousedown', (evento) => {
            if (evento.target === overlay) {
                fecharInterface();
            }
        });

        overlay.addEventListener('keydown', (evento) => {
            if (evento.key === 'Escape') {
                fecharInterface();
                return;
            }

            if (
                evento.key === 'Enter' &&
                evento.target === correta
            ) {
                evento.preventDefault();

                overlay
                    .querySelector('.ac-salvar')
                    .click();
            }
        });

        atualizarExemplo();

        window.setTimeout(() => {
            correta.focus();
        }, 20);
    }

    function fecharInterface() {
        document
            .querySelectorAll('#ac-tendichat-interface')
            .forEach((elemento) => elemento.remove());
    }

    /*
     * ============================================================
     * MENU DO TAMPERMONKEY
     * ============================================================
     */

    GM_registerMenuCommand(
        '📖 Ver dicionário de correções',
        visualizarDicionario
    );

    GM_registerMenuCommand(
        '➕ Adicionar correção manualmente',
        adicionarCorrecaoManualmente
    );

    GM_registerMenuCommand(
        '📤 Exportar dicionário JSON',
        exportarDicionario
    );

    GM_registerMenuCommand(
        '📥 Importar dicionário JSON',
        importarDicionario
    );

    GM_registerMenuCommand(
        '🗑️ Apagar dicionário',
        apagarDicionario
    );

    function adicionarCorrecaoManualmente() {
        const palavra = window.prompt(
            'Qual palavra ou expressão está errada?'
        );

        if (!palavra) {
            return;
        }

        abrirCadastroCorrecao(palavra);
    }

    function visualizarDicionario() {
        const dicionario = carregarDicionario();

        const registros = Object.values(dicionario)
            .sort((a, b) => {
                return a.original.localeCompare(
                    b.original,
                    'pt-BR'
                );
            });

        if (registros.length === 0) {
            window.alert(
                'O dicionário personalizado está vazio.'
            );

            return;
        }

        const texto = registros
            .map((registro, indice) => {
                return (
                    `${indice + 1}. ` +
                    `${registro.original} → ${registro.correta}`
                );
            })
            .join('\n');

        window.alert(
            `Dicionário personalizado:\n\n${texto}`
        );
    }

    function exportarDicionario() {
        const dicionario = carregarDicionario();

        const conteudo = JSON.stringify(
            {
                formato: 'autocorretor-tendichat',
                versao: 2,
                exportadoEm: new Date().toISOString(),
                correcoes: dicionario
            },
            null,
            2
        );

        const blob = new Blob(
            [conteudo],
            {
                type: 'application/json;charset=utf-8'
            }
        );

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        const data = new Date()
            .toISOString()
            .slice(0, 10);

        link.href = url;
        link.download =
            `dicionario-tendichat-${data}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        window.setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 1000);

        mostrarToast('Dicionário exportado.');
    }

    function importarDicionario() {
        const input = document.createElement('input');

        input.type = 'file';
        input.accept = '.json,application/json';

        input.addEventListener('change', async () => {
            const arquivo = input.files?.[0];

            if (!arquivo) {
                return;
            }

            try {
                const conteudo = await arquivo.text();
                const json = JSON.parse(conteudo);

                const correcoes =
                    json.correcoes &&
                    typeof json.correcoes === 'object'
                        ? json.correcoes
                        : json;

                if (
                    !correcoes ||
                    typeof correcoes !== 'object' ||
                    Array.isArray(correcoes)
                ) {
                    throw new Error(
                        'Estrutura de arquivo inválida.'
                    );
                }

                const atual = carregarDicionario();

                /*
                 * Mescla o arquivo com o dicionário atual.
                 * Correções importadas substituem as existentes
                 * quando possuem a mesma palavra original.
                 */
                salvarDicionario({
                    ...atual,
                    ...correcoes
                });

                mostrarToast(
                    'Dicionário importado com sucesso.'
                );
            } catch (erro) {
                console.error(
                    '[Autocorretor TendiChat]',
                    erro
                );

                window.alert(
                    'Não foi possível importar o dicionário.\n\n' +
                    (erro?.message || String(erro))
                );
            }
        });

        input.click();
    }

    function apagarDicionario() {
        const quantidade = Object.keys(
            carregarDicionario()
        ).length;

        if (quantidade === 0) {
            window.alert(
                'O dicionário já está vazio.'
            );

            return;
        }

        const confirmar = window.confirm(
            `Apagar as ${quantidade} correções ` +
            'salvas no dicionário?'
        );

        if (!confirmar) {
            return;
        }

        salvarDicionario({});
        mostrarToast('Dicionário apagado.');
    }

    /*
     * ============================================================
     * INTERFACE
     * ============================================================
     */

    const estilo = document.createElement('style');

    estilo.textContent = `
        #ac-tendichat-indicador {
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 2147483640;
            padding: 10px 15px;
            border-radius: 8px;
            background: #1d4ed8;
            color: #ffffff;
            font-family: Arial, sans-serif;
            font-size: 13px;
            font-weight: 700;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
        }

        #ac-tendichat-toast {
            position: fixed;
            right: 20px;
            bottom: 20px;
            z-index: 2147483647;
            max-width: 380px;
            padding: 11px 15px;
            border-radius: 8px;
            background: #111827;
            color: #ffffff;
            font-family: Arial, sans-serif;
            font-size: 13px;
            line-height: 1.4;
            box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
            opacity: 0;
            transform: translateY(8px);
            transition:
                opacity 0.2s ease,
                transform 0.2s ease;
        }

        #ac-tendichat-toast.ac-visivel {
            opacity: 1;
            transform: translateY(0);
        }

        #ac-tendichat-interface {
            position: fixed;
            inset: 0;
            z-index: 2147483646;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            background: rgba(15, 23, 42, 0.65);
        }

        #ac-tendichat-interface .ac-modal {
            width: min(440px, 96vw);
            overflow: hidden;
            border-radius: 12px;
            background: #ffffff;
            color: #111827;
            font-family: Arial, sans-serif;
            box-shadow: 0 22px 60px rgba(0, 0, 0, 0.4);
        }

        #ac-tendichat-interface .ac-cabecalho {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 16px 18px;
            border-bottom: 1px solid #e5e7eb;
            font-size: 17px;
        }

        #ac-tendichat-interface .ac-fechar {
            width: 34px;
            height: 34px;
            border: none;
            border-radius: 7px;
            background: #f3f4f6;
            color: #374151;
            font-size: 21px;
            cursor: pointer;
        }

        #ac-tendichat-interface .ac-conteudo {
            padding: 18px;
        }

        #ac-tendichat-interface label {
            display: block;
            margin: 0 0 6px;
            color: #374151;
            font-size: 13px;
            font-weight: 700;
        }

        #ac-tendichat-interface input {
            box-sizing: border-box;
            width: 100%;
            margin-bottom: 15px;
            padding: 10px 11px;
            border: 1px solid #d1d5db;
            border-radius: 7px;
            outline: none;
            font-size: 14px;
        }

        #ac-tendichat-interface input:focus {
            border-color: #2563eb;
            box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.13);
        }

        #ac-tendichat-interface .ac-exemplo {
            padding: 10px;
            border-radius: 7px;
            background: #f3f4f6;
            color: #374151;
            font-size: 14px;
            word-break: break-word;
        }

        #ac-tendichat-interface .ac-rodape {
            display: flex;
            justify-content: flex-end;
            gap: 9px;
            padding: 14px 18px;
            border-top: 1px solid #e5e7eb;
            background: #f9fafb;
        }

        #ac-tendichat-interface .ac-cancelar,
        #ac-tendichat-interface .ac-salvar {
            padding: 9px 14px;
            border-radius: 7px;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
        }

        #ac-tendichat-interface .ac-cancelar {
            border: 1px solid #d1d5db;
            background: #ffffff;
            color: #374151;
        }

        #ac-tendichat-interface .ac-salvar {
            border: none;
            background: #16a34a;
            color: #ffffff;
        }
    `;

    document.head.appendChild(estilo);

    function mostrarIndicador(campo, mostrar) {
        document
            .querySelectorAll('#ac-tendichat-indicador')
            .forEach((elemento) => elemento.remove());

        if (!mostrar) {
            return;
        }

        const indicador = document.createElement('div');

        indicador.id = 'ac-tendichat-indicador';
        indicador.textContent = 'Corrigindo mensagem...';

        document.body.appendChild(indicador);
    }

    function mostrarToast(mensagem) {
        document
            .querySelectorAll('#ac-tendichat-toast')
            .forEach((elemento) => elemento.remove());

        const toast = document.createElement('div');

        toast.id = 'ac-tendichat-toast';
        toast.textContent = mensagem;

        document.body.appendChild(toast);

        requestAnimationFrame(() => {
            toast.classList.add('ac-visivel');
        });

        window.setTimeout(() => {
            toast.classList.remove('ac-visivel');

            window.setTimeout(() => {
                toast.remove();
            }, 250);
        }, 3500);
    }

    function aguardar(tempo) {
        return new Promise((resolve) => {
            window.setTimeout(resolve, tempo);
        });
    }

    console.log(
        '[Autocorretor TendiChat] Script carregado.'
    );
})();