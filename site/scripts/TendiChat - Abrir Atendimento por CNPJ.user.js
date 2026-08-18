// ==UserScript==
// @name         TendiChat - Abrir Atendimento por CNPJ
// @namespace    maxdata.tendichat.cnpj.atendimento
// @version      1.7
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Abrir%20Atendimento%20por%20CNPJ.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Abrir%20Atendimento%20por%20CNPJ.user.js
// @description  Identifica CNPJ no TendiChat e abre atendimento comum ou suporte interno automaticamente
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @match        *://externo.maxdatasistema.com.br/Atendimentos/Atendimento*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const ATENDIMENTO_URL = 'http://externo.maxdatasistema.com.br/Atendimentos/Atendimento';

    const ATTR_AREA = 'data-area-cnpj-tendichat';
    const ATTR_BTN = 'data-botao-cnpj-tendichat';

    const PALAVRAS_CNPJ = /\b(cnpj|cnpj\/cpf|cpf\/cnpj|cadastro nacional)\b/i;

    const CONTEXTO_SUSPEITO = /\b(anydesk|any desk|telefone|fone|celular|whatsapp|wpp|zap|contato|ramal|senha|codigo|código|protocolo|pedido|ordem de serviço|os|nota|nf|nfe|nf-e|cupom|venda|boleto|chave|id remoto|acesso remoto|conexao|conexão)\b/i;

    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

    function somenteNumeros(valor) {
        return String(valor || '').replace(/\D/g, '');
    }

    function formatarCNPJ(cnpj) {
        cnpj = somenteNumeros(cnpj);

        if (cnpj.length !== 14) return cnpj;

        return cnpj.replace(
            /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
            '$1.$2.$3/$4-$5'
        );
    }

    function validarCNPJ(cnpj) {
        cnpj = somenteNumeros(cnpj);

        if (cnpj.length !== 14) return false;
        if (/^(\d)\1{13}$/.test(cnpj)) return false;

        let tamanho = 12;
        let numeros = cnpj.substring(0, tamanho);
        let digitos = cnpj.substring(tamanho);
        let soma = 0;
        let pos = tamanho - 7;

        for (let i = tamanho; i >= 1; i--) {
            soma += Number(numeros.charAt(tamanho - i)) * pos--;
            if (pos < 2) pos = 9;
        }

        let resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
        if (resultado !== Number(digitos.charAt(0))) return false;

        tamanho = 13;
        numeros = cnpj.substring(0, tamanho);
        soma = 0;
        pos = tamanho - 7;

        for (let i = tamanho; i >= 1; i--) {
            soma += Number(numeros.charAt(tamanho - i)) * pos--;
            if (pos < 2) pos = 9;
        }

        resultado = soma % 11 < 2 ? 0 : 11 - (soma % 11);
        return resultado === Number(digitos.charAt(1));
    }

    function temFormatoForteDeCNPJ(textoBruto) {
        return /\d{2}\s*\.?\s*\d{3}\s*\.?\s*\d{3}\s*\/\s*\d{4}\s*-?\s*\d{2}/.test(textoBruto);
    }

    function temOrdemDeCNPJProvavel(cnpj) {
        cnpj = somenteNumeros(cnpj);

        if (cnpj.length !== 14) return false;

        const ordem = cnpj.substring(8, 12);

        return /^0{0,3}[1-9]\d{0,3}$/.test(ordem) || /^00\d{2}$/.test(ordem);
    }

    function contextoEhSuspeito(texto, textoBruto) {
        if (PALAVRAS_CNPJ.test(texto)) return false;

        if (CONTEXTO_SUSPEITO.test(texto)) return true;

        if (/\(\s*\d{2}\s*\)\s*\d{4,5}-?\d{4}/.test(textoBruto)) return true;

        if (/\b(?:55\s*)?\d{2}\s*9?\d{4}[-\s]?\d{4}\b/.test(textoBruto)) return true;

        if (/\b\d{3}\s?\d{3}\s?\d{3}\b/.test(textoBruto) && /any\s?desk|acesso|remoto|senha/i.test(texto)) return true;

        return false;
    }

    function extrairCandidatosCNPJ(texto) {
        const candidatos = [];
        const textoOriginal = String(texto || '');

        const regex = /(^|[^\d])((?:\d[\s.\-/]*){14})(?![\s.\-/]*\d)/g;

        let match;

        while ((match = regex.exec(textoOriginal)) !== null) {
            const bruto = match[2].trim();
            const numeros = somenteNumeros(bruto);

            if (numeros.length !== 14) continue;
            if (candidatos.some(c => c.cnpj === numeros)) continue;

            const inicio = Math.max(0, match.index - 35);
            const fim = Math.min(textoOriginal.length, regex.lastIndex + 35);
            const contextoLocal = textoOriginal.substring(inicio, fim);

            const valido = validarCNPJ(numeros);
            const contextoSuspeito = contextoEhSuspeito(contextoLocal, bruto);
            const temPalavraCNPJ = PALAVRAS_CNPJ.test(contextoLocal);
            const temFormato = temFormatoForteDeCNPJ(bruto);
            const ordemProvavel = temOrdemDeCNPJProvavel(numeros);

            if (contextoSuspeito) continue;

            if (!valido && !temPalavraCNPJ && !temFormato && !ordemProvavel) {
                continue;
            }

            candidatos.push({
                cnpj: numeros,
                bruto,
                valido
            });
        }

        return candidatos;
    }

    function obterTextoMensagem(article) {
        const clone = article.cloneNode(true);

        clone.querySelectorAll(`[${ATTR_AREA}], [${ATTR_BTN}], button, svg`).forEach(el => el.remove());

        const paragrafos = Array.from(clone.querySelectorAll('p'))
            .map(p => (p.innerText || p.textContent || '').trim())
            .filter(Boolean);

        if (paragrafos.length) {
            return paragrafos.join('\n');
        }

        return (clone.innerText || clone.textContent || '')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function obterPontoInsercao(article) {
        const paragrafos = Array.from(article.querySelectorAll('p'))
            .filter(p => (p.innerText || p.textContent || '').trim());

        if (paragrafos.length) {
            return paragrafos[paragrafos.length - 1];
        }

        return null;
    }

    function isMensagemRealDoChat(article) {
        if (!article) return false;

        const wrapperMensagem = article.closest('div[id^="wamid."]');

        if (!wrapperMensagem) return false;

        if (article.closest('article[content="Suporte"]')) return false;

        return true;
    }

    function decodificarBase64Seguro(valor) {
        try {
            let base64 = String(valor || '')
                .replace(/^wamid\./, '')
                .replace(/-/g, '+')
                .replace(/_/g, '/');

            while (base64.length % 4 !== 0) {
                base64 += '=';
            }

            return atob(base64);
        } catch (e) {
            return '';
        }
    }

    function extrairContatoDeWamid(id) {
        const decodificado = decodificarBase64Seguro(id);
        const encontrados = decodificado.match(/\d{10,15}/g) || [];

        if (!encontrados.length) return '';

        const comBrasil = encontrados.find(n => n.startsWith('55') && n.length >= 12 && n.length <= 13);

        if (comBrasil) return comBrasil;

        return encontrados.sort((a, b) => b.length - a.length)[0] || '';
    }

    function extrairContatoTendiChat(article) {
        const wrapperAtual = article.closest('div[id^="wamid."]');

        if (wrapperAtual) {
            const contatoAtual = extrairContatoDeWamid(wrapperAtual.id);
            if (contatoAtual) return contatoAtual;
        }

        const wrappers = Array.from(document.querySelectorAll('div[id^="wamid."]'));

        for (const wrapper of wrappers) {
            const contato = extrairContatoDeWamid(wrapper.id);
            if (contato) return contato;
        }

        return '';
    }

    function abrirAtendimento(cnpj, contato, modoInterno = false) {
        const url = new URL(ATENDIMENTO_URL);

        url.searchParams.set('tm_auto', '1');
        url.searchParams.set('tm_cnpj', somenteNumeros(cnpj));

        if (contato) {
            url.searchParams.set('tm_contato', somenteNumeros(contato));
        }

        if (modoInterno) {
            url.searchParams.set('tm_interno', '1');
        }

        window.open(url.toString(), '_blank');
    }

    function obterCampoMensagemTendiChat() {
        const seletores = [
            'div[contenteditable="true"][role="textbox"]',
            'div[contenteditable="true"]',
            'textarea',
            'input[type="text"]'
        ];

        for (const seletor of seletores) {
            const campos = Array.from(document.querySelectorAll(seletor));

            const campo = campos.find(el => {
                const rect = el.getBoundingClientRect();
                const estilo = window.getComputedStyle(el);

                return rect.width > 0
                    && rect.height > 0
                    && estilo.display !== 'none'
                    && estilo.visibility !== 'hidden'
                    && !el.disabled
                    && !el.readOnly;
            });

            if (campo) return campo;
        }

        return null;
    }

    function definirTextoMensagemTendiChat(campo, texto) {
        if (!campo) return false;

        campo.focus();

        if (campo.isContentEditable) {
            document.execCommand('selectAll', false, null);
            document.execCommand('insertText', false, texto);
        } else {
            definirValorInput(campo, texto);
        }

        campo.dispatchEvent(new Event('input', { bubbles: true }));
        campo.dispatchEvent(new Event('change', { bubbles: true }));

        return true;
    }

    function enviarMensagemTendiChat(texto) {
        const campo = obterCampoMensagemTendiChat();

        if (!campo) return false;

        definirTextoMensagemTendiChat(campo, texto);

        setTimeout(() => {
            dispararEnter(campo);
        }, 150);

        return true;
    }

    function criarBotao(candidato, article) {
        const btn = document.createElement('button');
        const cnpjFormatado = formatarCNPJ(candidato.cnpj);

        btn.setAttribute(ATTR_BTN, '1');
        btn.dataset.cnpj = candidato.cnpj;
        btn.dataset.cnpjFormatado = cnpjFormatado;
        btn.dataset.valido = candidato.valido ? '1' : '0';

        btn.textContent = candidato.valido
            ? `Abrir atendimento: ${cnpjFormatado}`
            : `CNPJ inválido: ${cnpjFormatado}`;

        btn.title = candidato.valido
            ? 'Abrir atendimento com este CNPJ'
            : 'CNPJ inválido';

        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.marginTop = '6px';
        btn.style.padding = '5px 9px';
        btn.style.borderRadius = '8px';
        btn.style.border = 'none';
        btn.style.cursor = candidato.valido ? 'pointer' : 'default';
        btn.style.fontSize = '12px';
        btn.style.fontWeight = '700';
        btn.style.lineHeight = '1.2';
        btn.style.whiteSpace = 'nowrap';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,.20)';
        btn.style.color = '#fff';
        btn.style.background = candidato.valido ? '#16a34a' : '#dc2626';

        if (candidato.valido) {
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                const contato = extrairContatoTendiChat(article);

                abrirAtendimento(candidato.cnpj, contato);
            });
        } else {
            btn.addEventListener('click', function (event) {
                event.preventDefault();
                event.stopPropagation();

                enviarMensagemTendiChat('CNPJ invalido');
            });
        }

        return btn;
    }

    function criarBotaoSuporteInterno(candidato, article) {
        const btn = document.createElement('button');
        const miolo = document.createElement('span');

        btn.setAttribute(ATTR_BTN, '1');
        btn.type = 'button';
        btn.title = 'Abrir como suporte interno';
        btn.setAttribute('aria-label', 'Abrir como suporte interno');

        btn.style.display = 'inline-flex';
        btn.style.alignItems = 'center';
        btn.style.justifyContent = 'center';
        btn.style.width = '28px';
        btn.style.height = '28px';
        btn.style.marginTop = '6px';
        btn.style.padding = '0';
        btn.style.border = 'none';
        btn.style.borderRadius = '50%';
        btn.style.cursor = 'pointer';
        btn.style.background = '#2d8bc5';
        btn.style.boxShadow = '0 2px 6px rgba(0,0,0,.20)';
        btn.style.flex = '0 0 28px';

        miolo.textContent = 'S';
        miolo.style.display = 'inline-flex';
        miolo.style.alignItems = 'center';
        miolo.style.justifyContent = 'center';
        miolo.style.width = '18px';
        miolo.style.height = '18px';
        miolo.style.border = '2px solid #fff';
        miolo.style.borderRadius = '50%';
        miolo.style.background = '#fff';
        miolo.style.color = '#2d8bc5';
        miolo.style.fontSize = '13px';
        miolo.style.fontWeight = '900';
        miolo.style.fontFamily = 'Arial, sans-serif';
        miolo.style.lineHeight = '1';
        miolo.style.boxSizing = 'border-box';

        btn.appendChild(miolo);

        btn.addEventListener('mouseenter', () => {
            btn.style.background = '#2378aa';
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.background = '#2d8bc5';
        });

        btn.addEventListener('click', function (event) {
            event.preventDefault();
            event.stopPropagation();

            const contato = extrairContatoTendiChat(article);

            abrirAtendimento(candidato.cnpj, contato, true);
        });

        return btn;
    }

    function criarGrupoBotoes(candidato, article) {
        const grupo = document.createElement('div');

        grupo.style.display = 'inline-flex';
        grupo.style.alignItems = 'center';
        grupo.style.gap = '5px';

        grupo.appendChild(criarBotao(candidato, article));

        if (candidato.valido) {
            grupo.appendChild(criarBotaoSuporteInterno(candidato, article));
        }

        return grupo;
    }

    function criarAreaBotoes(candidatos, article) {
        const area = document.createElement('div');

        area.setAttribute(ATTR_AREA, '1');

        area.style.display = 'flex';
        area.style.flexWrap = 'wrap';
        area.style.gap = '6px';
        area.style.marginTop = '6px';

        candidatos.forEach(candidato => {
            area.appendChild(criarGrupoBotoes(candidato, article));
        });

        return area;
    }

    function processarMensagem(article) {
        if (!isMensagemRealDoChat(article)) return;
        if (article.querySelector(`[${ATTR_AREA}]`)) return;

        const texto = obterTextoMensagem(article);
        if (!texto) return;

        const candidatos = extrairCandidatosCNPJ(texto);
        if (!candidatos.length) return;

        const area = criarAreaBotoes(candidatos, article);
        const ponto = obterPontoInsercao(article);

        if (ponto) {
            ponto.insertAdjacentElement('afterend', area);
        } else {
            article.appendChild(area);
        }
    }

    function processarChatTendiChat() {
        const artigosDeMensagem = document.querySelectorAll('div[id^="wamid."] article');

        artigosDeMensagem.forEach(processarMensagem);
    }

    function iniciarTendiChat() {
        let timer = null;

        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(processarChatTendiChat, 250);
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });

        processarChatTendiChat();

        setTimeout(processarChatTendiChat, 500);
        setTimeout(processarChatTendiChat, 1500);
        setTimeout(processarChatTendiChat, 3000);
    }

    function isPaginaAtendimentoMaxData() {
        return location.hostname.includes('externo.maxdatasistema.com.br')
            && /\/Atendimentos\/Atendimento/i.test(location.pathname);
    }

    function aguardarElemento(seletor, timeout = 20000) {
        return new Promise((resolve, reject) => {
            const inicial = document.querySelector(seletor);

            if (inicial) {
                resolve(inicial);
                return;
            }

            const inicio = Date.now();

            const intervalo = setInterval(() => {
                const el = document.querySelector(seletor);

                if (el) {
                    clearInterval(intervalo);
                    resolve(el);
                    return;
                }

                if (Date.now() - inicio >= timeout) {
                    clearInterval(intervalo);
                    reject(new Error(`Elemento não encontrado: ${seletor}`));
                }
            }, 250);
        });
    }

    function definirValorInput(input, valor) {
        if (!input) return;

        input.focus();

        const proto = input.tagName === 'TEXTAREA'
            ? window.HTMLTextAreaElement.prototype
            : window.HTMLInputElement.prototype;

        const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');

        if (descriptor && descriptor.set) {
            descriptor.set.call(input, valor);
        } else {
            input.value = valor;
        }

        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    }

    function dispararEnter(input) {
        if (!input) return;

        input.focus();

        ['keydown', 'keypress', 'keyup'].forEach(tipo => {
            input.dispatchEvent(new KeyboardEvent(tipo, {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            }));
        });

        if (window.jQuery) {
            try {
                const $ = window.jQuery;

                $(input).trigger($.Event('keydown', { which: 13, keyCode: 13 }));
                $(input).trigger($.Event('keypress', { which: 13, keyCode: 13 }));
                $(input).trigger($.Event('keyup', { which: 13, keyCode: 13 }));
            } catch (e) {}
        }
    }

    function normalizarTexto(valor) {
        return String(valor || '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toUpperCase();
    }

    function dispararMudancaCampo(campo) {
        if (!campo) return;

        campo.dispatchEvent(new Event('input', { bubbles: true }));
        campo.dispatchEvent(new Event('change', { bubbles: true }));
        campo.dispatchEvent(new Event('blur', { bubbles: true }));

        if (window.jQuery) {
            try {
                window.jQuery(campo).trigger('input').trigger('change').trigger('blur');
            } catch (e) {}
        }
    }

    function selecionarOpcaoPorTexto(campo, textoDesejado) {
        if (!campo) return false;

        const textoNormalizado = normalizarTexto(textoDesejado);

        if (campo.tagName === 'SELECT') {
            const opcoes = Array.from(campo.options || []);
            const opcao = opcoes.find(item => {
                const textoOpcao = normalizarTexto(item.textContent || item.innerText);
                const valorOpcao = normalizarTexto(item.value);

                return textoOpcao === textoNormalizado || valorOpcao === textoNormalizado;
            });

            if (!opcao) return false;

            campo.focus();
            campo.value = opcao.value;
            opcao.selected = true;

            if (window.jQuery) {
                try {
                    window.jQuery(campo).val(opcao.value).trigger('change');
                } catch (e) {}
            }

            dispararMudancaCampo(campo);
            return true;
        }

        definirValorInput(campo, textoDesejado);
        dispararEnter(campo);
        dispararMudancaCampo(campo);

        return true;
    }

    async function aguardarESelecionarOpcao(seletor, textoDesejado, timeout = 20000) {
        const inicio = Date.now();

        while (Date.now() - inicio < timeout) {
            const campo = document.querySelector(seletor);

            if (campo && selecionarOpcaoPorTexto(campo, textoDesejado)) {
                return campo;
            }

            await sleep(250);
        }

        throw new Error(`Opção não encontrada em ${seletor}: ${textoDesejado}`);
    }

    async function tentarPreencherInterno(descricao, acao) {
        try {
            await acao();
            return true;
        } catch (e) {
            console.warn(`[TendiChat CNPJ] Não foi possível preencher ${descricao}:`, e);
            return false;
        }
    }

    function rolarTelaParaBaixo() {
        try {
            const altura = Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
            );

            window.scrollTo({
                top: altura,
                behavior: 'smooth'
            });

            document.documentElement.scrollTop = altura;
            document.body.scrollTop = altura;
        } catch (e) {}
    }

    async function preencherAtendimentoMaxData() {
        const params = new URLSearchParams(location.search);

        const auto = params.get('tm_auto');
        const cnpj = somenteNumeros(params.get('tm_cnpj') || '');
        const contato = somenteNumeros(params.get('tm_contato') || '');
        const modoInterno = params.get('tm_interno') === '1';

        if (auto !== '1' || cnpj.length !== 14) return;

        try {
            const campoCnpj = await aguardarElemento('#Cliente_cliCpfCgc', 20000);

            definirValorInput(campoCnpj, cnpj);

            await sleep(400);

            dispararEnter(campoCnpj);

            await sleep(1000);
            rolarTelaParaBaixo();

            await sleep(700);
            rolarTelaParaBaixo();

            if (contato) {
                const campoContato = await aguardarElemento('#vedAtendContato', 20000);

                rolarTelaParaBaixo();

                for (let i = 0; i < 5; i++) {
                    definirValorInput(campoContato, contato);
                    await sleep(400);
                }
            }

            if (modoInterno) {
                rolarTelaParaBaixo();

                await tentarPreencherInterno('a descrição do atendimento', async () => {
                    const campoDescricao = await aguardarElemento('#vedAtendDescricao', 20000);
                    definirValorInput(campoDescricao, 'Acesso adm');
                });

                await tentarPreencherInterno('o tipo de suporte', async () => {
                    await aguardarESelecionarOpcao(
                        '#TipoSuporteDesc',
                        'INTERNO/SUPORTE INTERNO',
                        20000
                    );
                });

                await sleep(600);

                await tentarPreencherInterno('o técnico', async () => {
                    await aguardarESelecionarOpcao(
                        '#vedTecnico',
                        'SKYTINS - PAULO',
                        20000
                    );
                });
            }

            history.replaceState({}, document.title, location.origin + location.pathname);
        } catch (e) {
            console.warn('[TendiChat CNPJ] Falha ao preencher atendimento:', e);
        }
    }

    if (isPaginaAtendimentoMaxData()) {
        preencherAtendimentoMaxData();
    } else {
        iniciarTendiChat();
    }

})();