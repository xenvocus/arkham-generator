# 开发者文档

本文档详细介绍项目的文件结构、函数功能和实现细节。

---

## 📁 项目结构

```
arkham-generator/
├── index.html      # 主页面结构
├── script.js       # 核心逻辑与 AI 交互
├── data.js         # 静态数据库
├── style.css       # 样式与主题系统
├── README.md       # 用户说明文档
└── DOCUMENTS.md    # 开发者文档 (本文件)
```

---

## 📄 index.html

主页面结构文件，采用单页应用 (SPA) 设计模式。

### 页面结构

| 区域 ID | 功能描述 |
|---------|----------|
| `.sidebar` | 侧边栏导航，包含页面切换和主题选择器 |
| `#view-workstation` | 核心创作平台，包含灵感生成、剧情分支、模组书写 |
| `#view-npc` | 调查员与角色档案页 |
| `#view-scene` | 探索区域与线索链页 |
| `#view-preview` | 模组排版预览与 PDF 导出页 |
| `#view-archive` | 历史档案室，存档管理页 |
| `#api-modal` | API Key 配置弹窗 |

### 内联函数

```javascript
switchView(viewId, navEl)
```
- **功能**: 切换当前显示的视图页面
- **参数**: 
  - `viewId`: 目标视图的 DOM ID
  - `navEl`: 对应的导航项元素 (用于高亮)

---

## 📄 script.js

核心业务逻辑文件，包含 AI 调用、数据处理和存档系统。

### 常量与配置

```javascript
const DEFAULT_CONFIGS = {
    gemini: { baseUrl: "...", model: "gemini-2.5-flash-preview-05-20" },
    openai: { baseUrl: "...", model: "gpt-4o-mini" }
}
```
- 支持 Gemini 和 OpenAI 两种 API 格式的默认配置

---

### API 配置管理函数

#### `getApiConfig()`
- **功能**: 获取当前完整的 API 配置
- **返回**: `object` - 包含 `provider`, `apiKey`, `baseUrl`, `model`
- **逻辑**: 如果用户未设置，使用对应提供商的默认值

#### `checkApiKey()`
- **功能**: 检查 API Key 是否已配置
- **返回**: `object` - API 配置对象
- **行为**: 如果 Key 不存在，弹出配置窗口并抛出错误

#### `toggleApiModal(show)`
- **功能**: 控制 API 配置弹窗的显示/隐藏
- **参数**: `show: boolean` - true 显示，false 隐藏
- **行为**: 打开时自动填充已保存的配置

#### `updateProviderPlaceholders()`
- **功能**: 根据选择的提供商更新输入框占位符
- **触发**: 切换 API 类型下拉框时自动调用

#### `saveApiConfig()`
- **功能**: 保存完整的 API 配置到 localStorage
- **存储键**: `api_provider`, `api_key`, `api_base_url`, `api_model`

---

### Engine 对象

核心引擎对象，包含所有模组生成相关的方法。

#### `Engine.generateSourceLocal()`
- **功能**: 本地随机生成灵感设定 (不依赖 AI)
- **数据源**: `DB` 对象中的预设数组
- **触发**: 调用 `activateNextStage()` 解锁下一阶段

#### `Engine.generateSourceAI()`
- **功能**: 智能补全灵感设定 (只填充用户未填写的字段)
- **智能逻辑**:
  1. 检测哪些字段已被用户填写
  2. 仅请求 AI 补全空白字段
  3. 根据已有设定保持风格一致性
- **输出字段**: `era`, `location`, `boss`, `item`
- **特性**: 如果所有字段已填写，直接跳过 AI 调用

#### `Engine.generateBranchesAI()`
- **功能**: 生成三种不同风格的剧情分支
- **分支类型**:
  1. 正面突袭 (武力/激进)
  2. 暗中调查 (潜行/调查)
  3. 禁忌仪式 (神秘/理智)
- **返回格式**: JSON 数组

#### `Engine.selectBranch(text, cardElement)`
- **功能**: 处理用户选择的剧情分支
- **参数**:
  - `text`: 分支描述文本
  - `cardElement`: 被点击的卡片 DOM 元素
- **行为**: 高亮选中卡片，填充最终剧情文本框，显示下一区块

