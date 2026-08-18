// ==UserScript==
// @name         TendiChat - Busca Telas Manager
// @namespace    http://tampermonkey.net/
// @version      1.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Busca%20Telas%20Manager.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Busca%20Telas%20Manager.user.js
// @match        *://*.tendichat.com.br/*
// @match        *://tendichat.com.br/*
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // =====================================================
    // BASE DE TELAS
    // =====================================================

    const BASE = [

        // =============================
        // MOVIMENTAÇÃO
        // =============================

        { codigo: '100', nome: 'Venda', grupo: 'Movimentação' },
                { codigo: '24', nome: 'Gustavo - lider dos tchola', grupo: '-Lider dos tchola' },
        { codigo: '101', nome: 'Ordem de Serviço', grupo: 'Movimentação' },
        { codigo: '103', nome: 'Cancelar Operação', grupo: 'Movimentação' },
        { codigo: '113', nome: 'Supervisão de Vendas', grupo: 'Movimentação' },
        { codigo: '114', nome: 'Monta Carga', grupo: 'Movimentação' },
        { codigo: '115', nome: 'Comanda', grupo: 'Movimentação' },
        { codigo: '123', nome: 'Pedido de Compra', grupo: 'Movimentação' },
        { codigo: '124', nome: 'Supervisão de Entregas', grupo: 'Movimentação' },
        { codigo: '126', nome: 'Controle de Locação', grupo: 'Movimentação' },
        { codigo: '127', nome: 'Controle de Romaneio', grupo: 'Movimentação' },
        { codigo: '129', nome: 'Controle de Pesagem', grupo: 'Movimentação' },
        { codigo: '133', nome: 'Controle de Viagem', grupo: 'Movimentação' },
        { codigo: '136', nome: 'Controle de Veículos', grupo: 'Movimentação' },
        { codigo: '137', nome: 'Conferidor', grupo: 'Movimentação' },
        { codigo: '141', nome: 'Controle de Produção', grupo: 'Movimentação' },
        { codigo: '144', nome: 'Estoque Pendente de Entrega', grupo: 'Movimentação' },
        { codigo: '153', nome: 'Mapa de Visitas', grupo: 'Movimentação' },
        { codigo: '154', nome: 'Força de Vendas', grupo: 'Movimentação' },
        { codigo: '155', nome: 'Transferência de Estoque Entre Filiais', grupo: 'Movimentação' },
        { codigo: '162', nome: 'Devolução', grupo: 'Movimentação' },
        { codigo: '165', nome: 'Cotação de Compra', grupo: 'Movimentação' },

        // =============================
        // FINANCEIRO
        // =============================

        { codigo: '104', nome: 'Faturamento Contas a Receber', grupo: 'Financeiro' },
        { codigo: '105', nome: 'Contas a Pagar', grupo: 'Financeiro' },
        { codigo: '106', nome: 'Contas a Receber', grupo: 'Financeiro' },
        { codigo: '107', nome: 'Caixa', grupo: 'Financeiro' },
        { codigo: '109', nome: 'Emitir Recibo', grupo: 'Financeiro' },
        { codigo: '111', nome: 'Emitir Boleto - Pacote', grupo: 'Financeiro' },
        { codigo: '112', nome: 'Movimentação de Conta', grupo: 'Financeiro' },
        { codigo: '117', nome: 'Emitir Boleto Gráfico', grupo: 'Financeiro' },
        { codigo: '120', nome: 'Emitir Carnê', grupo: 'Financeiro' },
        { codigo: '122', nome: 'Baixa de Carteiras', grupo: 'Financeiro' },
        { codigo: '125', nome: 'Lançamento Manual de Crédito', grupo: 'Financeiro' },
        { codigo: '130', nome: 'Impressão e Remessa Bancária', grupo: 'Financeiro' },
        { codigo: '131', nome: 'Retorno Bancário', grupo: 'Financeiro' },
        { codigo: '139', nome: 'Recebimento com Cartão TEF', grupo: 'Financeiro' },
        { codigo: '147', nome: 'Contas em Aberto - Envio Email', grupo: 'Financeiro' },
        { codigo: '148', nome: 'Serasa', grupo: 'Financeiro' },
        { codigo: '149', nome: 'Negativação de Devedores', grupo: 'Financeiro' },
        { codigo: '151', nome: 'Protesto', grupo: 'Financeiro' },
        { codigo: '160', nome: 'Inclusão e Baixa', grupo: 'Financeiro' },
        { codigo: '163', nome: 'Movimentação de Crédito do Cliente/Fornecedor', grupo: 'Financeiro' },

        // =============================
        // FISCAL
        // =============================

        { codigo: '102', nome: 'Entrada de Produtos', grupo: 'Fiscal' },
        { codigo: '121', nome: 'Emitir Nota Fiscal Eletrônica NFe', grupo: 'Fiscal' },
        { codigo: '128', nome: 'Inventário de Estoque', grupo: 'Fiscal' },
        { codigo: '142', nome: 'Emitir Conhecimento de Transporte Eletrônico CTe', grupo: 'Fiscal' },
        { codigo: '143', nome: 'Emitir Nota Fiscal Eletrônica NFCe', grupo: 'Fiscal' },
        { codigo: '145', nome: 'Emitir Manifesto Eletrônico MDFE', grupo: 'Fiscal' },
        { codigo: '146', nome: 'Emitir Nota Fiscal de Serviço Eletrônica NFSe', grupo: 'Fiscal' },
        { codigo: '150', nome: 'SAT CFe', grupo: 'Fiscal' },
        { codigo: '452', nome: 'SPED Fiscal', grupo: 'Fiscal' },
        { codigo: '456', nome: 'SPED PIS/COFINS', grupo: 'Fiscal' },
        { codigo: '462', nome: 'Sintegra', grupo: 'Fiscal' },

        // =============================
        // SISTEMA
        // =============================

        { codigo: '401', nome: 'Extras', grupo: 'Sistema' },
        { codigo: '402', nome: 'Chave Ativação', grupo: 'Sistema' },
        { codigo: '403', nome: 'Backup Sistema', grupo: 'Sistema' },
        { codigo: '410', nome: 'Exportação / Importação', grupo: 'Sistema' },
        { codigo: '421', nome: 'Sistema', grupo: 'Sistema > Configuração' },
        { codigo: '422', nome: 'Venda', grupo: 'Sistema > Configuração' },
        { codigo: '423', nome: 'Produto', grupo: 'Sistema > Configuração' },
        { codigo: '427', nome: 'Nota Fiscal Eletrônica - NFe/NFCe', grupo: 'Sistema > Configuração' },
        { codigo: '429', nome: 'Impostos', grupo: 'Sistema > Configuração' },
        { codigo: '431', nome: 'Entrada NF - Estoque Neutro', grupo: 'Sistema > Extras' },
        { codigo: '435', nome: 'Manutenção de Lotes dos Produtos', grupo: 'Sistema > Extras' },
        { codigo: '438', nome: 'Ativar / Desativar Produtos', grupo: 'Sistema > Extras' },
        { codigo: '439', nome: 'Cálculo de Parcelamento', grupo: 'Sistema > Extras' },
        { codigo: '442', nome: 'Regra de Impostos', grupo: 'Sistema > Configuração' },
        { codigo: '457', nome: 'Manutenção de Estoque de Produtos', grupo: 'Sistema > Extras' },
        { codigo: '458', nome: 'Atualizações de Cadastros', grupo: 'Sistema > Extras' },
        { codigo: '459', nome: 'Acerto de Estoque', grupo: 'Sistema > Extras' },
        { codigo: '465', nome: 'Consulta de Produtos', grupo: 'Sistema > Extras' },
        { codigo: '467', nome: 'Manutenção de Preços dos Produtos', grupo: 'Sistema > Extras' },
        { codigo: '476', nome: 'Manutenção de Estoques', grupo: 'Sistema > Extras' },
        { codigo: '490', nome: 'Maxdata Links Tela', grupo: 'Sistema > Extras' },
        { codigo: '491', nome: 'Atualizações de Cadastros Multiloja', grupo: 'Sistema > Extras' },

        // =============================
        // RELATÓRIOS
        // =============================

        { codigo: '306', nome: 'Curva ABC', grupo: 'Relatórios' },
        { codigo: '307', nome: 'Documento Fiscal', grupo: 'Relatórios' },
        { codigo: '325', nome: 'Consultar Custo', grupo: 'Relatórios' },
        { codigo: '330', nome: 'Ficha Kardex', grupo: 'Relatórios' },
        { codigo: '331', nome: 'Listagem de Produtos', grupo: 'Relatórios' },
        { codigo: '339', nome: 'Consultar Caixa', grupo: 'Relatórios' },
        { codigo: '341', nome: 'Movimentação Geral do Caixa', grupo: 'Relatórios' },
        { codigo: '346', nome: 'Fluxo de Caixa', grupo: 'Relatórios' },
        { codigo: '347', nome: 'Fluxo de Caixa Detalhado', grupo: 'Relatórios' },
        { codigo: '357', nome: 'Média NF Emitidas', grupo: 'Relatórios' },
        { codigo: '361', nome: 'Por Venda', grupo: 'Relatórios' },
        { codigo: '362', nome: 'Resumo de Vendas / Recebimentos / Comissões', grupo: 'Relatórios' },
        { codigo: '369', nome: 'Por Serviço', grupo: 'Relatórios' },
        { codigo: '370', nome: 'Acompanhamento de Serviços', grupo: 'Relatórios' },
        { codigo: '372', nome: 'Vendas com Desconto Superior ao Máximo', grupo: 'Relatórios' },
        { codigo: '376', nome: 'Inventário de Produtos Fiscal', grupo: 'Relatórios' },
        { codigo: '382', nome: 'Resumo de Vendas', grupo: 'Relatórios' },
        { codigo: '384', nome: 'Movimentação de Produtos', grupo: 'Relatórios' },
        { codigo: '387', nome: 'Itens Cancelados em Venda', grupo: 'Relatórios' },
        { codigo: '389', nome: 'Comissão do Vendedor sobre Recebimento', grupo: 'Relatórios' },
        { codigo: '703', nome: 'Vendas por Período', grupo: 'Relatórios' },
        { codigo: '709', nome: 'Boletim de Caixa', grupo: 'Relatórios' },
        { codigo: '737', nome: 'Relatório de Vendas por Período / Horário', grupo: 'Relatórios' },
        { codigo: '746', nome: 'Centro de Custos / Plano de Contas por Mês', grupo: 'Relatórios' },
        { codigo: '747', nome: 'Produtos com Estoque Pendente', grupo: 'Relatórios' },
        { codigo: '765', nome: 'Vendas / Conferência Fiscal', grupo: 'Relatórios' },
        { codigo: '769', nome: 'Comissão', grupo: 'Relatórios' },
        { codigo: '799', nome: 'Mapa de Controle de Movimentação Mensal', grupo: 'Relatórios' },
        { codigo: '806', nome: 'Relatório de Orçamentos Item / Lote', grupo: 'Relatórios' },
        { codigo: '821', nome: 'Supervisão de Vendas - Itens Alterados', grupo: 'Relatórios' },
        { codigo: '826', nome: 'Indicadores de Venda', grupo: 'Relatórios' },
        { codigo: '836', nome: 'Por Venda - Dia da Semana', grupo: 'Relatórios' },
        { codigo: '838', nome: 'BI Dashboard', grupo: 'Relatórios' },
        { codigo: '844', nome: 'CRM - Relacionamento das Vendas', grupo: 'Relatórios' },
        { codigo: '853', nome: 'Relatório de Vacinas', grupo: 'Relatórios' }
    ];

    // =====================================================
    // PESQUISA
    // =====================================================

    function pesquisar(termo) {

        termo = termo
            .toLowerCase()
            .trim();

        if (!termo)
            return [];

        return BASE.filter(item => {

            const texto = `
                ${item.codigo}
                ${item.nome}
                ${item.grupo}
            `
            .toLowerCase();

            return texto.includes(termo);

        }).slice(0, 25);
    }

    // =====================================================
    // RESULTADO
    // =====================================================

    function atualizarResultado(texto) {

    let box =
        document.getElementById('tm-resultado');

    if (!box) {

        box = document.createElement('div');

        box.id = 'tm-resultado';

        Object.assign(box.style, {

            position: 'fixed',
            top: '110px',
            left: '50%',
            transform: 'translateX(-50%)',

            width: '620px',
            height: '620px',

            background: '#0b1220',

            color: '#e2e8f0',

            zIndex: '999999',

            borderRadius: '18px',

            border: '1px solid #1e293b',

            boxShadow:
                '0 0 30px rgba(0,0,0,.45)',

            overflow: 'hidden',

            fontFamily: 'Arial'
        });

        box.innerHTML = `

            <div style="
                padding:14px;
                background:#111827;
                border-bottom:1px solid #1e293b;
                font-weight:bold;
                display:flex;
                justify-content:space-between;
                align-items:center;
            ">

                <span>
                    🔎 Busca de Telas
                </span>

                <button id="tm-minimizar"
                    style="
                        background:#334155;
                        color:white;
                        border:none;
                        border-radius:8px;
                        padding:6px 10px;
                        cursor:pointer;
                        font-weight:bold;
                    ">
                    _
                </button>

            </div>

            <div style="
                padding:14px;
                border-bottom:1px solid #1e293b;
                background:#0f172a;
            ">

                <textarea
                    id="tm-input"
                    rows="3"
                    placeholder="Ex.: estoque, comissão, caixa..."
                    style="
                        width:100%;
                        background:#020617;
                        color:#fff;
                        border:1px solid #334155;
                        border-radius:12px;
                        padding:12px;
                        resize:none;
                        font-size:14px;
                        box-sizing:border-box;
                    "
                ></textarea>

            </div>

            <textarea
                id="tm-texto"
                readonly
                style="
                    width:100%;
                    height:480px;
                    background:#020617;
                    color:#e2e8f0;
                    border:none;
                    padding:16px;
                    resize:none;
                    font-size:14px;
                    line-height:1.5;
                    box-sizing:border-box;
                "
            ></textarea>
        `;

        document.body.appendChild(box);

        const input =
            document.getElementById('tm-input');

        input.focus();

        input.addEventListener('keydown', e => {

            if (
                e.key === 'Enter' &&
                !e.shiftKey
            ) {

                e.preventDefault();

                const termo =
                    input.value.trim();

                if (!termo)
                    return;

                const resultados =
                    pesquisar(termo);

                if (!resultados.length) {

                    atualizarResultado(
                        'Nenhuma tela encontrada.'
                    );

                    return;
                }

                const texto =
                    resultados
                        .map(x =>
                            `${x.codigo} - ${x.nome}`
                        )
                        .join('\\n');

                atualizarResultado(
    texto.replace(/\\n/g, '\n')
);
            }

            if (e.key === 'Escape') {

                box.style.display = 'none';
            }
        });

        document
            .getElementById('tm-minimizar')
            .onclick = () => {

                box.style.display = 'none';
            };
    }

    document.getElementById(
        'tm-texto'
    ).value = texto;
}
    // =====================================================
    // JANELA DE PESQUISA
    // =====================================================

    function abrirPesquisa() {

    const existente =
        document.getElementById(
            'tm-resultado'
        );

    if (existente) {

        existente.style.display = 'block';

        document
            .getElementById('tm-input')
            ?.focus();

        return;
    }

    atualizarResultado(
        'Digite algo para pesquisar.'
    );
}

    // =====================================================
    // BOTÃO FLUTUANTE
    // =====================================================

  // =====================================================
