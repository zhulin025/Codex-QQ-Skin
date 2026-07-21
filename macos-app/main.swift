import AppKit
import Foundation
import UniformTypeIdentifiers

struct ThemeLibraryItem {
    let id: String
    let name: String
    let kind: String
    let active: Bool
}

final class AppDelegate: NSObject, NSApplicationDelegate, NSTableViewDataSource, NSTableViewDelegate {
    private var window: NSWindow!
    private var statusLabel: NSTextField!
    private var primaryButton: NSButton!
    private var customizeButton: NSButton!
    private var applyThemeButton: NSButton!
    private var deleteThemeButton: NSButton!
    private var openLibraryButton: NSButton!
    private var refreshLibraryButton: NSButton!
    private var updateButton: NSButton!
    private var restoreButton: NSButton!
    private var tableView: NSTableView!
    private var libraryLabel: NSTextField!
    private var busy = false
    private var themes: [ThemeLibraryItem] = []

    private var home: URL { FileManager.default.homeDirectoryForCurrentUser }
    private var installedRoot: URL { home.appendingPathComponent(".codex/codex-qq-skin-studio") }
    private var installedStart: URL { installedRoot.appendingPathComponent("scripts/start-qq-skin-macos.sh") }
    private var stateRoot: URL {
        home.appendingPathComponent("Library/Application Support/CodexQQSkin")
    }
    private var bundledRoot: URL {
        Bundle.main.resourceURL!.appendingPathComponent("CodexQQSkin")
    }
    private var scriptRoot: URL {
        FileManager.default.isExecutableFile(atPath: installedStart.path) ? installedRoot : bundledRoot
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        refreshState()
        reloadThemeLibrary()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 540, height: 620),
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
        stack.spacing = 12
        stack.edgeInsets = NSEdgeInsets(top: 22, left: 28, bottom: 20, right: 28)
        stack.translatesAutoresizingMaskIntoConstraints = false

