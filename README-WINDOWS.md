# ChatGPT QQ Skin for Windows 2.3.1

Windows 10/11 x64 原生 C# GUI 版本。安装器提供“一键安装并启动”和“上传图片生成皮肤”两个入口，并内置运行引擎与 Node.js，无需用户另外安装依赖。

项目不会修改官方 ChatGPT/Codex 安装目录、`app.asar`、API Key 或 Base URL。皮肤通过仅监听 `127.0.0.1` 的 Chromium DevTools Protocol 注入。

## 下载

从 [GitHub Releases](https://github.com/zhulin025/Codex-QQ-Skin/releases) 下载：

```text
ChatGPT QQ Skin Setup 2.3.1.exe
ChatGPT QQ Skin Setup 2.3.1.exe.sha256
```

当前 EXE 尚未使用商业代码签名，Windows SmartScreen 可能在首次运行时显示提示。请只从本项目正式 Release 下载，并核对 SHA-256。

## 系统要求

- Windows 10/11 x64。
- 已安装 Microsoft Store/MSIX 或普通安装版 ChatGPT/Codex 桌面客户端。
- 官方客户端至少成功启动过一次。
- 建议安装前保存正在进行的任务；安装器可能需要重新启动 ChatGPT。

## 安装与使用

1. 双击 `ChatGPT QQ Skin Setup 2.3.1.exe`。
2. 点击“一键安装并启动”。安装器会安装或升级引擎、启动 ChatGPT、注入并验证皮肤。
3. 点击“上传图片生成皮肤”，选择 PNG、JPEG 或 WebP 图片，即可在本机生成并应用自定义皮肤。
4. ChatGPT 右上角可在 `原生 / QQ / 自定义` 三种模式间即时切换。

图片分析完全在本机完成，不会上传用户图片。支持最大 16 MB、单边不超过 16384 像素且总像素不超过 5000 万的 PNG、JPEG 和 WebP。

## 2.3.1 更新

- 修复聊天浮窗透明和右侧内容重叠，QQ 顶部菜单新增可双向切换的“插件 / 技能”入口。
- 版本号对齐 macOS 2.3.1。
- 继续包含 2.3.0：启动时自动检查 GitHub Release、用户确认升级并校验 SHA-256。

## 2.2.1 更新

- 版本号对齐 macOS 2.2.1。
- 共享注入引擎：自定义背景模糊相关改动。
- 继续包含 2.1.x：语言参数、中文调试提示、窗口拖动与空数组启动误报等修复。

## 2.1 功能

- 原生 WinForms 安装器与 macOS 版相同的应用图标。
- 支持普通 EXE 和 Microsoft Store/MSIX 版 ChatGPT。
- QQ 2007 风格标题栏、工具栏、项目导航、三栏任务布局和伙伴面板。
- Windows 专属标题栏和设置页布局适配。
- 自定义图片作为窗口级 `cover` 背景，连续覆盖新建任务、任务详情和左侧栏。
- 安装成功状态直接反馈到 GUI，不等待常驻注入器退出。
- 升级时安全校验并停止旧注入器，随后重试替换引擎目录。

## 数据位置

- 引擎：`%LOCALAPPDATA%\CodexQQSkin\engine`
- 主题、日志和状态：`%APPDATA%\CodexQQSkin`
- 桌面启动入口：`ChatGPT QQ Skin.cmd`

## 手动入口

完整源码包仍提供以下脚本：

- `Start Codex QQ Skin Windows.cmd`
- `Customize Codex QQ Skin Windows.cmd`
- `Verify Codex QQ Skin Windows.cmd`
- `Restore Codex QQ Skin Windows.cmd`

如果自动检测不到普通 EXE 安装版，可以在 PowerShell 中设置：

```powershell
$env:CODEX_EXE = 'C:\完整路径\ChatGPT.exe'
.\scripts\windows\install-qq-skin-windows.ps1
```

## 构建

需要 **Windows 10/11** 或 GitHub Actions `windows-2022`。macOS 无法直接生成本安装器 `.exe`。

```powershell
.\scripts\windows\build-gui-installer.ps1 -UseInstalledNode -OutputFileName 'ChatGPT QQ Skin Setup 2.3.1.exe'
```

不使用 `-UseInstalledNode` 时，构建脚本会下载官方 Node.js 运行时并校验 SHA-256。输出文件保存在 `release` 目录。

发布时也可在仓库 Actions 中运行 `Publish release assets`，输入已有 draft tag（如 `v2.3.1`），由 CI 构建并上传 EXE。

## 安全说明

- CDP 只绑定 `127.0.0.1`。
- WebSocket 目标必须是本机指定端口下的 `app://` 页面。
- 停止旧注入器前会核验 PID、可执行文件、脚本路径和端口。
- 不修改或重新签名官方 ChatGPT/Codex 文件。
