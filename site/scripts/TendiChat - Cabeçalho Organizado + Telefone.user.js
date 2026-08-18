// ==UserScript==
// @name         TendiChat - Cabeçalho Organizado + Telefone
// @namespace    maxdata
// @version      2.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Cabe%C3%A7alho%20Organizado%20%2B%20Telefone.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Cabe%C3%A7alho%20Organizado%20%2B%20Telefone.user.js
// @description  Reorganiza o cabeçalho da conversa e exibe o telefone abaixo do nome
// @match        https://app.tendichat.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const HEADER_SELECTOR = 'article[data-tcv-chat-header="1"]';

    function extrairTelefone() {
        const mensagens = document.querySelectorAll('[id^="wamid."]');

        for (const mensagem of mensagens) {
            const id = mensagem.id;

            try {
                const parteBase64 = id.substring(id.indexOf('.') + 1);

                let base64 = parteBase64
                    .replace(/-/g, '+')
                    .replace(/_/g, '/');

                while (base64.length % 4) {
                    base64 += '=';
                }

                const decodificado = atob(base64);

                const numeros = decodificado.match(/\d{10,15}/g);

                if (!numeros) continue;

                const candidato = numeros
                    .map(numero => numero.replace(/\D/g, ''))
                    .find(numero =>
                        numero.startsWith('55') &&
                        (numero.length === 12 || numero.length === 13)
                    );

                if (candidato) {
                    return candidato;
                }

            } catch (e) {
                // Ignora IDs que não forem decodificáveis
            }
        }

        return null;
    }

    function formatarTelefone(numero) {
        if (!numero) return null;

        let telefone = numero.replace(/\D/g, '');

        if (telefone.startsWith('55')) {
            telefone = telefone.substring(2);
        }

        // DDD + 9 dígitos
        if (telefone.length === 11) {
            return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 3)} ${telefone.slice(3, 7)}-${telefone.slice(7)}`;
        }

        // DDD + 8 dígitos
        if (telefone.length === 10) {
            return `(${telefone.slice(0, 2)}) ${telefone.slice(2, 6)}-${telefone.slice(6)}`;
        }

        return telefone;
    }

    function encontrarSpanRestam(header) {
        const spans = header.querySelectorAll('span');

        for (const span of spans) {
            const texto = span.textContent.trim();

            if (
                texto.startsWith('Restam:') ||
                span.dataset.maxTelefone === '1'
            ) {
                return span;
            }
        }

        return null;
    }

    function reorganizarCabecalho() {
        const header = document.querySelector(HEADER_SELECTOR);

        if (!header) return;

        /*
         * Estrutura principal:
         *
         * article
         * ├── div ESQUERDA
         * └── div DIREITA
         */
        const ladoEsquerdo = header.children[0];

        if (!ladoEsquerdo) return;

        const avatar = ladoEsquerdo.querySelector('img');
        const nome = ladoEsquerdo.querySelector('p');
        const spanTelefone = encontrarSpanRestam(header);

        if (!avatar || !nome || !spanTelefone) return;

        const numero = extrairTelefone();

        if (!numero) return;

        const telefone = formatarTelefone(numero);

        if (!telefone) return;

        /*
         * ============================================================
         * CONFIGURAÇÃO DO HEADER
         * ============================================================
         */

        header.style.display = 'flex';
        header.style.alignItems = 'center';
        header.style.justifyContent = 'space-between';
        header.style.gap = '16px';


        /*
         * ============================================================
         * LADO ESQUERDO
         * ============================================================
         */

        ladoEsquerdo.style.display = 'flex';
        ladoEsquerdo.style.alignItems = 'center';
        ladoEsquerdo.style.gap = '10px';
        ladoEsquerdo.style.minWidth = '0';
        ladoEsquerdo.style.flex = '1';


        /*
         * ============================================================
         * AVATAR
         * ============================================================
         */

        avatar.style.flexShrink = '0';


        /*
         * ============================================================
         * CRIA O BLOCO DE INFORMAÇÕES
         * ============================================================
         */

        let blocoInfo = ladoEsquerdo.querySelector(
            '[data-max-bloco-cliente="1"]'
        );

        if (!blocoInfo) {
            blocoInfo = document.createElement('div');

            blocoInfo.dataset.maxBlocoCliente = '1';

            blocoInfo.style.display = 'flex';
            blocoInfo.style.flexDirection = 'column';
            blocoInfo.style.justifyContent = 'center';
            blocoInfo.style.alignItems = 'flex-start';
            blocoInfo.style.gap = '2px';
            blocoInfo.style.minWidth = '0';
            blocoInfo.style.flex = '1';

            avatar.insertAdjacentElement('afterend', blocoInfo);
        }


        /*
         * ============================================================
         * NOME DO CLIENTE
         * ============================================================
         */

        if (nome.parentElement !== blocoInfo) {
            blocoInfo.appendChild(nome);
        }

        nome.style.margin = '0';
        nome.style.padding = '0';
        nome.style.fontSize = '14px';
        nome.style.fontWeight = '600';
        nome.style.lineHeight = '1.25';

        // Evita o nome destruir o cabeçalho
        nome.style.maxWidth = '280px';
        nome.style.overflow = 'hidden';
        nome.style.textOverflow = 'ellipsis';
        nome.style.whiteSpace = 'nowrap';

        nome.title = nome.textContent.trim();


        /*
         * ============================================================
         * BLOCO INFERIOR: STATUS + TELEFONE
         * ============================================================
         */

        const containerOriginal = spanTelefone.parentElement;

        let linhaTelefone = blocoInfo.querySelector(
            '[data-max-linha-telefone="1"]'
        );

        if (!linhaTelefone) {
            linhaTelefone = document.createElement('div');

            linhaTelefone.dataset.maxLinhaTelefone = '1';

            linhaTelefone.style.display = 'flex';
            linhaTelefone.style.alignItems = 'center';
            linhaTelefone.style.gap = '6px';
            linhaTelefone.style.minHeight = '18px';

            blocoInfo.appendChild(linhaTelefone);
        }


        /*
         * ============================================================
         * BOLINHA AZUL DE STATUS
         * ============================================================
         */

        if (containerOriginal) {
            const bolinha = containerOriginal.querySelector(
                '.bg-blue-500'
            );

            if (bolinha) {
                const wrapperBolinha =
                    bolinha.closest('span[data-v-tippy]') ||
                    bolinha.parentElement;

                if (
                    wrapperBolinha &&
                    wrapperBolinha.parentElement !== linhaTelefone
                ) {
                    linhaTelefone.appendChild(wrapperBolinha);
                }
            }
        }


        /*
         * ============================================================
         * TELEFONE
         * ============================================================
         */

        if (spanTelefone.parentElement !== linhaTelefone) {
            linhaTelefone.appendChild(spanTelefone);
        }

        spanTelefone.dataset.maxTelefone = '1';

        spanTelefone.textContent = telefone;
        spanTelefone.title = `Contato do cliente: ${telefone}`;

        // Remove possíveis estilos do script anterior
        spanTelefone.removeAttribute('style');

        Object.assign(spanTelefone.style, {
            fontSize: '13px',
            fontWeight: '700',
            lineHeight: '1.2',
            letterSpacing: '0.25px',
            whiteSpace: 'nowrap',
            opacity: '0.95',
            cursor: 'default'
        });


        /*
         * ============================================================
         * REMOVE CONTAINER VAZIO ANTIGO
         * ============================================================
         */

        if (
            containerOriginal &&
            containerOriginal !== linhaTelefone &&
            containerOriginal.children.length === 0
        ) {
            containerOriginal.remove();
        }


        /*
         * ============================================================
         * LADO DIREITO
         * ============================================================
         */

        const ladoDireito = header.children[1];

        if (ladoDireito) {
            ladoDireito.style.flexShrink = '0';
            ladoDireito.style.marginLeft = 'auto';
        }
    }


    /*
     * ================================================================
     * SPA / VUE
     * ================================================================
     */

    let timer = null;

    const observer = new MutationObserver(() => {
        clearTimeout(timer);

        timer = setTimeout(() => {
            reorganizarCabecalho();
        }, 120);
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });


    /*
     * PRIMEIRA EXECUÇÃO
     */

    reorganizarCabecalho();

})();