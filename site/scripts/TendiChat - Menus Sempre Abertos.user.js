// ==UserScript==
// @name         TendiChat - Menus Sempre Abertos
// @namespace    maxdata.caio
// @version      1.0.0
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Menus%20Sempre%20Abertos.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/TendiChat%20-%20Menus%20Sempre%20Abertos.user.js
// @description  Mantém abertos os dois menus retráteis de três pontos do TendiChat
// @match        https://app.tendichat.com.br/app/chatz*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(() => {
  'use strict';

  const NOME_CONTROLE = '__menusSempreAbertos';

  // Encerra uma instância anterior do script.
  window[NOME_CONTROLE]?.parar?.();

  const DEBUG = false;
  const ATRASO_MUTACAO = 120;
  const INTERVALO_SEGURANCA = 1200;
  const TEMPO_ENTRE_CLIQUES = 800;

  const PATH_TRES_PONTOS =
    'M144 128a16 16 0 1 1-16-16';

  /*
   * Ícones existentes apenas quando o menu superior
   * está expandido.
   */
  const SENTINELAS_SUPERIOR = [
    'm16 8l6-6',
    'M16 21v-2a4 4',
    'M12 15V3',
    'M13 11a3 3',
    'm15 12l5-4',
    'M18 10h2v2'
  ];

  /*
   * Ícones existentes apenas quando o menu da
   * mensagem está expandido.
   */
  const SENTINELAS_MENSAGEM = [
    'M19.05 4.91',
    'M22 17a2 2'
  ];

  const ultimoClique = {
    superior: 0,
    mensagem: 0
  };

  let timerMutacao = null;
  let intervalo = null;
  let observador = null;
  let ativo = true;

  function log(...dados) {
    if (DEBUG) {
      console.log('[Menus Sempre Abertos]', ...dados);
    }
  }

  function estaVisivel(elemento) {
    if (!(elemento instanceof Element)) {
      return false;
    }

    const estilo = getComputedStyle(elemento);
    const rect = elemento.getBoundingClientRect();

    return (
      elemento.isConnected &&
      !elemento.hidden &&
      estilo.display !== 'none' &&
      estilo.visibility !== 'hidden' &&
      Number.parseFloat(estilo.opacity || '1') > 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  function ehBotaoTresPontos(svg) {
    if (!(svg instanceof SVGElement)) {
      return false;
    }

    const caminho = svg
      .querySelector('path')
      ?.getAttribute('d')
      ?.trim();

    return caminho?.startsWith(PATH_TRES_PONTOS) === true;
  }

  function possuiSentinela(container, sentinelas) {
    const caminhos = [
      ...container.querySelectorAll('svg path[d]')
    ].map(path => path.getAttribute('d')?.trim() || '');

    return sentinelas.some(sentinela =>
      caminhos.some(caminho => caminho.startsWith(sentinela))
    );
  }

  function identificarMenu(svg) {
    const article = svg.closest('article');

    if (!article) {
      return null;
    }

    /*
     * Menu superior do atendimento.
     */
    if (
      article.classList.contains('sticky') ||
      article.classList.contains('top-0')
    ) {
      return {
        tipo: 'superior',
        container: article,
        sentinelas: SENTINELAS_SUPERIOR
      };
    }

    /*
     * Menu localizado ao lado da caixa de mensagem.
     */
    if (
      article.classList.contains('w-full') &&
      article.querySelector(
        'textarea[placeholder="Mensagem..."]'
      )
    ) {
      return {
        tipo: 'mensagem',
        container: article,
        sentinelas: SENTINELAS_MENSAGEM
      };
    }

    return null;
  }

  function clicar(svg, tipo) {
    const agora = Date.now();

    if (
      agora - ultimoClique[tipo] <
      TEMPO_ENTRE_CLIQUES
    ) {
      return;
    }

    ultimoClique[tipo] = agora;

    log(`Abrindo menu ${tipo}.`, svg);

    svg.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        view: window
      })
    );
  }

  function manterMenusAbertos() {
    if (!ativo || !document.body) {
      return;
    }

    const tiposProcessados = new Set();

    const botoes = [
      ...document.querySelectorAll('svg.iconify--ph')
    ].filter(svg =>
      ehBotaoTresPontos(svg) && estaVisivel(svg)
    );

    for (const svg of botoes) {
      const menu = identificarMenu(svg);

      if (!menu) {
        continue;
      }

      /*
       * Evita processar duas representações visíveis
       * do mesmo menu na mesma execução.
       */
      if (tiposProcessados.has(menu.tipo)) {
        continue;
      }

      tiposProcessados.add(menu.tipo);

      const estaAberto = possuiSentinela(
        menu.container,
        menu.sentinelas
      );

      if (!estaAberto) {
        clicar(svg, menu.tipo);
      } else {
        log(`Menu ${menu.tipo} já está aberto.`);
      }
    }
  }

  function agendarVerificacao() {
    clearTimeout(timerMutacao);

    timerMutacao = setTimeout(
      manterMenusAbertos,
      ATRASO_MUTACAO
    );
  }

  observador = new MutationObserver(agendarVerificacao);

  observador.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'class',
      'style',
      'hidden'
    ]
  });

  /*
   * Verificação adicional para mudanças de rota,
   * atendimento, zoom ou renderizações não capturadas.
   */
  intervalo = setInterval(
    manterMenusAbertos,
    INTERVALO_SEGURANCA
  );

  function parar() {
    ativo = false;

    observador?.disconnect();
    clearInterval(intervalo);
    clearTimeout(timerMutacao);

    console.log(
      '[Menus Sempre Abertos] Script encerrado.'
    );
  }

  window[NOME_CONTROLE] = {
    executar: manterMenusAbertos,
    parar
  };

  manterMenusAbertos();

  console.log(
    '[Menus Sempre Abertos] Monitoramento iniciado.'
  );
})();