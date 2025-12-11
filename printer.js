// ==========================================
// 高级排版引擎 High-End Typesetting Engine
// ==========================================
// 负责将 HTML 内容流式布局到 A4 纸张的双栏网格中
// 并处理自动分页、跨栏截断和长卡片分割

class Typesetter {
    constructor() {
        // [Strict Sync] 使用 DOCX 导出的精确参数 (Twips -> mm)
        // Width: 12000 twips = 211.67 mm (Not standard A4 210mm)
        // Margin: 900 twips = 15.875 mm
        // Gap: 600 twips = 10.58 mm
        // Height: 11.69 inch = 297 mm
        this.config = {
            pageWidth: 211.67,
            pageHeight: 297,
            margin: 15.875,
            colGap: 10.58,
            // 动态计算
            contentWidth: 211.67 - (15.875 * 2), // ~179.92mm
            contentHeight: 297 - (15.875 * 2), // ~265.25mm
            colWidth: (211.67 - (15.875 * 2) - 10.58) / 2 // ~84.67mm
        };

        // 运行时状态
        this.pages = [];
        this.currentPage = null;
        this.currentColIndex = 0; // 0 或 1
        this.currentY = 0; // 当前栏已用高度 (px)

        // 像素转换率 (会在运行时计算)
        this.pxPerMm = 3.78; // 默认值 (96dpi)，实际会动态获取

        // Callbacks
        this.onProgress = null;
    }

    // 主入口：开始排版
    async run(options = {}) {
        this.onProgress = options.onProgress;

        // 1. 准备打印容器
        const printRoot = document.getElementById('print-root') || this.createPrintRoot();
        printRoot.innerHTML = ''; // 清空旧内容

        // 2. 计算当前环境的 DPI
        this.calibrateDPI(printRoot);

        // 3. 获取源内容并原子化
        const sourceAtoms = this.atomizeContent(document.getElementById('book-content'));

        // 4. 开始布局循环
        this.createNewPage(printRoot);

        if (this.onProgress) this.onProgress('layouting');

        for (let atom of sourceAtoms) {
            await this.placeAtom(atom, printRoot);
        }

        // 5. 渲染 PDF (后台运行)
        if (this.onProgress) this.onProgress('rendering');

        setTimeout(async () => {
            await this.renderToPDF(this.pages);
            // 渲染完成后清理
            printRoot.innerHTML = '';
            if (options.onComplete) options.onComplete();
        }, 100);
    }

    createPrintRoot() {
        const div = document.createElement('div');
        div.id = 'print-root';
        document.body.appendChild(div);
        return div;
    }

    calibrateDPI(root) {
        const testDiv = document.createElement('div');
        testDiv.style.width = '100mm';
        testDiv.style.height = '1px';
        testDiv.style.position = 'absolute';
        testDiv.style.visibility = 'hidden';
        root.appendChild(testDiv);

        const pxWidth = testDiv.getBoundingClientRect().width;
        this.pxPerMm = pxWidth / 100;

        root.removeChild(testDiv);
        console.log(`[Typesetter] Calibration: 1mm = ${this.pxPerMm}px`);

        // 更新最大高度 (px) (留一点 buffer)
        this.maxColHeightPx = this.config.contentHeight * this.pxPerMm - 2;
    }

