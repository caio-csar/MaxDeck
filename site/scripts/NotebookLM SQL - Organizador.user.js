// ==UserScript==
// @name         NotebookLM SQL - Organizador
// @namespace    caio.sql.notebook
// @version      30.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/NotebookLM%20SQL%20-%20Organizador.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/NotebookLM%20SQL%20-%20Organizador.user.js
// @match        https://*.google.com/*
// @grant        GM_setClipboard
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    const NOTEBOOK_ID =
        '86d68261-51e9-4b08-934c-adb2e6ce59ad';

    if (!location.href.includes(NOTEBOOK_ID)) {
        return;
    }

    let scriptsAtuais = [];


    // =========================================================
    // UTILITÁRIOS
    // =========================================================

    function limparTexto(texto) {

        return String(texto || '')
            .replace(/\u00A0/g, ' ')
            .replace(/\\+_/g, '_')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .trim();
    }


    function ehSQL(texto) {

        return /^\s*(SELECT|INSERT|UPDATE|DELETE|MERGE|WITH|CREATE|ALTER|DROP|EXEC|EXECUTE|DECLARE|TRUNCATE|DBCC)\b/i
            .test(
                limparTexto(texto)
            );
    }


    function tipoSQL(sql) {

        const match =
            limparTexto(sql)
                .match(
                    /^(SELECT|INSERT|UPDATE|DELETE|MERGE|WITH|CREATE|ALTER|DROP|EXEC|EXECUTE|DECLARE|TRUNCATE|DBCC)\b/i
                );


        if (!match) {
            return 'SQL';
        }


        return match[1]
            .toUpperCase()
            .replace(
                'EXECUTE',
                'EXEC'
            );
    }


