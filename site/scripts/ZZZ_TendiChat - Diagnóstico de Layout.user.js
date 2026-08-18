// ==UserScript==
// @name         ZZZ_TendiChat - Diagnóstico de Layout
// @namespace    caio.maxdata.tendichat
// @version      1.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/ZZZ_TendiChat%20-%20Diagn%C3%B3stico%20de%20Layout.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/ZZZ_TendiChat%20-%20Diagn%C3%B3stico%20de%20Layout.user.js
// @description  Identifica os elementos estruturais do TendiChat para ajuste de layout.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
    'use strict';

    const ID_PAINEL = 'tc-diagnostico-painel';
    const ID_MODAL = 'tc-diagnostico-modal';
    const CLASSE_LABEL = 'tc-diagnostico-label';

    function classeResumida(elemento) {
        if (!elemento) return null;

        const classe =
            typeof elemento.className === 'string'
                ? elemento.className
                : '';

        return classe
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 600);
    }

    function seletorResumido(elemento) {
        if (!elemento) return null;

        let seletor = elemento.tagName.toLowerCase();

        if (elemento.id) {
            seletor += `#${elemento.id}`;
        }

        const classes = classeResumida(elemento)
            ?.split(' ')
            .filter(Boolean)
            .slice(0, 8);

        if (classes?.length) {
            seletor += '.' + classes.join('.');
        }

        return seletor;
    }

    function obterRetangulo(elemento) {
        if (!elemento) return null;

        const r = elemento.getBoundingClientRect();

        return {
            top: Math.round(r.top * 100) / 100,
            right: Math.round(r.right * 100) / 100,
            bottom: Math.round(r.bottom * 100) / 100,
            left: Math.round(r.left * 100) / 100,
            width: Math.round(r.width * 100) / 100,
            height: Math.round(r.height * 100) / 100
        };
    }

    function obterEstilos(elemento) {
        if (!elemento) return null;

        const estilo = getComputedStyle(elemento);

        return {
            display: estilo.display,
            position: estilo.position,
            top: estilo.top,
            right: estilo.right,
            bottom: estilo.bottom,
            left: estilo.left,
            width: estilo.width,
            height: estilo.height,
            minWidth: estilo.minWidth,
            maxWidth: estilo.maxWidth,
            minHeight: estilo.minHeight,
            maxHeight: estilo.maxHeight,
            flex: estilo.flex,
            flexDirection: estilo.flexDirection,
            flexBasis: estilo.flexBasis,
            flexGrow: estilo.flexGrow,
            flexShrink: estilo.flexShrink,
            transform: estilo.transform,
            overflow: estilo.overflow,
            overflowX: estilo.overflowX,
            overflowY: estilo.overflowY,
            zIndex: estilo.zIndex,
            margin: estilo.margin,
            padding: estilo.padding,
            boxSizing: estilo.boxSizing
        };
    }

    function descreverElemento(nome, elemento) {
        if (!elemento) {
            return {
                nome,
                encontrado: false
            };
        }

        return {
            nome,
            encontrado: true,
            tag: elemento.tagName.toLowerCase(),
            id: elemento.id || null,
            seletor: seletorResumido(elemento),
            classes: classeResumida(elemento),
            retangulo: obterRetangulo(elemento),
            estilos: obterEstilos(elemento),
            filhosDiretos: elemento.children.length,
            scrollHeight: elemento.scrollHeight,
            scrollWidth: elemento.scrollWidth,
            clientHeight: elemento.clientHeight,
            clientWidth: elemento.clientWidth
        };
    }

    function filhoDiretoQueContem(elemento, ancestral) {
        if (!elemento || !ancestral) return null;

        let atual = elemento;

        while (atual?.parentElement && atual.parentElement !== ancestral) {
            atual = atual.parentElement;
        }

        return atual?.parentElement === ancestral ? atual : null;
    }

    function encontrarTituloAtendimentos(raiz) {
        if (!raiz) return null;

        return Array.from(
            raiz.querySelectorAll('h1, h2, h3, h4, h5, h6')
        ).find(elemento =>
            elemento.textContent
                .trim()
                .toLowerCase()
                .includes('atendimentos')
        ) || null;
    }

    function localizarElementos() {
        const header = document.querySelector('.app-header');
        const chatBox = document.querySelector('#chatBox');

        const textarea =
            document.querySelector(
                'textarea[placeholder="Mensagem..."]'
            ) ||
            document.querySelector('textarea');

        const main =
            chatBox?.closest('main') ||
            textarea?.closest('main') ||
            Array.from(document.querySelectorAll('main')).find(elemento =>
                elemento.textContent.includes('Atendimentos')
            );

        const filhosMain = main
            ? Array.from(main.children)
            : [];

        const conversa =
            filhosMain.find(elemento =>
                elemento.contains(chatBox)
            ) ||
            chatBox?.closest('section') ||
            null;

        const tituloAtendimentos =
            encontrarTituloAtendimentos(main);

        const pesquisa =
            main?.querySelector(
                'input[placeholder="Pesquisar"]'
            ) || null;

        const lista =
            filhosMain.find(elemento =>
                elemento !== conversa &&
                (
                    elemento.contains(pesquisa) ||
                    elemento.contains(tituloAtendimentos)
                )
            ) ||
            pesquisa?.closest('section') ||
            tituloAtendimentos?.closest('section') ||
            null;

        const conteudoConversa =
            filhoDiretoQueContem(chatBox, conversa);

        const compositor =
            filhoDiretoQueContem(textarea, conversa) ||
            textarea?.closest('form') ||
            null;

        const cabecalhoConversa =
            conteudoConversa
                ? Array.from(conteudoConversa.children).find(
                    elemento => elemento.tagName === 'ARTICLE'
                )
                : null;

        const secaoRolagemLista =
            tituloAtendimentos?.closest('section') || null;

        const blocoSuperiorLista =
            lista
                ? Array.from(lista.children).find(elemento =>
                    elemento.contains(pesquisa)
                )
                : null;

        return {
            header,
            main,
            lista,
            blocoSuperiorLista,
            secaoRolagemLista,
            tituloAtendimentos,
            pesquisa,
            conversa,
            conteudoConversa,
            cabecalhoConversa,
            chatBox,
            compositor,
            textarea
        };
    }

    function criarCadeiaAncestrais(elemento, limite = 10) {
        const resultado = [];
        let atual = elemento;

        while (atual && resultado.length < limite) {
            resultado.push({
                seletor: seletorResumido(atual),
                classes: classeResumida(atual),
                retangulo: obterRetangulo(atual),
                estilos: obterEstilos(atual)
            });

            atual = atual.parentElement;
        }

        return resultado;
    }

    function listarFilhosDiretos(elemento) {
        if (!elemento) return [];

        return Array.from(elemento.children).map(
            (filho, indice) => ({
                indice,
                tag: filho.tagName.toLowerCase(),
                seletor: seletorResumido(filho),
                classes: classeResumida(filho),
                retangulo: obterRetangulo(filho),
                estilos: obterEstilos(filho),
                contemChatBox: Boolean(
                    filho.querySelector('#chatBox')
                ),
                contemPesquisa: Boolean(
                    filho.querySelector(
                        'input[placeholder="Pesquisar"]'
                    )
                ),
                contemTextarea: Boolean(
                    filho.querySelector('textarea')
                )
            })
        );
    }

    function gerarRelatorio(elementos) {
        const zoomEstimado =
            window.outerWidth && window.innerWidth
                ? Math.round(
                    (window.outerWidth / window.innerWidth) * 100
                )
                : null;

        return {
            diagnostico: 'TendiChat Layout Vertical',
            data: new Date().toISOString(),

            pagina: {
                url: `${location.origin}${location.pathname}`,
                titulo: document.title
            },

            tela: {
                innerWidth: window.innerWidth,
                innerHeight: window.innerHeight,
                outerWidth: window.outerWidth,
                outerHeight: window.outerHeight,
                screenWidth: screen.width,
                screenHeight: screen.height,
                availWidth: screen.availWidth,
                availHeight: screen.availHeight,
                devicePixelRatio: window.devicePixelRatio,
                zoomEstimadoPercentual: zoomEstimado,
                scrollX: window.scrollX,
                scrollY: window.scrollY
            },

            breakpoints: {
                menorQue640: matchMedia('(max-width: 639px)').matches,
                maiorOuIgual640: matchMedia('(min-width: 640px)').matches,
                maiorOuIgual768: matchMedia('(min-width: 768px)').matches,
                maiorOuIgual1024: matchMedia('(min-width: 1024px)').matches,
                orientacaoRetrato: matchMedia(
                    '(orientation: portrait)'
                ).matches
            },

            elementos: [
                descreverElemento(
                    'Cabeçalho geral .app-header',
                    elementos.header
                ),
                descreverElemento(
                    'Main principal',
                    elementos.main
                ),
                descreverElemento(
                    'Lista de atendimentos',
                    elementos.lista
                ),
                descreverElemento(
                    'Bloco superior da lista',
                    elementos.blocoSuperiorLista
                ),
                descreverElemento(
                    'Rolagem/listagem de atendimentos',
                    elementos.secaoRolagemLista
                ),
                descreverElemento(
                    'Título Atendimentos',
                    elementos.tituloAtendimentos
                ),
                descreverElemento(
                    'Campo de pesquisa',
                    elementos.pesquisa
                ),
                descreverElemento(
                    'Área geral da conversa',
                    elementos.conversa
                ),
                descreverElemento(
                    'Conteúdo da conversa',
                    elementos.conteudoConversa
                ),
                descreverElemento(
                    'Cabeçalho interno da conversa',
                    elementos.cabecalhoConversa
                ),
                descreverElemento(
                    'Histórico #chatBox',
                    elementos.chatBox
                ),
                descreverElemento(
                    'Compositor/campo inferior',
                    elementos.compositor
                ),
                descreverElemento(
                    'Textarea',
                    elementos.textarea
                )
            ],

            filhosDiretosDoMain:
                listarFilhosDiretos(elementos.main),

            filhosDiretosDaConversa:
                listarFilhosDiretos(elementos.conversa),

            ancestraisDoChatBox:
                criarCadeiaAncestrais(elementos.chatBox),

            ancestraisDoTextarea:
                criarCadeiaAncestrais(elementos.textarea)
        };
    }

    function limparDestaques() {
        document
            .querySelectorAll('[data-tc-diagnostico-destaque]')
            .forEach(elemento => {
                elemento.style.outline =
                    elemento.dataset.tcDiagnosticoOutline || '';

                elemento.style.outlineOffset =
                    elemento.dataset.tcDiagnosticoOutlineOffset || '';

                delete elemento.dataset.tcDiagnosticoDestaque;
                delete elemento.dataset.tcDiagnosticoOutline;
                delete elemento.dataset.tcDiagnosticoOutlineOffset;
            });

        document
            .querySelectorAll(`.${CLASSE_LABEL}`)
            .forEach(elemento => elemento.remove());
    }

    function destacarElemento(elemento, nome, cor) {
        if (!elemento) return;

        const retangulo = elemento.getBoundingClientRect();

        elemento.dataset.tcDiagnosticoDestaque = '1';
        elemento.dataset.tcDiagnosticoOutline =
            elemento.style.outline || '';

        elemento.dataset.tcDiagnosticoOutlineOffset =
            elemento.style.outlineOffset || '';

        elemento.style.outline = `3px solid ${cor}`;
        elemento.style.outlineOffset = '-3px';

        const label = document.createElement('div');
        label.className = CLASSE_LABEL;
        label.textContent = nome;

        Object.assign(label.style, {
            position: 'fixed',
            top: `${Math.max(0, retangulo.top + 3)}px`,
            left: `${Math.max(0, retangulo.left + 3)}px`,
            padding: '3px 7px',
            borderRadius: '5px',
            background: cor,
            color: '#fff',
            fontSize: '11px',
            fontWeight: '700',
            fontFamily: 'Arial, sans-serif',
            zIndex: '2147483647',
            pointerEvents: 'none',
            maxWidth: '260px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
        });

        document.body.appendChild(label);
    }

    function aplicarDestaques(elementos) {
        limparDestaques();

        destacarElemento(
            elementos.header,
            'HEADER GERAL',
            '#2563eb'
        );

        destacarElemento(
            elementos.main,
            'MAIN DO TENDICHAT',
            '#7c3aed'
        );

        destacarElemento(
            elementos.lista,
            'LISTA DE ATENDIMENTOS',
            '#dc2626'
        );

        destacarElemento(
            elementos.conversa,
            'ÁREA DA CONVERSA',
            '#16a34a'
        );

        destacarElemento(
            elementos.chatBox,
            'HISTÓRICO DO CHAT',
            '#ea580c'
        );

        destacarElemento(
            elementos.compositor,
            'CAMPO DE MENSAGEM',
            '#0891b2'
        );
    }

    async function copiarTexto(texto) {
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(texto, 'text');
                return true;
            }

            await navigator.clipboard.writeText(texto);
            return true;
        } catch (erro) {
            console.error(
                '[TendiChat Diagnóstico] Falha ao copiar:',
                erro
            );

            return false;
        }
    }

    function abrirModal(texto) {
        document.getElementById(ID_MODAL)?.remove();

        const modal = document.createElement('div');
        modal.id = ID_MODAL;

        Object.assign(modal.style, {
            position: 'fixed',
            inset: '0',
            background: 'rgba(0, 0, 0, 0.65)',
            zIndex: '2147483647',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '20px'
        });

        const caixa = document.createElement('div');

        Object.assign(caixa.style, {
            width: 'min(900px, 96vw)',
            height: 'min(760px, 90vh)',
            background: '#fff',
            borderRadius: '12px',
            padding: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            boxShadow: '0 20px 60px rgba(0,0,0,.4)'
        });

        const titulo = document.createElement('strong');
        titulo.textContent = 'Diagnóstico do TendiChat';

        Object.assign(titulo.style, {
            color: '#111827',
            fontFamily: 'Arial, sans-serif',
            fontSize: '16px'
        });

        const aviso = document.createElement('div');
        aviso.textContent =
            'O relatório não contém as mensagens do atendimento. Copie e envie o conteúdo abaixo.';

        Object.assign(aviso.style, {
            color: '#4b5563',
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px'
        });

        const textarea = document.createElement('textarea');
        textarea.value = texto;
        textarea.readOnly = true;

        Object.assign(textarea.style, {
            flex: '1',
            width: '100%',
            minHeight: '0',
            resize: 'none',
            padding: '10px',
            border: '1px solid #d1d5db',
            borderRadius: '8px',
            outline: 'none',
            fontFamily: 'Consolas, monospace',
            fontSize: '11px',
            color: '#111827',
            background: '#f9fafb'
        });

        const botoes = document.createElement('div');

        Object.assign(botoes.style, {
            display: 'flex',
            justifyContent: 'flex-end',
            gap: '8px'
        });

        const botaoCopiar = document.createElement('button');
        botaoCopiar.textContent = 'Copiar relatório';

        const botaoFechar = document.createElement('button');
        botaoFechar.textContent = 'Fechar';

        for (const botao of [botaoCopiar, botaoFechar]) {
            Object.assign(botao.style, {
                border: 'none',
                borderRadius: '8px',
                padding: '9px 14px',
                cursor: 'pointer',
                fontWeight: '700'
            });
        }

        Object.assign(botaoCopiar.style, {
            background: '#7c3aed',
            color: '#fff'
        });

        Object.assign(botaoFechar.style, {
            background: '#e5e7eb',
            color: '#111827'
        });

        botaoCopiar.addEventListener('click', async () => {
            const copiado = await copiarTexto(texto);

            botaoCopiar.textContent = copiado
                ? 'Copiado!'
                : 'Selecione e copie';

            if (!copiado) {
                textarea.focus();
                textarea.select();
            }
        });

        botaoFechar.addEventListener('click', () => {
            modal.remove();
        });

        modal.addEventListener('click', evento => {
            if (evento.target === modal) {
                modal.remove();
            }
        });

        botoes.append(botaoFechar, botaoCopiar);

        caixa.append(
            titulo,
            aviso,
            textarea,
            botoes
        );

        modal.appendChild(caixa);
        document.body.appendChild(modal);

        textarea.focus();
        textarea.select();
    }

    async function executarDiagnostico() {
        const elementos = localizarElementos();
        const relatorio = gerarRelatorio(elementos);
        const texto = JSON.stringify(relatorio, null, 2);

        aplicarDestaques(elementos);

        console.group(
            '%c[TendiChat Diagnóstico]',
            'color:#7c3aed;font-weight:bold'
        );

        console.log(relatorio);
        console.groupEnd();

        const copiado = await copiarTexto(texto);

        abrirModal(texto);

        const botao = document.querySelector(
            '#tc-diagnostico-executar'
        );

        if (botao) {
            botao.textContent = copiado
                ? '✅ Diagnóstico copiado'
                : '🧪 Diagnóstico gerado';

            setTimeout(() => {
                botao.textContent = '🧪 Rodar diagnóstico';
            }, 2500);
        }
    }

    function criarPainel() {
        if (document.getElementById(ID_PAINEL)) return;

        const painel = document.createElement('div');
        painel.id = ID_PAINEL;

        Object.assign(painel.style, {
            position: 'fixed',
            right: '12px',
            top: '70px',
            zIndex: '2147483646',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            fontFamily: 'Arial, sans-serif'
        });

        const executar = document.createElement('button');
        executar.id = 'tc-diagnostico-executar';
        executar.textContent = '🧪 Rodar diagnóstico';

        const limpar = document.createElement('button');
        limpar.textContent = '🧹 Limpar marcações';

        for (const botao of [executar, limpar]) {
            Object.assign(botao.style, {
                border: 'none',
                borderRadius: '9px',
                padding: '9px 12px',
                cursor: 'pointer',
                color: '#fff',
                fontSize: '12px',
                fontWeight: '700',
                boxShadow: '0 4px 12px rgba(0,0,0,.25)'
            });
        }

        executar.style.background = '#7c3aed';
        limpar.style.background = '#475569';

        executar.addEventListener(
            'click',
            executarDiagnostico
        );

        limpar.addEventListener(
            'click',
            limparDestaques
        );

        painel.append(executar, limpar);
        document.body.appendChild(painel);
    }

    function iniciar() {
        criarPainel();

        const observer = new MutationObserver(() => {
            criarPainel();
        });

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true
        });
    }

    iniciar();
})();