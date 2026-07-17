# Codex QQ Skin

一套面向 macOS Codex 桌面端的复古 QQ 风格外观：双层蓝银标题栏、三栏工作区、QQ 在线资料卡，以及独立的 Codex 伙伴面板。

> 非 OpenAI、腾讯或 QQ 官方产品。本项目不会修改官方 `.app`、`app.asar`、代码签名、API Key 或 Base URL。

## 效果特点

- 38px 深蓝标题行与 29px 蓝银工具行组成一体化复古标题区。
- 左上企鹅与动态任务标题避开 macOS 交通灯，不随窗口宽度拉伸。
- 右上三颗控件直接复用 Codex 原生按钮的 SVG、尺寸与点击行为，不再绘制多余的关闭按钮。
- 自动打开 Codex 原生左侧栏与固定摘要，形成左侧项目、中间对话、右侧摘要的三栏布局。
- 右上保留真实“输出 / 来源 / 进度 / 子代理”，右下显示 Codex 伙伴。
- 左下显示 QQ 风格企鹅头像、当前用户名和绿色在线状态。
- 项目、任务、每轮对话、代码块与输入框使用蓝银旧式面板样式。
- 设置页保持原生双栏结构，进入设置时自动收起任务伙伴卡。
- 一键验证、一键暂停和一键恢复官方外观。

## 系统要求

- macOS（Apple Silicon 或 Intel）。
- 已安装官方 Codex/ChatGPT 桌面端，并至少正常启动过一次。
- 建议窗口宽度不小于 `1180px`，三栏模式才能完整显示。
- 安装前退出 Codex，避免应用正在保存配置。

项目不要求单独安装 Node.js。运行时会验证并使用官方 Codex 应用内签名的 Node.js。

## 最简单的安装方式

1. 从 GitHub 下载 ZIP 并解压。
2. 完全退出 Codex。
3. 双击 `Install Codex QQ Skin.command`。
4. 如果 macOS 首次阻止运行：右键文件，选择“打开”，然后再次确认。
5. 安装完成后，从桌面生成的启动入口打开主题版 Codex。

也可以在终端安装：

```bash
cd Codex-QQ-Skin
chmod +x ./*.command scripts/*.sh tests/*.sh
./scripts/install-dream-skin-macos.sh
```

安装器会把运行引擎复制到：

```text
~/.codex/codex-dream-skin-studio
```

这个目录名沿用基础引擎的兼容路径，不影响仓库名与界面名称。

## 日常使用

安装后可以使用仓库入口：

- `Start Codex QQ Skin.command`：启动复古主题。
- `Customize Codex QQ Skin.command`：导入自己的背景图。
- `Verify Codex QQ Skin.command`：检查签名、运行时、注入结果并截图。
- `Restore Codex QQ Skin.command`：停止主题并恢复官方外观。
- `Install Menu Bar.command`：安装可选的 SwiftBar 菜单栏入口。

终端对应命令：

```bash
./scripts/start-dream-skin-macos.sh
./scripts/doctor-macos.sh --require-live
./scripts/pause-dream-skin-macos.sh
./scripts/restore-dream-skin-macos.sh --restore-base-theme --restart-codex
```

## 更换背景图

```bash
./scripts/load-image-theme-macos.sh /绝对路径/你的图片.png \
  --appearance light \
  --safe-area center \
  --task-mode off
```

重新执行启动脚本即可应用。QQ 标题栏、三栏布局和伙伴卡不会被替换。

## 验证与开发

```bash
npm test
./scripts/doctor-macos.sh
```

测试覆盖注入 payload、图片元数据、主题切换、UTF-8 配置往返、回环 CDP 限制、清理恢复和官方签名检查。

## 目录结构

```text
assets/      外框、企鹅、CSS 与 renderer 注入代码
presets/     经典 Codex QQ 三栏预设
scripts/     安装、启动、验证、换图、暂停和恢复脚本
menubar/     可选 SwiftBar 菜单插件
tests/       macOS 自动化回归测试
```

仓库只保留当前 macOS QQ 皮肤实际使用的代码和素材，不包含 Windows 版本、旧人物预设、概念图库、历史事故记录或废弃标题栏图片。

## 工作原理与安全边界

Codex QQ Skin 通过仅监听 `127.0.0.1` 的 Chromium DevTools Protocol，把 CSS、透明外框和少量非交互装饰注入 Codex renderer。侧栏、对话、输入框、输出和来源依然是 Codex 原生 DOM。

- 不写入官方安装目录。
- 不修改 `app.asar` 和应用签名。
- WebSocket 只接受经过校验的 loopback Codex 页面端点。
- 调试端口开启期间，不要运行来源不明的本机程序。
- 恢复脚本会停止 watcher、移除注入并恢复保存的外观配置。

## 来源说明

本项目使用并改造了 [Codex Dream Skin](https://github.com/Fei-Away/Codex-Dream-Skin) macOS 源码，包括回环 CDP 启动器、renderer 注入器、主题配置保护、签名验证和恢复流程。

在此基础上，本仓库重新实现了 QQ 复古双层标题栏、三栏自动布局、原生摘要对齐、Codex 伙伴卡、QQ 在线用户卡、响应式窗框和相应测试。

## 商标与素材声明

- Codex、ChatGPT 与 OpenAI 名称及相关权利属于其权利人。
- QQ 与腾讯名称及相关权利属于其权利人。
- 本仓库企鹅为 AI 生成的非官方复古风格素材，不代表腾讯或 QQ 官方图标授权。
- `codex-pet.png` 与复古外框仅作为本项目的界面装饰素材。
- 商业分发前请自行完成商标、素材和当地法律审查。

## License

[MIT License](./LICENSE)