    // 将原始内容打散为"打印原子"
    atomizeContent(sourceNode) {
        if (!sourceNode) return [];
        const atoms = [];

        // 递归遍历辅助函数
        const traverse = (node) => {
            if (node.nodeType === Node.TEXT_NODE) {
                // 忽略纯文本节点
                return;
            }

            if (node.nodeType !== Node.ELEMENT_NODE) return;

            // 1. 头部跨栏区 -> type: spanning
            if (node.matches(SELECTORS.headerSection)) {
                const clone = node.cloneNode(true);
                clone.removeAttribute('style');
                clone.classList.add('print-header-span');
                atoms.push({ type: 'spanning', node: clone });
                return;
            }

            // 2. 章节容器 -> 穿透
            if (node.matches(SELECTORS.section)) {
                Array.from(node.children).forEach(child => traverse(child));
                return;
            }

            // 3. 也是容器 -> 穿透
            if (node.id === 'npc-container' || node.id === 'scene-container' || node.matches(SELECTORS.timeline.list)) {
                Array.from(node.children).forEach(child => traverse(child));
                return;
            }
            if (node.tagName === 'UL') {
                Array.from(node.children).forEach(child => traverse(child));
                return;
            }

            // 4. 识别特定组件
            let type = 'block';
            if (node.tagName === 'H1' || node.matches(SELECTORS.title)) type = 'h1';
            else if (node.tagName === 'H2' || node.matches(SELECTORS.h1)) type = 'h1'; // 映射为 h1
            else if (node.matches(SELECTORS.npc.container)) type = 'npc-card';
            else if (node.matches(SELECTORS.scene.container)) type = 'scene-box';
            else if (node.matches(SELECTORS.p) || node.tagName === 'P') type = 'p';
            else if (node.tagName === 'LI') type = 'li';
            else if (node.matches(SELECTORS.meta)) type = 'meta';

            // 普通 DIV 穿透
            if (type === 'block' && node.tagName === 'DIV' && !node.className.includes('print-atom')) {
                Array.from(node.children).forEach(child => traverse(child));
                return;
            }

            // 克隆节点
            const clone = node.cloneNode(true);
            clone.removeAttribute('style');
            clone.classList.add('print-atom');

            // 【关键修复】手动添加样式类，让 CSS 选择器能生效
            if (type === 'h1') clone.classList.add('print-h1');
            if (type === 'h2') clone.classList.add('print-h2');

            if (type === 'npc-card') clone.classList.add('print-npc-card');
            if (type === 'scene-box') clone.classList.add('print-scene-box');

            atoms.push({ type, node: clone });
        };

        Array.from(sourceNode.children).forEach(child => traverse(child));
        return atoms;
    }