function copiarTexto(texto) {

    // Mantém a formatação e força quebra de linha padrão Windows
    const textoFormatado =
        String(texto || '')
            .replace(/\r\n/g, '\n')
            .replace(/\r/g, '\n')
            .replace(/\n/g, '\r\n');

    try {

        if (
            typeof GM_setClipboard ===
            'function'
        ) {

            GM_setClipboard(
                textoFormatado,
                'text'
            );

            return;
        }

    } catch (erro) {

        console.error(
            '[CAIO SQL] clipboard:',
            erro
        );
    }


    navigator.clipboard
        ?.writeText(
            textoFormatado
        );
}


    function criarElemento(
        tag,
        texto,
        css
    ) {

        const elemento =
            document.createElement(tag);


        if (
            texto !== undefined &&
            texto !== null
        ) {

            elemento.textContent =
                texto;
        }


        if (css) {

            elemento.style.cssText =
                css;
        }


        return elemento;
    }


    // =========================================================
    // LOCALIZA A ÚLTIMA RESPOSTA
    // =========================================================

    function pegarUltimaResposta() {

        const candidatos =
            Array.from(
                document.querySelectorAll(
                    '[aria-label]'
                )
            );


        const botoesCopiar =
            candidatos.filter(
                function (el) {

                    const label =
                        (
                            el.getAttribute(
                                'aria-label'
                            ) ||
                            ''
                        )
                        .toLowerCase();


                    return (
                        label.includes('copiar') &&
                        label.includes('resposta')
                    );

                }
            );


        if (!botoesCopiar.length) {
            return null;
        }


        const ultimo =
            botoesCopiar[
                botoesCopiar.length - 1
            ];


        let elemento =
            ultimo;


        for (
            let i = 0;
            i < 25 && elemento;
            i++
        ) {

            const classes =
                String(
                    elemento.className ||
                    ''
                );


            if (
                classes.includes(
                    'to-user-container'
                )
            ) {

                return elemento;
            }


            elemento =
                elemento.parentElement;
        }


        return (
            ultimo.closest('mat-card') ||
            ultimo.closest('chat-message') ||
            null
        );
    }


    // =========================================================
    // EXTRAÇÃO DOS SCRIPTS
    // =========================================================

    function extrairScripts(
        resposta
    ) {

        const resultado =
            [];


        if (!resposta) {
            return resultado;
        }


        const elementos =
            Array.from(
                resposta.querySelectorAll(
                    'paragraph-element-view, code-block-element-view'
                )
            );


        let tituloAtual =
            '';

        let descricaoAtual =
            '';


        elementos.forEach(
            function (elemento) {

                // =============================================
                // PARÁGRAFO / TÍTULO
                // =============================================

                if (
                    elemento.matches(
                        'paragraph-element-view'
                    )
                ) {

                    const p =
                        elemento.querySelector(
                            '.paragraph'
                        );


                    if (!p) {
                        return;
                    }


                    const texto =
                        limparTexto(
                            p.innerText ||
                            p.textContent
                        );


                    if (!texto) {
                        return;
                    }


                    const ehTitulo =

                        p.getAttribute(
                            'role'
                        ) === 'heading'

                        ||

                        p.hasAttribute(
                            'aria-level'
                        )

                        ||

                        Array.from(
                            p.classList
                        )
                        .some(
                            function (classe) {

                                return /^heading\d+$/i
                                    .test(
                                        classe
                                    );
                            }
                        );


                    if (ehTitulo) {

                        tituloAtual =
                            texto;

                        descricaoAtual =
                            '';

                    } else if (
                        tituloAtual
                    ) {

                        descricaoAtual +=
                            (
                                descricaoAtual
                                    ? '\n'
                                    : ''
                            )
                            +
                            texto;
                    }


                    return;
                }


                // =============================================
                // BLOCO DE CÓDIGO
                // =============================================

                if (
                    elemento.matches(
                        'code-block-element-view'
                    )
                ) {

                    const code =
                        elemento.querySelector(
                            'pre code'
                        );


                    if (!code) {
                        return;
                    }


                    const sql =
                        limparTexto(
                            code.innerText ||
                            code.textContent
                        );


                    if (!ehSQL(sql)) {
                        return;
                    }


                    resultado.push({

                        titulo:
                            tituloAtual ||
                            `Script ${resultado.length + 1}`,

                        descricao:
                            descricaoAtual.trim(),

                        tipo:
                            tipoSQL(sql),

                        sql:
                            sql
                    });


                    descricaoAtual =
                        '';
                }

            }
        );


        // =====================================================
        // FALLBACK
        // =====================================================

        if (!resultado.length) {

            resposta
                .querySelectorAll(
                    'pre code'
                )
                .forEach(
                    function (code) {

                        const sql =
                            limparTexto(
                                code.innerText ||
                                code.textContent
                            );


                        if (!ehSQL(sql)) {
                            return;
                        }


                        resultado.push({

                            titulo:
                                `Script ${resultado.length + 1}`,

                            descricao:
                                '',

                            tipo:
                                tipoSQL(sql),

                            sql:
                                sql
                        });

                    }
                );
        }


        return resultado;
    }


    // =========================================================
    // CRIA O POPOVER
    // ZERO innerHTML
    // =========================================================

    function criarPainel() {

        let painel =
            document.getElementById(
                'caio-sql-painel'
            );


        if (painel) {
            return painel;
        }


        painel =
            document.createElement('div');


        painel.id =
            'caio-sql-painel';


        painel.setAttribute(
            'popover',
            'manual'
        );


        painel.style.cssText = `
            width: 94vw !important;
            height: 90vh !important;

            max-width: none !important;
            max-height: none !important;

            box-sizing: border-box !important;

            margin: auto !important;
            padding: 0 !important;

            border: 2px solid #2563eb !important;
            border-radius: 18px !important;

            background: #0b1120 !important;
            color: white !important;

            overflow: hidden !important;

            font-family: Arial, sans-serif !important;

            box-shadow:
                0 30px 100px
                rgba(0,0,0,.70) !important;
        `;


        // =====================================================
        // CONTAINER
        // =====================================================

        const container =
            criarElemento(
                'div',
                null,
                `
                    width:100%;
                    height:100%;

                    display:flex;
                    flex-direction:column;
                `
            );


        // =====================================================
        // HEADER
        // =====================================================

        const header =
            criarElemento(
                'div',
                null,
                `
                    height:72px;

                    box-sizing:border-box;

                    padding:0 24px;

                    display:flex;
                    align-items:center;
                    justify-content:space-between;

                    gap:20px;

                    background:#111827;

                    border-bottom:
                        1px solid
                        rgba(255,255,255,.10);
                `
            );


        const esquerda =
            criarElemento(
                'div',
                null,
                `
                    display:flex;
                    align-items:center;
                    gap:13px;
                `
            );


        const logo =
            criarElemento(
                'div',
                'SQL',
                `
                    width:44px;
                    height:44px;

                    border-radius:12px;

                    display:flex;
                    align-items:center;
                    justify-content:center;

                    background:
                        linear-gradient(
                            135deg,
                            #2563eb,
                            #4f46e5
                        );

                    font-family:
                        Consolas,
                        monospace;

                    font-size:13px;
                    font-weight:900;
                `
            );


        const tituloBox =
            criarElemento(
                'div'
            );


        const titulo =
            criarElemento(
                'div',
                'Scripts da última resposta',
                `
                    font-size:20px;
                    font-weight:800;
                `
            );


        const status =
            criarElemento(
                'div',
                'Pronto',
                `
                    margin-top:4px;

                    color:#94a3b8;

                    font-size:12px;
                `
            );


        status.id =
            'caio-sql-status';


        tituloBox.appendChild(
            titulo
        );

        tituloBox.appendChild(
            status
        );


        esquerda.appendChild(
            logo
        );

        esquerda.appendChild(
            tituloBox
        );


        // =====================================================
        // AÇÕES
        // =====================================================

        const acoes =
            criarElemento(
                'div',
                null,
                `
                    display:flex;
                    gap:8px;
                `
            );


        const copiarTodos =
            criarElemento(
                'button',
                'Copiar todos',
                `
                    height:39px;

                    padding:0 15px;

                    border:none;
                    border-radius:9px;

                    background:#2563eb;
                    color:white;

                    font-weight:700;

                    cursor:pointer;
                `
            );


        copiarTodos.type =
            'button';


        copiarTodos.addEventListener(
            'click',
            function () {

                if (!scriptsAtuais.length) {
                    return;
                }


                const texto =
                    scriptsAtuais
                        .map(
                            function (
                                script,
                                index
                            ) {

                                return (
`-- ============================================================
-- ${index + 1}. ${script.titulo}
-- ============================================================

${script.sql}`
                                );

                            }
                        )
                        .join(
                            '\n\n\n'
                        );


                copiarTexto(
                    texto
                );


                const original =
                    copiarTodos.textContent;


                copiarTodos.textContent =
                    'Copiado ✓';


                copiarTodos.style.background =
                    '#059669';


                setTimeout(
                    function () {

                        copiarTodos.textContent =
                            original;

                        copiarTodos.style.background =
                            '#2563eb';

                    },
                    1000
                );

            }
        );


        const fechar =
            criarElemento(
                'button',
                '×',
                `
                    width:42px;
                    height:39px;

                    border:
                        1px solid
                        rgba(255,255,255,.14);

                    border-radius:9px;

                    background:
                        rgba(255,255,255,.07);

                    color:white;

                    font-size:23px;

                    cursor:pointer;
                `
            );


        fechar.type =
            'button';


        fechar.addEventListener(
            'click',
            function () {

                painel.hidePopover();

            }
        );


        acoes.appendChild(
            copiarTodos
        );

        acoes.appendChild(
            fechar
        );


        header.appendChild(
            esquerda
        );

        header.appendChild(
            acoes
        );


        // =====================================================
        // CORPO
        // =====================================================

        const corpo =
            criarElemento(
                'div',
                null,
                `
                    flex:1;

                    min-height:0;

                    overflow:auto;

                    padding:22px;

                    box-sizing:border-box;

                    background:
                        radial-gradient(
                            circle at top,
                            #172554,
                            #0b1120 55%
                        );
                `
            );


        const grid =
            criarElemento(
                'div',
                null,
                `
                    width:100%;

                    display:grid;

                    grid-template-columns:
                        repeat(
                            auto-fit,
                            minmax(
                                min(520px,100%),
                                1fr
                            )
                        );

                    gap:20px;

                    align-items:start;
                `
            );


        grid.id =
            'caio-sql-grid';


        corpo.appendChild(
            grid
        );


        container.appendChild(
            header
        );

        container.appendChild(
            corpo
        );

        painel.appendChild(
            container
        );


        document.body.appendChild(
            painel
        );


        return painel;
    }


    // =========================================================
    // CARD SQL
    // ZERO innerHTML
    // =========================================================

    function criarCard(
        script,
        index
    ) {

        const card =
            criarElemento(
                'article',
                null,
                `
                    min-width:0;

                    overflow:hidden;

                    border:
                        1px solid
                        rgba(255,255,255,.10);

                    border-radius:16px;

                    background:#111827;

                    box-shadow:
                        0 10px 30px
                        rgba(0,0,0,.25);
                `
            );


        const header =
            criarElemento(
                'div',
                null,
                `
                    min-height:72px;

                    box-sizing:border-box;

                    padding:13px 15px;

                    display:flex;
                    align-items:center;
                    justify-content:space-between;

                    gap:15px;

                    background:#172033;

                    border-bottom:
                        1px solid
                        rgba(255,255,255,.08);
                `
            );


        const info =
            criarElemento(
                'div',
                null,
                `
                    min-width:0;
                `
            );


        const linhaTitulo =
            criarElemento(
                'div',
                null,
                `
                    display:flex;
                    align-items:center;

                    gap:7px;

                    color:#f8fafc;

                    font-size:14px;
                    font-weight:800;

                    line-height:1.4;
                `
            );


        const numero =
            criarElemento(
                'span',
                String(
                    index + 1
                ),
                `
                    min-width:22px;
                    height:22px;

                    box-sizing:border-box;

                    padding:0 6px;

                    border-radius:6px;

                    display:inline-flex;
                    align-items:center;
                    justify-content:center;

                    flex-shrink:0;

                    background:
                        rgba(
                            59,
                            130,
                            246,
                            .18
                        );

                    color:#93c5fd;

                    font-size:10px;
                `
            );


        const titulo =
            criarElemento(
                'span',
                script.titulo,
                `
                    min-width:0;

                    overflow-wrap:anywhere;
                `
            );


        linhaTitulo.appendChild(
            numero
        );

        linhaTitulo.appendChild(
            titulo
        );


        const tipo =
            criarElemento(
                'span',
                script.tipo,
                `
                    display:inline-block;

                    margin-top:7px;

                    padding:3px 7px;

                    border-radius:5px;

                    background:#26344d;

                    color:#93c5fd;

                    font-family:
                        Consolas,
                        monospace;

                    font-size:9px;
                    font-weight:800;
                `
            );


        info.appendChild(
            linhaTitulo
        );

        info.appendChild(
            tipo
        );


        if (
            script.descricao
        ) {

            const descricao =
                criarElemento(
                    'div',
                    script.descricao,
                    `
                        margin-top:7px;

                        color:#94a3b8;

                        font-size:11px;

                        line-height:1.45;

                        white-space:pre-line;
                    `
                );


            info.appendChild(
                descricao
            );
        }


        const copiar =
            criarElemento(
                'button',
                'Copiar SQL',
                `
                    flex-shrink:0;

                    height:35px;

                    padding:0 13px;

                    border:none;
                    border-radius:8px;

                    background:#2563eb;
                    color:white;

                    font-size:11px;
                    font-weight:800;

                    cursor:pointer;
                `
            );


        copiar.type =
            'button';


        copiar.addEventListener(
            'click',
            function () {

                copiarTexto(
                    script.sql
                );


                copiar.textContent =
                    'Copiado ✓';


                copiar.style.background =
                    '#059669';


                setTimeout(
                    function () {

                        copiar.textContent =
                            'Copiar SQL';

                        copiar.style.background =
                            '#2563eb';

                    },
                    1000
                );

            }
        );


        header.appendChild(
            info
        );

        header.appendChild(
            copiar
        );


        const pre =
            criarElemento(
                'pre',
                null,
                `
                    margin:0;

                    max-height:620px;

                    overflow:auto;

                    box-sizing:border-box;

                    padding:18px;

                    background:#0b1120;

                    color:#dbe5f4;

                    font-family:
                        Consolas,
                        "Cascadia Code",
                        monospace;

                    font-size:12.5px;

                    line-height:1.55;

                    white-space:pre;

                    tab-size:4;
                `
            );


        const code =
            criarElemento(
                'code',
                script.sql
            );


        pre.appendChild(
            code
        );


        card.appendChild(
            header
        );

        card.appendChild(
            pre
        );


        return card;
    }


    // =========================================================
    // RENDERIZAÇÃO
    // =========================================================

    function renderizarScripts() {

        const grid =
            document.getElementById(
                'caio-sql-grid'
            );


        const status =
            document.getElementById(
                'caio-sql-status'
            );


        if (!grid) {
            return;
        }


        // limpa sem innerHTML

        while (
            grid.firstChild
        ) {

            grid.removeChild(
                grid.firstChild
            );
        }


        if (!scriptsAtuais.length) {

            if (status) {

                status.textContent =
                    'Nenhum script encontrado';
            }


            const vazio =
                criarElemento(
                    'div',
                    null,
                    `
                        grid-column:1/-1;

                        min-height:55vh;

                        display:flex;
                        align-items:center;
                        justify-content:center;

                        text-align:center;
                    `
                );


            const caixa =
                criarElemento(
                    'div'
                );


            const titulo =
                criarElemento(
                    'div',
                    'Nenhum SQL encontrado',
                    `
                        color:white;

                        font-size:19px;
                        font-weight:800;

                        margin-bottom:8px;
                    `
                );


            const texto =
                criarElemento(
                    'div',
                    'A última resposta não possui bloco SQL reconhecido.',
                    `
                        color:#94a3b8;

                        font-size:13px;
                    `
                );


            caixa.appendChild(
                titulo
            );

            caixa.appendChild(
                texto
            );

            vazio.appendChild(
                caixa
            );

            grid.appendChild(
                vazio
            );


            return;
        }


        if (status) {

            status.textContent =
                scriptsAtuais.length === 1

                ? '1 script encontrado'

                : `${scriptsAtuais.length} scripts encontrados`;
        }


        scriptsAtuais.forEach(
            function (
                script,
                index
            ) {

                grid.appendChild(
                    criarCard(
                        script,
                        index
                    )
                );

            }
        );
    }


    // =========================================================
    // ABERTURA
    // =========================================================

    function abrirPainel() {

        try {

            const painel =
                criarPainel();


            painel.showPopover();


            const status =
                document.getElementById(
                    'caio-sql-status'
                );


            if (status) {

                status.textContent =
                    'Lendo última resposta...';
            }


            const resposta =
                pegarUltimaResposta();


            scriptsAtuais =
                extrairScripts(
                    resposta
                );


            renderizarScripts();


        } catch (erro) {

            console.error(
                '[CAIO SQL] ERRO:',
                erro
            );


            alert(
                'Erro SQL Scripts:\n\n' +
                (
                    erro.stack ||
                    erro.message ||
                    String(erro)
                )
            );
        }
    }


    // =========================================================
    // BOTÃO
    // MESMA ESTRUTURA QUE JÁ FUNCIONOU
    // =========================================================

    function criarBotao() {

        const wrapper =
            document.createElement('span');

        wrapper.id =
            'caio-sql-wrapper';

        wrapper.style.cssText = `
            display: inline-flex !important;
            align-items: center !important;
            margin: 0 8px !important;
        `;


        const button =
            document.createElement('button');

        button.type =
            'button';

        button.textContent =
            '</> SQL Scripts';

        button.style.cssText = `
            height: 36px !important;
            padding: 0 14px !important;

            border: 1px solid #a8c7fa !important;
            border-radius: 18px !important;

            background: #e8f0fe !important;
            color: #0b57d0 !important;

            font-family: Arial, sans-serif !important;
            font-size: 12px !important;
            font-weight: bold !important;

            cursor: pointer !important;

            display: inline-flex !important;
            align-items: center !important;
        `;


        button.addEventListener(
            'click',
            function (event) {

                event.preventDefault();
                event.stopPropagation();

                abrirPainel();

            }
        );


        wrapper.appendChild(
            button
        );


        return wrapper;
    }


    // =========================================================
    // LOCALIZADOR
    // MESMA LÓGICA COMPROVADA
    // =========================================================

    function procurar() {

        try {

            const candidatos =
                Array.from(
                    document.querySelectorAll(
                        '[aria-label]'
                    )
                );


            const copiar =
                candidatos.filter(
                    function (el) {

                        const label =
                            el.getAttribute(
                                'aria-label'
                            ) || '';


                        return (
                            label
                                .toLowerCase()
                                .includes(
                                    'copiar'
                                )

                            &&

                            label
                                .toLowerCase()
                                .includes(
                                    'resposta'
                                )
                        );

                    }
                );


            if (!copiar.length) {
                return;
            }


            const ultimo =
                copiar[
                    copiar.length - 1
                ];


            let elemento =
                ultimo;


            let barra =
                null;


            for (
                let i = 0;
                i < 12 && elemento;
                i++
            ) {

                const tag =
                    (
                        elemento.tagName ||
                        ''
                    ).toLowerCase();


                const classes =
                    elemento.className ||
                    '';


                if (
                    tag ===
                    'mat-card-actions'

                    ||

                    String(classes)
                        .includes(
                            'message-actions'
                        )
                ) {

                    barra =
                        elemento;

                    break;
                }


                elemento =
                    elemento.parentElement;
            }


            if (!barra) {
                return;
            }


            const velho =
                document.getElementById(
                    'caio-sql-wrapper'
                );


            if (velho) {

                if (
                    velho.parentElement ===
                    barra
                ) {

                    return;
                }


                velho.remove();
            }


            const novo =
                criarBotao();


            const chatActions =
                barra.querySelector(
                    'chat-actions'
                );


            if (chatActions) {

                barra.insertBefore(
                    novo,
                    chatActions
                );

            } else {

                barra.appendChild(
                    novo
                );
            }


        } catch (erro) {

            console.error(
                '[CAIO SQL]',
                erro
            );
        }
    }


    // =========================================================
    // EXECUÇÃO
    // =========================================================

    setTimeout(
        procurar,
        500
    );


    setInterval(
        procurar,
        2000
    );

})();