// BOTÃO FIXO AO LADO DO 🤖
// =====================================================

function criarBotaoBusca() {

    const btn = document.createElement('button');

    btn.id = 'tm-btn-busca';

    btn.innerText = '?';

    Object.assign(btn.style, {

        width: '28px',
        height: '28px',
        minWidth: '28px',

        padding: '0',

        border: 'none',

        borderRadius: '8px',

        background:
            'linear-gradient(135deg,#2563eb,#1d4ed8)',

        color: '#fff',

        display: 'inline-flex',

        alignItems: 'center',

        justifyContent: 'center',

        fontSize: '16px',

        fontWeight: '900',

        cursor: 'pointer',

        lineHeight: '1',

        transition: 'all .15s ease',

        boxShadow:
            '0 2px 10px rgba(37,99,235,.35)'
    });

    btn.onmouseenter = () => {

        btn.style.transform =
            'translateY(-1px) scale(1.05)';
    };

    btn.onmouseleave = () => {

        btn.style.transform =
            'translateY(0) scale(1)';
    };

    btn.onclick = abrirPesquisa;

    return btn;
}

function inserirBotaoBusca() {

    const btnRelato =
        document.getElementById(
            'helper-btn-ia'
        );

    if (!btnRelato) return;

    if (
        document.getElementById(
            'tm-btn-busca'
        )
    ) return;

    const caixa =
        btnRelato.parentElement;

    if (!caixa) return;

    const filhos =
        Array.from(caixa.children);

    const idx =
        filhos.indexOf(btnRelato);

    if (idx === -1) return;

    const alvo =
        filhos[idx + 1];

    const novoBotao =
        criarBotaoBusca();

    if (alvo) {

        alvo.replaceWith(novoBotao);

    } else {

        btnRelato.insertAdjacentElement(
            'afterend',
            novoBotao
        );
    }
}

setInterval(
    inserirBotaoBusca,
    500
);

})();