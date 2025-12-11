// ==========================================
// 导出引擎 Export Engine (Enhanced with docx library)
// ==========================================

// 辅助：获取 CSS 变量值
function getCssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// RGB/RGBA 转 Hex
function rgbToHex(color) {
    if (!color || color === 'transparent' || color === 'rgba(0, 0, 0, 0)') return '#ffffff';
    if (color.startsWith('#')) return color;
    const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
    if (match) {
        return '#' + [match[1], match[2], match[3]]
            .map(x => parseInt(x).toString(16).padStart(2, '0')).join('');
    }
    return '#000000';
}

// 获取当前主题颜色
function getThemeColors() {
    const computedBody = getComputedStyle(document.body);
    return {
        accent: rgbToHex(computedBody.getPropertyValue('--accent').trim()) || '#8a0303',
        bgPanel: rgbToHex(computedBody.getPropertyValue('--bg-panel').trim()) || '#fdf6e3',
        textPrimary: rgbToHex(computedBody.getPropertyValue('--text-primary').trim()) || '#433422',
        textMuted: rgbToHex(computedBody.getPropertyValue('--text-muted').trim()) || '#8b7d6b',
        border: rgbToHex(computedBody.getPropertyValue('--border').trim()) || '#d4c5a9'
    };
}

function escapeTex(str) {
    if (!str) return '';
    return str.replace(/([&%$#_{}])/g, '\\$1').replace(/\n/g, ' ').trim();
}

// 解析书籍内容
function parseBookContent() {
    const contentNode = document.getElementById('book-content');
    if (!contentNode) throw new Error("Cannot find book content");

    const titleCn = contentNode.querySelector(SELECTORS.title)?.childNodes[0]?.textContent?.trim() || '未命名模组';
    const titleEn = contentNode.querySelector(SELECTORS.title + ' span')?.textContent?.trim() || 'Untitled Module';

    const metaSpans = contentNode.querySelectorAll(SELECTORS.meta + ' span');
    const era = metaSpans[0]?.textContent?.replace('🕰️', '').trim() || '';
    const boss = metaSpans[1]?.textContent?.replace('💀', '').trim() || '';

    const sections = [];
    contentNode.querySelectorAll(SELECTORS.section + ':not(' + SELECTORS.headerSection + ')').forEach(section => {
        const secData = {
            h1: section.querySelector(SELECTORS.h1)?.textContent || '',
            p: section.querySelector(SELECTORS.p)?.textContent || '',
            timeline: [],
            npcs: [],
            scenes: []
        };

        // Timeline
        const timelineUl = section.querySelector(SELECTORS.timeline.item)?.parentElement; // Usually UL inside section
        // Or if we strictly follow structure:
        const tList = section.querySelector('ul');
        if (tList) {
            tList.querySelectorAll(SELECTORS.timeline.item).forEach(li => {
                const strong = li.querySelector('strong');
                const timeText = strong ? strong.textContent : '';
                const restText = li.textContent.replace(timeText, '').trim();
                secData.timeline.push({ time: timeText, text: restText });
            });
        }

        // NPCs
        section.querySelectorAll(SELECTORS.npc.container).forEach(card => {
            const fullText = card.querySelector(SELECTORS.npc.desc)?.textContent || '';
            let desc = fullText, secret = '';
            const secretIdx = fullText.indexOf('秘密：');
            if (secretIdx > -1) {
                desc = fullText.substring(0, secretIdx).replace('⚠️', '').trim();
                secret = fullText.substring(secretIdx + 3).trim();
            }

            secData.npcs.push({
                name: card.querySelector('.npc-name')?.textContent || 'NPC', // Keep legacy for simplicity or add to SELECTORS if critical
                role: card.querySelector('.npc-role')?.textContent || '',
                stats: card.querySelector('.npc-stats')?.textContent || '',
                desc: desc,
                secret: secret
            });
        });

        // Scenes
        section.querySelectorAll(SELECTORS.scene.container).forEach(box => {
            secData.scenes.push({
                title: box.querySelector('.scene-title')?.textContent || '',
                item: box.querySelector('.scene-item')?.textContent || '',
                desc: box.querySelector(SELECTORS.scene.desc)?.textContent || '',
                event: box.querySelector(SELECTORS.scene.event)?.textContent || ''
            });
        });

        sections.push(secData);
    });

    return { titleCn, titleEn, era, boss, sections };
}

// --- Word (.docx) 导出 (使用 docx 库) ---
async function exportToWord() {
    try {
        const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
            WidthType, BorderStyle, AlignmentType, SectionType, convertInchesToTwip, LevelFormat } = docx;

        const contentNode = document.getElementById('book-content');
        if (!contentNode) throw new Error("Cannot find book content");

        const colors = getThemeColors();
        const accentHex = colors.accent.replace('#', '');
        const bgPanelHex = colors.bgPanel.replace('#', '');
        const textHex = colors.textPrimary.replace('#', '');
        const borderHex = colors.border.replace('#', '');
        const mutedHex = colors.textMuted.replace('#', '');

        // 获取字体 (从 CSS 变量提取)
        const fontStack = getCssVar('--font-serif');
        const fontSerif = fontStack.split(',')[0].replace(/["']/g, '').trim() || 'Georgia';
        // 根据字体栈类型确定中文字体 (匹配浏览器 fallback 行为)
        let fontChinese = 'SimSun'; // 默认宋体
        if (fontStack.includes('sans-serif')) {
            fontChinese = 'Microsoft YaHei'; // 微软雅黑
        } else if (fontStack.includes('monospace')) {
            fontChinese = 'SimSun'; // 等宽中文用宋体
        }

        // 提取内容
        const data = parseBookContent();

        // 辅助：获取 DOCX 字号 (1px = 1.5 half-points)
        // 动态读取 DOM 计算样式，实现 "所见即所得"
        // 修正：使用 Math.floor 向下取整，防止 Word 渲染比 CSS 宽
        function getDocxFontSize(selector, defaultSize) {
            const el = document.querySelector(selector);
            if (!el) return defaultSize;
            const fontSizePx = parseFloat(getComputedStyle(el).fontSize);
            if (isNaN(fontSizePx)) return defaultSize;
            return Math.floor(fontSizePx * 1.5);
        }

        // === 标题区内容 (单栏) ===
        const headerChildren = [];

        // 中文标题
        const titleSize = getDocxFontSize(SELECTORS.title, 60);
        headerChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
            children: [new TextRun({ text: data.titleCn, bold: true, size: titleSize, color: textHex })]
        }));

        // 英文标题 + 下划线
        // 使用 mutedHex 配合 font-family:serif (subtitle 的 CSS 现在是 muted 色的)
        const subTitleSize = getDocxFontSize(SELECTORS.title + ' span', 28);
        headerChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: textHex } },
            children: [new TextRun({ text: data.titleEn, size: subTitleSize, allCaps: true, color: mutedHex })]
        }));

        // 动态获取 Meta Gap
        const metaEl = document.querySelector('.book-meta');
        const metaGapPx = metaEl ? parseFloat(getComputedStyle(metaEl).gap) || 30 : 30;
        const halfGapTwips = Math.round(metaGapPx * 15 / 2); // 1px = 15 twips

        // 元信息表格 (时代 + Boss，AUTO 宽度居中)
        const metaTable = new Table({
            alignment: AlignmentType.CENTER,
            width: { size: 0, type: WidthType.AUTO },
            borders: {
                top: { style: BorderStyle.NONE },
                bottom: { style: BorderStyle.NONE },
                left: { style: BorderStyle.NONE },
                right: { style: BorderStyle.NONE },
                insideHorizontal: { style: BorderStyle.NONE },
                insideVertical: { style: BorderStyle.NONE }
            },
            rows: [
                new TableRow({
                    children: [
                        new TableCell({
                            width: { size: 0, type: WidthType.AUTO },
                            margins: { right: halfGapTwips },
                            children: [new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: `🕰️ ${data.era}`, size: 24, italics: true, color: mutedHex })]
                            })]
                        }),
                        new TableCell({
                            width: { size: 0, type: WidthType.AUTO },
                            margins: { left: halfGapTwips },
                            children: [new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: `💀 ${data.boss}`, size: 24, italics: true, color: mutedHex })]
                            })]
                        })
                    ]
                })
            ]
        });
        headerChildren.push(metaTable);

        // === 正文区内容 (双栏) ===
        const contentChildren = [];

        // 动态获取各类元素字号
        const h1Size = getDocxFontSize(SELECTORS.h1, 34);
        const pSize = getDocxFontSize(SELECTORS.p, 24);
        const sceneTitleSize = getDocxFontSize('.scene-title', 26);

        data.sections.forEach(section => {
            if (section.h1) {
                contentChildren.push(new Paragraph({
                    spacing: { before: 300, after: 100 },
                    border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: borderHex } },
                    children: [new TextRun({ text: section.h1, bold: true, size: h1Size, color: accentHex })]
                }));
            }

            if (section.p) {
                contentChildren.push(new Paragraph({
                    spacing: { after: 200 },
                    children: [new TextRun({ text: section.p, size: pSize, color: textHex })]
                }));
            }

            // 时间轴
            section.timeline.forEach(item => {
                contentChildren.push(new Paragraph({
                    spacing: { after: 100 },
                    numbering: { reference: 'small-bullet', level: 0 },
                    children: [
                        new TextRun({ text: item.time, bold: true, color: accentHex, size: pSize }),
                        new TextRun({ text: item.text, size: pSize, color: textHex, break: 1 })
                    ]
                }));
            });

            // NPC 卡片 (根据用户规范)
            section.npcs.forEach(npc => {
                // 计算卡片背景色 (比 bgPanel 略深，模拟 rgba(0,0,0,0.04) 叠加效果)
                const bgR = parseInt(bgPanelHex.substring(0, 2), 16);
                const bgG = parseInt(bgPanelHex.substring(2, 4), 16);
                const bgB = parseInt(bgPanelHex.substring(4, 6), 16);
                const darkenFactor = 0.96;
                const cardBgHex = Math.round(bgR * darkenFactor).toString(16).padStart(2, '0') +
                    Math.round(bgG * darkenFactor).toString(16).padStart(2, '0') +
                    Math.round(bgB * darkenFactor).toString(16).padStart(2, '0');

                // 卡片内容
                const npcChildren = [];

                // 头像 (内嵌表格，与文字共享背景)
                const portraitTable = new Table({
                    width: { size: 1200, type: WidthType.DXA },
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 4, color: borderHex },
                        bottom: { style: BorderStyle.SINGLE, size: 4, color: borderHex },
                        left: { style: BorderStyle.SINGLE, size: 4, color: borderHex },
                        right: { style: BorderStyle.SINGLE, size: 4, color: borderHex }
                    },
                    rows: [
                        new TableRow({
                            height: { value: 1400, rule: 'atLeast' },
                            children: [
                                new TableCell({
                                    shading: { fill: borderHex },
                                    verticalAlign: 'center',
                                    children: [new Paragraph({
                                        alignment: AlignmentType.CENTER,
                                        children: [new TextRun({ text: '?', size: 56, color: textHex })]
                                    })]
                                })
                            ]
                        })
                    ]
                });
                npcChildren.push(portraitTable);
                npcChildren.push(new Paragraph({ spacing: { after: 100 } }));

                // 名字 (强调色粗体 + 装饰线)
                npcChildren.push(new Paragraph({
                    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: borderHex } },
                    spacing: { after: 40 },
                    children: [new TextRun({ text: npc.name, bold: true, color: accentHex, size: pSize })]
                }));

                // 角色
                if (npc.role) {
                    npcChildren.push(new Paragraph({
                        children: [new TextRun({ text: npc.role, size: pSize, color: textHex })]
                    }));
                }

                // 属性
                if (npc.stats) {
                    npcChildren.push(new Paragraph({
                        children: [new TextRun({ text: npc.stats, size: pSize, color: textHex })]
                    }));
                }

                // 描述
                if (npc.desc) {
                    npcChildren.push(new Paragraph({
                        spacing: { before: 80 },
                        children: [new TextRun({ text: npc.desc, size: pSize, color: textHex })]
                    }));
                }

                // 秘密区域
                if (npc.secret) {
                    npcChildren.push(new Paragraph({
                        spacing: { before: 80 },
                        children: [
                            new TextRun({ text: '⚠ 秘密：', bold: true, color: accentHex, size: pSize }),
                            new TextRun({ text: npc.secret, size: pSize, color: textHex })
                        ]
                    }));
                }

                // NPC 卡片外框
                const npcTable = new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.SINGLE, size: 4, color: borderHex },
                        bottom: { style: BorderStyle.SINGLE, size: 4, color: borderHex },
                        left: { style: BorderStyle.SINGLE, size: 4, color: borderHex },
                        right: { style: BorderStyle.SINGLE, size: 4, color: borderHex }
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    shading: { fill: cardBgHex },
                                    margins: { top: 150, bottom: 150, left: 200, right: 200 },
                                    children: npcChildren
                                })
                            ]
                        })
                    ]
                });
                contentChildren.push(npcTable);
                contentChildren.push(new Paragraph({ spacing: { after: 300 } }));
            });

            // 场景卡片
            section.scenes.forEach(scene => {
                // 场景背景色 (bgPanel * 0.98，模拟 rgba(0,0,0,0.02))
                const sceneDarken = 0.98;
                const sceneBgHex = Math.round(parseInt(bgPanelHex.substring(0, 2), 16) * sceneDarken).toString(16).padStart(2, '0') +
                    Math.round(parseInt(bgPanelHex.substring(2, 4), 16) * sceneDarken).toString(16).padStart(2, '0') +
                    Math.round(parseInt(bgPanelHex.substring(4, 6), 16) * sceneDarken).toString(16).padStart(2, '0');

                const sceneTable = new Table({
                    width: { size: 100, type: WidthType.PERCENTAGE },
                    borders: {
                        top: { style: BorderStyle.NONE },
                        bottom: { style: BorderStyle.NONE },
                        left: { style: BorderStyle.THICK, size: 24, color: mutedHex },
                        right: { style: BorderStyle.NONE }
                    },
                    rows: [
                        new TableRow({
                            children: [
                                new TableCell({
                                    shading: { fill: sceneBgHex },
                                    margins: { top: 100, bottom: 100, left: 150, right: 150 },
                                    children: [
                                        new Paragraph({
                                            children: [
                                                new TextRun({ text: scene.title, bold: true, size: sceneTitleSize, color: textHex }),
                                                scene.item ? new TextRun({ text: '  ' + scene.item, size: pSize, color: mutedHex }) : null
                                            ].filter(Boolean)
                                        }),
                                        new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: scene.desc, size: pSize, color: textHex })] }),
                                        scene.event ? new Paragraph({ spacing: { before: 100 }, children: [new TextRun({ text: scene.event, italics: true, bold: true, size: pSize, color: accentHex })] }) : new Paragraph({})
                                    ]
                                })
                            ]
                        })
                    ]
                });
                contentChildren.push(sceneTable);
                contentChildren.push(new Paragraph({ spacing: { after: 200 } }));
            });
        });

        // 页面设置 (两个 section 共享)
        const pageSettings = {
            // 1:1 Pixel Mapping (96 DPI): 800px Width, 60px Padding (Back to 1:1 based on Math.floor fix)
            size: { width: 12000, height: convertInchesToTwip(11.69) }, // 800px
            margin: { top: convertInchesToTwip(1), bottom: convertInchesToTwip(0.5), left: 900, right: 900 } // 60px (900 twips)
        };

        // 创建文档 (两个 section，共享页面设置以确保 CONTINUOUS 正常工作)
        const doc = new Document({
            background: { color: bgPanelHex },
            styles: {
                default: {
                    document: {
                        run: {
                            characterSpacing: -5, // Condense by 0.25pt to match CSS tightness
                            font: {
                                ascii: fontSerif,
                                eastAsia: fontChinese,
                                hAnsi: fontSerif
                            },
                            size: 24 // Default size 24 (12pt = 16px)
                        }
                    }
                }
            },
            numbering: {
                config: [{
                    reference: 'small-bullet',
                    levels: [{
                        level: 0,
                        format: LevelFormat.BULLET,
                        text: '•',
                        alignment: AlignmentType.LEFT,
                        style: {
                            run: { size: pSize }, // Match paragraph font size (CSS default)
                            paragraph: {
                                indent: { left: 360, hanging: 180 } // Tighter bullet-text spacing
                            }
                        }
                    }]
                }]
            },
            sections: [
                {
                    // 标题区：单栏
                    properties: {
                        page: pageSettings,
                        column: { count: 1 }
                    },
                    children: headerChildren
                },
                {
                    // 正文区：双栏，紧接标题 (同一页)
                    properties: {
                        type: SectionType.CONTINUOUS,
                        page: pageSettings,
                        column: { count: 2, space: 600 } // 40px Gap
                    },
                    children: contentChildren
                }
            ]
        });

        const blob = await Packer.toBlob(doc);
        const fileTitle = document.getElementById('val-final-branch')?.getAttribute('data-title-cn') || 'ArkhamModule';
        downloadFile(blob, `${fileTitle}.docx`);

    } catch (e) {
        console.error(e);
        alert('Word Export Failed: ' + e.message);
    }
}

