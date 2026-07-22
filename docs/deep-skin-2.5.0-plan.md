# Codex 深度皮肤 2.5.0 产品与实现规划

## 目标

2.5.0 将 2.5、2.6、2.7 三阶段一次性交付：用户只需在安装包中点击“安装 Codex 深度皮肤助手”，随后在 Codex 中输入一句主题关键词，即可完成参考方案、分层素材、主题包、本地应用和真实验收。

典型用法：

```text
用 Codex 深度皮肤助手生成一个钢铁侠主题皮肤
```

参考图是可选增强输入，不是必需输入。没有参考图时，Skill 自动生成首页和任务页两张内部视觉参考，再据此生成可交互的分层素材。

## 原 2.5—2.7 能力映射

本次对外版本统一命名为 `2.5.0`，但完整吸收原规划的三个阶段：

- 原 2.5：V2 深度主题协议、通用分层渲染、大黄蜂迁移、主题创建与校验。
- 原 2.6：`.codexskin` 安全容器、导入导出、主题库安装切换、跨平台引擎命令。
- 原 2.7：关键词驱动 Skill、无参考图自动生成方案、分层素材验收、安装器一键安装 Skill、真实 Codex 截图验证。

阶段编号只用于能力追踪，不再要求用户分别安装或升级三个版本。

## 产品边界

### 安装包负责

- 安装、更新本地皮肤引擎。
- 一键安装或更新 `codex-deep-skin-builder` Skill。
- 显示 Skill 安装状态和版本。
- 启动皮肤版 Codex、管理主题库、恢复官方外观。
- 提供确定性的主题创建、验证、导入、导出、安装、应用和运行验证命令。

安装包不提供多步骤深度定制向导，不要求用户理解图层、尺寸、透明通道或主题配置。

### Skill 负责

- 理解一句话主题需求以及可选参考图。
- 无参考图时自动生成首页、任务页两张内部视觉参考。
- 自动选择视觉方向并生成背景、右侧前景、侧栏幽灵人物、水印、品牌徽标和可选头像。
- 对透明素材去背并检查边缘、裁切和主体覆盖率。
- 生成 V2 主题目录并调用引擎打包为 `.codexskin`。
- 安装到本地皮肤库、应用、验证并返回真实 Codex 截图。
- 仅在关键输入不可推断、图像生成能力缺失或连续生成失败时询问用户。

## 用户流程

```text
打开安装包
  → 点击“安装 Codex 深度皮肤助手”
  → 在 Codex 输入一句主题关键词
  → Skill 自动生成两张内部参考图
  → Skill 自动生成并验收分层素材
  → 生成标准 .codexskin 包
  → 本地安装、应用和截图验收
  → 返回实际效果与恢复方式
```

用户可以用“先看方案，不要应用”“保留皮肤包但不要切换”“人物再小一点”等话语覆盖默认行为。

## V2 主题包协议

主题目录必须自包含，不允许引用目录外文件，不允许携带 JavaScript 或任意 CSS。

```text
my-theme/
├── theme.json
├── background.png
├── foreground-right.png
├── sidebar-character.png
├── watermark.png
├── brand-emblem.png
└── avatar.png
```

示例：

```json
{
  "schemaVersion": 2,
  "kind": "deep-custom",
  "id": "custom-ironman",
  "name": "钢铁侠 · Arc Reactor",
  "appearance": "dark",
  "assets": {
    "background": "background.png",
    "foregroundRight": "foreground-right.png",
    "sidebarCharacter": "sidebar-character.png",
    "watermark": "watermark.png",
    "brandEmblem": "brand-emblem.png",
    "avatar": "avatar.png"
  },
  "brand": {
    "title": "CODEX",
    "subtitle": "MORE THAN CODE"
  },
  "colors": {
    "background": "#111318",
    "panel": "#191c22",
    "accent": "#f0b323",
    "text": "#edf0f1"
  },
  "layout": {
    "foregroundRight": { "width": 520, "right": -24, "bottom": -120, "opacity": 1 },
    "sidebarCharacter": { "size": 138, "positionY": 22, "opacity": 0.075 },
    "watermark": { "width": 170, "positionX": 56, "positionY": 8, "opacity": 0.1 }
  }
}
```

支持的受控图层为：`background`、`foregroundRight`、`sidebarCharacter`、`watermark`、`brandEmblem`、`avatar`。所有位置、尺寸和透明度都经过范围校验并映射为 CSS 变量。

旧版 `schemaVersion: 1` 单背景主题继续可用。

## `.codexskin` 文件

`.codexskin` 是只包含主题清单和受控图片资源的 ZIP 容器。引擎必须验证：

- 入口路径不得为绝对路径，不得包含 `..`、控制字符或反斜杠绕过。
- 不接受符号链接、目录外引用、重复文件名或未声明的可执行内容。
- `theme.json` 不超过 1 MB。
- 单张图片不超过 16 MB，总解包大小不超过 64 MB。
- 图片扩展名、文件签名、像素尺寸和总像素量合法。
- 写入主题库前先在临时目录完整验证，再进行原子发布。

## 引擎命令

统一提供：

```bash
node scripts/deep-theme.mjs create ...
node scripts/deep-theme.mjs validate --theme-dir <dir>
node scripts/deep-theme.mjs export --theme-dir <dir> --out <name.codexskin>
node scripts/deep-theme.mjs import --package <name.codexskin>
node scripts/deep-theme.mjs install --theme-dir <dir>
node scripts/deep-theme.mjs apply --id <theme-id>
node scripts/deep-theme.mjs verify
```

Skill 只编排这些确定性命令，不重复实现安全校验和安装逻辑。

## Skill 结构

```text
skills/codex-deep-skin-builder/
├── SKILL.md
├── agents/openai.yaml
└── references/
    ├── theme-pack-v2.md
    ├── asset-generation.md
    ├── layout-rules.md
    └── acceptance-matrix.md
```

Skill 默认直接完成“生成、保存、应用、验证”。只有用户明确说“先看方案”时才停在概念预览。

## 安装包界面

macOS 与 Windows 安装器只新增一个傻瓜式入口：

```text
安装 Codex 深度皮肤助手
```

未安装时执行安装，已有旧版本时执行更新，当前版本已安装时显示“✓ 深度皮肤助手已安装”。安装完成后显示一句可复制的示例提示。安装 Skill 不上传素材、不要求 API Key，也不改变当前皮肤。

## 验收矩阵

- macOS 与 Windows 安装、更新和 Skill 复制路径。
- `schemaVersion: 1` 与 `schemaVersion: 2` 同时可用。
- V2 主题创建、验证、导入、导出、安装和切换。
- 非法路径、符号链接、超大文件、损坏图片和恶意归档被拒绝。
- 首页、任务页、设置页、右侧面板打开和关闭。
- 常规宽屏、窄窗口、紧凑高度与系统缩放。
- 原生、QQ、单背景自定义、深度主题之间切换无残留。
- 热应用、重启、重复应用和恢复原生。
- Skill 文件通过结构校验，关键词模式与参考图模式均有明确执行合同。
- 最终应用使用真实 Codex CDP 状态和截图验证，而非只检查 DOM 是否存在。

## 2.5.0 完成标准

- 大黄蜂从硬编码主题迁移为标准 V2 自包含主题包。
- 安装器携带并可一键安装 `codex-deep-skin-builder`。
- 用户可只输入主题关键词完成全流程。
- 所有新增命令和跨平台安装路径有自动化测试。
- 本地构建、热应用、Doctor 与真实 Codex 验证通过。
- 本版本只在本地完成，不自动发布或上传。
