// ==========================================
// 导出引擎 Export Engine (Restored & Enhanced)
// ==========================================

// 辅助：获取 CSS 变量值
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function getHexColor(varName) {
    let color = getCssVar(varName) || '#000000';
    return color;
}

function escapeTex(str) {
    if (!str) return '';
    return str.replace(/([&%$#_{}])/g, '\\$1').replace(/\n/g, ' ').trim();
}

function downloadFile(blob, filename) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// --- Word (.doc) 导出 (修复版: 动态样式 + 严格分栏) ---
async function exportToWord() {
    try {
        const contentNode = document.getElementById('book-content');
        if (!contentNode) throw new Error("Cannot find book content");

        // 1. 获取当前的高级配色 (Computed Styles)
        // 注意：getComputedStyle(contentNode) 可能只得到 transparent，需要兜底
        const computedStyle = getComputedStyle(contentNode);
        const bgColor = computedStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ? '#ffffff' : computedStyle.backgroundColor;
        const textColor = getComputedStyle(document.body).getPropertyValue('--text-primary').trim() || '#000000';
        const accentColor = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#8a0303';
        const panelColor = getComputedStyle(document.body).getPropertyValue('--bg-panel').trim() || '#f9f9f9';


        const clone = contentNode.cloneNode(true);
        clone.querySelectorAll('.no-print').forEach(el => el.remove());

        // CSS: 针对 Word 的特殊处理 (注入动态颜色)
        // Word 对 CSS 变量支持不好，必须用值
        const cssRules = `
            body { 
                font-family: 'Times New Roman', SimSun, serif; 
                background-color: ${panelColor}; /* 强制使用面板背景色 (Paper Color) */
                color: ${textColor};
            }
            
            /* Section 1: Title (必须强制单栏) */
            @page Section1 {
                size: 21cm 29.7cm;
                margin: 2cm;
                mso-page-orientation: portrait;
                mso-column-count: 1; /* 强行单栏 */
            }
            div.Section1 { page: Section1; }
            
            /* Section 2: Content (双栏) */
            @page Section2 {
                size: 21cm 29.7cm;
                margin: 2cm;
                mso-page-orientation: portrait;
                mso-columns: 2 even 1cm; /* Word 关键: 2栏 */
            }
            div.Section2 { page: Section2; }
            
            /* Elements - 使用计算出的颜色 */
            .book-title { 
                font-size: 24pt; 
                font-weight: bold; 
                color: ${textColor}; 
                text-align: center; 
                border-bottom: 2px solid ${textColor}; 
                padding-bottom: 10pt; 
            }
            .book-h1 { 
                font-size: 16pt; 
                font-weight: bold; 
                color: ${accentColor}; 
                border-bottom: 2px solid ${accentColor}; 
                margin-top: 15pt; 
                margin-bottom: 10pt; 
                break-after: avoid;
            }
            h2 { 
                font-size: 14pt; 
                font-weight: bold; 
                color: ${textColor}; 
                border-bottom: 1px solid #ccc; 
                margin-top: 12pt; 
                break-after: avoid;
            }
            p { 
                font-size: 10.5pt; 
                line-height: 1.5; 
                margin-bottom: 6pt; 
                text-align: justify; 
                text-indent: 2em; 
            }
            
            /* Box Styling */
            .npc-card {
                border: 1pt solid #ccc;
                background: ${panelColor} !important; /* 强制使用面板背景色 */
                padding: 8pt;
                margin-bottom: 10pt;
                mso-element: frame; 
            }
            .npc-name { 
                color: ${accentColor}; 
                font-weight: bold; 
                border-bottom: 1pt solid #eee; 
                margin-bottom: 4pt; 
            }
            
            .scene-box {
                border: 1pt solid ${textColor};
                background: ${panelColor} !important;
                padding: 8pt;
                margin-bottom: 10pt;
            }
        `;

        const htmlContent = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
                <meta charset="utf-8">
                <title>Export</title>
                <style>${cssRules}</style>
            </head>
            <body>
                <!-- Section 1: Title Only -->
                <div class="Section1" style="mso-column-count: 1; width: 100%;">
                    ${clone.querySelector('.book-header-section')?.outerHTML || '<h1 class="book-title">Arkham Module</h1>'}
                </div>
                
                <!-- Word Section Break -->
                <br clear=all style='mso-special-character:line-break;page-break-before:always'>
                
                <!-- Section 2: Main Content -->
                <div class="Section2">
                    ${Array.from(clone.children).filter(el => !el.classList.contains('book-header-section')).map(el => el.outerHTML).join('')}
                </div>
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
        const titleCn = document.getElementById('val-final-branch')?.getAttribute('data-title-cn') || 'ArkhamModule';
        downloadFile(blob, `${titleCn}.doc`);

    } catch (e) {
        console.error(e);
        alert('Word Export Failed: ' + e.message);
    }
}

// --- LaTeX (.tex) 导出 (增强版: 样式注入) ---
async function exportToTex() {
    try {
        const contentNode = document.getElementById('book-content');

        // 获取当前颜色变量 (修正变量名)
        const computedBody = getComputedStyle(document.body);
        const colorAccent = computedBody.getPropertyValue('--accent').trim() || '#D72638';
        const colorBgPanel = computedBody.getPropertyValue('--bg-panel').trim() || '#ffffff';

        // 转换 Hex 为 LaTeX 格式 (e.g. #D72638 -> D72638)
        const pureAccent = colorAccent.replace('#', '');
        const pureBgPanel = colorBgPanel.replace('#', '');

        let tex = `\\documentclass[a4paper,twocolumn]{article}
\\usepackage[UTF8]{ctex}
\\usepackage[margin=2cm]{geometry}
\\usepackage{xcolor}
\\usepackage{pagecolor}
\\usepackage{tcolorbox}
\\usepackage{titlesec}
\\usepackage{enumitem}

% 颜色定义
\\definecolor{accent}{HTML}{${pureAccent}}
\\definecolor{pagebg}{HTML}{${pureBgPanel}}

% 设置页面背景
\\pagecolor{pagebg}

% 标题样式
\\titleformat{\\section}{\\Large\\bfseries\\color{accent}}{}{0em}{}[\\titlerule]
\\titleformat{\\subsection}{\\large\\bfseries}{}{0em}{}

% 卡片样式 (NPC)
\\newtcolorbox{npccard}[1]{
  colback=pagebg,
  colframe=gray!50!black,
  title=#1,
  fonttitle=\\bfseries,
  coltitle=white,
  boxrule=0.5pt,
  arc=2pt
}

% 场景样式
\\newtcolorbox{scenebox}[1]{
  colback=white,
  colframe=black,
  title=#1,
  fonttitle=\\bfseries,
  coltitle=white,
  boxrule=1pt,
  sharp corners
}

\\begin{document}
`;

        // 提取标题
        const titleSpan = contentNode.querySelector('.book-title');
        const title = titleSpan ? titleSpan.innerText.replace(/\n/g, ' ') : 'Arkham Module';
        tex += `\\title{\\textbf{\\Huge ${escapeTex(title)}}}\n\\author{Arkham Generator}\n\\date{\\today}\n\\maketitle\n\n`;

        // 递归遍历
        const children = contentNode.children;
        for (let el of children) {
            if (el.classList.contains('book-header-section')) continue;

            if (el.tagName === 'H2' || el.classList.contains('book-h1')) {
                tex += `\\section*{${escapeTex(el.innerText)}}\n`;
            } else if (el.tagName === 'SECTION' || el.classList.contains('section-card') || el.classList.contains('book-section')) {
                tex += parseNodeToTexWithStyles(el);
            }
        }

        tex += `\n\\end{document}`;

        const blob = new Blob([tex], { type: 'text/plain' });
        const titleCn = document.getElementById('val-final-branch')?.getAttribute('data-title-cn') || 'ArkhamModule';
        downloadFile(blob, `${titleCn}.tex`);

    } catch (e) {
        console.error(e);
        alert('TeX Export Failed: ' + e.message);
    }
}

// 增强的解析函数
function parseNodeToTexWithStyles(node) {
    let out = '';
    for (let child of node.childNodes) {
        if (child.nodeType === 3) { // Text
            out += escapeTex(child.textContent);
        } else if (child.nodeType === 1) { // Element
            if (child.tagName === 'H2') {
                out += `\\subsection*{${escapeTex(child.innerText)}}\n`;
            } else if (child.tagName === 'P') {
                out += `${escapeTex(child.innerText)}\n\n`;
            } else if (child.tagName === 'UL') {
                out += `\\begin{itemize}[leftmargin=*]\n${parseNodeToTexWithStyles(child)}\\end{itemize}\n`;
            } else if (child.tagName === 'LI') {
                out += `\\item ${child.innerText}\n`;
            } else if (child.classList.contains('npc-card')) {
                const name = child.querySelector('.npc-name')?.innerText || 'NPC';
                const desc = child.innerText.replace(name, '').trim();
                out += `\\begin{npccard}{${escapeTex(name)}}\n${escapeTex(desc)}\n\\end{npccard}\n`;
            } else if (child.classList.contains('scene-box')) {
                const header = child.querySelector('.scene-header')?.innerText || 'Scene';
                const content = child.querySelector('.scene-desc')?.innerText || '';
                const event = child.querySelector('.scene-event')?.innerText || '';
                out += `\\begin{scenebox}{${escapeTex(header)}}\n${escapeTex(content)}\n\n\\textit{Event: ${escapeTex(event)}}\n\\end{scenebox}\n`;
            } else {
                out += parseNodeToTexWithStyles(child);
            }
        }
    }
    return out;
}
