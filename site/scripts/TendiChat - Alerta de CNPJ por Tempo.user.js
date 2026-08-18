// ==UserScript==
// @name         TendiChat - Alerta de CNPJ por Tempo
// @namespace    maxdata.tendichat.alerta.cnpj
// @version      1.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Alerta%20de%20CNPJ%20por%20Tempo.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Alerta%20de%20CNPJ%20por%20Tempo.user.js
// @description  Exibe um indicador verde, amarelo ou vermelho na lista de atendimentos conforme o tempo desde o envio de um CNPJ válido.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        AMARELO_APOS_MINUTOS: 30,
        VERMELHO_APOS_MINUTOS: 45,
        EXPIRAR_APOS_HORAS: 24,
        INTERVALO_ATUALIZACAO_MS: 10_000,
        STORAGE_KEY: 'tm_alerta_cnpj_tempo_v1',
        ATTR_INDICADOR: 'data-tm-alerta-cnpj'
    };

    const MINUTO = 60_000;
    const HORA = 60 * MINUTO;

    let timerVarredura = null;

    function somenteNumeros(valor) {
        return String(valor || '').replace(/\D/g, '');
    }

    function normalizarTexto(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function validarCNPJ(cnpj) {
        cnpj = somenteNumeros(cnpj);

        if (cnpj.length !== 14) return false;
        if (/^(\d)\1{13}$/.test(cnpj)) return false;

        const calcularDigito = (base, pesos) => {
            const soma = base
                .split('')
                .reduce((total, numero, indice) => {
                    return total + Number(numero) * pesos[indice];
                }, 0);

            const resto = soma % 11;
            return resto < 2 ? 0 : 11 - resto;
        };

        const base12 = cnpj.slice(0, 12);
        const digito1 = calcularDigito(
            base12,
            [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        );

        const digito2 = calcularDigito(
            base12 + digito1,
            [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
        );

        return cnpj === base12 + String(digito1) + String(digito2);
    }

    function extrairCNPJValido(texto) {
        const origem = String(texto || '');
        const regex = /(^|[^\d])((?:\d[\s.\-/]*){14})(?![\s.\-/]*\d)/g;

        let correspondencia;

        while ((correspondencia = regex.exec(origem)) !== null) {
            const candidato = somenteNumeros(correspondencia[2]);

            if (validarCNPJ(candidato)) {
                return candidato;
            }
        }

        return '';
    }

    function carregarRegistros() {
        try {
            const dados = JSON.parse(
                localStorage.getItem(CONFIG.STORAGE_KEY) || '{}'
            );

            return dados && typeof dados === 'object' ? dados : {};
        } catch (erro) {
            console.warn('[Alerta CNPJ] Falha ao ler dados salvos:', erro);
            return {};
        }
    }

    function salvarRegistros(registros) {
        try {
            localStorage.setItem(
                CONFIG.STORAGE_KEY,
                JSON.stringify(registros)
            );
        } catch (erro) {
            console.warn('[Alerta CNPJ] Falha ao salvar dados:', erro);
        }
    }

    function gerarChaveAtendimento(nome) {
        return normalizarTexto(nome);
    }

    function obterNomeAtendimento(article) {
        const imagem = article.querySelector('img[alt]');

        if (imagem?.alt?.trim()) {
            return imagem.alt.trim();
        }

        const candidatos = Array.from(
            article.querySelectorAll('div, p, span')
        );

        const nome = candidatos.find(elemento => {
            const texto = (elemento.textContent || '').trim();
            const estilo = window.getComputedStyle(elemento);

            return texto
                && texto.length <= 100
                && elemento.children.length === 0
                && (
                    Number(estilo.fontWeight) >= 600
                    || estilo.fontWeight === 'bold'
                );
        });

        return (nome?.textContent || '').trim();
    }

    function obterTextoPrevia(article) {
        const paragrafosComTitulo = Array.from(
            article.querySelectorAll('p[title]')
        );

        const previa = paragrafosComTitulo.find(elemento => {
            const texto = (elemento.getAttribute('title') || '').trim();

            return texto
                && !/^\d+$/.test(texto)
                && texto.length <= 5000;
        });

        if (previa) {
            return (
                previa.getAttribute('title')
                || previa.textContent
                || ''
            ).trim();
        }

        const paragrafos = Array.from(article.querySelectorAll('p'));

        const alternativa = paragrafos.find(elemento => {
            const texto = (elemento.textContent || '').trim();

            return texto
                && !/^\d+$/.test(texto)
                && texto.length <= 5000;
        });

        return (alternativa?.textContent || '').trim();
    }

    function textoPareceHorario(texto) {
        const valor = normalizarTexto(texto);

        return (
            /^(agora|ha poucos segundos)$/.test(valor)
            || /^\d+\s+segundos?\s+atras$/.test(valor)
            || /^\d+\s+minutos?\s+atras$/.test(valor)
            || /^\d+\s+horas?\s+atras$/.test(valor)
            || /^\d+\s+dias?\s+atras$/.test(valor)
            || /^ontem(?:\s+as)?\s+\d{1,2}:\d{2}$/.test(valor)
            || /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}$/.test(valor)
            || /^\d{1,2}:\d{2}$/.test(valor)
        );
    }

    function obterElementoHorario(article) {
        const elementos = Array.from(
            article.querySelectorAll('div, span, time')
        );

        return elementos.find(elemento => {
            if (elemento.children.length > 0) return false;

            const texto = (elemento.textContent || '').trim();

            return texto
                && texto.length <= 40
                && textoPareceHorario(texto);
        }) || null;
    }

    function converterHorarioParaTimestamp(texto) {
        const agora = new Date();
        const valor = normalizarTexto(texto);

        if (!valor) return Date.now();

        if (valor === 'agora' || valor === 'ha poucos segundos') {
            return Date.now();
        }

        let match = valor.match(/^(\d+)\s+segundos?\s+atras$/);

        if (match) {
            return Date.now() - Number(match[1]) * 1000;
        }

        match = valor.match(/^(\d+)\s+minutos?\s+atras$/);

        if (match) {
            return Date.now() - Number(match[1]) * MINUTO;
        }

        match = valor.match(/^(\d+)\s+horas?\s+atras$/);

        if (match) {
            return Date.now() - Number(match[1]) * HORA;
        }

        match = valor.match(/^(\d+)\s+dias?\s+atras$/);

        if (match) {
            return Date.now() - Number(match[1]) * 24 * HORA;
        }

        match = valor.match(/^ontem(?:\s+as)?\s+(\d{1,2}):(\d{2})$/);

        if (match) {
            const data = new Date(
                agora.getFullYear(),
                agora.getMonth(),
                agora.getDate() - 1,
                Number(match[1]),
                Number(match[2]),
                0,
                0
            );

            return data.getTime();
        }

        match = valor.match(
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})$/
        );

        if (match) {
            const data = new Date(
                Number(match[3]),
                Number(match[2]) - 1,
                Number(match[1]),
                Number(match[4]),
                Number(match[5]),
                0,
                0
            );

            return data.getTime();
        }

        match = valor.match(/^(\d{1,2}):(\d{2})$/);

        if (match) {
            const data = new Date(
                agora.getFullYear(),
                agora.getMonth(),
                agora.getDate(),
                Number(match[1]),
                Number(match[2]),
                0,
                0
            );

            if (data.getTime() > Date.now() + 5 * MINUTO) {
                data.setDate(data.getDate() - 1);
            }

            return data.getTime();
        }

        return Date.now();
    }

    function formatarTempo(minutos) {
        if (minutos < 1) return '<1m';
        if (minutos < 60) return `${minutos}m`;

        const horas = Math.floor(minutos / 60);
        const restante = minutos % 60;

        return restante
            ? `${horas}h${String(restante).padStart(2, '0')}`
            : `${horas}h`;
    }

    function obterFaixa(minutos) {
        if (minutos >= CONFIG.VERMELHO_APOS_MINUTOS) {
            return {
                nome: 'critico',
                texto: 'Crítico',
                classe: 'tm-cnpj-vermelho'
            };
        }

        if (minutos >= CONFIG.AMARELO_APOS_MINUTOS) {
            return {
                nome: 'atencao',
                texto: 'Atenção',
                classe: 'tm-cnpj-amarelo'
            };
        }

        return {
            nome: 'normal',
            texto: 'Normal',
            classe: 'tm-cnpj-verde'
        };
    }

    function criarIndicador() {
        const indicador = document.createElement('span');

        indicador.setAttribute(CONFIG.ATTR_INDICADOR, '1');
        indicador.className = 'tm-cnpj-indicador';
        indicador.innerHTML = `
            <span class="tm-cnpj-ponto"></span>
            <span class="tm-cnpj-tempo"></span>
        `;

        return indicador;
    }

    function posicionarIndicador(article, indicador, elementoHorario) {
        if (indicador.isConnected) return;

        if (elementoHorario?.parentElement) {
            elementoHorario.parentElement.insertBefore(
                indicador,
                elementoHorario
            );

            return;
        }

        const primeiraLinha = article.querySelector(
            '.flex.items-center.justify-between'
        );

        if (primeiraLinha) {
            primeiraLinha.appendChild(indicador);
            return;
        }

        article.appendChild(indicador);
    }

    function atualizarIndicador(article, registro, elementoHorario) {
        let indicador = article.querySelector(
            `[${CONFIG.ATTR_INDICADOR}]`
        );

        if (!indicador) {
            indicador = criarIndicador();
            posicionarIndicador(article, indicador, elementoHorario);
        }

        const minutos = Math.max(
            0,
            Math.floor((Date.now() - registro.iniciadoEm) / MINUTO)
        );

        const faixa = obterFaixa(minutos);
        const textoTempo = indicador.querySelector('.tm-cnpj-tempo');

        indicador.classList.remove(
            'tm-cnpj-verde',
            'tm-cnpj-amarelo',
            'tm-cnpj-vermelho'
        );

        indicador.classList.add(faixa.classe);
        indicador.dataset.faixa = faixa.nome;

        const novoTexto = `CNPJ ${formatarTempo(minutos)}`;

        if (textoTempo && textoTempo.textContent !== novoTexto) {
            textoTempo.textContent = novoTexto;
        }

        const novoTitulo =
            `CNPJ válido enviado há ${minutos} minuto(s). `
            + `Situação: ${faixa.texto}.`;

        if (indicador.title !== novoTitulo) {
            indicador.title = novoTitulo;
        }
    }

    function removerIndicador(article) {
        article
            .querySelector(`[${CONFIG.ATTR_INDICADOR}]`)
            ?.remove();
    }

    function registrarCNPJDaPrevia(article, nome, chave, registros) {
        const previa = obterTextoPrevia(article);
        const cnpj = extrairCNPJValido(previa);

        if (!cnpj) return false;

        const elementoHorario = obterElementoHorario(article);
        const horarioTexto = (
            elementoHorario?.textContent
            || ''
        ).trim();

        let iniciadoEm = converterHorarioParaTimestamp(horarioTexto);

        const agora = Date.now();
        const limiteExpiracao =
            CONFIG.EXPIRAR_APOS_HORAS * HORA;

        /*
         * Quando a própria lista informa uma data antiga, o atendimento
         * não é marcado como novo. Isso evita sinalizar CNPJs históricos.
         */
        if (
            horarioTexto
            && textoPareceHorario(horarioTexto)
            && iniciadoEm < agora - limiteExpiracao
        ) {
            return false;
        }

        if (
            !Number.isFinite(iniciadoEm)
            || iniciadoEm > agora + 5 * MINUTO
        ) {
            iniciadoEm = agora;
        }

        const anterior = registros[chave];
        const mesmoCnpj = anterior?.cnpj === cnpj;
        const claramenteMaisNovo =
            anterior
            && iniciadoEm > anterior.iniciadoEm + 2 * MINUTO;

        if (!anterior || !mesmoCnpj || claramenteMaisNovo) {
            registros[chave] = {
                nome,
                cnpj,
                iniciadoEm,
                atualizadoEm: agora
            };

            return true;
        }

        anterior.atualizadoEm = agora;
        return false;
    }

    function limparRegistrosExpirados(registros) {
        const limite =
            Date.now() - CONFIG.EXPIRAR_APOS_HORAS * HORA;

        let alterou = false;

        Object.keys(registros).forEach(chave => {
            const registro = registros[chave];

            if (
                !registro
                || !Number.isFinite(registro.iniciadoEm)
                || registro.iniciadoEm < limite
            ) {
                delete registros[chave];
                alterou = true;
            }
        });

        return alterou;
    }

    function processarLista() {
        const artigos = Array.from(
            document.querySelectorAll(
                'section article[content="Suporte"]'
            )
        );

        if (!artigos.length) return;

        const registros = carregarRegistros();
        let alterou = limparRegistrosExpirados(registros);

        artigos.forEach(article => {
            const nome = obterNomeAtendimento(article);
            const chave = gerarChaveAtendimento(nome);

            if (!nome || !chave) {
                removerIndicador(article);
                return;
            }

            if (
                registrarCNPJDaPrevia(
                    article,
                    nome,
                    chave,
                    registros
                )
            ) {
                alterou = true;
            }

            const registro = registros[chave];

            if (!registro) {
                removerIndicador(article);
                return;
            }

            const idade = Date.now() - registro.iniciadoEm;

            if (
                idade < 0
                || idade > CONFIG.EXPIRAR_APOS_HORAS * HORA
            ) {
                delete registros[chave];
                removerIndicador(article);
                alterou = true;
                return;
            }

            atualizarIndicador(
                article,
                registro,
                obterElementoHorario(article)
            );
        });

        if (alterou) {
            salvarRegistros(registros);
        }
    }

    function agendarVarredura() {
        clearTimeout(timerVarredura);

        timerVarredura = setTimeout(processarLista, 120);
    }

    function adicionarEstilos() {
        if (document.querySelector('#tm-alerta-cnpj-estilos')) {
            return;
        }

        const estilo = document.createElement('style');

        estilo.id = 'tm-alerta-cnpj-estilos';
        estilo.textContent = `
            .tm-cnpj-indicador {
                display: inline-flex;
                align-items: center;
                gap: 4px;
                flex-shrink: 0;
                margin-right: 5px;
                padding: 2px 6px;
                border: 1px solid transparent;
                border-radius: 999px;
                font-size: 10px;
                font-weight: 700;
                line-height: 1.25;
                white-space: nowrap;
                box-shadow: 0 1px 2px rgba(0, 0, 0, .08);
                transition:
                    background-color .2s ease,
                    border-color .2s ease,
                    color .2s ease;
                pointer-events: none;
            }

            .tm-cnpj-ponto {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: currentColor;
                box-shadow: 0 0 0 2px rgba(255, 255, 255, .7);
            }

            .tm-cnpj-verde {
                color: #15803d;
                background: #dcfce7;
                border-color: #86efac;
            }

            .tm-cnpj-amarelo {
                color: #a16207;
                background: #fef9c3;
                border-color: #fde047;
            }

            .tm-cnpj-vermelho {
                color: #b91c1c;
                background: #fee2e2;
                border-color: #fca5a5;
                animation: tm-cnpj-pulso 1.6s ease-in-out infinite;
            }

            @keyframes tm-cnpj-pulso {
                0%, 100% {
                    box-shadow: 0 0 0 0 rgba(220, 38, 38, 0);
                }

                50% {
                    box-shadow: 0 0 0 4px rgba(220, 38, 38, .16);
                }
            }

            @media (prefers-reduced-motion: reduce) {
                .tm-cnpj-vermelho {
                    animation: none;
                }
            }

            .dark .tm-cnpj-verde {
                color: #86efac;
                background: rgba(21, 128, 61, .25);
                border-color: rgba(134, 239, 172, .45);
            }

            .dark .tm-cnpj-amarelo {
                color: #fde047;
                background: rgba(161, 98, 7, .25);
                border-color: rgba(253, 224, 71, .45);
            }

            .dark .tm-cnpj-vermelho {
                color: #fca5a5;
                background: rgba(185, 28, 28, .28);
                border-color: rgba(252, 165, 165, .5);
            }
        `;

        document.head.appendChild(estilo);
    }

    function iniciar() {
        adicionarEstilos();

        const observer = new MutationObserver(agendarVarredura);

        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
            characterData: true
        });

        processarLista();

        setTimeout(processarLista, 500);
        setTimeout(processarLista, 1500);

        setInterval(
            processarLista,
            CONFIG.INTERVALO_ATUALIZACAO_MS
        );
    }

    iniciar();
})();