#### `Engine.generateFullModule()`
- **功能**: 生成完整模组内容 (真相、时间轴、决战)
- **输出字段**:
  - `title` / `title_en`: 中英文标题
  - `location_en`: 地点英文翻译
  - `truth`: 模组真相
  - `timeline`: 事件时间轴数组
  - `climax`: 决战场景
- **数据存储**: 将标题信息存储在 DOM 元素的 `data-*` 属性中

#### `Engine.generateNPCs()`
- **功能**: 生成 NPC 角色列表
- **输出字段**: `name`, `role`, `stats`, `desc`, `secret`
- **前置条件**: 需要先生成模组真相

#### `Engine.generateScenes()`
- **功能**: 生成调查探索场景
- **输出字段**: `name`, `desc`, `item`, `event`
- **前置条件**: 需要确定地点信息

#### `Engine.renderBook()`
- **功能**: 渲染模组预览书本
- **数据来源**: 从各 DOM 元素收集已生成的内容
- **回退逻辑**: 如果 AI 标题不存在，使用默认标题格式

#### `Engine.callAI(promptText)`
- **功能**: 统一的 AI 调用入口，自动选择正确的 API 格式
- **参数**: `promptText: string` - AI 提示词
- **返回**: `Promise<Object>` - 解析后的 JSON 数据
- **逻辑**: 根据 `config.provider` 分发到对应的调用方法

#### `Engine.callGemini(promptText, config)`
- **功能**: Google Gemini API 调用
- **参数**: 
  - `promptText: string` - AI 提示词
  - `config: object` - API 配置
- **URL 格式**: `{baseUrl}/models/{model}:generateContent?key={apiKey}`

#### `Engine.callOpenAI(promptText, config)`
- **功能**: OpenAI 格式 API 调用 (兼容 OpenAI/DeepSeek/本地模型)
- **参数**: 
  - `promptText: string` - AI 提示词
  - `config: object` - API 配置
- **URL 格式**: `{baseUrl}/chat/completions`
- **认证方式**: Bearer Token

#### `Engine.callGeminiAPI(promptText)` (已弃用)
- **功能**: 向后兼容的别名，内部调用 `callAI()`

#### `Engine.randomPick(arr)`
- **功能**: 从数组中随机选择一个元素
- **参数**: `arr: Array` - 源数组
- **返回**: 随机选中的元素

#### `Engine.activateNextStage()`
- **功能**: 激活下一阶段的 UI 区块
- **行为**: 移除 `section-branch` 的禁用样式

---

### ArchiveSystem 对象

存档系统对象，管理模组的保存和读取。

#### `ArchiveSystem.saveCurrent()`
- **功能**: 将当前工作状态保存为存档
- **存储位置**: `localStorage['arkham_archives']`
- **数据结构**:
  ```javascript
  {
    id: number,           // 时间戳 ID
    meta: { title, era, date },
    inputs: { era, loc, boss, item, branch, titleCn, titleEn, locEn },
    content: { truth, timeline, climax, npcs, scenes }
  }
  ```

#### `ArchiveSystem.renderList()`
- **功能**: 渲染存档列表到 `#archive-list` 容器
- **空状态**: 显示"档案室空无一物"提示

#### `ArchiveSystem.load(id)`
- **功能**: 读取指定 ID 的存档并恢复状态
- **参数**: `id: number` - 存档时间戳 ID
- **行为**: 
  - 恢复所有输入框值
  - 恢复 DOM 元素的 `data-*` 属性
  - 恢复生成的 HTML 内容
  - 跳转到工作台页面

#### `ArchiveSystem.remove(id)`
- **功能**: 删除指定 ID 的存档
- **参数**: `id: number` - 存档时间戳 ID
- **确认**: 弹出确认对话框

---

### 主题控制函数

#### `setTheme(themeName)`
- **功能**: 切换视觉主题
- **参数**: `themeName: string` - 主题标识符
- **可选值**: `'yellow'`, `'noir'`, `'deep'`
- **实现**: 设置 `body` 的 `data-theme` 属性

---

## 📄 data.js

静态数据库文件，包含预设的模组元素。

### DB 对象

