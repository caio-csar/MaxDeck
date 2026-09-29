// ==UserScript==
// @name         Painel Maxdata - Boneco Pendentes
// @namespace    http://tampermonkey.net/
// @version      5.7
// @downloadURL https://caio-csar.github.io/MaxDeck/scripts/Painel%20Maxdata%20-%20Boneco%20Pendentes.user.js
// @updateURL https://caio-csar.github.io/MaxDeck/scripts/Painel%20Maxdata%20-%20Boneco%20Pendentes.user.js
// @description  Boneco proporcional aos atendimentos pendentes, recortando margens transparentes automaticamente
// @match        https://painel.maxdata.com.br/*
// @run-at       document-end
// @grant        GM_getResourceURL
//
// @resource     BONECO_1  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/1.png
// @resource     BONECO_2  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/2.png
// @resource     BONECO_3  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/3.png
// @resource     BONECO_4  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/4.png
// @resource     BONECO_5  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/5.png
// @resource     BONECO_6  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/6.png
// @resource     BONECO_7  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/7.png
// @resource     BONECO_8  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/8.png
// @resource     BONECO_9  file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/9.png
// @resource     BONECO_10 file:///C:/Users/migra/Desktop/backup%20max14/Documents/tamperpainel/sem_fundo/10.png
//
// ==/UserScript==

