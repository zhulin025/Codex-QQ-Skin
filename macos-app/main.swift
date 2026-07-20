import AppKit
import Foundation
import UniformTypeIdentifiers

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var primaryButton: NSButton!
    private var customizeButton: NSButton!
    private var updateButton: NSButton!
    private var restoreButton: NSButton!
    private var busy = false

    private var home: URL { FileManager.default.homeDirectoryForCurrentUser }
    private var installedRoot: URL { home.appendingPathComponent(".codex/codex-qq-skin-studio") }
    private var installedStart: URL { installedRoot.appendingPathComponent("scripts/start-qq-skin-macos.sh") }
    private var bundledRoot: URL {
        Bundle.main.resourceURL!.appendingPathComponent("CodexQQSkin")
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        refreshState()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 520, height: 390),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Codex QQ Skin"
        window.center()
        window.isReleasedWhenClosed = false

        let stack = NSStackView()
        stack.orientation = .vertical
        stack.alignment = .centerX
        stack.spacing = 16
        stack.edgeInsets = NSEdgeInsets(top: 30, left: 36, bottom: 28, right: 36)
        stack.translatesAutoresizingMaskIntoConstraints = false

        let icon = NSImageView(image: NSApp.applicationIconImage)
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 78).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 78).isActive = true

        let title = NSTextField(labelWithString: "Codex QQ Skin")
        title.font = .boldSystemFont(ofSize: 24)

        let subtitle = NSTextField(wrappingLabelWithString: "2.0 支持上传任意图片，自动分析主色、明暗、视觉焦点和安全留白，生成专属 QQ 皮肤。全程仅在本机处理。")
        subtitle.alignment = .center
        subtitle.textColor = .secondaryLabelColor
        subtitle.maximumNumberOfLines = 2
        subtitle.translatesAutoresizingMaskIntoConstraints = false
        subtitle.widthAnchor.constraint(equalToConstant: 420).isActive = true

        statusLabel = NSTextField(labelWithString: "正在检查…")
        statusLabel.alignment = .center

        primaryButton = NSButton(title: "一键安装并启动", target: self, action: #selector(primaryAction))
        primaryButton.bezelStyle = .rounded
        primaryButton.keyEquivalent = "\r"
        primaryButton.controlSize = .large

        customizeButton = NSButton(title: "上传图片，生成我的皮肤…", target: self, action: #selector(customizeSkin))
        customizeButton.bezelStyle = .rounded
        customizeButton.controlSize = .large

        let actions = NSStackView()
        actions.orientation = .horizontal
        actions.spacing = 10
        updateButton = NSButton(title: "重新安装 / 更新", target: self, action: #selector(installOrUpdate))
        restoreButton = NSButton(title: "恢复官方外观", target: self, action: #selector(restore))
        actions.addArrangedSubview(updateButton)
        actions.addArrangedSubview(restoreButton)

        [icon, title, subtitle, statusLabel, primaryButton, customizeButton, actions].forEach(stack.addArrangedSubview)
        window.contentView?.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor),
            stack.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor)
        ])
    }

    private func refreshState() {
        let installed = FileManager.default.isExecutableFile(atPath: installedStart.path)
        statusLabel.stringValue = installed ? "✓ 已安装，可以直接启动" : "尚未安装，点击下方按钮即可完成"
        primaryButton.title = installed ? "启动 Codex QQ Skin" : "一键安装并启动"
        updateButton.isHidden = !installed
        customizeButton.isEnabled = installed && !busy
        restoreButton.isEnabled = installed
    }

    @objc private func primaryAction() {
        if FileManager.default.isExecutableFile(atPath: installedStart.path) {
            run(script: installedStart, arguments: ["--prompt-restart"], progress: "正在启动 QQ 皮肤版 Codex…", success: "Codex QQ Skin 已启动。")
        } else {
            installOrUpdate()
        }
    }

    @objc private func installOrUpdate() {
        guard !busy else { return }
        let alert = NSAlert()
        alert.messageText = "准备安装 Codex QQ Skin"
        alert.informativeText = "安装过程会自动退出正在运行的 Codex，并在完成后重新打开。不会修改官方应用，也不需要管理员密码。"
        alert.addButton(withTitle: "继续安装")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }

        closeCodex {
            let installer = self.bundledRoot.appendingPathComponent("scripts/install-qq-skin-macos.sh")
            self.run(script: installer, arguments: ["--no-launchers"], progress: "正在安装并启动，请稍候…", success: "安装完成。以后双击本应用即可启动。")
        }
    }

    @objc private func customizeSkin() {
        guard FileManager.default.isExecutableFile(atPath: installedStart.path) else {
            showError("请先完成安装，再上传图片生成自定义皮肤。")
            return
        }
        let panel = NSOpenPanel()
        panel.title = "选择一张图片，自动生成 QQ 皮肤"
        panel.prompt = "生成皮肤"
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.png, .jpeg, .webP, .heic, .tiff]
        guard panel.runModal() == .OK, let image = panel.url else { return }

        let fallbackName = image.deletingPathExtension().lastPathComponent
        let nameAlert = NSAlert()
        nameAlert.messageText = "给这套皮肤起个名字"
        nameAlert.informativeText = "图片会留在本机。配色、明暗、焦点和布局将自动生成。"
        let field = NSTextField(string: fallbackName.isEmpty ? "我的 Codex QQ Skin" : fallbackName)
        field.frame = NSRect(x: 0, y: 0, width: 320, height: 24)
        nameAlert.accessoryView = field
        nameAlert.addButton(withTitle: "生成并应用")
        nameAlert.addButton(withTitle: "取消")
        guard nameAlert.runModal() == .alertFirstButtonReturn else { return }
        let themeName = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        let script = installedRoot.appendingPathComponent("scripts/load-image-theme-macos.sh")
        run(
            script: script,
            arguments: ["--file", image.path, "--name", themeName.isEmpty ? "我的 Codex QQ Skin" : themeName],
            progress: "正在分析图片并生成整套皮肤…",
            success: "自定义皮肤已生成并应用。"
        )
    }

    @objc private func restore() {
        let script = installedRoot.appendingPathComponent("scripts/restore-qq-skin-macos.sh")
        run(script: script, arguments: ["--restore-base-theme", "--restart-codex"], progress: "正在恢复官方外观…", success: "已恢复 Codex 官方外观。")
    }

    private func closeCodex(completion: @escaping () -> Void) {
        let apps = NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex")
        apps.forEach { $0.terminate() }
        DispatchQueue.global().async {
            let deadline = Date().addingTimeInterval(18)
            while Date() < deadline && !NSRunningApplication.runningApplications(withBundleIdentifier: "com.openai.codex").isEmpty {
                Thread.sleep(forTimeInterval: 0.25)
            }
            DispatchQueue.main.async(execute: completion)
        }
    }

    private func run(script: URL, arguments: [String], progress: String, success: String) {
        guard !busy else { return }
        guard FileManager.default.fileExists(atPath: script.path) else {
            showError("缺少运行文件：\(script.lastPathComponent)。请重新下载完整应用。")
            return
        }
        setBusy(true, message: progress)

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [script.path] + arguments
        process.currentDirectoryURL = script.deletingLastPathComponent().deletingLastPathComponent()
        var environment = ProcessInfo.processInfo.environment
        environment["HOME"] = home.path
        process.environment = environment
        let output = Pipe()
        process.standardOutput = output
        process.standardError = output

        process.terminationHandler = { process in
            let data = output.fileHandleForReading.readDataToEndOfFile()
            let details = String(data: data, encoding: .utf8) ?? ""
            DispatchQueue.main.async {
                self.setBusy(false, message: process.terminationStatus == 0 ? success : "操作失败")
                self.refreshState()
                if process.terminationStatus != 0 {
                    self.showError(self.friendlyError(details), details: details)
                } else {
                    let alert = NSAlert()
                    alert.messageText = "完成"
                    alert.informativeText = success
                    alert.runModal()
                }
            }
        }
        do { try process.run() } catch {
            setBusy(false, message: "无法启动安装程序")
            showError(error.localizedDescription)
        }
    }

    private func friendlyError(_ details: String) -> String {
        if details.contains("Could not find the official Codex app") { return "没有找到官方 Codex 应用，请先安装并至少打开一次 Codex。" }
        if details.contains("Codex config not found") { return "请先正常打开一次 Codex，随后退出，再重新安装。" }
        if details.contains("signature is not valid") { return "官方 Codex 应用签名校验失败，请重新安装官方版本后再试。" }
        return "操作没有完成。可以展开下方详情查看原因。"
    }

    private func setBusy(_ value: Bool, message: String) {
        busy = value
        statusLabel.stringValue = message
        primaryButton.isEnabled = !value
        customizeButton.isEnabled = !value && FileManager.default.isExecutableFile(atPath: installedStart.path)
        updateButton.isEnabled = !value
        restoreButton.isEnabled = !value
    }

    private func showError(_ message: String, details: String = "") {
        let alert = NSAlert()
        alert.alertStyle = .warning
        alert.messageText = "Codex QQ Skin"
        alert.informativeText = details.isEmpty ? message : "\(message)\n\n\(details.suffix(1800))"
        alert.runModal()
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
