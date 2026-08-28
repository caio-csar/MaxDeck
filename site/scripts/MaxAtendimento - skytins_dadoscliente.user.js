// ==UserScript==
// @name         MaxAtendimento - skytins_dadoscliente
// @namespace    maxdata.atendimento.skytins_dadoscliente
// @version      2.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20skytins_dadoscliente.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/MaxAtendimento%20-%20skytins_dadoscliente.user.js
// @description  Gera INSERT de cadastro, abre OS SkyTins, copia mensagem para WhatsApp e copia CNPJ limpo
// @match        *://externo.maxdatasistema.com.br/Atendimentos/Atendimento*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ATENDIMENTO_URL =
        'http://externo.maxdatasistema.com.br/Atendimentos/Atendimento';

    const ID_ACOES =
        'tm-acoes-cliente';

    const ID_TOAST =
        'tm-acoes-cliente-toast';


    // =========================================================
    // UTILITÁRIOS
    // =========================================================

    function getValor(id) {

        const elemento =
            document.getElementById(id);

        return elemento
            ? String(
                elemento.value || ''
            ).trim()
            : '';
    }


    function somenteNumeros(valor) {

        return String(
            valor || ''
        ).replace(
            /\D/g,
            ''
        );
    }


    function limparNomeEmpresa(valor) {

        return String(
            valor || ''
        )
            .replace(
                /[#*]/g,
                ''
            )
            .replace(
                /\s+/g,
                ' '
            )
            .trim();
    }


    function escaparSQL(valor) {

        return String(
            valor || ''
        ).replace(
            /'/g,
            "''"
        );
    }


    function sqlTexto(valor) {

        return `N'${escaparSQL(valor)}'`;
    }


    function separarCidadeUF(valor) {

        const texto =
            String(
                valor || ''
            ).trim();

        const match =
            texto.match(
                /^(.*?)\s*-\s*([A-Za-z]{2})\s*$/
            );

        if (!match) {

            return {
                cidade: texto,
                uf: ''
            };
        }

        return {
            cidade:
                match[1].trim(),

            uf:
                match[2].toUpperCase()
        };
    }


    async function copiarTexto(texto) {

        try {

            await navigator.clipboard.writeText(
                texto
            );

            return true;

        } catch (e) {

            const area =
                document.createElement(
                    'textarea'
                );

            area.value =
                texto;

            area.style.position =
                'fixed';

            area.style.left =
                '-9999px';

            area.style.top =
                '-9999px';

            document.body.appendChild(
                area
            );

            area.focus();
            area.select();

            let sucesso =
                false;

            try {

                sucesso =
                    document.execCommand(
                        'copy'
                    );

            } catch (erro) {

                sucesso =
                    false;
            }

            area.remove();

            return sucesso;
        }
    }


    function mostrarAviso(
        texto,
        erro = false
    ) {

        const anterior =
            document.getElementById(
                ID_TOAST
            );

        if (anterior) {
            anterior.remove();
        }

        const aviso =
            document.createElement(
                'div'
            );

        aviso.id =
            ID_TOAST;

        aviso.textContent =
            texto;

        Object.assign(
            aviso.style,
            {
                position: 'fixed',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: '2147483647',

                background:
                    erro
                        ? '#c62828'
                        : '#2e7d32',

                color: '#fff',

                padding:
                    '10px 16px',

                borderRadius:
                    '5px',

                fontFamily:
                    'Arial, sans-serif',

                fontSize:
                    '13px',

                fontWeight:
                    '600',

                boxShadow:
                    '0 3px 12px rgba(0,0,0,.30)'
            }
        );

        document.body.appendChild(
            aviso
        );

        setTimeout(
            () => aviso.remove(),
            2000
        );
    }


    // =========================================================
    // INSERT CADASTRO
    // =========================================================

    function gerarInsert() {

        const razao =
            limparNomeEmpresa(
                getValor(
                    'vedCliNome'
                )
            ).toUpperCase();

        const fantasia =
            limparNomeEmpresa(
                getValor(
                    'Cliente_cliFantasia'
                )
            ).toUpperCase();

        const apelido =
            fantasia;

        const cnpj =
            somenteNumeros(
                getValor(
                    'Cliente_cliCpfCgc'
                )
            );

        const ie =
            somenteNumeros(
                getValor(
                    'Cliente_cliRgInsc'
                )
            );

        const telefone =
            somenteNumeros(
                getValor(
                    'Cliente_cliCelular'
                )
            );

        const cidadeUF =
            separarCidadeUF(
                getValor(
                    'CliCidade'
                )
            );

        const cidade =
            String(
                cidadeUF.cidade || ''
            )
                .trim()
                .toUpperCase();

        const uf =
            String(
                cidadeUF.uf || ''
            )
                .trim()
                .toUpperCase();

        return `INSERT INTO config (
    cofEmpRazao,
    cofEmpFantasia,
    cofEmpApelido,
    -- cofEmpCnpj,
    cofEmpIe,
    cofEmpFone,
    cofEmpCid,
    cofEmpUf
)
VALUES (
    ${sqlTexto(razao)},
    ${sqlTexto(fantasia)},
    ${sqlTexto(apelido)},
    -- ${sqlTexto(cnpj)},
    ${sqlTexto(ie)},
    ${sqlTexto(telefone)},
    ${sqlTexto(cidade)},
    ${sqlTexto(uf)}
);`;
    }


    // =========================================================
    // MENSAGEM SKYTINS / WHATSAPP
    // =========================================================

    function gerarMensagemSkyTins() {

        const codigo =
            getValor(
                'vedClienteId'
            );

        const numeroOS =
            getValor(
                'vedId'
            );

        return (
            `Solicito acesso adm a empresa(${codigo}). ` +
            `OS enviada ao Paulo: ${numeroOS}`
        );
    }


    // =========================================================
    // ABERTURA DE OS SKYTINS
    // =========================================================

    function abrirOSSkyTins() {

        const cnpj =
            somenteNumeros(
                getValor(
                    'Cliente_cliCpfCgc'
                )
            );

        const contato =
            somenteNumeros(
                getValor(
                    'vedAtendContato'
                )
            );

        if (
            cnpj.length !== 14
        ) {

            mostrarAviso(
                'Não foi possível identificar o CNPJ deste atendimento.',
                true
            );

            return;
        }

        const url =
            new URL(
                ATENDIMENTO_URL
            );

        url.searchParams.set(
            'tm_auto',
            '1'
        );

        url.searchParams.set(
            'tm_cnpj',
            cnpj
        );

        if (contato) {

            url.searchParams.set(
                'tm_contato',
                contato
            );
        }

        url.searchParams.set(
            'tm_interno',
            '1'
        );

        window.open(
            url.toString(),
            '_blank'
        );
    }


    // =========================================================
    // BOTÕES / ÍCONES
    // =========================================================

    function aplicarBaseAcao(acao) {

        acao.setAttribute(
            'role',
            'button'
        );

        acao.tabIndex =
            0;

        Object.assign(
            acao.style,
            {
                height: '30px',

                display:
                    'inline-flex',

                alignItems:
                    'center',

                justifyContent:
                    'center',

                borderRadius:
                    '4px',

                fontFamily:
                    '"Roboto", Arial, sans-serif',

                fontSize:
                    '12px',

                fontWeight:
                    '500',

                cursor:
                    'pointer',

                userSelect:
                    'none',

                whiteSpace:
                    'nowrap',

                boxSizing:
                    'border-box',

                transition:
                    'background .15s ease, box-shadow .15s ease, transform .08s ease'
            }
        );

        acao.addEventListener(
            'mousedown',
            () => {

                acao.style.transform =
                    'translateY(1px)';
            }
        );

        acao.addEventListener(
            'mouseup',
            () => {

                acao.style.transform =
                    'translateY(0)';
            }
        );

        acao.addEventListener(
            'mouseleave',
            () => {

                acao.style.transform =
                    'translateY(0)';
            }
        );

        return acao;
    }


    // =========================================================
    // BOTÃO INSERT
    // =========================================================

    function criarBotaoInsert() {

        const acao =
            aplicarBaseAcao(
                document.createElement(
                    'div'
                )
            );

        acao.textContent =
            'Insert cadastro';

        acao.title =
            'Gerar e copiar INSERT do cadastro';

        Object.assign(
            acao.style,
            {
                padding:
                    '0 10px',

                border:
                    '1px solid #9e9e9e',

                background:
                    '#ffffff',

                color:
                    '#424242'
            }
        );

        acao.addEventListener(
            'mouseenter',
            () => {

                acao.style.background =
                    '#f5f5f5';
            }
        );

        acao.addEventListener(
            'mouseleave',
            () => {

                acao.style.background =
                    '#ffffff';
            }
        );

        acao.addEventListener(
            'click',
            async function (event) {

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                const razao =
                    getValor(
                        'vedCliNome'
                    );

                const fantasia =
                    getValor(
                        'Cliente_cliFantasia'
                    );

                const cidade =
                    getValor(
                        'CliCidade'
                    );

                if (!razao) {

                    mostrarAviso(
                        'Razão social não encontrada.',
                        true
                    );

                    return;
                }

                if (!fantasia) {

                    mostrarAviso(
                        'Nome fantasia não encontrado.',
                        true
                    );

                    return;
                }

                if (!cidade) {

                    mostrarAviso(
                        'Cidade não encontrada.',
                        true
                    );

                    return;
                }

                const copiado =
                    await copiarTexto(
                        gerarInsert()
                    );

                mostrarAviso(
                    copiado
                        ? 'INSERT copiado.'
                        : 'Não foi possível copiar o INSERT.',
                    !copiado
                );
            },
            true
        );

        return acao;
    }


    // =========================================================
    // ÍCONE / BOTÃO SKYTINS
    // =========================================================

    function criarIconeSkyTins() {

        const miolo =
            document.createElement(
                'span'
            );

        miolo.textContent =
            'S';

        Object.assign(
            miolo.style,
            {
                width:
                    '18px',

                height:
                    '18px',

                display:
                    'inline-flex',

                alignItems:
                    'center',

                justifyContent:
                    'center',

                border:
                    '2px solid #fff',

                borderRadius:
                    '50%',

                background:
                    '#fff',

                color:
                    '#2d8bc5',

                fontSize:
                    '13px',

                fontWeight:
                    '900',

                fontFamily:
                    'Arial, sans-serif',

                lineHeight:
                    '1',

                boxSizing:
                    'border-box'
            }
        );

        return miolo;
    }


    function criarBotaoSkyTins() {

        const acao =
            aplicarBaseAcao(
                document.createElement(
                    'div'
                )
            );

        acao.title =
            'Abrir OS para SkyTins';

        acao.setAttribute(
            'aria-label',
            'Abrir OS para SkyTins'
        );

        acao.appendChild(
            criarIconeSkyTins()
        );

        Object.assign(
            acao.style,
            {
                width:
                    '30px',

                minWidth:
                    '30px',

                padding:
                    '0',

                border:
                    '1px solid #2378aa',

                background:
                    '#2d8bc5',

                color:
                    '#fff'
            }
        );

        acao.addEventListener(
            'mouseenter',
            () => {

                acao.style.background =
                    '#2378aa';
            }
        );

        acao.addEventListener(
            'mouseleave',
            () => {

                acao.style.background =
                    '#2d8bc5';
            }
        );

        acao.addEventListener(
            'click',
            function (event) {

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                abrirOSSkyTins();
            },
            true
        );

        return acao;
    }


    // =========================================================
    // ÍCONE / BOTÃO WHATSAPP
    // =========================================================

    function criarIconeWhatsApp() {

        const svg =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'svg'
            );

        svg.setAttribute(
            'viewBox',
            '0 0 24 24'
        );

        svg.setAttribute(
            'width',
            '18'
        );

        svg.setAttribute(
            'height',
            '18'
        );

        svg.setAttribute(
            'aria-hidden',
            'true'
        );


        const bolha =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'path'
            );

        bolha.setAttribute(
            'fill',
            'currentColor'
        );

        bolha.setAttribute(
            'd',
            'M12 2a9 9 0 0 0-7.78 13.52L3 21l5.63-1.18A9 9 0 1 0 12 2Z'
        );


        const telefone =
            document.createElementNS(
                'http://www.w3.org/2000/svg',
                'path'
            );

        telefone.setAttribute(
            'fill',
            '#1976d2'
        );

        telefone.setAttribute(
            'd',
            'M8.1 7.1c.2-.45.4-.46.72-.47h.61c.18 0 .39.06.5.36l.76 1.85c.08.2.04.36-.07.53l-.43.6c-.12.16-.24.3-.1.55.14.25.62 1 1.32 1.62.9.8 1.67 1.05 1.92 1.18.24.12.39.1.54-.07l.8-.93c.18-.2.36-.16.59-.08l1.72.81c.25.12.41.18.47.29.06.1.06.6-.14 1.18-.2.58-1.15 1.1-1.59 1.16-.4.05-.92.08-1.48-.1-.34-.1-.78-.25-1.34-.49a11.55 11.55 0 0 1-4.82-4.25c-.13-.18-1.18-1.57-1.18-3 0-.72.38-1.08.51-1.27Z'
        );

        svg.appendChild(
            bolha
        );

        svg.appendChild(
            telefone
        );

        return svg;
    }


    function criarBotaoWhatsApp() {

        const acao =
            aplicarBaseAcao(
                document.createElement(
                    'div'
                )
            );

        acao.title =
            'Copiar mensagem SkyTins para WhatsApp';

        acao.setAttribute(
            'aria-label',
            'Copiar mensagem SkyTins para WhatsApp'
        );

        acao.appendChild(
            criarIconeWhatsApp()
        );

        Object.assign(
            acao.style,
            {
                width:
                    '30px',

                minWidth:
                    '30px',

                padding:
                    '0',

                border:
                    '1px solid #1565c0',

                background:
                    '#1976d2',

                color:
                    '#fff'
            }
        );

        acao.addEventListener(
            'mouseenter',
            () => {

                acao.style.background =
                    '#1565c0';
            }
        );

        acao.addEventListener(
            'mouseleave',
            () => {

                acao.style.background =
                    '#1976d2';
            }
        );

        acao.addEventListener(
            'click',
            async function (event) {

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                const codigo =
                    getValor(
                        'vedClienteId'
                    );

                const os =
                    getValor(
                        'vedId'
                    );

                if (!codigo) {

                    mostrarAviso(
                        'Código do cliente não encontrado.',
                        true
                    );

                    return;
                }

                if (!os) {

                    mostrarAviso(
                        'Número da OS não encontrado.',
                        true
                    );

                    return;
                }

                const copiado =
                    await copiarTexto(
                        gerarMensagemSkyTins()
                    );

                mostrarAviso(
                    copiado
                        ? 'Mensagem SkyTins copiada.'
                        : 'Não foi possível copiar a mensagem.',
                    !copiado
                );
            },
            true
        );

        return acao;
    }


    // =========================================================
    // POSIÇÃO DOS BOTÕES
    //
    // INSERT | SKYTINS | WHATSAPP
    // =========================================================

    function instalarAcoes() {

        if (
            document.getElementById(
                ID_ACOES
            )
        ) {
            return;
        }

        const campoAbertura =
            document.getElementById(
                'vedAbertura'
            );

        const campoAtendente =
            document.getElementById(
                'Atendente_cliFantasia'
            );

        if (
            !campoAbertura ||
            !campoAtendente
        ) {
            return;
        }

        const colunaAbertura =
            campoAbertura.closest(
                '.col-lg-3'
            );

        const colunaAtendente =
            campoAtendente.closest(
                '.col-lg-3'
            );

        if (
            !colunaAbertura ||
            !colunaAtendente
        ) {
            return;
        }

        colunaAtendente.classList.remove(
            'col-lg-offset-4'
        );

        colunaAtendente.classList.remove(
            'col-md-offset-4'
        );

        const coluna =
            document.createElement(
                'div'
            );

        coluna.id =
            ID_ACOES;

        coluna.className =
            'col-lg-4 col-md-4 col-sm-12';

        const area =
            document.createElement(
                'div'
            );

        Object.assign(
            area.style,
            {
                height:
                    '30px',

                display:
                    'flex',

                alignItems:
                    'center',

                justifyContent:
                    'flex-start',

                gap:
                    '5px',

                width:
                    '100%'
            }
        );

        // Ordem solicitada:
        area.appendChild(
            criarBotaoInsert()
        );

        area.appendChild(
            criarBotaoSkyTins()
        );

        area.appendChild(
            criarBotaoWhatsApp()
        );

        coluna.appendChild(
            area
        );

        colunaAbertura.insertAdjacentElement(
            'afterend',
            coluna
        );
    }


    // =========================================================
    // CNPJ CLICÁVEL
    // =========================================================

    function instalarCopiaCNPJ() {

        const campoCNPJ =
            document.getElementById(
                'Cliente_cliCpfCgc'
            );

        if (!campoCNPJ) {
            return;
        }

        const grupo =
            campoCNPJ.closest(
                '.input-group'
            );

        if (!grupo) {
            return;
        }

        const label =
            grupo.querySelector(
                'label.input-group-addon'
            );

        if (!label) {
            return;
        }

        if (
            label.dataset.tmCopiaCnpj ===
            '1'
        ) {
            return;
        }

        label.dataset.tmCopiaCnpj =
            '1';

        label.title =
            'Clique para copiar o CNPJ sem pontuação';

        label.style.cursor =
            'pointer';

        label.addEventListener(
            'click',
            async function (event) {

                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();

                const cnpj =
                    somenteNumeros(
                        campoCNPJ.value
                    );

                if (!cnpj) {

                    mostrarAviso(
                        'CNPJ não encontrado.',
                        true
                    );

                    return;
                }

                const copiado =
                    await copiarTexto(
                        cnpj
                    );

                mostrarAviso(
                    copiado
                        ? `CNPJ copiado: ${cnpj}`
                        : 'Não foi possível copiar o CNPJ.',
                    !copiado
                );
            },
            true
        );
    }


    // =========================================================
    // INICIALIZAÇÃO
    // =========================================================

    function iniciar() {

        instalarAcoes();

        instalarCopiaCNPJ();
    }


    iniciar();


    const observer =
        new MutationObserver(
            () => {

                iniciar();
            }
        );


    observer.observe(
        document.body,
        {
            childList:
                true,

            subtree:
                true
        }
    );

})();