(function () {
    'use strict';

    /*
     * =========================================================
     * CONFIGURAÇÕES
     * =========================================================
     */

    const PANEL_SELECTOR = '#pending_so';

    const EMPTY_TEXT =
        'Nenhum Atendimento Pendente';

    /*
     * 0 = encostado exatamente na tabela
     * positivo = desce
     * negativo = sobe
     */
    const TOP_OFFSET = 0;

    /*
     * 0 = encostado exatamente no fundo
     */
    const BOTTOM_GAP = 0;

    /*
     * Ajuste horizontal
     */
    const X_OFFSET = 0;

    /*
     * Transparência considerada "vazia".
     *
     * Quanto maior, mais agressivo o recorte.
     * 8 costuma ser ideal.
     */
    const ALPHA_THRESHOLD = 8;

    /*
     * Animação inicial
     */
    const INTRO_ENABLED = true;

    const INTRO_FRAME_MS = 45;

    /*
     * false:
     * 0 pendentes = 1.png
     */
    const HIDE_WHEN_ZERO = false;

    /*
     * =========================================================
     * RESOURCES
     * =========================================================
     */

    const RAW_IMAGES = [
        GM_getResourceURL('BONECO_1'),
        GM_getResourceURL('BONECO_2'),
        GM_getResourceURL('BONECO_3'),
        GM_getResourceURL('BONECO_4'),
        GM_getResourceURL('BONECO_5'),
        GM_getResourceURL('BONECO_6'),
        GM_getResourceURL('BONECO_7'),
        GM_getResourceURL('BONECO_8'),
        GM_getResourceURL('BONECO_9'),
        GM_getResourceURL('BONECO_10')
    ];

    /*
     * Aqui ficarão as imagens já
     * recortadas.
     */

    const IMAGES = new Array(10);

    /*
     * =========================================================
     * ESTADO
     * =========================================================
     */

    let box = null;

    let img = null;

    let observer = null;

    let currentPanel = null;

    let raf = 0;

    let currentIndex = -1;

    let targetIndex = 0;

    let introDone = false;

    let introRunning = false;

    let introTimer = null;

    /*
     * =========================================================
     * REMOVE TRANSPARÊNCIA EXTERNA DA PNG
     * =========================================================
     */

    function trimTransparentImage(url) {

        return new Promise((resolve) => {

            const source =
                new Image();

            source.onload = () => {

                try {

                    const width =
                        source.naturalWidth;

                    const height =
                        source.naturalHeight;

                    /*
                     * Canvas original
                     */

                    const canvas =
                        document.createElement(
                            'canvas'
                        );

                    canvas.width =
                        width;

                    canvas.height =
                        height;

                    const ctx =
                        canvas.getContext(
                            '2d',
                            {
                                willReadFrequently:
                                    true
                            }
                        );

                    ctx.drawImage(
                        source,
                        0,
                        0
                    );

                    const pixels =
                        ctx.getImageData(
                            0,
                            0,
                            width,
                            height
                        );

                    const data =
                        pixels.data;

                    /*
                     * Limites encontrados
                     */

                    let minX =
                        width;

                    let minY =
                        height;

                    let maxX =
                        -1;

                    let maxY =
                        -1;

                    /*
                     * Procura pixels
                     * realmente visíveis.
                     */

                    for (
                        let y = 0;
                        y < height;
                        y++
                    ) {

                        for (
                            let x = 0;
                            x < width;
                            x++
                        ) {

                            const index =
                                (
                                    y *
                                    width +
                                    x
                                ) * 4;

                            const alpha =
                                data[
                                    index + 3
                                ];

                            if (
                                alpha >
                                ALPHA_THRESHOLD
                            ) {

                                if (
                                    x < minX
                                ) {

                                    minX =
                                        x;
                                }

                                if (
                                    y < minY
                                ) {

                                    minY =
                                        y;
                                }

                                if (
                                    x > maxX
                                ) {

                                    maxX =
                                        x;
                                }

                                if (
                                    y > maxY
                                ) {

                                    maxY =
                                        y;
                                }
                            }
                        }
                    }

                    /*
                     * Imagem totalmente
                     * transparente?
                     */

                    if (
                        maxX < minX ||
                        maxY < minY
                    ) {

                        resolve(
                            url
                        );

                        return;
                    }

                    /*
                     * Área útil
                     */

                    const cropWidth =
                        maxX -
                        minX +
                        1;

                    const cropHeight =
                        maxY -
                        minY +
                        1;

                    /*
                     * Canvas final
                     */

                    const cropped =
                        document.createElement(
                            'canvas'
                        );

                    cropped.width =
                        cropWidth;

                    cropped.height =
                        cropHeight;

                    const croppedCtx =
                        cropped.getContext(
                            '2d'
                        );

                    croppedCtx.drawImage(
                        canvas,

                        minX,
                        minY,

                        cropWidth,
                        cropHeight,

                        0,
                        0,

                        cropWidth,
                        cropHeight
                    );

                    /*
                     * Resultado vira
                     * uma nova PNG.
                     */

                    resolve(
                        cropped.toDataURL(
                            'image/png'
                        )
                    );

                } catch (error) {

                    console.error(
                        '[BONECO MAXDATA] Erro recortando PNG:',
                        error
                    );

                    /*
                     * Se der qualquer erro,
                     * usa a original.
                     */

                    resolve(
                        url
                    );
                }
            };

            source.onerror = () => {

                console.error(
                    '[BONECO MAXDATA] Falha lendo imagem:',
                    url
                );

                resolve(
                    url
                );
            };

            source.src =
                url;
        });
    }

    /*
     * =========================================================
     * PREPARA TODAS AS IMAGENS
     * =========================================================
     */

    async function prepareImages() {

        console.log(
            '[BONECO MAXDATA] Recortando transparências...'
        );

        for (
            let i = 0;
            i < RAW_IMAGES.length;
            i++
        ) {

            IMAGES[i] =
                await trimTransparentImage(
                    RAW_IMAGES[i]
                );
        }

        console.log(
            '[BONECO MAXDATA] Imagens preparadas.'
        );
    }

    /*
     * =========================================================
     * CSS
     * =========================================================
     */

    function injectCSS() {

        if (
            document.getElementById(
                'maxdata-boneco-estavel-css'
            )
        ) {

            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            'maxdata-boneco-estavel-css';

        style.textContent = `

            #maxdata-boneco-estavel-box {

                /*
                 * FIXED:
                 * acompanha viewport.
                 */

                position: fixed !important;

                /*
                 * Fica por cima do fundo,
                 * mas abaixo de elementos
                 * absurdamente altos.
                 */

                z-index: 999999 !important;

                pointer-events:
                    none !important;

                user-select:
                    none !important;

                display:
                    none;

                overflow:
                    visible !important;

                background:
                    transparent !important;

                border:
                    0 !important;

                padding:
                    0 !important;

                margin:
                    0 !important;

                /*
                 * O centro horizontal
                 * funciona como âncora.
                 */

                width:
                    0 !important;
            }

            #maxdata-boneco-estavel-img {

                position:
                    absolute !important;

                /*
                 * Centro horizontal
                 */

                left:
                    50% !important;

                transform:
                    translateX(-50%) !important;

                /*
                 * Ocupa EXATAMENTE toda
                 * altura entre tabela
                 * e fundo da tela.
                 */

                top:
                    0 !important;

                bottom:
                    0 !important;

                height:
                    100% !important;

                width:
                    auto !important;

                max-width:
                    none !important;

                max-height:
                    none !important;

                /*
                 * Mantém proporção.
                 */

                object-fit:
                    contain !important;

                object-position:
                    center center !important;

                display:
                    block !important;

                background:
                    transparent !important;

                border:
                    0 !important;

                padding:
                    0 !important;

                margin:
                    0 !important;

                pointer-events:
                    none !important;

                user-select:
                    none !important;

                -webkit-user-drag:
                    none !important;
            }

        `;

        document.head.appendChild(
            style
        );
    }

    /*
     * =========================================================
     * ELEMENTOS
     * =========================================================
     */

    function ensureElements() {

        if (!document.body) {

            return false;
        }

        if (
            !box ||
            !box.isConnected
        ) {

            box =
                document.createElement(
                    'div'
                );

            box.id =
                'maxdata-boneco-estavel-box';

            document.body.appendChild(
                box
            );
        }

        if (
            !img ||
            !img.isConnected
        ) {

            img =
                document.createElement(
                    'img'
                );

            img.id =
                'maxdata-boneco-estavel-img';

            img.alt =
                '';

            img.draggable =
                false;

            img.onload = () => {

                img.style.visibility =
                    'visible';

                if (box) {

                    box.style.display =
                        'block';
                }
            };

            img.onerror = () => {

                console.error(
                    '[BONECO MAXDATA] Falha exibindo imagem.'
                );

                img.style.visibility =
                    'hidden';
            };

            box.appendChild(
                img
            );
        }

        return true;
    }

    /*
     * =========================================================
     * PAINEL
     * =========================================================
     */

    function getPanel() {

        return document.querySelector(
            PANEL_SELECTOR
        );
    }

    function getTable(panel) {

        return panel
            ? panel.querySelector(
                'table'
            )
            : null;
    }

    /*
     * =========================================================
     * CONTAGEM
     * =========================================================
     */

    function countPending(panel) {

        if (!panel) {

            return 0;
        }

        const text =
            (panel.innerText || '')
                .replace(
                    /\s+/g,
                    ' '
                )
                .trim();

        if (
            !text ||
            text.includes(
                EMPTY_TEXT
            )
        ) {

            return 0;
        }

        const rows =
            Array.from(
                panel.querySelectorAll(
                    'tr'
                )
            );

        return rows.filter(
            row => {

                if (
                    row.classList.contains(
                        'table-header'
                    )
                ) {

                    return false;
                }

                const rowText =
                    (row.innerText || '')
                        .replace(
                            /\s+/g,
                            ' '
                        )
                        .trim();

                if (!rowText) {

                    return false;
                }

                if (
                    rowText.includes(
                        EMPTY_TEXT
                    )
                ) {

                    return false;
                }

                if (
                    rowText.includes(
                        'Ordem'
                    ) &&
                    rowText.includes(
                        'Tempo'
                    )
                ) {

                    return false;
                }

                const cells =
                    row.querySelectorAll(
                        'td'
                    );

                if (!cells.length) {

                    return false;
                }

                if (
                    cells.length === 1 &&
                    cells[0]
                        .hasAttribute(
                            'colspan'
                        )
                ) {

                    return false;
                }

                return true;
            }
        ).length;
    }

    /*
     * =========================================================
     * CONTAGEM → PNG
     * =========================================================
     */

    function indexByCount(
        count
    ) {

        /*
         * 0 = 1.png
         * 1 = 2.png
         * ...
         * 9+ = 10.png
         */

        return Math.min(
            Math.max(
                count,
                0
            ),
            9
        );
    }

    /*
     * =========================================================
     * IMAGEM
     * =========================================================
     */

    function showImage(
        index
    ) {

        if (
            !img ||
            !box
        ) {

            return;
        }

        if (
            index < 0 ||
            index >=
                IMAGES.length
        ) {

            return;
        }

        if (
            currentIndex ===
                index &&
            img.src
        ) {

            box.style.display =
                'block';

            return;
        }

        currentIndex =
            index;

        img.style.visibility =
            'hidden';

        img.src =
            IMAGES[index];

        box.style.display =
            'block';
    }

    /*
     * =========================================================
     * POSIÇÃO
     * =========================================================
     */

    function positionBoneco(
        panel,
        table
    ) {

        const panelRect =
            panel.getBoundingClientRect();

        const tableRect =
            table.getBoundingClientRect();

        /*
         * TOPO:
         * exatamente depois do
         * último elemento da tabela.
         */

        const top =
            Math.round(
                tableRect.bottom +
                TOP_OFFSET
            );

        /*
         * Centro da coluna
         */

        const centerX =
            Math.round(
                panelRect.left +
                panelRect.width /
                    2 +
                X_OFFSET
            );

        /*
         * Em vez de calcular
         * height manualmente:
         *
         * top + bottom.
         *
         * Isso garante que a caixa
         * SEMPRE encoste no rodapé.
         */

        box.style.left =
            `${centerX}px`;

        box.style.top =
            `${top}px`;

        box.style.bottom =
            `${BOTTOM_GAP}px`;

        box.style.height =
            'auto';
    }

    /*
     * =========================================================
     * INTRO
     * =========================================================
     */

    function stopIntro() {

        if (introTimer) {

            clearTimeout(
                introTimer
            );

            introTimer =
                null;
        }

        introRunning =
            false;
    }

    function runIntro(
        finalIndex
    ) {

        if (!INTRO_ENABLED) {

            introDone =
                true;

            showImage(
                finalIndex
            );

            return;
        }

        if (
            introDone ||
            introRunning
        ) {

            return;
        }

        introRunning =
            true;

        let frame =
            9;

        function nextFrame() {

            const panel =
                getPanel();

            const table =
                getTable(
                    panel
                );

            if (
                !panel ||
                !table
            ) {

                stopIntro();

                return;
            }

            positionBoneco(
                panel,
                table
            );

            showImage(
                frame
            );

            if (
                frame <=
                finalIndex
            ) {

                introDone =
                    true;

                introRunning =
                    false;

                showImage(
                    finalIndex
                );

                return;
            }

            frame--;

            introTimer =
                setTimeout(
                    nextFrame,
                    INTRO_FRAME_MS
                );
        }

        nextFrame();
    }

    /*
     * =========================================================
     * UPDATE
     * =========================================================
     */

    function update() {

        if (
            !ensureElements()
        ) {

            return;
        }

        const panel =
            getPanel();

        const table =
            getTable(
                panel
            );

        if (
            !panel ||
            !table
        ) {

            box.style.display =
                'none';

            return;
        }

        const count =
            countPending(
                panel
            );

        if (
            HIDE_WHEN_ZERO &&
            count === 0
        ) {

            box.style.display =
                'none';

            return;
        }

        targetIndex =
            indexByCount(
                count
            );

        /*
         * Sempre recalcula usando
         * o fim atual da tabela.
         *
         * Se entrar atendimento,
         * tabela aumenta e o boneco
         * desce automaticamente.
         */

        positionBoneco(
            panel,
            table
        );

        if (
            !introDone &&
            !introRunning
        ) {

            runIntro(
                targetIndex
            );

            return;
        }

        if (
            introRunning
        ) {

            return;
        }

        showImage(
            targetIndex
        );
    }

    /*
     * =========================================================
     * UPDATE CONTROLADO
     * =========================================================
     */

    function scheduleUpdate() {

        cancelAnimationFrame(
            raf
        );

        raf =
            requestAnimationFrame(
                update
            );
    }

    /*
     * =========================================================
     * OBSERVER
     * =========================================================
     */

    function bindPanelObserver() {

        const panel =
            getPanel();

        if (!panel) {

            return false;
        }

        if (
            panel ===
                currentPanel &&
            observer
        ) {

            return true;
        }

        currentPanel =
            panel;

        if (observer) {

            observer.disconnect();

            observer =
                null;
        }

        observer =
            new MutationObserver(
                scheduleUpdate
            );

        observer.observe(
            panel,
            {
                childList:
                    true,

                subtree:
                    true,

                characterData:
                    true,

                /*
                 * Caso a página altere
                 * classes/estilo.
                 */

                attributes:
                    true
            }
        );

        return true;
    }

    /*
     * =========================================================
     * AGUARDA PAINEL
     * =========================================================
     */

    function waitForPanel() {

        if (
            bindPanelObserver()
        ) {

            scheduleUpdate();

            return;
        }

        const bodyObserver =
            new MutationObserver(
                () => {

                    if (
                        bindPanelObserver()
                    ) {

                        bodyObserver
                            .disconnect();

                        scheduleUpdate();
                    }
                }
            );

        bodyObserver.observe(
            document.body,
            {
                childList:
                    true,

                subtree:
                    true
            }
        );
    }

    /*
     * =========================================================
     * WATCHER
     * =========================================================
     */

    function startRebindWatcher() {

        setInterval(
            () => {

                const panel =
                    getPanel();

                if (
                    !panel ||
                    panel !==
                        currentPanel ||
                    !currentPanel
                        ?.isConnected
                ) {

                    bindPanelObserver();
                }

                /*
                 * Mesmo sem alteração no DOM,
                 * garante alinhamento.
                 */

                scheduleUpdate();

            },
            1000
        );
    }

    /*
     * =========================================================
     * START
     * =========================================================
     */

    async function start() {

        injectCSS();

        ensureElements();

        /*
         * Primeiro remove as bordas
         * transparentes das 10 PNGs.
         */

        await prepareImages();

        /*
         * Depois começa o painel.
         */

        waitForPanel();

        startRebindWatcher();

        window.addEventListener(
            'resize',
            scheduleUpdate,
            {
                passive:
                    true
            }
        );

        window.addEventListener(
            'load',
            scheduleUpdate,
            {
                passive:
                    true
            }
        );

        scheduleUpdate();
    }

    start();

})();