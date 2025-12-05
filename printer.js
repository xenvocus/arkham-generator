// ==========================================
// 高级排版引擎 High-End Typesetting Engine
// ==========================================
// 负责将 HTML 内容流式布局到 A4 纸张的双栏网格中
// 并处理自动分页、跨栏截断和长卡片分割

class Typesetter {
    constructor() {
        // A4 纸张配置 (单位: mm)
        this.config = {
            pageWidth: 210,
            pageHeight: 297,
            margin: 25, // 进一步增大页边距 (原20mm->25mm)
            colGap: 10,
            // 计算属性 (25mm * 2 = 50mm)
            contentWidth: 210 - 50, // 160mm
            contentHeight: 297 - 50, // 247mm
            colWidth: (160 - 10) / 2 // 75mm
        };

        // 运行时状态
        this.pages = [];
        this.currentPage = null;
        this.currentColIndex = 0; // 0 或 1
        this.currentY = 0; // 当前栏已用高度 (px)

        // 像素转换率 (会在运行时计算)
        this.pxPerMm = 3.78; // 默认值 (96dpi)，实际会动态获取
    }

    // 主入口：开始排版
    async run() {
        // 1. 准备打印容器
        const printRoot = document.getElementById('print-root') || this.createPrintRoot();
        printRoot.innerHTML = ''; // 清空旧内容

        // 2. 计算当前环境的 DPI
        this.calibrateDPI(printRoot);

        // 3. 获取源内容并原子化
        const sourceAtoms = this.atomizeContent(document.getElementById('book-content'));

        // 4. 开始布局循环
        this.createNewPage(printRoot);

        for (let atom of sourceAtoms) {
            await this.placeAtom(atom, printRoot);
        }

        // 5. 渲染 PDF (后台运行)
        const btn = document.querySelector('button[onclick="exportToPDF()"]');
        if (btn) btn.innerHTML = '📄 生成 PDF...';

        setTimeout(async () => {
            await this.renderToPDF(this.pages);
            if (btn) {
                btn.innerHTML = '📄 导出 PDF (Export)';
                btn.disabled = false;
            }
            // 渲染完成后清理
            printRoot.innerHTML = '';
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
            if (node.classList.contains('book-header-section')) {
                const clone = node.cloneNode(true);
                clone.removeAttribute('style');
                clone.classList.add('print-header-span');
                atoms.push({ type: 'spanning', node: clone });
                return;
            }

            // 2. 章节容器 -> 穿透
            if (node.classList.contains('book-section')) {
                Array.from(node.children).forEach(child => traverse(child));
                return;
            }

            // 3. 也是容器 -> 穿透
            if (node.id === 'npc-container' || node.id === 'scene-container' || node.id === 'out-timeline') {
                Array.from(node.children).forEach(child => traverse(child));
                return;
            }
            if (node.tagName === 'UL') {
                Array.from(node.children).forEach(child => traverse(child));
                return;
            }

            // 4. 识别特定组件
            let type = 'block';
            if (node.tagName === 'H1' || node.classList.contains('book-title')) type = 'h1';
            else if (node.tagName === 'H2' || node.classList.contains('book-h1')) type = 'h1'; // 映射为 h1
            else if (node.classList.contains('npc-card')) type = 'npc-card';
            else if (node.classList.contains('scene-box')) type = 'scene-box';
            else if (node.classList.contains('book-p') || node.tagName === 'P') type = 'p';
            else if (node.tagName === 'LI') type = 'li';
            else if (node.classList.contains('book-meta')) type = 'meta';

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

    async placeAtom(atom, root) {
        // 跨栏元素
        if (atom.type === 'spanning') {
            const page = this.currentPage.el;
            if (this.currentY > 0 || this.currentColIndex > 0) {
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

        const headerOffset = this.currentPage.headerHeight || 0;
        const availableSpaceOnPage = this.maxColHeightPx - headerOffset;

        const currentCol = this.currentPage.cols[this.currentColIndex];
        currentCol.appendChild(atom.node);

        const height = atom.node.offsetHeight;
        const remainingY = availableSpaceOnPage - this.currentY;

        // 1. 放得下
        if (height <= remainingY) {
            this.currentY += height;
            const style = window.getComputedStyle(atom.node);
            this.currentY += parseFloat(style.marginBottom || 0);
            return;
        }

        // 2. 放不下
        currentCol.removeChild(atom.node);

        // 策略 A: 空间太小 (<40px) -> 换栏
        if (remainingY < 40) {
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        // 分割逻辑
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
        if (atom.type === 'h1' || atom.type === 'h2') {
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
            // [New] Timeline List Item Splitting
            await this.splitTimelineItem(atom, availableHeight, root);
        } else {
            if (atom.node.offsetHeight > this.maxColHeightPx) {
                console.warn(`Force placing: ${atom.type}`);
                const currentCol = this.currentPage.cols[this.currentColIndex];
                currentCol.appendChild(atom.node);
                this.currentY += atom.node.offsetHeight;
                return;
            }

            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
        }
    }

    // Timeline LI 分割逻辑 (New)
    async splitTimelineItem(atom, limitHeight, root) {
        const originalNode = atom.node;
        const currentCol = this.currentPage.cols[this.currentColIndex];

        const topPart = originalNode.cloneNode(true);
        currentCol.appendChild(topPart);

        // 尝试只保留 strong (时间) 和部分文本
        // Structure: <strong>Time</strong> Text...
        // 实际上 atomizeContent 只是 cloneNode，所以结构还在。

        const strongNode = topPart.querySelector('strong');
        // 如果没有 strong，就当普通文本分
        if (!strongNode) {
            currentCol.removeChild(topPart);
            await this.splitTextNode(atom, limitHeight, root);
            return;
        }

        // 基础高度测试：仅 strong 能放下吗？
        //为了测试，先把文本删掉？
        // childNodes: [strong, textNode]
        const textNode = Array.from(topPart.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0);

        if (!textNode) {
            // 只有 strong，放不下就换栏
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const fullText = textNode.textContent;
        let start = 0, end = fullText.length, bestSplit = 0;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            textNode.textContent = fullText.substring(0, mid) + '...';
            if (topPart.offsetHeight <= limitHeight) {
                bestSplit = mid;
                start = mid + 1;
            } else {
                end = mid - 1;
            }
        }

        if (bestSplit < 5) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        // Top Part Done
        textNode.textContent = fullText.substring(0, bestSplit);
        topPart.classList.add('print-fragment-start');
        this.currentY += topPart.offsetHeight;
        this.moveToNextColumn(root);

        // Bottom Part
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

        const infoNode = originalNode.querySelector('.npc-info') || originalNode.querySelector('.print-npc-info');
        if (!infoNode) {
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const topPart = originalNode.cloneNode(true);
        currentCol.appendChild(topPart);

        if (limitHeight < 60) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const topInfo = topPart.querySelector('.npc-info') || topPart.querySelector('.print-npc-info');
        const descNode = topInfo.querySelector('.npc-desc');

        if (!descNode) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const rawText = descNode.innerText;
        let start = 0, end = rawText.length, bestSplit = 0;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            descNode.innerText = rawText.substring(0, mid) + '...';
            if (topPart.offsetHeight <= limitHeight) {
                bestSplit = mid;
                start = mid + 1;
            } else {
                end = mid - 1;
            }
        }

        if (bestSplit < 10) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        descNode.innerText = rawText.substring(0, bestSplit);
        topPart.classList.add('print-fragment-start');
        this.currentY += topPart.offsetHeight;

        this.moveToNextColumn(root);

        const bottomPart = originalNode.cloneNode(true);
        bottomPart.classList.add('print-fragment-end');

        const bottomPortrait = bottomPart.querySelector('.npc-portrait') || bottomPart.querySelector('.print-npc-portrait');
        if (bottomPortrait) bottomPortrait.style.display = 'none';

        const bottomInfo = bottomPart.querySelector('.npc-info') || bottomPart.querySelector('.print-npc-info');
        const bottomDesc = bottomInfo.querySelector('.npc-desc');
        bottomDesc.innerText = rawText.substring(bestSplit);

        Array.from(bottomInfo.children).forEach(c => {
            if (c !== bottomDesc) c.style.display = 'none';
        });

        await this.placeAtom({ type: 'npc-card', node: bottomPart }, root);
    }

    async splitSceneBox(atom, limitHeight, root) {
        const originalNode = atom.node;
        const currentCol = this.currentPage.cols[this.currentColIndex];

        const topPart = originalNode.cloneNode(true);
        currentCol.appendChild(topPart);

        if (limitHeight < 40) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const descNode = topPart.querySelector('.scene-desc');
        if (!descNode) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        const rawText = descNode.innerText;
        let start = 0, end = rawText.length, bestSplit = 0;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            descNode.innerText = rawText.substring(0, mid) + '...';
            const eventNode = topPart.querySelector('.scene-event');
            if (eventNode) eventNode.style.display = 'none';

            if (topPart.offsetHeight <= limitHeight) {
                bestSplit = mid;
                start = mid + 1;
            } else {
                end = mid - 1;
            }
        }

        if (bestSplit < 5) {
            currentCol.removeChild(topPart);
            this.moveToNextColumn(root);
            await this.placeAtom(atom, root);
            return;
        }

        descNode.innerText = rawText.substring(0, bestSplit);
        const topEvent = topPart.querySelector('.scene-event');
        if (topEvent) topEvent.style.display = 'none';

        topPart.classList.add('print-fragment-start');
        this.currentY += topPart.offsetHeight;

        this.moveToNextColumn(root);

        const bottomPart = originalNode.cloneNode(true);
        bottomPart.classList.add('print-fragment-end');

        const bottomHeader = bottomPart.querySelector('.scene-header');
        if (bottomHeader) bottomHeader.style.display = 'none';

        const bottomDesc = bottomPart.querySelector('.scene-desc');
        bottomDesc.innerText = rawText.substring(bestSplit);

        await this.placeAtom({ type: 'scene-box', node: bottomPart }, root);
    }

    async splitTextNode(atom, limitHeight, root) {
        const fullText = atom.node.textContent;
        const tempNode = atom.node.cloneNode(true);
        tempNode.textContent = '';
        const currentCol = this.currentPage.cols[this.currentColIndex];
        currentCol.appendChild(tempNode);

        let start = 0, end = fullText.length, bestFitIndex = 0;

        while (start <= end) {
            const mid = Math.floor((start + end) / 2);
            tempNode.textContent = fullText.substring(0, mid) + '...';
            if (tempNode.offsetHeight <= limitHeight) {
                bestFitIndex = mid;
                start = mid + 1;
            } else {
                end = mid - 1;
            }
        }

        tempNode.textContent = fullText.substring(0, bestFitIndex);
        tempNode.classList.add('print-fragment-start');
        this.currentY += tempNode.offsetHeight;
        this.moveToNextColumn(root);

        const remainingAtom = { type: atom.type, node: atom.node.cloneNode(true) };
        remainingAtom.node.textContent = fullText.substring(bestFitIndex);
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
    if (btn) { btn.innerHTML = '⏳ 正在排版 / Calculating...'; btn.disabled = true; }
    try { const engine = new Typesetter(); await engine.run(); }
    catch (e) { console.error(e); alert('排版引擎故障: ' + e.message); if (btn) { btn.innerHTML = '📄 导出 PDF (Export)'; btn.disabled = false; } }
}
