// ==UserScript==
// @name         ZZZ_TendiChat - Bot Transferir por Contato
// @namespace    http://tampermonkey.net/
// @version      3.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/ZZZ_TendiChat%20-%20Bot%20Transferir%20por%20Contato.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/ZZZ_TendiChat%20-%20Bot%20Transferir%20por%20Contato.user.js
// @description  Botão flutuante para buscar atendimento pelo final do contato, aplicar filtro "Ver todos", abrir conversa e transferir para atendente informado.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ID_BOTAO = 'tc-bot-transferir-flutuante';
    const ID_PAINEL = 'tc-painel-transferir-flutuante';
    const ID_DATALIST = 'tc-lista-atendentes-transferir';

    const PATH_FILTRO_TENDICHAT = 'M22 3H2l8 9.46V19l4 2v-8.54z';
    const PATH_LUPA_TENDICHAT = 'M8 1a7 7 0 0 1 5.605 11.191l5.102 5.102l-1.414 1.414l-5.102-5.102A7 7 0 1 1 8 1m0 2a5 5 0 1 0 0 10A5 5 0 0 0 8 3';

    let executando = false;

    function normalizar(texto) {
        return (texto || '')
            .replace(/[🟢🔴]/g, '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function somenteDigitos(texto) {
        return (texto || '').replace(/\D/g, '');
    }

    function esperar(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function visivel(el) {
        if (!el || !(el instanceof Element)) return false;

        const st = window.getComputedStyle(el);
        if (st.display === 'none') return false;
        if (st.visibility === 'hidden') return false;
        if (st.opacity === '0') return false;

        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
    }

    function dentroDoPainel(el) {
        return !!el.closest(`#${ID_PAINEL}`);
    }

    function textoDoElemento(el) {
        if (!el) return '';

        return [
            el.innerText,
            el.textContent,
            el.getAttribute('aria-label'),
            el.getAttribute('title'),
            el.getAttribute('placeholder'),
            el.value
        ].filter(Boolean).join(' ');
    }

    function setValorInput(el, valor) {
        if (!el) return;

        const proto = Object.getPrototypeOf(el);
        const desc = Object.getOwnPropertyDescriptor(proto, 'value');

        if (desc && desc.set) {
            desc.set.call(el, valor);
        } else {
            el.value = valor;
        }

        dispararEventos(el);
    }

    function dispararEventos(el) {
        if (!el) return;

        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }));
        el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    function clicar(el) {
        if (!el) return false;

        const alvo =
            el.closest('button, a, [role="button"], [role="tab"], li, [tabindex]') ||
            el;

        alvo.scrollIntoView({
            block: 'center',
            inline: 'center'
        });

        alvo.dispatchEvent(new MouseEvent('mouseover', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        alvo.dispatchEvent(new MouseEvent('mousedown', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        alvo.dispatchEvent(new MouseEvent('mouseup', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        alvo.dispatchEvent(new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
        }));

        return true;
    }

    function setStatus(msg, tipo = 'info') {
        const status = document.querySelector('#tc-status-transferir');

        if (!status) return;

        const cores = {
            info: '#475569',
            ok: '#15803d',
            erro: '#b91c1c',
            alerta: '#b45309'
        };

        status.style.color = cores[tipo] || cores.info;
        status.textContent = msg;
    }

    function normalizarPathSvg(d) {
        return (d || '')
            .replace(/\s+/g, '')
            .replace(/,/g, '')
            .trim()
            .toLowerCase();
    }

    function encontrarBotaoPorPathSvg(pathProcurado) {
        const alvo = normalizarPathSvg(pathProcurado);
        const paths = Array.from(document.querySelectorAll('svg path'));

        for (const path of paths) {
            if (!visivel(path)) continue;
            if (dentroDoPainel(path)) continue;

            const d = normalizarPathSvg(path.getAttribute('d'));

            const bateu =
                d === alvo ||
                d.includes(alvo) ||
                alvo.includes(d);

            if (!bateu) continue;

            const botao = path.closest('button, a, [role="button"], [tabindex], div');

            if (botao && visivel(botao) && !dentroDoPainel(botao)) {
                return botao;
            }
        }

        return null;
    }

    function encontrarElementoPorTexto(palavras, escopo = document) {
        const termos = palavras.map(normalizar);

        const candidatos = Array.from(
            escopo.querySelectorAll('button, a, [role="button"], [role="tab"], [aria-label], [title], li, span, div')
        ).filter(el => {
            if (!visivel(el)) return false;
            if (dentroDoPainel(el)) return false;

            const textoOriginal = textoDoElemento(el);
            const texto = normalizar(textoOriginal);

            if (!texto) return false;
            if (textoOriginal.length > 500) return false;

            return termos.some(t => texto.includes(t));
        });

        candidatos.sort((a, b) => {
            const aClicavel = a.matches('button, a, [role="button"], [role="tab"]') ? 0 : 1;
            const bClicavel = b.matches('button, a, [role="button"], [role="tab"]') ? 0 : 1;

            if (aClicavel !== bClicavel) return aClicavel - bClicavel;

            return textoDoElemento(a).length - textoDoElemento(b).length;
        });

        return candidatos[0] || null;
    }

    function encontrarBotaoVerTodos() {
        const candidatos = Array.from(
            document.querySelectorAll('button, a, [role="button"], li, div, span')
        ).filter(el => {
            if (!visivel(el)) return false;
            if (dentroDoPainel(el)) return false;

            const texto = normalizar(textoDoElemento(el));

            if (!texto) return false;
            if (texto.length > 100) return false;

            return texto === 'ver todos' ||
                   texto.includes('ver todos') ||
                   texto.includes('todos os atendimentos') ||
                   texto === 'todos';
        });

        candidatos.sort((a, b) => {
            const ta = normalizar(textoDoElemento(a));
            const tb = normalizar(textoDoElemento(b));

            function peso(t) {
                if (t === 'ver todos') return 0;
                if (t.includes('ver todos')) return 1;
                if (t.includes('todos os atendimentos')) return 2;
                if (t === 'todos') return 3;
                return 4;
            }

            return peso(ta) - peso(tb);
        });

        const encontrado = candidatos[0];

        if (!encontrado) return null;

        return encontrado.closest('button, a, [role="button"], li, [tabindex]') || encontrado;
    }

    function encontrarBotaoPesquisar() {
        return encontrarBotaoPorPathSvg(PATH_LUPA_TENDICHAT) ||
               encontrarElementoPorTexto(['pesquisar', 'buscar', 'procurar']);
    }

    function criarDatalistAtendentes() {
        let datalist = document.querySelector(`#${ID_DATALIST}`);

        if (!datalist) {
            datalist = document.createElement('datalist');
            datalist.id = ID_DATALIST;
            document.body.appendChild(datalist);
        }

        const nomes = new Set();

        Array.from(document.querySelectorAll('select')).forEach(select => {
            if (!select.options || select.options.length < 3) return;

            Array.from(select.options).forEach(opt => {
                const nome = (opt.textContent || '')
                    .replace(/[🟢🔴]/g, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                const nomeNormal = normalizar(nome);

                if (!nome) return;
                if (nome.length > 60) return;
                if (nomeNormal.includes('nao definido')) return;
                if (nomeNormal.includes('selecionar')) return;
                if (nomeNormal.includes('atendente')) return;

                nomes.add(nome);
            });
        });

        datalist.innerHTML = '';

        Array.from(nomes)
            .sort((a, b) => normalizar(a).localeCompare(normalizar(b), 'pt-BR'))
            .forEach(nome => {
                const opt = document.createElement('option');
                opt.value = nome;
                datalist.appendChild(opt);
            });
    }

    function criarInterface() {
        if (!document.body) return;

        if (!document.querySelector(`#${ID_BOTAO}`)) {
            const botao = document.createElement('button');
            botao.id = ID_BOTAO;
            botao.type = 'button';
            botao.innerHTML = '⇄<span>Transferir</span>';
            botao.title = 'Transferir atendimento por final do contato';

            Object.assign(botao.style, {
                position: 'fixed',
                left: '18px',
                bottom: '22px',
                height: '42px',
                padding: '0 14px',
                border: '1px solid #2563eb',
                borderRadius: '999px',
                background: '#2563eb',
                color: '#ffffff',
                fontSize: '14px',
                fontWeight: '900',
                cursor: 'pointer',
                zIndex: '2147483647',
                boxShadow: '0 12px 30px rgba(15,23,42,.28)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                fontFamily: 'Arial, sans-serif'
            });

            botao.querySelector('span').style.fontSize = '12px';

            botao.addEventListener('click', () => {
                alternarPainel();
            });

            document.body.appendChild(botao);
        }

        if (!document.querySelector(`#${ID_PAINEL}`)) {
            const painel = document.createElement('div');
            painel.id = ID_PAINEL;

            Object.assign(painel.style, {
                position: 'fixed',
                left: '18px',
                bottom: '74px',
                width: '335px',
                background: '#ffffff',
                color: '#0f172a',
                border: '1px solid #cbd5e1',
                borderRadius: '16px',
                boxShadow: '0 18px 45px rgba(15,23,42,.30)',
                padding: '13px',
                zIndex: '2147483647',
                fontFamily: 'Arial, sans-serif',
                display: 'none'
            });

            painel.innerHTML = `
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                    <strong style="font-size:14px;">Transferir atendimento</strong>
                    <button id="tc-fechar-transferir" type="button"
                        style="border:none;background:transparent;color:#64748b;font-size:20px;font-weight:900;cursor:pointer;line-height:1;">×</button>
                </div>

                <label style="display:block;font-size:11px;font-weight:900;color:#475569;margin-bottom:4px;">
                    Últimos 4 números do contato
                </label>
                <input id="tc-final-contato" type="text" maxlength="4" inputmode="numeric"
                    placeholder="Ex: 8351"
                    style="width:100%;height:38px;border:1px solid #cbd5e1;border-radius:10px;padding:0 10px;font-size:14px;font-weight:800;box-sizing:border-box;margin-bottom:10px;outline:none;">

                <label style="display:block;font-size:11px;font-weight:900;color:#475569;margin-bottom:4px;">
                    Atendente de destino
                </label>
                <input id="tc-atendente-destino" type="text" list="${ID_DATALIST}"
                    placeholder="Digite o nome do atendente"
                    style="width:100%;height:38px;border:1px solid #cbd5e1;border-radius:10px;padding:0 10px;font-size:14px;font-weight:800;box-sizing:border-box;margin-bottom:10px;outline:none;">

                <button id="tc-confirmar-transferir" type="button"
                    style="width:100%;height:40px;border:none;border-radius:10px;background:#2563eb;color:#ffffff;font-size:13px;font-weight:900;cursor:pointer;">
                    Confirmar e transferir
                </button>

                <div id="tc-status-transferir"
                    style="margin-top:10px;font-size:11px;font-weight:800;color:#475569;line-height:1.35;">
                    Informe o final do contato e o atendente.
                </div>
            `;

            document.body.appendChild(painel);

            painel.querySelector('#tc-fechar-transferir').addEventListener('click', () => {
                painel.style.display = 'none';
            });

            const inputContato = painel.querySelector('#tc-final-contato');
            const inputAtendente = painel.querySelector('#tc-atendente-destino');

            inputContato.addEventListener('input', () => {
                inputContato.value = somenteDigitos(inputContato.value).slice(0, 4);
            });

            painel.querySelector('#tc-confirmar-transferir').addEventListener('click', async () => {
                const finalContato = somenteDigitos(inputContato.value).slice(-4);
                const atendente = inputAtendente.value.trim();

                await executarTransferencia(finalContato, atendente);
            });
        }
    }

    function alternarPainel() {
        criarDatalistAtendentes();

        const painel = document.querySelector(`#${ID_PAINEL}`);
        if (!painel) return;

        const abrindo = painel.style.display === 'none';

        painel.style.display = abrindo ? 'block' : 'none';

        if (abrindo) {
            setStatus('Informe o final do contato e o atendente.', 'info');

            setTimeout(() => {
                const input = document.querySelector('#tc-final-contato');
                if (input) input.focus();
            }, 50);
        }
    }

    async function clicarAbaPorTermos(termos) {
        const el = encontrarElementoPorTexto(termos);

        if (!el) return false;

        clicar(el);
        await esperar(180);
        return true;
    }

    function encontrarCampoBuscaAtendimento() {
        const inputs = Array.from(
            document.querySelectorAll('input[type="text"], input[type="search"], input:not([type])')
        ).filter(input => {
            if (!visivel(input)) return false;
            if (dentroDoPainel(input)) return false;

            const texto = normalizar(textoDoElemento(input));

            if (texto.includes('mensagem')) return false;
            if (texto.includes('digite sua mensagem')) return false;
            if (texto.includes('responder')) return false;
            if (texto.includes('atendente')) return false;

            return true;
        });

        const porTexto = inputs.find(input => {
            const texto = normalizar(textoDoElemento(input));

            return texto.includes('buscar') ||
                   texto.includes('pesquisar') ||
                   texto.includes('procurar') ||
                   texto.includes('contato') ||
                   texto.includes('cliente') ||
                   texto.includes('telefone') ||
                   texto.includes('atendimento');
        });

        return porTexto || inputs[0] || null;
    }

    async function aplicarFiltroVerTodosEPesquisar() {
        setStatus('Aplicando filtro "Ver todos"...', 'info');

        const botaoFiltro =
            encontrarBotaoPorPathSvg(PATH_FILTRO_TENDICHAT) ||
            encontrarElementoPorTexto(['filtro', 'filtrar']);

        if (!botaoFiltro) {
            setStatus('Não encontrei o botão de filtro.', 'erro');
            return false;
        }

        clicar(botaoFiltro);
        await esperar(90);

        const botaoVerTodos = encontrarBotaoVerTodos();

        if (!botaoVerTodos) {
            setStatus('Não encontrei a opção "Ver todos".', 'erro');
            return false;
        }

        clicar(botaoVerTodos);
        await esperar(90);

        const botaoPesquisar = encontrarBotaoPesquisar();

        if (!botaoPesquisar) {
            setStatus('Não encontrei o botão de pesquisar/lupa.', 'erro');
            return false;
        }

        clicar(botaoPesquisar);
        await esperar(350);

        return true;
    }

    async function preencherBuscaAtendimento(finalContato) {
        const campo = encontrarCampoBuscaAtendimento();

        if (!campo) {
            setStatus('Não encontrei o campo de busca de atendimento.', 'erro');
            return false;
        }

        setStatus(`Buscando contato final ${finalContato}...`, 'info');

        campo.focus();
        setValorInput(campo, '');
        await esperar(40);

        setValorInput(campo, finalContato);
        await esperar(70);

        const pesquisou = await aplicarFiltroVerTodosEPesquisar();

        if (!pesquisou) return false;

        return true;
    }

    function encontrarCardPorFinalContato(finalContato) {
        const candidatos = Array.from(
            document.querySelectorAll('button, a, [role="button"], li, article, div, span')
        ).filter(el => {
            if (!visivel(el)) return false;
            if (dentroDoPainel(el)) return false;

            const textoOriginal = textoDoElemento(el);
            const textoNormal = normalizar(textoOriginal);

            if (!textoNormal) return false;
            if (textoOriginal.length < 4) return false;
            if (textoOriginal.length > 1200) return false;

            const digitos = somenteDigitos(textoOriginal);

            return digitos.includes(finalContato);
        });

        candidatos.sort((a, b) => textoDoElemento(a).length - textoDoElemento(b).length);

        const encontrado = candidatos[0];

        if (!encontrado) return null;

        return encontrado.closest(
            'button, a, [role="button"], li, article, [class*="card"], [class*="item"], [class*="chat"], [class*="atendimento"], [class*="conversation"], [class*="Conversation"]'
        ) || encontrado;
    }

    async function procurarEAbrirAtendimento(finalContato) {
        const locais = [
            {
                nome: 'Pendente',
                termos: ['pendente', 'pendentes']
            },
            {
                nome: 'Atendendo',
                termos: ['atendendo', 'em atendimento', 'atendimento']
            }
        ];

        for (const local of locais) {
            setStatus(`Procurando em ${local.nome}...`, 'info');

            await clicarAbaPorTermos(local.termos);

            const buscaOk = await preencherBuscaAtendimento(finalContato);

            if (!buscaOk) {
                return false;
            }

            for (let tentativa = 1; tentativa <= 10; tentativa++) {
                const card = encontrarCardPorFinalContato(finalContato);

                if (card) {
                    setStatus(`Contato encontrado em ${local.nome}. Abrindo conversa...`, 'info');
                    clicar(card);
                    await esperar(600);
                    return true;
                }

                await esperar(150);
            }
        }

        return false;
    }

    function escopoModalOuDocumento() {
        const modais = Array.from(document.querySelectorAll(
            '[role="dialog"], [class*="modal"], [class*="Modal"], [class*="dialog"], [class*="Dialog"], [class*="popover"], [class*="Popover"]'
        )).filter(el => {
            if (!visivel(el)) return false;
            if (dentroDoPainel(el)) return false;
            return true;
        });

        modais.sort((a, b) => {
            const za = parseInt(window.getComputedStyle(a).zIndex || '0', 10);
            const zb = parseInt(window.getComputedStyle(b).zIndex || '0', 10);
            return zb - za;
        });

        return modais[0] || document;
    }

    async function abrirTransferencia() {
        setStatus('Abrindo botão de transferência...', 'info');

        const palavrasTransferir = [
            'transferir',
            'encaminhar',
            'redirecionar',
            'trocar atendente',
            'alterar atendente',
            'mudar atendente'
        ];

        let botao = encontrarElementoPorTexto(palavrasTransferir);

        if (botao) {
            clicar(botao);
            await esperar(350);
            return true;
        }

        const palavrasMenu = [
            'mais',
            'opcoes',
            'opções',
            'menu',
            'acoes',
            'ações'
        ];

        const menu = encontrarElementoPorTexto(palavrasMenu);

        if (menu) {
            clicar(menu);
            await esperar(250);

            botao = encontrarElementoPorTexto(palavrasTransferir);

            if (botao) {
                clicar(botao);
                await esperar(350);
                return true;
            }
        }

        return false;
    }

    function encontrarOpcaoAtendenteEmSelect(select, nomeAtendente) {
        const alvo = normalizar(nomeAtendente);
        const options = Array.from(select.options || []);

        return options.find(opt => normalizar(opt.textContent) === alvo) ||
               options.find(opt => normalizar(opt.textContent).startsWith(alvo)) ||
               options.find(opt => normalizar(opt.textContent).includes(alvo));
    }

    async function selecionarAtendente(nomeAtendente) {
        setStatus(`Selecionando atendente "${nomeAtendente}"...`, 'info');

        const alvo = normalizar(nomeAtendente);

        for (let tentativa = 1; tentativa <= 10; tentativa++) {
            const escopo = escopoModalOuDocumento();

            const selects = Array.from(escopo.querySelectorAll('select')).filter(visivel);

            for (const select of selects) {
                const opt = encontrarOpcaoAtendenteEmSelect(select, nomeAtendente);

                if (opt) {
                    select.value = opt.value;
                    dispararEventos(select);
                    await esperar(300);
                    return true;
                }
            }

            const campos = Array.from(
                escopo.querySelectorAll('input[type="text"], input[type="search"], input:not([type]), [role="combobox"]')
            ).filter(el => {
                if (!visivel(el)) return false;
                if (dentroDoPainel(el)) return false;

                const texto = normalizar(textoDoElemento(el));

                return texto.includes('atendente') ||
                       texto.includes('responsavel') ||
                       texto.includes('responsável') ||
                       texto.includes('selecione') ||
                       texto.includes('buscar') ||
                       el.getAttribute('role') === 'combobox';
            });

            if (campos.length) {
                const campo = campos[0];

                campo.focus();

                if ('value' in campo) {
                    setValorInput(campo, nomeAtendente);
                }

                await esperar(300);

                const opcao = encontrarElementoPorTexto([nomeAtendente], document);

                if (opcao && normalizar(textoDoElemento(opcao)).includes(alvo)) {
                    clicar(opcao);
                    await esperar(250);
                    return true;
                }
            }

            const dropdown = encontrarElementoPorTexto([
                'atendente',
                'responsavel',
                'responsável',
                'selecionar atendente',
                'escolher atendente'
            ], escopo);

            if (dropdown) {
                clicar(dropdown);
                await esperar(250);

                const opcao = encontrarElementoPorTexto([nomeAtendente], document);

                if (opcao && normalizar(textoDoElemento(opcao)).includes(alvo)) {
                    clicar(opcao);
                    await esperar(250);
                    return true;
                }
            }

            await esperar(150);
        }

        return false;
    }

    async function confirmarTransferencia() {
        setStatus('Confirmando transferência...', 'info');

        for (let tentativa = 1; tentativa <= 10; tentativa++) {
            const escopo = escopoModalOuDocumento();

            const botoes = Array.from(
                escopo.querySelectorAll('button, a, [role="button"]')
            ).filter(btn => {
                if (!visivel(btn)) return false;
                if (dentroDoPainel(btn)) return false;
                if (btn.disabled) return false;
                if (btn.id === ID_BOTAO) return false;

                const texto = normalizar(textoDoElemento(btn));

                return texto.includes('confirmar') ||
                       texto.includes('transferir') ||
                       texto.includes('salvar') ||
                       texto.includes('enviar') ||
                       texto.includes('concluir') ||
                       texto === 'ok';
            });

            botoes.sort((a, b) => {
                const ta = normalizar(textoDoElemento(a));
                const tb = normalizar(textoDoElemento(b));

                function peso(texto) {
                    if (texto.includes('confirmar')) return 0;
                    if (texto.includes('transferir')) return 1;
                    if (texto.includes('salvar')) return 2;
                    if (texto.includes('enviar')) return 3;
                    return 4;
                }

                return peso(ta) - peso(tb);
            });

            if (botoes[0]) {
                clicar(botoes[0]);
                await esperar(500);
                return true;
            }

            await esperar(150);
        }

        return false;
    }

    async function executarTransferencia(finalContato, atendente) {
        if (executando) {
            setStatus('Já existe uma transferência em andamento.', 'alerta');
            return;
        }

        if (!finalContato || finalContato.length !== 4) {
            setStatus('Informe exatamente os 4 últimos números do contato.', 'erro');
            return;
        }

        if (!atendente) {
            setStatus('Informe o atendente de destino.', 'erro');
            return;
        }

        executando = true;

        try {
            setStatus('Iniciando busca do atendimento...', 'info');

            const encontrou = await procurarEAbrirAtendimento(finalContato);

            if (!encontrou) {
                setStatus(`Contato final ${finalContato} não encontrado em Pendente ou Atendendo.`, 'erro');
                return;
            }

            const abriuTransferencia = await abrirTransferencia();

            if (!abriuTransferencia) {
                setStatus('Não consegui localizar o botão de transferir. Talvez ele seja ícone sem texto.', 'erro');
                return;
            }

            const selecionou = await selecionarAtendente(atendente);

            if (!selecionou) {
                setStatus(`Não consegui selecionar o atendente "${atendente}".`, 'erro');
                return;
            }

            const confirmou = await confirmarTransferencia();

            if (!confirmou) {
                setStatus('Atendente selecionado, mas não encontrei o botão de confirmar.', 'erro');
                return;
            }

            setStatus(`Transferência para "${atendente}" concluída.`, 'ok');

        } catch (erro) {
            console.error('[TendiChat Transferência]', erro);
            setStatus('Erro inesperado. Veja o console do navegador.', 'erro');
        } finally {
            executando = false;
        }
    }

    function iniciarSempre() {
        criarInterface();
    }

    setInterval(iniciarSempre, 700);

    const observer = new MutationObserver(() => {
        criarInterface();
    });

    function iniciarObserver() {
        if (!document.body) {
            setTimeout(iniciarObserver, 300);
            return;
        }

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });

        criarInterface();
    }

    iniciarObserver();
})();