        let icon = NSImageView(image: NSApp.applicationIconImage)
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 64).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 64).isActive = true

        let title = NSTextField(labelWithString: "Codex QQ Skin")
        title.font = .boldSystemFont(ofSize: 22)

        let subtitle = NSTextField(wrappingLabelWithString: "App 管理皮肤库，Codex 内可轻量切换最近自定义皮肤。QQ 与自定义互不混用。")
        subtitle.alignment = .center
        subtitle.textColor = .secondaryLabelColor
        subtitle.maximumNumberOfLines = 2
        subtitle.translatesAutoresizingMaskIntoConstraints = false
        subtitle.widthAnchor.constraint(equalToConstant: 460).isActive = true

        statusLabel = NSTextField(labelWithString: "正在检查…")
        statusLabel.alignment = .center

        primaryButton = NSButton(title: "一键安装并启动", target: self, action: #selector(primaryAction))
        primaryButton.bezelStyle = .rounded
        primaryButton.keyEquivalent = "\r"
        primaryButton.controlSize = .large

        customizeButton = NSButton(title: "上传图片，生成我的皮肤…", target: self, action: #selector(customizeSkin))
        customizeButton.bezelStyle = .rounded
        customizeButton.controlSize = .large

        libraryLabel = NSTextField(labelWithString: "我的皮肤库")
        libraryLabel.font = .boldSystemFont(ofSize: 13)
        libraryLabel.alignment = .left

        tableView = NSTableView()
        tableView.headerView = nil
        tableView.rowHeight = 28
        tableView.allowsEmptySelection = true
        tableView.allowsMultipleSelection = false
        tableView.dataSource = self
        tableView.delegate = self
        let nameColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("name"))
        nameColumn.title = "名称"
        nameColumn.width = 280
        let kindColumn = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("kind"))
        kindColumn.title = "类型"
        kindColumn.width = 120
        tableView.addTableColumn(nameColumn)
        tableView.addTableColumn(kindColumn)

        let scroll = NSScrollView()
        scroll.documentView = tableView
        scroll.hasVerticalScroller = true
        scroll.borderType = .bezelBorder
        scroll.translatesAutoresizingMaskIntoConstraints = false
        scroll.heightAnchor.constraint(equalToConstant: 180).isActive = true
        scroll.widthAnchor.constraint(equalToConstant: 460).isActive = true

        let libraryActions = NSStackView()
        libraryActions.orientation = .horizontal
        libraryActions.spacing = 8
        applyThemeButton = NSButton(title: "应用选中", target: self, action: #selector(applySelectedTheme))
        deleteThemeButton = NSButton(title: "删除", target: self, action: #selector(deleteSelectedTheme))
        refreshLibraryButton = NSButton(title: "刷新", target: self, action: #selector(reloadThemeLibrary))
        openLibraryButton = NSButton(title: "打开文件夹", target: self, action: #selector(openThemesFolder))
        for button in [applyThemeButton, deleteThemeButton, refreshLibraryButton, openLibraryButton] {
            button?.bezelStyle = .rounded
            libraryActions.addArrangedSubview(button!)
        }

        let actions = NSStackView()
        actions.orientation = .horizontal
        actions.spacing = 10
        updateButton = NSButton(title: "重新安装 / 更新", target: self, action: #selector(installOrUpdate))
        restoreButton = NSButton(title: "恢复官方外观", target: self, action: #selector(restore))
        actions.addArrangedSubview(updateButton)
        actions.addArrangedSubview(restoreButton)

        [
            icon, title, subtitle, statusLabel, primaryButton, customizeButton,
            libraryLabel, scroll, libraryActions, actions,
        ].forEach(stack.addArrangedSubview)
        window.contentView?.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor),
            stack.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor),
            stack.topAnchor.constraint(equalTo: window.contentView!.topAnchor),
            stack.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor),
        ])
    }

    func numberOfRows(in tableView: NSTableView) -> Int { themes.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row >= 0, row < themes.count else { return nil }
        let item = themes[row]
        let text = NSTextField(labelWithString: "")
        text.isEditable = false
        text.isBordered = false
        text.backgroundColor = .clear
        if tableColumn?.identifier.rawValue == "kind" {
            text.stringValue = item.kind == "qq-stable" ? "QQ 固定" : "自定义"
            text.textColor = .secondaryLabelColor
        } else {
            text.stringValue = item.active ? "✓ \(item.name)" : item.name
            text.font = item.active ? .boldSystemFont(ofSize: 12) : .systemFont(ofSize: 12)
        }
        return text
    }

    private func selectedTheme() -> ThemeLibraryItem? {
        let row = tableView.selectedRow
        guard row >= 0, row < themes.count else { return nil }
        return themes[row]
    }

    private func refreshState() {
        let installed = FileManager.default.isExecutableFile(atPath: installedStart.path)
        let bundledVersion = skinVersion(at: bundledRoot) ?? "未知"
        if !installed {
            statusLabel.stringValue = "尚未安装，点击下方按钮即可完成（App \(bundledVersion)）"
            primaryButton.title = "一键安装并启动"
        } else if engineNeedsUpdate() {
            let installedVersion = skinVersion(at: installedRoot) ?? "旧版"
            statusLabel.stringValue = "✓ 已安装 \(installedVersion)，启动时会自动更新到 \(bundledVersion)"
            primaryButton.title = "更新并启动"
        } else {
            statusLabel.stringValue = "✓ 已安装 \(bundledVersion)，可以直接启动"
            primaryButton.title = "启动 Codex QQ Skin"
        }
        updateButton.isHidden = !installed
        let enabled = installed && !busy
        customizeButton.isEnabled = enabled
        applyThemeButton.isEnabled = enabled
        deleteThemeButton.isEnabled = enabled
        refreshLibraryButton.isEnabled = enabled
        openLibraryButton.isEnabled = enabled
        restoreButton.isEnabled = installed
        libraryLabel.stringValue = installed ? "我的皮肤库（\(themes.count)）" : "我的皮肤库（安装后可用）"
    }

    private func skinVersion(at root: URL) -> String? {
        let common = root.appendingPathComponent("scripts/common-macos.sh")
        guard let text = try? String(contentsOf: common, encoding: .utf8) else { return nil }
        for line in text.components(separatedBy: .newlines) {
            let trimmed = line.trimmingCharacters(in: .whitespaces)
            guard trimmed.hasPrefix("SKIN_VERSION=") else { continue }
            return trimmed
                .dropFirst("SKIN_VERSION=".count)
                .trimmingCharacters(in: CharacterSet(charactersIn: "\"'"))
        }
        return nil
    }

    private func engineNeedsUpdate() -> Bool {
        guard FileManager.default.isExecutableFile(atPath: installedStart.path) else { return true }
        if let start = try? String(contentsOf: installedStart, encoding: .utf8),
           start.contains("${MODE_ARGS[@]}") || start.contains("${mode_args[@]}") {
            return true
        }
        let listScript = installedRoot.appendingPathComponent("scripts/list-themes-macos.sh")
        if !FileManager.default.isExecutableFile(atPath: listScript.path) { return true }
        let bundled = skinVersion(at: bundledRoot)
        let installed = skinVersion(at: installedRoot)
        guard let bundled, let installed else { return bundled != installed }
        return bundled != installed
    }

    @objc private func reloadThemeLibrary() {
        guard FileManager.default.isExecutableFile(atPath: installedStart.path) else {
            themes = []
            tableView.reloadData()
            refreshState()
            return
        }
        let script = scriptRoot.appendingPathComponent("scripts/list-themes-macos.sh")
        runCapturing(script: script, arguments: ["--json"]) { [weak self] code, output in
            guard let self else { return }
            if code != 0 {
                self.themes = []
                self.tableView.reloadData()
                self.refreshState()
                return
            }
            guard let data = output.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rows = json["themes"] as? [[String: Any]] else {
                self.themes = []
                self.tableView.reloadData()
                self.refreshState()
                return
            }
            self.themes = rows.compactMap { row in
                guard let id = row["id"] as? String, let name = row["name"] as? String else { return nil }
                return ThemeLibraryItem(
                    id: id,
                    name: name,
                    kind: (row["kind"] as? String) ?? "custom-native",
                    active: (row["active"] as? Bool) ?? false
                )
            }
            self.tableView.reloadData()
            if let activeIndex = self.themes.firstIndex(where: \.active) {
                self.tableView.selectRowIndexes(IndexSet(integer: activeIndex), byExtendingSelection: false)
            }
            self.refreshState()
        }
    }

    @objc private func applySelectedTheme() {
        guard let theme = selectedTheme() else {
            showError("请先在列表中选中一套皮肤。")
            return
        }
        let script = scriptRoot.appendingPathComponent("scripts/switch-theme-macos.sh")
        run(
            script: script,
            arguments: ["--id", theme.id],
            progress: "正在应用「\(theme.name)」…",
            success: "已切换到「\(theme.name)」。",
            onSuccess: { [weak self] in self?.reloadThemeLibrary() }
        )
    }

    @objc private func deleteSelectedTheme() {
        guard let theme = selectedTheme() else {
            showError("请先在列表中选中一套皮肤。")
            return
        }
        if theme.kind == "qq-stable" || theme.id.hasPrefix("preset-") {
            showError("内置 QQ / 预设皮肤不能删除。")
            return
        }
        if theme.active {
            showError("不能删除当前正在使用的皮肤，请先切换到其他皮肤。")
            return
        }
        let alert = NSAlert()
        alert.messageText = "删除「\(theme.name)」？"
        alert.informativeText = "只会从皮肤库移除，不会修改 Codex 官方应用。"
        alert.addButton(withTitle: "删除")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let script = scriptRoot.appendingPathComponent("scripts/remove-theme-macos.sh")
        run(
            script: script,
            arguments: ["--id", theme.id],
            progress: "正在删除「\(theme.name)」…",
            success: "已删除「\(theme.name)」。",
            onSuccess: { [weak self] in self?.reloadThemeLibrary() }
        )
    }

    @objc private func openThemesFolder() {
        let url = stateRoot.appendingPathComponent("themes")
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        NSWorkspace.shared.open(url)
    }

    @objc private func primaryAction() {
        if FileManager.default.isExecutableFile(atPath: installedStart.path) {
            if engineNeedsUpdate() {
                closeCodex {
                    let installer = self.bundledRoot.appendingPathComponent("scripts/install-qq-skin-macos.sh")
                    self.run(
                        script: installer,
                        arguments: ["--no-launchers"],
                        progress: "发现旧引擎，正在更新到 App 内置版本并启动…",
                        success: "引擎已更新，Codex QQ Skin 已启动。",
                        onSuccess: { [weak self] in self?.reloadThemeLibrary() }
                    )
                }
            } else {
                run(
                    script: installedStart,
                    arguments: ["--prompt-restart"],
                    progress: "正在启动 QQ 皮肤版 Codex…",
                    success: "Codex QQ Skin 已启动。"
                )
            }
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
            self.run(
                script: installer,
                arguments: ["--no-launchers"],
                progress: "正在安装并启动，请稍候…",
                success: "安装完成。以后双击本应用即可启动。",
                onSuccess: { [weak self] in self?.reloadThemeLibrary() }
            )
        }
    }

    @objc private func customizeSkin() {
        guard FileManager.default.isExecutableFile(atPath: installedStart.path) else {
            showError("请先完成安装，再上传图片生成自定义皮肤。")
            return
        }
        let panel = NSOpenPanel()
        panel.title = "选择一张图片，自动生成皮肤"
        panel.prompt = "生成皮肤"
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.allowsMultipleSelection = false
        panel.allowedContentTypes = [.png, .jpeg, .webP, .heic, .tiff]
        guard panel.runModal() == .OK, let image = panel.url else { return }

        let fallbackName = image.deletingPathExtension().lastPathComponent
        let nameAlert = NSAlert()
        nameAlert.messageText = "给这套皮肤起个名字"
        nameAlert.informativeText = "图片会留在本机，并自动加入皮肤库。"
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
            success: "自定义皮肤已生成并应用。",
            onSuccess: { [weak self] in self?.reloadThemeLibrary() }
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

    private func run(
        script: URL,
        arguments: [String],
        progress: String,
        success: String,
        onSuccess: (() -> Void)? = nil
    ) {
        guard !busy else { return }
        guard FileManager.default.fileExists(atPath: script.path) else {
            showError("缺少运行文件：\(script.lastPathComponent)。请重新下载完整应用，或点「重新安装 / 更新」。")
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
                    onSuccess?()
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

    private func runCapturing(script: URL, arguments: [String], completion: @escaping (Int32, String) -> Void) {
        guard FileManager.default.fileExists(atPath: script.path) else {
            completion(1, "")
            return
        }
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [script.path] + arguments
        process.currentDirectoryURL = script.deletingLastPathComponent().deletingLastPathComponent()
        var environment = ProcessInfo.processInfo.environment
        environment["HOME"] = home.path
        process.environment = environment
        let output = Pipe()
        process.standardOutput = output
        process.standardError = Pipe()
        process.terminationHandler = { process in
            let data = output.fileHandleForReading.readDataToEndOfFile()
            let text = String(data: data, encoding: .utf8) ?? ""
            DispatchQueue.main.async { completion(process.terminationStatus, text) }
        }
        do { try process.run() } catch { DispatchQueue.main.async { completion(1, "") } }
    }

    private func friendlyError(_ details: String) -> String {
        if details.contains("Could not find the official Codex app") { return "没有找到官方 Codex 应用，请先安装并至少打开一次 Codex。" }
        if details.contains("Codex config not found") { return "请先正常打开一次 Codex，随后退出，再重新安装。" }
        if details.contains("signature is not valid") { return "官方 Codex 应用签名校验失败，请重新安装官方版本后再试。" }
        if details.contains("MODE_ARGS") || details.contains("unbound variable") {
            return "检测到旧版启动脚本。请点击「重新安装 / 更新」，或直接再点一次主按钮以自动刷新引擎。"
        }
        if details.contains("currently active") { return "不能删除当前正在使用的皮肤，请先切换到其他皮肤。" }
        if details.contains("Built-in preset") { return "内置预设皮肤不能删除。" }
        return "操作没有完成。可以展开下方详情查看原因。"
    }

    private func setBusy(_ value: Bool, message: String) {
        busy = value
        statusLabel.stringValue = message
        primaryButton.isEnabled = !value
        let installed = FileManager.default.isExecutableFile(atPath: installedStart.path)
        customizeButton.isEnabled = !value && installed
        applyThemeButton.isEnabled = !value && installed
        deleteThemeButton.isEnabled = !value && installed
        refreshLibraryButton.isEnabled = !value && installed
        openLibraryButton.isEnabled = !value && installed
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
