// ==UserScript==
// @name         Chave Temporária - Max Atendimento
// @namespace    https://tampermonkey.net/
// @version      1.2
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Chave%20Tempor%C3%A1ria%20-%20Max%20Atendimento.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Chave%20Tempor%C3%A1ria%20-%20Max%20Atendimento.user.js
// @description  Destaca Chave / Validade e copia solicitação de chave temporária
// @match        *://externo.maxdatasistema.com.br/Atendimentos/Atendimento*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function obterSaudacao() {
        const hora = new Date().getHours();

        if (hora < 12) return 'Bom dia';
        if (hora < 18) return 'Boa tarde';
        return 'Boa noite';
    }

    function copiarTexto(texto) {
        const textarea = document.createElement('textarea');
        textarea.value = texto;

        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        textarea.style.pointerEvents = 'none';

        document.body.appendChild(textarea);

        textarea.focus();
        textarea.select();

        document.execCommand('copy');

        textarea.remove();
    }

    function ativarBotao() {
        const label = document.querySelector(
            'label[for="CliChaveValidade"]'
        );

        if (!label) return;

        if (label.dataset.chaveTemporaria === '1') return;

        label.dataset.chaveTemporaria = '1';

        // Só destaca.
        // Não altera tamanho, posição, display ou espaçamento.
        label.style.backgroundColor = '#ffd54f';
        label.style.color = '#222';
        label.style.borderColor = '#e0a800';
        label.style.fontWeight = 'bold';
        label.style.cursor = 'pointer';

        label.title = 'Clique para copiar solicitação de chave temporária';

        label.addEventListener('click', function (event) {
            event.preventDefault();

            const campoCliente = document.querySelector('#vedClienteId');

            if (!campoCliente || !campoCliente.value) {
                alert('Código do cliente não encontrado.');
                return;
            }

            const cliente = campoCliente.value.trim();
            const saudacao = obterSaudacao();

            const mensagem =
`${saudacao}!

Cliente ${cliente} solicita chave temporária.`;

            copiarTexto(mensagem);

            // Feedback sem alterar tamanho do botão
            const textoOriginal = label.textContent;
            const corOriginal = label.style.backgroundColor;

            label.textContent = 'Copiado!';
            label.style.backgroundColor = '#81c784';

            setTimeout(() => {
                label.textContent = textoOriginal;
                label.style.backgroundColor = corOriginal;
            }, 1000);
        });
    }

    ativarBotao();

    const observer = new MutationObserver(ativarBotao);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });

})();
