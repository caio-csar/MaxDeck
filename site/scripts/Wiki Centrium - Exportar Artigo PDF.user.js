// ==UserScript==
// @name         Wiki Centrium - Exportar Artigo PDF
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Wiki%20Centrium%20-%20Exportar%20Artigo%20PDF.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Wiki%20Centrium%20-%20Exportar%20Artigo%20PDF.user.js
// @description  Extrai o conteúdo principal da Wiki Centrium e gera impressão/PDF limpo
// @author       Caio
// @match        https://wiki.centrium.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    function criarBotaoPDF() {
        if (document.getElementById('btnExportarPDFWiki')) return;

        const btn = document.createElement('button');
        btn.id = 'btnExportarPDFWiki';
        btn.innerText = '📄 Exportar PDF';

        btn.style.position = 'fixed';
        btn.style.right = '20px';
        btn.style.bottom = '20px';
        btn.style.zIndex = '999999';
        btn.style.background = '#d71920';
        btn.style.color = '#fff';
        btn.style.border = 'none';
        btn.style.borderRadius = '8px';
        btn.style.padding = '12px 18px';
        btn.style.fontSize = '15px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.boxShadow = '0 4px 12px rgba(0,0,0,.25)';

        btn.addEventListener('click', exportarPDF);

        document.body.appendChild(btn);
    }

    function prepararImagem(img) {
        const src =
            img.getAttribute('src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src');

        if (src) {
            img.setAttribute('src', src);
        }

        const srcset =
            img.getAttribute('srcset') ||
            img.getAttribute('data-srcset');

        if (srcset) {
            img.setAttribute('srcset', srcset);
        }

        img.removeAttribute('loading');
        img.removeAttribute('lazy');
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
    }

    function limparConteudo(elemento) {
        const clone = elemento.cloneNode(true);

        clone.querySelectorAll('script, iframe, nav, .navigation, .entry-meta, noscript').forEach(el => el.remove());

        clone.querySelectorAll('img').forEach(prepararImagem);

        clone.querySelectorAll('*').forEach(el => {
            el.removeAttribute('style');
            el.removeAttribute('onclick');
            el.removeAttribute('onload');
            el.removeAttribute('data-pagespeed-url-hash');
        });

        return clone;
    }

    function exportarPDF() {
        const titulo =
            document.querySelector('.entry-title')?.innerText?.trim() ||
            document.title ||
            'documentacao';

        const conteudoOriginal =
            document.querySelector('article') ||
            document.querySelector('#primary') ||
            document.querySelector('.entry-content');

        if (!conteudoOriginal) {
            alert('Não encontrei o conteúdo principal da página.');
            return;
        }

        const conteudoLimpo = limparConteudo(conteudoOriginal);

        const janela = window.open('', '_blank');

        if (!janela) {
            alert('O navegador bloqueou a janela. Libere pop-ups para esta página.');
            return;
        }

        janela.document.open();
        janela.document.write(`
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <title>${titulo}</title>

    <style>
        * {
            box-sizing: border-box;
        }

        body {
            font-family: Arial, Helvetica, sans-serif;
            color: #222;
            background: #fff;
            margin: 0;
            padding: 30px;
            line-height: 1.55;
            font-size: 14px;
        }

        .pdf-container {
            max-width: 900px;
            margin: 0 auto;
        }

        h1, h2, h3, h4 {
            color: #111;
            page-break-after: avoid;
        }

        h1 {
            font-size: 26px;
            margin-top: 10px;
            border-bottom: 2px solid #ddd;
            padding-bottom: 8px;
        }

        h2 {
            font-size: 21px;
            margin-top: 28px;
        }

        h3 {
            font-size: 17px;
            margin-top: 22px;
        }

        p, li {
            font-size: 14px;
        }

        ul, ol {
            padding-left: 24px;
        }

        img {
            max-width: 100%;
            height: auto;
            display: block;
            margin: 14px auto;
            page-break-inside: avoid;
        }

        figure {
            margin: 20px 0;
            page-break-inside: avoid;
        }

        blockquote {
            border-left: 4px solid #d71920;
            padding: 10px 14px;
            background: #f7f7f7;
            margin: 20px 0;
        }

        code {
            background: #f1f1f1;
            padding: 2px 5px;
            border-radius: 4px;
            font-size: 13px;
        }

        hr {
            border: 0;
            border-top: 1px solid #ccc;
            margin: 28px 0;
        }

        a {
            color: #000;
            text-decoration: none;
        }

        @page {
            size: A4;
            margin: 15mm;
        }

        @media print {
            body {
                padding: 0;
            }

            .no-print {
                display: none !important;
            }

            h1, h2, h3, h4, img, figure, blockquote {
                page-break-inside: avoid;
            }
        }
    </style>
</head>

<body>
    <div class="pdf-container">
        ${conteudoLimpo.innerHTML}
    </div>

    <script>
        window.onload = function () {
            setTimeout(function () {
                window.print();
            }, 800);
        };
    <\/script>
</body>
</html>
        `);
        janela.document.close();
    }

    criarBotaoPDF();

})();