// --- LaTeX (.tex) 导出 ---
async function exportToTex() {
    try {
        const data = parseBookContent();

        const colors = getThemeColors();
        const pureAccent = colors.accent.replace('#', '');
        const pureBgPanel = colors.bgPanel.replace('#', '');
        const pureBorder = colors.border.replace('#', '');
        const pureText = colors.textPrimary.replace('#', '');
        const pureMuted = colors.textMuted.replace('#', '');

        let tex = `\\documentclass[a4paper]{article}
\\usepackage[UTF8]{ctex}
\\usepackage[margin=2cm]{geometry}
\\usepackage{xcolor}
\\usepackage{pagecolor}
\\usepackage{tcolorbox}
\\usepackage{titlesec}
\\usepackage{enumitem}
\\usepackage{multicol}
\\usepackage{graphicx}

% 颜色定义
\\definecolor{accent}{HTML}{${pureAccent}}
\\definecolor{pagebg}{HTML}{${pureBgPanel}}
\\definecolor{bordercolor}{HTML}{${pureBorder}}
\\definecolor{textcolor}{HTML}{${pureText}}
\\definecolor{mutedcolor}{HTML}{${pureMuted}}

\\pagecolor{pagebg}
\\color{textcolor}

% 章节标题样式
\\titleformat{\\section}
  {\\Large\\bfseries\\color{accent}}
  {}{0em}{}
  [\\color{bordercolor}\\titlerule]
\\titlespacing{\\section}{0pt}{1.5em}{0.8em}

% NPC 卡片
\\newtcolorbox{npccard}[1]{
  colback=pagebg,
  colframe=bordercolor,
  title={\\color{accent}#1},
  fonttitle=\\bfseries,
  boxrule=0.5pt,
  arc=2pt,
  left=5pt, right=5pt, top=3pt, bottom=3pt
}

% 秘密区域
\\newtcolorbox{secretbox}{
  colback=pagebg!95!yellow,
  colframe=bordercolor,
  boxrule=0.5pt,
  arc=0pt,
  left=5pt, right=5pt, top=3pt, bottom=3pt
}

% 场景样式
\\newtcolorbox{scenebox}[1]{
  colback=pagebg!98!black,
  colframe=pagebg,
  borderline west={3pt}{0pt}{mutedcolor},
  title={\\bfseries #1},
  fonttitle=\\normalfont,
  coltitle=textcolor,
  boxrule=0pt,
  sharp corners,
  left=8pt, right=5pt, top=3pt, bottom=3pt
}

\\begin{document}

% === 标题区 ===
\\begin{center}
{\\Huge\\bfseries ${escapeTex(data.titleCn)}}

\\vspace{0.3em}
{\\large\\scshape ${escapeTex(data.titleEn)}}
\\end{center}

\\vspace{0.3em}
\\rule{\\textwidth}{0.5pt}
\\vspace{0.5em}

% 时代与Boss (flex 布局模拟，各自居中)
\\noindent
\\begin{minipage}[t]{0.35\\textwidth}
\\centering
{\\color{mutedcolor}🕰️ ${escapeTex(data.era)}}
\\end{minipage}%
\\hfill
\\begin{minipage}[t]{0.60\\textwidth}
\\centering
{\\color{mutedcolor}💀 ${escapeTex(data.boss)}}
\\end{minipage}

\\vspace{1.5em}

% === 正文区 (双栏) ===
\\begin{multicols}{2}
`;

        data.sections.forEach(section => {
            if (section.h1) tex += `\\section*{${escapeTex(section.h1)}}\n\n`;

            if (section.p) tex += `${escapeTex(section.p)}\n\n`;

            if (section.timeline.length > 0) {
                tex += `\\begin{itemize}[leftmargin=*]\n`;
                section.timeline.forEach(item => {
                    tex += `\\item {\\bfseries\\color{accent}${escapeTex(item.time)}} ${escapeTex(item.text)}\n`;
                });
                tex += `\\end{itemize}\n\n`;
            }

            section.npcs.forEach(npc => {
                tex += `\\begin{npccard}{${escapeTex(npc.name)}}\n`;
                if (npc.role) tex += `{\\itshape\\color{mutedcolor} ${escapeTex(npc.role)}}\n\n`;
                if (npc.stats) tex += `${escapeTex(npc.stats)}\n\n`;
                tex += `${escapeTex(npc.desc)}\n`;
                tex += `\\end{npccard}\n\n`;
                if (npc.secret) {
                    tex += `\\begin{secretbox}\n{\\bfseries\\color{accent} ⚠️ 秘密：}${escapeTex(npc.secret)}\n\\end{secretbox}\n\n`;
                }
            });

            section.scenes.forEach(scene => {
                const header = scene.item ? `${escapeTex(scene.title)} \\hfill {\\small\\color{mutedcolor}${escapeTex(scene.item)}}` : escapeTex(scene.title);
                tex += `\\begin{scenebox}{${header}}\n${escapeTex(scene.desc)}\n\n`;
                if (scene.event) tex += `{\\itshape\\bfseries\\color{accent} ${escapeTex(scene.event)}}\n`;
                tex += `\\end{scenebox}\n\n`;
            });
        });

        tex += `\\end{multicols}\n\\end{document}`;

        const blob = new Blob([tex], { type: 'text/plain;charset=utf-8' });
        const fileTitle = document.getElementById('val-final-branch')?.getAttribute('data-title-cn') || 'ArkhamModule';
        downloadFile(blob, `${fileTitle}.tex`);

    } catch (e) {
        console.error(e);
        alert('TeX Export Failed: ' + e.message);
    }
}