```javascript
const DB = {
    eras: [...],           // 时代背景数组
    locations: [...],      // 地点数组
    bosses: [...],         // 反派/神话生物数组
    items: [...],          // 关键道具数组
    branchTemplates: [...] // 剧情分支模板 (备用)
}
```

#### 字段说明

| 字段 | 类型 | 说明 |
|------|------|------|
| `eras` | `string[]` | 时代背景选项，如 "1920s 禁酒令" |
| `locations` | `string[]` | 地点选项，如 "古老的灯塔" |
| `bosses` | `string[]` | 反派选项，如 "星之彩" |
| `items` | `string[]` | 道具选项，如 "死灵之书残页" |
| `branchTemplates` | `object[]` | 本地分支模板，包含 `type` 和 `text` 字段 |

---

## 📄 style.css

样式文件，采用 CSS 变量实现主题系统。

### 设计系统 (Design Tokens)

#### 通用变量
```css
--sidebar-width: 260px;  /* 侧边栏宽度 */
```

#### 主题变量
| 变量名 | 说明 |
|--------|------|
| `--bg-app` | 应用背景色 |
| `--bg-panel` | 面板/卡片背景色 |
| `--text-primary` | 主要文字颜色 |
| `--text-muted` | 次要文字颜色 |
| `--accent` | 强调色 |
| `--nav-text-active` | 导航激活状态颜色 |
| `--border` | 边框颜色 |
| `--font-serif` | 主字体 |
| `--shadow-card` | 卡片阴影 |
| `--btn-hover` | 按钮悬停背景 |

### 主题定义

#### 默认主题: 黄衣之王 (Yellow)
- 暖色羊皮纸风格
- 强调色: 暗红 `#8a0303`
- 字体: Georgia, Times New Roman

#### 主题 2: 黑色大丽花 (Noir)
- 冷峻黑白打字机风格
- 强调色: 纯黑 `#000000`
- 字体: Courier New

#### 主题 3: 拉莱耶 (Deep)
- 深海科技风格
- 强调色: 青色 `#2aa198`
- 字体: Segoe UI

### 主要样式类

| 类名 | 用途 |
|------|------|
| `.sidebar` | 侧边栏容器 |
| `.nav-item` | 导航项 |
| `.section-card` | 内容区块卡片 |
| `.input-field` | 输入框 |
| `.btn` | 按钮基础样式 |
| `.ai-btn` | AI 操作按钮 |
| `.branch-card` | 剧情分支卡片 |
| `.npc-card` | NPC 卡片 |
| `.scene-box` | 场景区块 |
| `.book-container` | 书本预览容器 |
| `.archive-card` | 存档卡片 |
| `.modal-overlay` | 弹窗遮罩层 |

### 打印样式

```css
@media print { ... }
```
- 隐藏侧边栏和交互元素
- 只显示预览页内容
- 移除阴影和边框

---

## 🔧 扩展开发指南

### 添加新的 AI 生成功能

1. 在 `Engine` 对象中添加新方法
2. 定义 AI Prompt，指定返回的 JSON 格式
3. 调用 `this.callAI(prompt)` 获取结果
4. 将结果渲染到对应的 DOM 元素

### 添加新的 API 提供商

1. 在 `DEFAULT_CONFIGS` 中添加新提供商的默认配置
2. 在 `Engine` 对象中添加对应的调用方法 (如 `callXxx`)
3. 在 `callAI()` 中添加分发逻辑
4. 更新 `index.html` 中的 `select-provider` 下拉选项

### 添加新主题

1. 在 `style.css` 中定义新的 `[data-theme="xxx"]` 选择器
2. 覆盖所有 CSS 变量
3. 在 `index.html` 的 `.theme-switcher` 中添加新按钮

### 数据持久化

所有数据存储使用 `localStorage`:
- `api_provider`: API 类型 (gemini/openai)
- `api_key`: API 密钥
- `api_base_url`: 自定义 Base URL
- `api_model`: 自定义模型名称
- `arkham_archives`: 存档数组 (JSON 字符串)

---

## 📋 依赖说明

- **无外部依赖**: 纯原生 HTML/CSS/JavaScript 实现
- **API 依赖**: 支持 Gemini / OpenAI 及兼容格式
- **浏览器兼容**: 支持现代浏览器 (Chrome, Firefox, Edge, Safari)