    // 通用二分查找分割点
    findBinarySplitIndex(totalLen, checkFn) {
        let start = 0, end = totalLen, bestSplit = 0;
        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            if (checkFn(mid)) {
                bestSplit = mid;
                start = mid + 1;
            } else {
                end = mid - 1;
            }
        }
        return bestSplit;
    }

    createNewPage(root) {
        const page = document.createElement('div');
        page.className = 'print-page';

        const col1 = document.createElement('div');
        col1.className = 'print-column';
        col1.style.marginRight = this.config.colGap + 'mm';

        const col2 = document.createElement('div');
        col2.className = 'print-column';

        page.appendChild(col1);
        page.appendChild(col2);

        root.appendChild(page);

        this.pages.push({ el: page, cols: [col1, col2] });
        this.currentPage = this.pages[this.pages.length - 1];
        this.currentColIndex = 0;
        this.currentY = 0;
    }

    getRemainingHeight() {
        const col = this.currentPage.cols[this.currentColIndex];
        const page = this.currentPage.el;
        const pageRect = page.getBoundingClientRect();
        const pageStyle = window.getComputedStyle(page);
        const paddingBottom = parseFloat(pageStyle.paddingBottom || 0);
        // Allow 20px tolerance
        const limitBottom = pageRect.bottom - paddingBottom + 20;

        if (col.children.length === 0) {
            const colRect = col.getBoundingClientRect();
            // If col is empty, remaining is from col top (or header bottom) to limit
            // colRect.top might be pushed down by header
            return Math.max(0, limitBottom - colRect.top);
        }

        const lastChild = col.lastElementChild;
        const lastRect = lastChild.getBoundingClientRect();
        const lastStyle = window.getComputedStyle(lastChild);
        const marginBottom = parseFloat(lastStyle.marginBottom || 0);

        const usedBottom = lastRect.bottom + marginBottom;
        return Math.max(0, limitBottom - usedBottom);
    }

    async placeAtom(atom, root) {
        // 跨栏元素
        // 跨栏元素
        if (atom.type === 'spanning') {
            const page = this.currentPage.el;
            const hasContent = this.currentPage.cols.some(c => c.children.length > 0);

            if (hasContent) {
                this.createNewPage(root);
            }
            const col1 = this.currentPage.cols[0];
            this.currentPage.el.insertBefore(atom.node, col1);

            const spanHeight = atom.node.offsetHeight;

            // 计算外边距 (因为插入到 flex 容器中会挤占空间)
            const style = window.getComputedStyle(atom.node);
            const marginBottom = parseFloat(style.marginBottom || 0);

            // 【关键修复】headerSpan 不应占用 currentY (Column Y)，而是作为 Column Height Cap
            // this.currentY += spanHeight; // DELETE THIS
            this.currentY = 0; // 重置列 Y
            this.currentPage.headerHeight = spanHeight + marginBottom;
            return;
        }

        const currentCol = this.currentPage.cols[this.currentColIndex];
        currentCol.appendChild(atom.node);

        const atomRect = atom.node.getBoundingClientRect();
        const style = window.getComputedStyle(atom.node);
        const marginBottom = parseFloat(style.marginBottom || 0);

        // Limit is Page Bottom - Padding Bottom
        const page = this.currentPage.el;
        const pageRect = page.getBoundingClientRect();
        const pageStyle = window.getComputedStyle(page);
        const paddingBottom = parseFloat(pageStyle.paddingBottom || 0);
        // Allow 20px tolerance
        const limitBottom = pageRect.bottom - paddingBottom + 20;

        // Check fit (allow 1px small buffer on top of tolerance)
        if (atomRect.bottom + marginBottom <= limitBottom + 1) {
            // Fits
            return;
        }

        // Doesn't fit
        currentCol.removeChild(atom.node);

        const remainingY = this.getRemainingHeight();

        await this.splitAndPlace(atom, remainingY, root);
    }

    moveToNextColumn(root) {
        if (this.currentColIndex === 0) {
            this.currentColIndex = 1;
            this.currentY = 0;
        } else {
            this.createNewPage(root);
        }
    }

    async splitAndPlace(atom, availableHeight, root) {
        // H1/H2 标题: 如果高度够就放，不够就移到下栏 (但不留大空白)
        if (atom.type === 'h1' || atom.type === 'h2') {
            // 尝试直接放置 - 如果剩余空间足够放标题
            const currentCol = this.currentPage.cols[this.currentColIndex];
            currentCol.appendChild(atom.node);
            const height = atom.node.offsetHeight;
            if (height <= availableHeight) {
                // 能放下
                this.currentY += height;
                return;
            }
            // 放不下，移走
            currentCol.removeChild(atom.node);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        if (atom.type === 'p' || atom.type === 'meta') {
            await this.splitTextNode(atom, availableHeight, root);
        } else if (atom.type === 'npc-card') {
            await this.splitNpcCard(atom, availableHeight, root);
        } else if (atom.type === 'scene-box') {
            await this.splitSceneBox(atom, availableHeight, root);
        } else if (atom.type === 'li') {
            await this.splitTimelineItem(atom, availableHeight, root);
        } else {
            // 未知类型: 尝试放置，放不下再移
            const currentCol = this.currentPage.cols[this.currentColIndex];
            currentCol.appendChild(atom.node);
            const height = atom.node.offsetHeight;
            if (height <= availableHeight || height > this.maxColHeightPx) {
                this.currentY += height;
                return;
            }
            currentCol.removeChild(atom.node);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
        }
    }

    // 时间线分割逻辑
    async splitTimelineItem(atom, limitHeight, root) {
        const originalNode = atom.node;
        const currentCol = this.currentPage.cols[this.currentColIndex];

        const topPart = originalNode.cloneNode(true);
        currentCol.appendChild(topPart);

        const strongNode = topPart.querySelector('strong');
        if (!strongNode) {
            currentCol.removeChild(topPart);
            await this.splitTextNode(atom, limitHeight, root);
            return;
        }

        const textNode = Array.from(topPart.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);

        if (!textNode) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const fullText = textNode.textContent;
        textNode.textContent = '';
        if (topPart.offsetHeight > limitHeight) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const bestSplit = this.findBinarySplitIndex(fullText.length, (mid) => {
            if (mid === 0) textNode.textContent = '';
            else textNode.textContent = fullText.substring(0, mid);
            return topPart.offsetHeight <= limitHeight;
        });

        textNode.textContent = fullText.substring(0, bestSplit);
        topPart.classList.add('print-fragment-start');
        this.currentY += topPart.offsetHeight;
        this.moveToNextColumn(root);

        const bottomPart = originalNode.cloneNode(true);
        bottomPart.classList.add('print-fragment-end');
        bottomPart.style.marginTop = '0';
        bottomPart.style.listStyle = 'none'; // 去掉 bullet

        const bStrong = bottomPart.querySelector('strong');
        if (bStrong) bStrong.style.display = 'none'; // 隐藏时间

        const bText = Array.from(bottomPart.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);
        if (bText) bText.textContent = fullText.substring(bestSplit);

        await this.placeAtom({ type: 'li', node: bottomPart }, root);
    }

    async splitNpcCard(atom, limitHeight, root) {
        const originalNode = atom.node;
        const currentCol = this.currentPage.cols[this.currentColIndex];

        if (limitHeight < 1) {
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const topPart = originalNode.cloneNode(true);
        currentCol.appendChild(topPart);

        // 获取所有可分割的子元素
        const portrait = topPart.querySelector(SELECTORS.npc.portrait) || topPart.querySelector('.print-npc-portrait');
        const infoNode = topPart.querySelector(SELECTORS.npc.info) || topPart.querySelector('.print-npc-info');

        if (!infoNode) {
            // 没有 info 节点，整体移走
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        // info 内的子元素：name, role, stats, desc
        const infoChildren = Array.from(infoNode.children);
        const descNode = infoNode.querySelector(SELECTORS.npc.desc) || infoNode.querySelector('.npc-desc');

        const rawDescText = descNode ? descNode.innerText : '';

        // 隐藏所有元素，然后逐个恢复，找到能放下的最大内容

        // 首先检查如果什么都不显示能否放下（只有容器边框）
        if (portrait) portrait.style.display = 'none';
        infoChildren.forEach(c => c.style.display = 'none');

        if (topPart.offsetHeight > limitHeight) {
            // 连空容器都放不下
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        // 逐个恢复元素，找到分割点
        let splitLevel = 'none'; // 分割发生在哪一层
        let descSplitIndex = 0;  // 如果在描述内分割，分割点在哪里

        // 1. 尝试只放头像
        if (portrait) {
            portrait.style.display = '';
            if (topPart.offsetHeight > limitHeight) {
                // 连头像都放不下
                portrait.style.display = 'none';
                splitLevel = 'none';
            } else {
                splitLevel = 'portrait';
            }
        }

        // 2. 逐个恢复 info 子元素
        for (let i = 0; i < infoChildren.length; i++) {
            const child = infoChildren[i];
            child.style.display = '';

            if (child === descNode) {
                // 描述节点需要特殊处理：二分法分割文本
                descNode.innerText = '';
                if (topPart.offsetHeight > limitHeight) {
                    // 连空描述都放不下，恢复到上一个分割点
                    child.style.display = 'none';
                    break;
                }

                // 二分法找描述的分割点
                const bestSplit = this.findBinarySplitIndex(rawDescText.length, (mid) => {
                    if (mid === 0) descNode.innerText = '';
                    else descNode.innerText = rawDescText.substring(0, mid);
                    return topPart.offsetHeight <= limitHeight;
                });

                // 检查是否能放下完整描述
                if (bestSplit >= rawDescText.length) {
                    descNode.innerText = rawDescText;
                    if (topPart.offsetHeight <= limitHeight) {
                        // 整个卡片都能放下
                        this.currentY += topPart.offsetHeight;
                        return;
                    }
                }

                descSplitIndex = bestSplit;

                if (descSplitIndex === 0) {
                    descNode.innerText = '';
                } else {
                    descNode.innerText = rawDescText.substring(0, descSplitIndex).trim();
                }
                splitLevel = 'desc';
                break;
            } else {
                // 非描述节点
                if (topPart.offsetHeight > limitHeight) {
                    // 这个元素放不下，恢复到上一个分割点
                    child.style.display = 'none';
                    break;
                }
                // 记录分割点
                splitLevel = child.className || 'info-child-' + i;
            }
        }

        // 如果什么都放不下，移到下一栏
        if (splitLevel === 'none' && (!portrait || portrait.style.display === 'none')) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        // 应用分割
        topPart.classList.add('print-fragment-start');
        this.currentY += topPart.offsetHeight;
        this.moveToNextColumn(root);

        // 创建下半部分
        const bottomPart = originalNode.cloneNode(true);
        bottomPart.classList.add('print-fragment-end');

        const bottomPortrait = bottomPart.querySelector(SELECTORS.npc.portrait) || bottomPart.querySelector('.print-npc-portrait');
        const bottomInfo = bottomPart.querySelector(SELECTORS.npc.info) || bottomPart.querySelector('.print-npc-info');
        const bottomInfoChildren = Array.from(bottomInfo.children);
        const bottomDesc = bottomInfo.querySelector(SELECTORS.npc.desc) || bottomInfo.querySelector('.npc-desc');

        // 隐藏上半部分已显示的元素
        if (bottomPortrait && portrait && portrait.style.display !== 'none') {
            bottomPortrait.style.display = 'none';
        }
        for (let i = 0; i < bottomInfoChildren.length; i++) {
            const child = bottomInfoChildren[i];
            const topChild = infoChildren[i];

            if (child === bottomDesc || topChild === descNode) {
                if (splitLevel === 'desc' && descSplitIndex > 0) {
                    bottomDesc.innerText = rawDescText.substring(descSplitIndex).trim();
                }
                break;
            }

            if (topChild && topChild.style.display !== 'none') {
                // 这个元素在上半部分已显示，下半部分隐藏
                child.style.display = 'none';
            }
        }

        await this.placeAtom({ type: 'npc-card', node: bottomPart }, root);
    }

    async splitSceneBox(atom, limitHeight, root) {
        const originalNode = atom.node;
        const currentCol = this.currentPage.cols[this.currentColIndex];

        const topPart = originalNode.cloneNode(true);
        currentCol.appendChild(topPart);

        if (limitHeight < 1) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const descNode = topPart.querySelector(SELECTORS.scene.desc);
        if (!descNode) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const rawText = descNode.innerText;

        // 检查头部是否能放下（隐藏事件）
        descNode.innerText = '';
        const topEventCheck = topPart.querySelector(SELECTORS.scene.event);
        if (topEventCheck) topEventCheck.style.display = 'none';

        if (topPart.offsetHeight > limitHeight) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const bestSplit = this.findBinarySplitIndex(rawText.length, (mid) => {
            if (mid === 0) descNode.innerText = '';
            else descNode.innerText = rawText.substring(0, mid);
            const eventNode = topPart.querySelector(SELECTORS.scene.event);
            if (eventNode) eventNode.style.display = 'none';
            return topPart.offsetHeight <= limitHeight;
        });

        // 如果整个描述都能放下，检查事件是否也能放下
        if (bestSplit >= rawText.length) {
            descNode.innerText = rawText;
            const eventNode = topPart.querySelector(SELECTORS.scene.event);
            if (eventNode) eventNode.style.display = '';

            if (topPart.offsetHeight <= limitHeight) {
                this.currentY += topPart.offsetHeight;
                return;
            }
        }

        if (bestSplit === 0) descNode.innerText = '';
        else descNode.innerText = rawText.substring(0, bestSplit);

        const topEvent = topPart.querySelector(SELECTORS.scene.event);
        let eventKeptInTop = false;
        let eventSplitIndex = -1;
        let fullEventText = '';

        if (topEvent) {
            fullEventText = topEvent.innerText;

            if (bestSplit < rawText.length) {
                // 描述未完全放下，隐藏事件
                topEvent.style.display = 'none';
            } else {
                topEvent.style.display = '';
                if (topPart.offsetHeight > limitHeight) {
                    // 事件放不下，尝试分割事件文本
                    const eventSplit = this.findBinarySplitIndex(fullEventText.length, (mid) => {
                        if (mid === 0) topEvent.innerText = '';
                        else topEvent.innerText = fullEventText.substring(0, mid);
                        return topPart.offsetHeight <= limitHeight;
                    });

                    if (eventSplit > 0) {
                        topEvent.innerText = fullEventText.substring(0, eventSplit);
                        eventSplitIndex = eventSplit;
                    } else {
                        topEvent.style.display = 'none';
                    }
                } else {
                    eventKeptInTop = true;
                }
            }
        }

        topPart.classList.add('print-fragment-start');
        this.currentY += topPart.offsetHeight;

        this.moveToNextColumn(root);

        const bottomPart = originalNode.cloneNode(true);
        bottomPart.classList.add('print-fragment-end');

        const bottomHeader = bottomPart.querySelector(SELECTORS.scene.header);
        if (bottomHeader) bottomHeader.style.display = 'none';

        const bottomDesc = bottomPart.querySelector(SELECTORS.scene.desc);
        bottomDesc.innerText = rawText.substring(bestSplit);

        const bottomEvent = bottomPart.querySelector(SELECTORS.scene.event);
        if (eventKeptInTop) {
            if (bottomEvent) bottomEvent.style.display = 'none';
        } else if (eventSplitIndex > 0) {
            if (bottomEvent) {
                bottomEvent.innerText = fullEventText.substring(eventSplitIndex);
            }
        }

        await this.placeAtom({ type: 'scene-box', node: bottomPart }, root);
    }

    async splitTextNode(atom, limitHeight, root) {
        const fullText = atom.node.innerText;
        const tempNode = atom.node.cloneNode(true);
        const currentCol = this.currentPage.cols[this.currentColIndex];
        currentCol.appendChild(tempNode);

        const bestFitIndex = this.findBinarySplitIndex(fullText.length, (mid) => {
            tempNode.innerText = fullText.substring(0, mid);
            return tempNode.offsetHeight <= limitHeight;
        });

        tempNode.innerText = fullText.substring(0, bestFitIndex);
        tempNode.classList.add('print-fragment-start');
        this.currentY += tempNode.offsetHeight;

        this.moveToNextColumn(root);

        const remainingAtom = { type: atom.type, node: atom.node.cloneNode(true) };
        remainingAtom.node.innerText = fullText.substring(bestFitIndex);
        remainingAtom.node.classList.add('print-fragment-end');
        await this.placeAtom(remainingAtom, root);
    }

    async renderToPDF(pages) {
        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF('p', 'mm', 'a4');

        for (let i = 0; i < pages.length; i++) {
            if (i > 0) pdf.addPage();
            const pageEl = pages[i].el;
            const canvas = await html2canvas(pageEl, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/jpeg', 0.95);
            pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
        }

        const titleCn = document.getElementById('val-final-branch')?.getAttribute('data-title-cn') || 'ArkhamModule';
        pdf.save(`${titleCn}_Print.pdf`);
    }
}

async function exportToPDF() {
    const btn = document.querySelector('button[onclick="exportToPDF()"]');
    const originalText = btn ? btn.innerHTML : '📄 导出 PDF';

    if (btn) {
        btn.innerHTML = '⏳ 正在排版 / Calculating...';
        btn.disabled = true;
    }

    try {
        const engine = new Typesetter();
        await engine.run({
            onProgress: (phase) => {
                if (btn) {
                    if (phase === 'rendering') btn.innerHTML = '📄 生成 PDF...';
                }
            },
            onComplete: () => {
                if (btn) {
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                }
            }
        });
    }
    catch (e) {
        console.error(e);
        alert('排版引擎故障: ' + e.message);
        if (btn) {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }
}
