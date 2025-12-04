// ==========================================
// 配置区域
// ==========================================
// 【重要】请务必保留你之前填写的真实 Key
const API_KEY = "AIzaSyCt4OigsGUVb13csaRBKeBN9xhXZ4Pgl6g".trim(); 
const API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent";

const Engine = {
    // 1. 本地随机生成 (保留功能)
    generateSourceLocal: function() {
        document.getElementById('val-era').value = this.randomPick(DB.eras);
        document.getElementById('val-loc').value = this.randomPick(DB.locations);
        document.getElementById('val-boss').value = this.randomPick(DB.bosses);
        document.getElementById('val-item').value = this.randomPick(DB.items);
        this.activateNextStage();
    },

    // 2. AI 铭刻灵感
    generateSourceAI: async function() {
        const btn = document.querySelector('button[onclick="Engine.generateSourceAI()"]');
        const originalText = btn.innerText;
        btn.innerText = "⏳ 构思中...";
        btn.disabled = true;

        try {
            const prompt = `
                请发挥你的创造力，随机构思一个独特的克苏鲁跑团(COC)设定。
                你需要提供：一个独特的时代背景、一个恐怖的地点、一个幕后黑手(神话生物或邪教)、一个关键道具。
                请严格返回以下 JSON 格式：
                {
                    "era": "时代 (例如：2049年赛博东京)",
                    "location": "地点 (例如：废弃的仿生人制造厂)",
                    "boss": "反派 (例如：产生自我意识的修格斯)",
                    "item": "物品 (例如：植入式死灵芯片)"
                }
            `;
            const data = await this.callGeminiAPI(prompt);
            
            document.getElementById('val-era').value = data.era;
            document.getElementById('val-loc').value = data.location;
            document.getElementById('val-boss').value = data.boss;
            document.getElementById('val-item').value = data.item;
            
            this.activateNextStage();

        } catch (e) {
            alert("AI 灵感枯竭了：" + e.message);
        } finally {
            btn.innerText = originalText;
            btn.disabled = false;
        }
    },

    // 3. AI 推演剧情分支
    generateBranchesAI: async function() {
        const context = {
            era: document.getElementById('val-era').value,
            loc: document.getElementById('val-loc').value,
            boss: document.getElementById('val-boss').value,
            item: document.getElementById('val-item').value
        };

        if(!context.loc) { alert("请先生成或填写上面的灵感信息！"); return; }

        const loader = document.getElementById('loading-branches');
        const container = document.getElementById('branch-container');
        loader.style.display = 'block';
        container.innerHTML = ''; 

        try {
            const prompt = `
                基于以下COC跑团设定，创作 3 个截然不同的调查员切入方向（剧情分支）：
                - 设定：${JSON.stringify(context)}
                
                请生成 3 个选项：
                1. "武力/激进" (正面冲突)
                2. "潜行/调查" (秘密潜入)
                3. "神秘/理智" (通过知识或魔法解决)
                
                请严格返回以下 JSON 数组格式：
                [
                    { "type": "正面突袭", "text": "具体剧情描述..." },
                    { "type": "暗中调查", "text": "具体剧情描述..." },
                    { "type": "禁忌仪式", "text": "具体剧情描述..." }
                ]
            `;
            const branches = await this.callGeminiAPI(prompt);

            branches.forEach((branch, index) => {
                const card = document.createElement('div');
                card.className = 'branch-card';
                card.innerHTML = `<strong>${branch.type}</strong><p>${branch.text}</p>`;
                card.onclick = () => this.selectBranch(branch.text, card);
                container.appendChild(card);
            });
        } catch (e) {
            console.error(e);
            alert("剧情生成失败，请重试");
        } finally {
            loader.style.display = 'none';
        }
    },

    // 4. 选择分支
    selectBranch: function(text, cardElement) {
        document.querySelectorAll('.branch-card').forEach(el => el.classList.remove('selected'));
        cardElement.classList.add('selected');
        document.getElementById('val-final-branch').value = text;
        document.getElementById('section-full').style.display = 'block';
    },

    // 5. 自动书写模组 (包含标题生成逻辑)
    generateFullModule: async function() {
        const loader = document.getElementById('loading-bar');
        const fill = loader.querySelector('.bar-fill');
        
        const context = {
            era: document.getElementById('val-era').value,
            loc: document.getElementById('val-loc').value,
            boss: document.getElementById('val-boss').value,
            item: document.getElementById('val-item').value,
            plot: document.getElementById('val-final-branch').value
        };

        const prompt = `
            你是一位资深的《克苏鲁的呼唤》(CoC) 模组作者。请根据以下大纲，创作模组终稿。
            
            【核心设定】
            - 时代/地点：${context.era}，${context.loc}
            - 核心诡计：${context.boss} 试图利用 ${context.item}
            - 剧情走向：${context.plot}

            【写作要求】
            1. **拟定标题**：请根据剧情核心，起一个富有克苏鲁风格、神秘且短促的**中文标题**（如《黑水之诅》）和对应的**英文标题**。
            2. **英文翻译**：请将地点 "${context.loc}" 翻译为优雅的英文。
            3. **自由时间轴**：请设计一个跨度在 **7天到30天** 之间的事件链。不要只写流水账，可以使用"三天后"、"下个满月"等自然的时间流逝。必须包含前史（导致现状的原因）。
            4. **纯净输出**：直接输出正文，不要包含说明性文字。
            
            【必须严格返回的 JSON 格式】
            {
                "title": "中文模组名",
                "title_en": "英文模组名",
                "location_en": "地点的英文翻译",
                "truth": "真相正文...",
                "timeline": [
                    {"time": "前史 (具体时间点)", "event": "事件描述..."},
                    {"time": "模组第1周", "event": "事件描述..."},
                    {"time": "第15天 - 最终仪式", "event": "事件描述..."}
                ],
                "climax": "决战正文..."
            }
        `;

        loader.style.display = 'block';
        fill.style.width = '30%';

        try {
            const data = await this.callGeminiAPI(prompt);
            fill.style.width = '100%';

            // 渲染正文
            document.getElementById('out-truth').innerText = data.truth;
            document.getElementById('out-climax').innerText = data.climax;
            
            const ul = document.getElementById('out-timeline');
            ul.innerHTML = '';
            data.timeline.forEach(t => {
                const li = document.createElement('li');
                li.innerHTML = `<strong style="color:var(--accent); display:block; margin-bottom:4px;">${t.time}</strong> ${t.event}`;
                ul.appendChild(li);
            });

            // 【关键】保存 AI 生成的标题和英文地名
            const storeEl = document.getElementById('val-final-branch');
            storeEl.setAttribute('data-title-cn', data.title);
            storeEl.setAttribute('data-title-en', data.title_en);
            
            const locInput = document.getElementById('val-loc');
            locInput.setAttribute('data-en', data.location_en);

        } catch (e) {
            console.error(e);
            alert("书写中断，请重试...");
            fill.style.background = 'var(--accent)';
        }
    },

    // 6. 生成 NPC
    generateNPCs: async function() {
        const plot = document.getElementById('out-truth').innerText;
        const era = document.getElementById('val-era').value;
        const boss = document.getElementById('val-boss').value;

        if(plot === "..." || !plot) { alert("请先在【创作台】生成模组内容！"); return; }

        const btn = document.querySelector('button[onclick="Engine.generateNPCs()"]');
        btn.innerHTML = "⏳ 正在联络线人..."; btn.disabled = true;

        try {
            const prompt = `基于剧情"${plot}"和时代"${era}"，设计3-4位关键NPC。返回JSON数组：[{ "name": "姓名", "role": "身份", "stats": "属性", "desc": "描述", "secret": "秘密" }]`;
            const npcs = await this.callGeminiAPI(prompt);
            
            const container = document.getElementById('npc-container');
            container.innerHTML = '';
            npcs.forEach(npc => {
                container.innerHTML += `
                    <div class="npc-card">
                        <div class="npc-portrait">?</div>
                        <div class="npc-info">
                            <div class="npc-name">${npc.name}</div>
                            <div class="npc-role">${npc.role}</div>
                            <div class="npc-stats">${npc.stats}</div>
                            <div class="npc-desc">${npc.desc}<br><br><strong>⚠️ 秘密：</strong>${npc.secret}</div>
                        </div>
                    </div>`;
            });
        } catch (e) { alert("NPC生成失败"); } 
        finally { btn.innerHTML = "👥 生成 NPC 列表"; btn.disabled = false; }
    },

    // 7. 生成场景
    generateScenes: async function() {
        const location = document.getElementById('val-loc').value;
        const plot = document.getElementById('out-truth').innerText;

        if(!location) { alert("请先确定地点！"); return; }
        const btn = document.querySelector('button[onclick="Engine.generateScenes()"]');
        btn.innerHTML = "⏳ 正在绘制地图..."; btn.disabled = true;

        try {
            const prompt = `基于地点"${location}"和剧情"${plot}"，设计4-5个探索区域。返回JSON数组：[{ "name": "场景名", "desc": "环境描写", "item": "物品", "event": "事件" }]`;
            const scenes = await this.callGeminiAPI(prompt);

            const container = document.getElementById('scene-container');
            container.innerHTML = '';
            scenes.forEach(scene => {
                container.innerHTML += `
                    <div class="scene-box">
                        <div class="scene-header"><span class="scene-title">📍 ${scene.name}</span><span class="scene-item">📦 ${scene.item}</span></div>
                        <div class="scene-desc">${scene.desc}</div>
                        <div class="scene-event">⚡ 触发事件：${scene.event}</div>
                    </div>`;
            });
        } catch (e) { alert("场景生成失败"); } 
        finally { btn.innerHTML = "🔍 生成探索区域"; btn.disabled = false; }
    },

    // 8. 渲染模组书 (修复版)
    renderBook: function() {
        // 抓取基础信息
        const era = document.getElementById('val-era').value || "Unknown Era";
        const loc = document.getElementById('val-loc').value || "Unknown Location";
        const boss = document.getElementById('val-boss').value || "Unknown Threat";
        
        // 抓取 AI 生成的标题 (如果有的话)
        const storeEl = document.getElementById('val-final-branch');
        let titleCn = storeEl.getAttribute('data-title-cn');
        let titleEn = storeEl.getAttribute('data-title-en');
        
        // 抓取 AI 生成的英文地名
        let locEn = document.getElementById('val-loc').getAttribute('data-en');

        // --- 回退逻辑 (Fallback) ---
        // 如果还没有生成过标题，就用默认的
        if (!titleCn) titleCn = `${loc}的阴影`;
        if (!titleEn) {
            // 如果连英文地名都没有，就显示拼音或占位符
            titleEn = `Shadows of ${locEn || loc}`;
        }

        const truth = document.getElementById('out-truth').innerText;
        const climax = document.getElementById('out-climax').innerText;
        const npcHtml = document.getElementById('npc-container').innerHTML;
        const sceneHtml = document.getElementById('scene-container').innerHTML;
        const timelineHtml = document.getElementById('out-timeline').innerHTML;

        // 组装 HTML
        const bookHtml = `
            <div class="book-title">
                ${titleCn}<br>
                <span style="font-size: 1.2rem; font-family: sans-serif; font-weight:normal; display:block; margin-top:10px; letter-spacing:2px; text-transform: uppercase;">
                    ${titleEn}
                </span>
            </div>
            
            <div class="book-meta">
                <span>🕰️ ${era}</span>
                <span>💀 ${boss}</span>
            </div>

            <div class="book-columns">
                <div class="book-h1">1. 守密人背景 (Keeper's Lore)</div>
                <div class="book-p">${truth}</div>

                <div class="book-h1">2. 事件时间表 (Timeline)</div>
                <div style="font-size: 0.9rem; margin-bottom: 20px;">
                    <ul style="padding-left: 20px; line-height: 1.6;">
                       ${timelineHtml ? timelineHtml : "<li>（时间轴尚未生成）</li>"}
                    </ul>
                </div>

                <div class="book-h1">3. 登场人物 (Dramatis Personae)</div>
                <div style="font-size: 0.9rem; break-inside: avoid;">
                   ${npcHtml ? npcHtml : "<p>（人物档案尚未生成）</p>"}
                </div>

                <div class="book-h1">4. 调查场景 (Locations)</div>
                <div style="font-size: 0.9rem;">
                   ${sceneHtml ? sceneHtml : "<p>（场景尚未生成）</p>"}
                </div>

                <div class="book-h1">5. 结局与高潮 (Conclusion)</div>
                <div class="book-p">${climax}</div>
            </div>
        `;

        document.getElementById('book-content').innerHTML = bookHtml;
    },

    // 9. 通用 API 调用器
    callGeminiAPI: async function(promptText) {
        const payload = { contents: [{ parts: [{ text: promptText }] }] };
        const response = await fetch(`${API_URL}?key=${API_KEY}`, {
            method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        let text = data.candidates[0].content.parts[0].text;
        text = text.replace(/```json|```/g, "").trim();
        return JSON.parse(text);
    },

    // 辅助
    randomPick: arr => arr[Math.floor(Math.random() * arr.length)],
    activateNextStage: () => {
        const sec = document.getElementById('section-branch');
        sec.style.opacity = '1'; sec.style.pointerEvents = 'auto';
    }
};

// ==========================================
// 档案系统 (Archive System)
// ==========================================
const ArchiveSystem = {
    // 保存当前状态
    saveCurrent: function() {
        // 1. 获取关键信息用于标题
        const era = document.getElementById('val-era').value || "未知时代";
        const loc = document.getElementById('val-loc').value || "未知地点";
        const titleCn = document.getElementById('val-final-branch').getAttribute('data-title-cn') || `${loc}的怪谈`;
        
        // 2. 打包所有数据 (Data Serialization)
        const saveData = {
            id: Date.now(), // 使用时间戳作为唯一ID
            meta: { title: titleCn, era: era, date: new Date().toLocaleString() },
            inputs: {
                era: document.getElementById('val-era').value,
                loc: document.getElementById('val-loc').value,
                boss: document.getElementById('val-boss').value,
                item: document.getElementById('val-item').value,
                branch: document.getElementById('val-final-branch').value,
                // 重要：保存 AI 生成的隐藏属性
                titleCn: document.getElementById('val-final-branch').getAttribute('data-title-cn'),
                titleEn: document.getElementById('val-final-branch').getAttribute('data-title-en'),
                locEn: document.getElementById('val-loc').getAttribute('data-en')
            },
            content: {
                truth: document.getElementById('out-truth').innerText,
                timeline: document.getElementById('out-timeline').innerHTML,
                climax: document.getElementById('out-climax').innerText,
                npcs: document.getElementById('npc-container').innerHTML,
                scenes: document.getElementById('scene-container').innerHTML
            }
        };

        // 3. 存入 LocalStorage
        let archives = JSON.parse(localStorage.getItem('arkham_archives') || "[]");
        archives.unshift(saveData); // 加到最前面
        localStorage.setItem('arkham_archives', JSON.stringify(archives));

        alert(`✅ 存档 "${titleCn}" 已成功封存。`);
        this.renderList(); // 刷新列表
    },

    // 渲染存档列表
    renderList: function() {
        const container = document.getElementById('archive-list');
        const archives = JSON.parse(localStorage.getItem('arkham_archives') || "[]");
        
        container.innerHTML = '';

        if (archives.length === 0) {
            container.innerHTML = '<p style="grid-column: 1 / -1; text-align:center; color:var(--text-muted);">/// 档案室空无一物 ///</p>';
            return;
        }

        archives.forEach(arch => {
            const card = document.createElement('div');
            card.className = 'archive-card';
            card.innerHTML = `
                <div class="archive-title">${arch.meta.title}</div>
                <div class="archive-date">${arch.meta.date} | ${arch.meta.era}</div>
                <div class="archive-actions">
                    <button class="btn-small" onclick="ArchiveSystem.load(${arch.id})">📂 读取 (Load)</button>
                    <button class="btn-small btn-delete" onclick="ArchiveSystem.remove(${arch.id})">🗑️ 销毁</button>
                </div>
            `;
            container.appendChild(card);
        });
    },

    // 读取存档
    load: function(id) {
        if(!confirm("⚠️ 读取存档将覆盖当前工作台的内容，确定吗？")) return;

        const archives = JSON.parse(localStorage.getItem('arkham_archives') || "[]");
        const target = archives.find(a => a.id === id);

        if (!target) return;

        // 1. 恢复输入框
        document.getElementById('val-era').value = target.inputs.era;
        document.getElementById('val-loc').value = target.inputs.loc;
        document.getElementById('val-boss').value = target.inputs.boss;
        document.getElementById('val-item').value = target.inputs.item;
        
        // 2. 恢复分支和隐藏属性
        const branchInput = document.getElementById('val-final-branch');
        branchInput.value = target.inputs.branch;
        if(target.inputs.titleCn) branchInput.setAttribute('data-title-cn', target.inputs.titleCn);
        if(target.inputs.titleEn) branchInput.setAttribute('data-title-en', target.inputs.titleEn);
        if(target.inputs.locEn) document.getElementById('val-loc').setAttribute('data-en', target.inputs.locEn);

        // 3. 恢复生成的内容
        document.getElementById('out-truth').innerText = target.content.truth;
        document.getElementById('out-timeline').innerHTML = target.content.timeline;
        document.getElementById('out-climax').innerText = target.content.climax;
        document.getElementById('npc-container').innerHTML = target.content.npcs;
        document.getElementById('scene-container').innerHTML = target.content.scenes;

        // 4. 恢复显示的区域
        // 如果有内容，显示完整模组区
        if(target.content.truth && target.content.truth !== "...") {
            document.getElementById('section-full').style.display = 'block';
            document.getElementById('section-branch').style.opacity = '1'; 
            document.getElementById('section-branch').style.pointerEvents = 'auto';
        }

        // 跳转回工作台
        switchView('view-workstation');
        // 手动高亮工作台按钮
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        document.querySelector('.nav-item').classList.add('active'); // 假设第一个是工作台
        
        alert("📖 记忆已回溯。");
    },

    // 删除存档
    remove: function(id) {
        if(!confirm("🔥 确定要永久销毁这份档案吗？")) return;
        
        let archives = JSON.parse(localStorage.getItem('arkham_archives') || "[]");
        archives = archives.filter(a => a.id !== id);
        localStorage.setItem('arkham_archives', JSON.stringify(archives));
        this.renderList();
    }
};

// ==========================================
// 视觉控制台
// ==========================================
function setTheme(themeName) {
    document.body.setAttribute('data-theme', themeName);
}
setTheme('yellow');