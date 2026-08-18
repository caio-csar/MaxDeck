// ==UserScript==
// @name         Max Painel - Ultra Modern UI (Stripe Style)
// @namespace    http://tampermonkey.net/
// @version      3.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Max%20Painel%20-%20Ultra%20Modern%20UI%20%28Stripe%20Style%29.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Max%20Painel%20-%20Ultra%20Modern%20UI%20%28Stripe%20Style%29.user.js
// @description  Redesenho completo do painel Maxdata com visual minimalista, moderno e de alta fidelidade.
// @author       Você
// @match        https://painel.maxdata.com.br/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(function() {
    'use strict';

    // 1. Importa a fonte Inter (padrão de interfaces modernas de alto nível)
    const linkFont = document.createElement('link');
    linkFont.rel = 'stylesheet';
    linkFont.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
    document.head.appendChild(linkFont);

    // 2. CSS Ultra Moderno
    const css = `
        /* Variáveis de Cores - Paleta Premium */
        :root {
            --bg-page: #090d16;          /* Fundo escuro profundo (estilo Tailwind Slate-950) */
            --bg-card: #111827;          /* Fundo dos painéis principais */
            --border-card: #1f2937;      /* Borda sutil dos painéis */
            --text-main: #f9fafb;        /* Texto principal brilhante */
            --text-muted: #6b7280;       /* Texto secundário */

            /* Tons Pastel Tecnológicos (Modernos e confortáveis aos olhos) */
            --urgente-bg: rgba(239, 68, 68, 0.08);
            --urgente-border: rgba(239, 68, 68, 0.3);
            --urgente-text: #fca5a5;
            --urgente-glow: rgba(239, 68, 68, 0.15);

            --alerta-bg: rgba(249, 115, 22, 0.08);
            --alerta-border: rgba(249, 115, 22, 0.3);
            --alerta-text: #fdb674;
            --alerta-glow: rgba(249, 115, 22, 0.15);

            --purple-bg: rgba(168, 85, 247, 0.08);
            --purple-border: rgba(168, 85, 247, 0.3);
            --purple-text: #d8b4fe;
            --purple-glow: rgba(168, 85, 247, 0.15);

            --default-bg: rgba(255, 255, 255, 0.02);
            --default-border: rgba(255, 255, 255, 0.08);
            --default-text: #e5e7eb;
        }

        /* Fundo do Painel */
        body, html {
            background-color: var(--bg-page) !important;
            background-image: radial-gradient(circle at top, #1e1b4b 0%, var(--bg-page) 65%) !important; /* Glow roxo/azul sutil ao fundo */
            font-family: 'Inter', system-ui, sans-serif !important;
            color: var(--text-main) !important;
        }

        /* Painéis Principais (Atendimentos Pendentes, Em Andamento, Disponíveis) */
        div[style*="background-color: rgb(44"],
        div[style*="background-color:#2c"],
        div[style*="background-color: rgb(42"] {
            background: var(--bg-card) !important;
            border: 1px solid var(--border-card) !important;
            border-radius: 16px !important;
            box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5), 0 8px 10px -6px rgba(0, 0, 0, 0.5) !important;
            padding: 24px !important;
        }

        /* Títulos dos Painéis */
        div[style*="font-size: 24px"], div[style*="font-size:24px"] {
            font-family: 'Inter', sans-serif !important;
            font-weight: 700 !important;
            font-size: 1.25rem !important; /* 20px - tamanho moderno */
            letter-spacing: -0.03em !important;
            color: var(--text-main) !important;
            border-bottom: 1px solid rgba(255, 255, 255, 0.06) !important;
            padding-bottom: 16px !important;
            margin-bottom: 20px !important;
        }

        /* Esconder cabeçalhos antigos de tabela que poluem o visual */
        div[style*="background-color: gray"],
        div[style*="background-color: rgb(128, 128, 128)"] {
            display: none !important;
        }

        /* --- CARDS DE ATENDIMENTO (O Pulo do Gato) --- */
        .modern-row-urgente, .modern-row-alerta, .modern-row-purple, .modern-row-default {
            display: flex !important;
            flex-direction: row !important;
            justify-content: space-between !important;
            align-items: center !important;
            padding: 14px 20px !important;
            margin-bottom: 10px !important;
            border-radius: 10px !important;
            font-weight: 500 !important;
            font-size: 0.9rem !important;
            transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
            box-shadow: inset 0 1px 0 0 rgba(255, 255, 255, 0.05) !important;
            border: 1px solid transparent !important;
        }

        /* Estilo Individual por Prioridade */
        .modern-row-urgente {
            background-color: var(--urgente-bg) !important;
            border-color: var(--urgente-border) !important;
            color: var(--urgente-text) !important;
            box-shadow: 0 0 12px var(--urgente-glow) !important;
        }
        .modern-row-alerta {
            background-color: var(--alerta-bg) !important;
            border-color: var(--alerta-border) !important;
            color: var(--alerta-text) !important;
            box-shadow: 0 0 12px var(--alerta-glow) !important;
        }
        .modern-row-purple {
            background-color: var(--purple-bg) !important;
            border-color: var(--purple-border) !important;
            color: var(--purple-text) !important;
            box-shadow: 0 0 12px var(--purple-glow) !important;
        }
        .modern-row-default {
            background-color: var(--default-bg) !important;
            border-color: var(--default-border) !important;
            color: var(--default-text) !important;
        }

        /* Hover de alta fidelidade (Efeito de foco) */
        .modern-row-urgente:hover, .modern-row-alerta:hover, .modern-row-purple:hover, .modern-row-default:hover {
            transform: translateY(-2px);
            filter: brightness(1.25);
            box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.4) !important;
        }

        /* Limpeza completa de heranças das tabelas antigas */
        .modern-row-urgente *, .modern-row-alerta *, .modern-row-purple *, .modern-row-default * {
            background: transparent !important;
            background-color: transparent !important;
            border: none !important;
            box-shadow: none !important;
        }

        /* Estilo do tempo (Bold e com espaçamento) */
        .modern-row-urgente div:last-child,
        .modern-row-alerta div:last-child,
        .modern-row-purple div:last-child,
        .modern-row-default div:last-child {
            font-family: 'JetBrains Mono', monospace, sans-serif !important;
            font-weight: 700 !important;
            letter-spacing: 0.05em !important;
        }

        /* --- WIDGETS DE TOPO (Minimalismo Absoluto) --- */
        div[style*="background-color: rgb(21, 26, 30)"],
        div[style*="background-color:#151a1e"],
        div[style*="background-color: rgb(128, 128, 128)"] {
            background: rgba(17, 24, 39, 0.6) !important;
            backdrop-filter: blur(12px) !important;
            border: 1px solid rgba(255, 255, 255, 0.08) !important;
            border-radius: 12px !important;
            box-shadow: none !important;
            color: var(--text-main) !important;
        }

        /* Ajuste do Relógio e do Nome do Consultor para tirar o fundo cinza claro */
        div[style*="14:42"], div[style*="14:"], div[style*="Consultor"] {
            background: transparent !important;
            border: none !important;
            color: var(--text-main) !important;
        }

        /* Botões Superiores */
        div[style*="background-color: rgb(244, 67, 54)"] { /* Botão Sair */
            background-color: #ef4444 !important;
            border-radius: 8px !important;
            font-weight: 600 !important;
            transition: all 0.2s !important;
        }
        div[style*="background-color: rgb(244, 67, 54)"]:hover {
            background-color: #dc2626 !important;
            box-shadow: 0 0 15px rgba(239, 68, 68, 0.4) !important;
        }
    `;

    // Injeta o CSS
    const styleSheet = document.createElement("style");
    styleSheet.type = "text/css";
    styleSheet.innerText = css;
    document.head.appendChild(styleSheet);

    // 3. Script inteligente que intercepta e reconstrói a estrutura de tabelas para "Cards"
    function modernizeStructure() {
        const rows = document.querySelectorAll('div[style*="background-color"]');

        rows.forEach(row => {
            const bg = row.style.backgroundColor;
            if (!bg) return;

            // Limpa classes anteriores para evitar duplicidade
            row.classList.remove('modern-row-urgente', 'modern-row-alerta', 'modern-row-purple', 'modern-row-default');

            // Descobre o nível de prioridade pela cor antiga
            if (bg.includes('255, 0, 0') || bg === 'red') {
                row.classList.add('modern-row-urgente');
            } else if (bg.includes('255, 87, 34') || bg.includes('255, 102, 0') || bg === 'orange') {
                row.classList.add('modern-row-alerta');
            } else if (bg.includes('156, 39, 176') || bg === 'purple' || bg.includes('120, 40, 140')) {
                row.classList.add('modern-row-purple');
            } else if (bg.includes('44, 62, 80') || bg.includes('42, 59, 76') || bg.includes('33, 47, 61') || bg.includes('21, 26, 30')) {
                // Linhas sem alerta ativo
                if (!row.innerText.includes("Consultor") && !row.innerText.includes("Hora")) {
                    row.classList.add('modern-row-default');
                }
            }
        });
    }

    // Executa e monitora mudanças na tela (atualizações em tempo real)
    modernizeStructure();
    const observer = new MutationObserver(modernizeStructure);
    observer.observe(document.body, { childList: true, subtree: true });

})();