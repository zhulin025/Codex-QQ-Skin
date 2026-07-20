# Codex QQ Skin for Windows（预览版）

这是 Codex QQ Skin 的 Windows x64 便携版本。它不会修改官方 Codex 安装目录、`app.asar`、API Key 或 Base URL，而是通过仅监听 `127.0.0.1` 的 Chromium DevTools Protocol 注入皮肤。

## 系统要求

- Windows 10/11 x64。
- 已安装官方 Codex 桌面端，并至少成功启动过一次。
- 完全退出 Codex 后再安装。
- 从完整发布 ZIP 解压运行；不要只复制单个 CMD 文件。

## 安装与使用

1. 解压 `Codex-QQ-Skin-Windows-x64-v*.zip`。
2. 双击 `Install Codex QQ Skin Windows.cmd`。
3. 安装后可以双击桌面生成的 `Codex QQ Skin.cmd` 启动。
4. 双击 `Customize Codex QQ Skin Windows.cmd`，选择一张图片即可在本机自动生成并应用整套皮肤方案。
5. `Verify Codex QQ Skin Windows.cmd` 会验证运行状态并在桌面保存截图。
6. `Restore Codex QQ Skin Windows.cmd` 会停止注入器并恢复安装前保存的官方外观设置。

2.0 的图片分析全程在本机完成，会自动计算主色、明暗、视觉焦点、安全留白、画面构图和任务页呈现方式，不会上传用户图片。支持 PNG、JPEG 和 WebP，文件上限为 16 MB，单边不超过 16384 像素且总像素不超过 5000 万。

右上角可在 `原生 / QQ / 自定义` 三种模式之间切换。QQ 皮肤始终使用固定内置素材；用户图片只生成基于 Codex 原生布局的自定义皮肤，不会覆盖 QQ 皮肤。

运行引擎安装到 `%LOCALAPPDATA%\CodexQQSkin\engine`，主题、日志和运行状态保存在 `%APPDATA%\CodexQQSkin`。发布包已经包含独立 Node.js 运行时，用户不需要另行安装 Node.js。

如果安装器找不到 Codex，可以先在 PowerShell 中设置官方程序的完整路径：

```powershell
$env:CODEX_EXE = 'C:\完整路径\Codex.exe'
.\scripts\windows\install-qq-skin-windows.ps1
```

## 当前验证状态

GitHub Actions 的 Windows Server Runner 会自动检查 PowerShell 语法、Node 注入 payload、主题备份的平台隔离、ZIP 内容和 SHA-256。真实 Codex Windows 客户端的安装路径、启动参数、界面注入、退出恢复以及 SmartScreen 表现仍需在一台真实 Windows 10/11 机器上验收。
