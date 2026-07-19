<p align="center">
  <img src="./website/project-logo.png" width="180" alt="Codex QQ Skin 项目 Logo">
</p>

# Codex QQ Skin

一套面向 macOS Codex 桌面端的复古 QQ 风格外观：双层蓝银标题栏、三栏工作区、QQ 在线资料卡，以及独立的 Codex 伙伴面板。

> 非 OpenAI、腾讯或 QQ 官方产品。本项目不会修改官方 `.app`、`app.asar`、代码签名、API Key 或 Base URL。

## 效果预览

### 任务详情

![Codex QQ Skin 任务详情界面](./assets/任务详情截图.png)

### 新建任务

![Codex QQ Skin 新建任务界面](./assets/新建任务截图.png)

## 安装

安装前请确保官方 Codex/ChatGPT 桌面端至少成功启动过一次，并完全退出 Codex。项目不要求另行安装 Node.js。

### 安装方式 1：通过终端安装（推荐）

1. 在 GitHub 项目页点击 **Code → Download ZIP**，下载后解压。
2. 打开“终端”，依次执行：

```bash
cd ~/Downloads/Codex-QQ-Skin
xattr -dr com.apple.quarantine .
chmod +x ./*.command scripts/*.sh
./scripts/install-qq-skin-macos.sh
```

如果项目不在 `~/Downloads/Codex-QQ-Skin`，请输入 `cd `（末尾保留空格），将解压后的项目文件夹拖进终端窗口，然后按回车，再执行后面三条命令。

`xattr` 命令用于移除 GitHub 下载文件的 macOS 隔离标记。请只对确认来自本项目官方仓库的文件执行该命令，不需要使用 `sudo`。

### 安装方式 2：双击命令文件

1. 在 GitHub 项目页点击 **Code → Download ZIP**，下载后解压。
2. 完全退出 Codex。
3. 双击 `Install Codex QQ Skin.command`。
4. 等待安装完成，然后使用桌面上生成的 `Codex QQ Skin.command` 启动主题版 Codex。

如果 macOS 提示“Apple 无法验证”：

1. 先右键 `Install Codex QQ Skin.command`，选择“打开”，然后再次确认。
2. 如果仍被拦截，请打开“系统设置 → 隐私与安全性”，在安全提示处点击“仍要打开”并完成身份验证。
3. 如果系统没有显示“仍要打开”，请改用上面的“安装方式 1”，通过 `xattr` 命令移除隔离标记后安装。

运行引擎会安装到 `~/.codex/codex-qq-skin-studio`，主题和运行状态保存在 `~/Library/Application Support/CodexQQSkin`。

## 效果特点

- 38px 深蓝标题行与 29px 蓝银工具行组成一体化复古标题区。
- 左上企鹅与动态任务标题避开 macOS 交通灯，不随窗口宽度拉伸。
- 右上三颗控件直接复用 Codex 原生按钮的 SVG、尺寸与点击行为，不再绘制多余的关闭按钮。
- 自动打开 Codex 原生左侧栏与固定摘要，形成左侧项目、中间对话、右侧摘要的三栏布局。
- 右上保留真实“输出 / 来源 / 进度 / 子代理”，右下显示 Codex 伙伴。
- 左下显示 QQ 风格企鹅头像、当前用户名和绿色在线状态。
- Codex 完成任务时播放原创“咳咳”声，需要授权时播放另一组急促“滴滴”声；伙伴卡右下可一键静音。
- 项目、任务、每轮对话、代码块与输入框使用蓝银旧式面板样式。
- 设置页保持原生双栏结构，进入设置时自动收起任务伙伴卡。
- 一键验证、一键暂停和一键恢复官方外观。

## 系统要求

- macOS（Apple Silicon 或 Intel）。
- 已安装官方 Codex/ChatGPT 桌面端，并至少正常启动过一次。
- 建议窗口宽度不小于 `1180px`，三栏模式才能完整显示。
- 安装前退出 Codex，避免应用正在保存配置。

项目不要求单独安装 Node.js。运行时会验证并使用官方 Codex 应用内签名的 Node.js。

## 日常使用

安装后可以使用仓库入口：

- `Start Codex QQ Skin.command`：启动复古主题。
- `Customize Codex QQ Skin.command`：导入自己的背景图。
- `Verify Codex QQ Skin.command`：检查签名、运行时、注入结果并截图。
- `Restore Codex QQ Skin.command`：停止主题并恢复官方外观。
- `Install Menu Bar.command`：安装可选的 SwiftBar 菜单栏入口。

终端对应命令：

```bash
./scripts/start-qq-skin-macos.sh
./scripts/doctor-macos.sh --require-live
./scripts/pause-qq-skin-macos.sh
./scripts/restore-qq-skin-macos.sh --restore-base-theme --restart-codex
```

## 更换背景图

```bash
./scripts/load-image-theme-macos.sh /绝对路径/你的图片.png \
  --appearance light \
  --safe-area center \
  --task-mode off
```

重新执行启动脚本即可应用。QQ 标题栏、三栏布局和伙伴卡不会被替换。

## 任务提示音

提示音默认开启，音量约为 48%。完成提示音使用耳聆网页面标注为 CC0 的“QQ系统消息提示音”，其他提示音由 Web Audio 在本地实时合成：

- 任务从“运行中”切换到完成：播放两段短促“咳咳”声。
- 新出现命令或操作授权卡片：播放四段急促“滴滴”声，同一张授权卡片只提醒一次。
- 首次打开皮肤并与窗口交互，或网络从离线恢复在线：播放两段“敲门”声。
- 手动点击停止任务、切换任务、热更新皮肤不会误报完成。
- 在右侧「Codex 伙伴」卡片点击「🔊 提示音」可静音，设置会保存在本机。

自定义主题也可以在 `theme.json` 中调整：

```json
"sound": {
  "enabled": true,
  "volume": 0.48,
  "completed": "cough",
  "approval": "alert",
  "online": "knock"
}
```

`completed` 还可设为 `didi`，`approval` 和 `online` 也可设为 `didi`，`volume` 范围为 `0..1`。首次使用时需要先在 Codex 窗口内点击或按键一次，以满足 Chromium 的音频播放规则。

咳嗽声的来源、页面许可声明和文件校验值见 [`assets/audio/qq-system-cough.LICENSE.md`](assets/audio/qq-system-cough.LICENSE.md)。

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
