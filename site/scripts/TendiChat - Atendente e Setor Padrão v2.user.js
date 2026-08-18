// ==UserScript==
// @name         TendiChat - Atendente e Setor Padrão v2
// @namespace    http://tampermonkey.net/
// @version      2.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Atendente%20e%20Setor%20Padr%C3%A3o%20v2.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Atendente%20e%20Setor%20Padr%C3%A3o%20v2.user.js
// @description  Define Suporte e Caio como padrão e cria busca de atendentes de forma resistente a mudanças na lista.
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CONFIG = {
        meuNome: 'Caio',
        setorPadrao: 'Suporte',
        maxSugestoes: 12,
        intervaloMs: 700,
        debug: true
    };

    const PREFIXO = '[TendiChat Padrão v2]';

    function log(...args) {
        if (CONFIG.debug) console.log(PREFIXO, ...args);
    }

    function normalizar(texto) {
        return String(texto || '')
            .replace(/[🟢🔴]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');
    }

    function nomeLimpo(texto) {
        return String(texto || '')
            .replace(/[🟢🔴]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function optionsDoSelect(select) {
        return Array.from(select?.options || []);
    }

    function textoDoContexto(elemento) {
        const blocos = [];
        let atual = elemento;

        for (let i = 0; atual && i < 5; i++, atual = atual.parentElement) {
            blocos.push(atual.textContent || '');
        }

        return normalizar(blocos.join(' '));
    }

    function encontrarOpcao(select, textoExato) {
        const alvo = normalizar(textoExato);
        return optionsDoSelect(select).find(opt => normalizar(opt.textContent) === alvo) || null;
    }

    function definirValorSelect(select, valor) {
        if (!select) return;

        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLSelectElement.prototype,
            'value'
        )?.set;

        if (setter) setter.call(select, String(valor));
        else select.value = String(valor);

        select.dispatchEvent(new Event('input', { bubbles: true }));
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function selecionarOpcao(select, option, manual = false) {
        if (!select || !option) return false;

        if (manual) {
            select.dataset.tendiUsuarioAlterouAtendente = '1';
        }

        definirValorSelect(select, option.value);
        return select.value === option.value;
    }

    function encontrarSelectSetor() {
        const porId = document.querySelector('#menu-hierarquico');
        if (porId instanceof HTMLSelectElement) return porId;

        return Array.from(document.querySelectorAll('select')).find(select => {
            const contexto = textoDoContexto(select);
            const temSuporte = !!encontrarOpcao(select, CONFIG.setorPadrao);
            return contexto.includes('transferir para o setor') && temSuporte;
        }) || null;
    }

    function pontuarSelectAtendente(select) {
        if (!(select instanceof HTMLSelectElement)) return -999;
        if (select.id === 'menu-hierarquico') return -999;

        const opcoes = optionsDoSelect(select);
        const contexto = textoDoContexto(select);
        const textos = opcoes.map(opt => normalizar(opt.textContent));

        let pontos = 0;

        if (contexto.includes('transferir para o atendente')) pontos += 100;
        if (textos.includes(normalizar(CONFIG.meuNome))) pontos += 60;
        if (textos.some(t => t.includes('nao definido'))) pontos += 30;
        if (opcoes.length >= 10) pontos += 20;
        if (select.classList.contains('classinput')) pontos += 10;
        if (contexto.includes('transferir para o setor')) pontos -= 50;

        return pontos;
    }

    function encontrarSelectAtendentes() {
        const candidatos = Array.from(document.querySelectorAll('select'))
            .map(select => ({ select, pontos: pontuarSelectAtendente(select) }))
            .filter(item => item.pontos >= 60)
            .sort((a, b) => b.pontos - a.pontos);

        return candidatos[0]?.select || null;
    }

    function aplicarSetorPadrao() {
        const selectSetor = encontrarSelectSetor();
        if (!selectSetor) return false;

        const opcaoAtual = optionsDoSelect(selectSetor).find(o => o.value === selectSetor.value);
        const atual = normalizar(opcaoAtual?.textContent);

        if (selectSetor.value && atual !== 'selecionar') return true;

        const suporte = encontrarOpcao(selectSetor, CONFIG.setorPadrao);
        if (!suporte) return false;

        definirValorSelect(selectSetor, suporte.value);
        log('Setor padrão aplicado:', nomeLimpo(suporte.textContent), suporte.value);
        return true;
    }

    function aplicarAtendentePadrao(select) {
        if (!select) return false;
        if (select.dataset.tendiUsuarioAlterouAtendente === '1') return true;

        const atual = optionsDoSelect(select).find(o => o.value === select.value);
        const textoAtual = normalizar(atual?.textContent);
        const semAtendente = !select.value || textoAtual.includes('nao definido') || textoAtual.includes('selecionar');

        if (!semAtendente) return true;

        const meuNome = encontrarOpcao(select, CONFIG.meuNome);
        if (!meuNome) {
            log('Opção do atendente ainda não carregada:', CONFIG.meuNome);
            return false;
        }

        selecionarOpcao(select, meuNome, false);
        log('Atendente padrão aplicado:', nomeLimpo(meuNome.textContent), meuNome.value);
        return true;
    }

    function criarComboBusca(select) {
        if (!select || !select.isConnected) return;

        const wrapperExistente = select.parentElement?.querySelector(':scope > .tendi-combo-atendente-v2');
        if (wrapperExistente) {
            select.dataset.tendiComboCriado = '1';
            return;
        }

        if (select.dataset.tendiComboCriado === '1') {
            delete select.dataset.tendiComboCriado;
        }

        const pai = select.parentElement;
        if (!pai) return;

        select.dataset.tendiComboCriado = '1';
        select.style.display = 'none';

        const wrapper = document.createElement('div');
        wrapper.className = 'tendi-combo-atendente-v2';

        Object.assign(wrapper.style, {
            position: 'relative',
            width: '100%',
            minWidth: '0',
            display: 'block',
            zIndex: '999998'
        });

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Selecionar atendente...';
        input.autocomplete = 'off';
        input.spellcheck = false;

        Object.assign(input.style, {
            width: '100%',
            height: '40px',
            padding: '0 36px 0 11px',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            background: '#ffffff',
            color: '#0f172a',
            fontSize: '12px',
            fontWeight: '700',
            outline: 'none',
            boxSizing: 'border-box'
        });

        const seta = document.createElement('span');
        seta.textContent = '▾';
        Object.assign(seta.style, {
            position: 'absolute',
            right: '12px',
            top: '9px',
            color: '#475569',
            fontSize: '14px',
            pointerEvents: 'none'
        });

        const lista = document.createElement('div');
        Object.assign(lista.style, {
            position: 'absolute',
            top: '44px',
            left: '0',
            width: '100%',
            maxHeight: '280px',
            overflowY: 'auto',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '8px',
            boxShadow: '0 10px 25px rgba(15,23,42,.22)',
            zIndex: '999999',
            display: 'none',
            padding: '4px',
            boxSizing: 'border-box'
        });

        let sugestoes = [];
        let indiceSelecionado = -1;

        function opcaoSelecionadaAtual() {
            return optionsDoSelect(select).find(o => o.value === select.value) || null;
        }

        function atualizarTextoAtual() {
            const atual = opcaoSelecionadaAtual();
            input.value = atual ? nomeLimpo(atual.textContent) : '';
        }

        function fecharLista() {
            lista.style.display = 'none';
            indiceSelecionado = -1;
        }

        function abrirLista() {
            lista.style.display = 'block';
        }

        function destacarItem() {
            const itens = Array.from(lista.querySelectorAll('button[data-indice]'));
            itens.forEach((item, index) => {
                item.style.background = index === indiceSelecionado ? '#e2e8f0' : '#ffffff';
                if (index === indiceSelecionado) item.scrollIntoView({ block: 'nearest' });
            });
        }

        function obterSugestoes() {
            const termo = normalizar(input.value);
            const opcoes = optionsDoSelect(select)
                .filter(opt => nomeLimpo(opt.textContent))
                .sort((a, b) => {
                    const aPlaceholder = normalizar(a.textContent).includes('nao definido');
                    const bPlaceholder = normalizar(b.textContent).includes('nao definido');
                    if (aPlaceholder !== bPlaceholder) return aPlaceholder ? -1 : 1;
                    return nomeLimpo(a.textContent).localeCompare(nomeLimpo(b.textContent), 'pt-BR');
                });

            if (!termo) return opcoes.slice(0, CONFIG.maxSugestoes);

            const comeca = opcoes.filter(opt => normalizar(opt.textContent).startsWith(termo));
            const contem = opcoes.filter(opt => {
                const texto = normalizar(opt.textContent);
                return !texto.startsWith(termo) && texto.includes(termo);
            });

            return [...comeca, ...contem].slice(0, CONFIG.maxSugestoes);
        }

        function escolher(opt) {
            if (!opt) return;
            selecionarOpcao(select, opt, true);
            input.value = nomeLimpo(opt.textContent);
            fecharLista();
            input.blur();
        }

        function renderizarSugestoes() {
            lista.innerHTML = '';
            sugestoes = obterSugestoes();
            indiceSelecionado = -1;

            if (!sugestoes.length) {
                const vazio = document.createElement('div');
                vazio.textContent = 'Nenhum atendente encontrado';
                Object.assign(vazio.style, {
                    padding: '8px 10px',
                    color: '#64748b',
                    fontSize: '12px',
                    fontWeight: '600'
                });
                lista.appendChild(vazio);
                abrirLista();
                return;
            }

            sugestoes.forEach((opt, index) => {
                const item = document.createElement('button');
                item.type = 'button';
                item.dataset.indice = String(index);
                item.textContent = nomeLimpo(opt.textContent);

                Object.assign(item.style, {
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    border: 'none',
                    borderRadius: '7px',
                    background: '#ffffff',
                    color: '#0f172a',
                    fontSize: '12px',
                    fontWeight: '700',
                    cursor: 'pointer'
                });

                item.addEventListener('mouseenter', () => {
                    indiceSelecionado = index;
                    destacarItem();
                });

                item.addEventListener('mousedown', e => e.preventDefault());
                item.addEventListener('click', () => escolher(opt));
                lista.appendChild(item);
            });

            abrirLista();
        }

        input.addEventListener('focus', () => {
            input.select();
            renderizarSugestoes();
        });

        input.addEventListener('input', renderizarSugestoes);

        input.addEventListener('keydown', e => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (lista.style.display === 'none') renderizarSugestoes();
                if (!sugestoes.length) return;
                indiceSelecionado = (indiceSelecionado + 1) % sugestoes.length;
                destacarItem();
                return;
            }

            if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (!sugestoes.length) return;
                indiceSelecionado = indiceSelecionado <= 0 ? sugestoes.length - 1 : indiceSelecionado - 1;
                destacarItem();
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const opt = indiceSelecionado >= 0
                    ? sugestoes[indiceSelecionado]
                    : sugestoes.length === 1
                        ? sugestoes[0]
                        : null;
                escolher(opt);
                return;
            }

            if (e.key === 'Escape') {
                fecharLista();
                atualizarTextoAtual();
                input.blur();
            }
        });

        document.addEventListener('click', e => {
            if (wrapper.isConnected && !wrapper.contains(e.target)) {
                fecharLista();
                atualizarTextoAtual();
            }
        });

        select.addEventListener('change', atualizarTextoAtual);

        const observer = new MutationObserver(() => {
            atualizarTextoAtual();
        });
        observer.observe(select, { childList: true, subtree: true });

        wrapper.append(input, seta, lista);
        pai.appendChild(wrapper);
        atualizarTextoAtual();

        log('Busca de atendentes criada em', select);
    }

    let ultimoSelectAtendente = null;

    function aplicar() {
        try {
            aplicarSetorPadrao();

            const selectAtendente = encontrarSelectAtendentes();
            if (!selectAtendente) return;

            if (selectAtendente !== ultimoSelectAtendente) {
                ultimoSelectAtendente = selectAtendente;
                log('Select de atendentes encontrado:', selectAtendente);
            }

            aplicarAtendentePadrao(selectAtendente);
            criarComboBusca(selectAtendente);
        } catch (erro) {
            console.error(PREFIXO, 'Erro ao aplicar automação:', erro);
        }
    }

    const observerPagina = new MutationObserver(aplicar);
    observerPagina.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    setInterval(aplicar, CONFIG.intervaloMs);
    aplicar();
})();
