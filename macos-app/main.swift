import AppKit
import CryptoKit
import Foundation
import UniformTypeIdentifiers

private let releaseAPI = URL(string: "https://api.github.com/repos/zhulin025/Codex-QQ-Skin/releases/latest")!

private struct GitHubRelease: Decodable {
    struct Asset: Decodable {
        let name: String
        let browser_download_url: URL
    }
    let tag_name: String
    let html_url: URL
    let body: String?
    let assets: [Asset]
}

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
    private var skillButton: NSButton!
    private var skillStatusLabel: NSTextField!
    private var customizeButton: NSButton!
    private var restoreButton: NSButton!
    private var tableView: NSTableView!
    private var libraryLabel: NSTextField!
    private var tabControl: NSSegmentedControl!
    private var launchPane: NSStackView!
    private var libraryPane: NSStackView!
    private var busy = false
    private var themes: [ThemeLibraryItem] = []

    private var home: URL { FileManager.default.homeDirectoryForCurrentUser }
    private var installedRoot: URL { home.appendingPathComponent(".codex/codex-qq-skin-studio") }
    private var installedStart: URL { installedRoot.appendingPathComponent("scripts/start-qq-skin-macos.sh") }
    private var installedSkill: URL { home.appendingPathComponent(".codex/skills/codex-deep-skin-builder/SKILL.md") }
    private var bundledSkill: URL { bundledRoot.appendingPathComponent("skills/codex-deep-skin-builder/SKILL.md") }
    private var bundledRoot: URL {
        Bundle.main.resourceURL!.appendingPathComponent("CodexQQSkin")
    }
    private var scriptRoot: URL {
        FileManager.default.isExecutableFile(atPath: installedStart.path) ? installedRoot : bundledRoot
    }

    private func bundledSkillIsCurrent() -> Bool {
        guard let installedData = try? Data(contentsOf: installedSkill),
              let bundledData = try? Data(contentsOf: bundledSkill) else { return false }
        return installedData == bundledData
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildWindow()
        refreshState()
        reloadThemeLibrary()
        window.makeKeyAndOrderFront(nil)
        NSApp.activate(ignoringOtherApps: true)
        checkForUpdates()
    }

    private var appVersion: String {
        Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0.0.0"
    }

    private func checkForUpdates() {
        var request = URLRequest(url: releaseAPI)
        request.timeoutInterval = 12
        request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")
        request.setValue("Codex-QQ-Skin/\(appVersion)", forHTTPHeaderField: "User-Agent")
        URLSession.shared.dataTask(with: request) { [weak self] data, _, _ in
            guard let self, let data,
                  let release = try? JSONDecoder().decode(GitHubRelease.self, from: data),
                  VersionPolicy.serverUpdateAvailable(remote: release.tag_name, current: self.appVersion) else { return }
            DispatchQueue.main.async { self.offerUpdate(release) }
        }.resume()
    }

    private func offerUpdate(_ release: GitHubRelease) {
        guard !busy else { return }
        let alert = NSAlert()
        alert.messageText = "发现新版本 \(release.tag_name)"
        let notes = (release.body ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        alert.informativeText = "当前版本：\(appVersion)\n\n\(notes.isEmpty ? "建议升级到最新版本。" : String(notes.prefix(700)))"
        alert.addButton(withTitle: "下载并安装")
        alert.addButton(withTitle: "稍后")
        alert.addButton(withTitle: "查看更新说明")
        switch alert.runModal() {
        case .alertFirstButtonReturn: downloadAndInstall(release)
        case .alertThirdButtonReturn: NSWorkspace.shared.open(release.html_url)
        default: break
        }
    }

    private func downloadAndInstall(_ release: GitHubRelease) {
        let current = Bundle.main.bundleURL
        let parent = current.deletingLastPathComponent()
        guard !current.path.contains("/AppTranslocation/"), FileManager.default.isWritableFile(atPath: parent.path) else {
            showError("当前应用所在位置无法自动替换。请先把 Codex QQ Skin.app 拖到“应用程序”文件夹，再重新打开并升级。")
            return
        }
        guard VersionPolicy.serverUpdateAvailable(remote: release.tag_name, current: appVersion) else { return }
        guard let archive = release.assets.first(where: { $0.name == "Codex.QQ.Skin.app.zip" }),
              let checksum = release.assets.first(where: { $0.name == archive.name + ".sha256" }) else {
            showError("这个 Release 缺少 macOS 安装包或 SHA-256 校验文件。")
            return
        }
        setBusy(true, message: "正在下载 \(release.tag_name)…")
        URLSession.shared.downloadTask(with: archive.browser_download_url) { [weak self] temporary, _, error in
            guard let self, let temporary, error == nil else {
                DispatchQueue.main.async { self?.setBusy(false, message: "更新下载失败"); self?.showError("无法下载安装包，请检查网络后重试。") }
                return
            }
            let work = FileManager.default.temporaryDirectory.appendingPathComponent("codex-qq-skin-update-\(UUID().uuidString)")
            do {
                try FileManager.default.createDirectory(at: work, withIntermediateDirectories: true)
                let zip = work.appendingPathComponent(archive.name)
                try FileManager.default.moveItem(at: temporary, to: zip)
                let expected = try String(contentsOf: checksum.browser_download_url, encoding: .utf8)
                    .split(whereSeparator: { $0 == " " || $0 == "\t" || $0 == "\n" }).first.map(String.init)?.lowercased() ?? ""
                let actual = SHA256.hash(data: try Data(contentsOf: zip)).map { String(format: "%02x", $0) }.joined()
                guard expected.count == 64, expected == actual else { throw NSError(domain: "Updater", code: 2, userInfo: [NSLocalizedDescriptionKey: "安装包校验失败，已取消更新。"] ) }
                let expanded = work.appendingPathComponent("expanded")
                try FileManager.default.createDirectory(at: expanded, withIntermediateDirectories: true)
                let unzip = Process()
                unzip.executableURL = URL(fileURLWithPath: "/usr/bin/ditto")
                unzip.arguments = ["-x", "-k", zip.path, expanded.path]
                try unzip.run(); unzip.waitUntilExit()
                guard unzip.terminationStatus == 0,
                      let staged = FileManager.default.enumerator(at: expanded, includingPropertiesForKeys: nil)?.compactMap({ $0 as? URL }).first(where: { $0.pathExtension == "app" && $0.lastPathComponent == "Codex QQ Skin.app" }) else {
                    throw NSError(domain: "Updater", code: 3, userInfo: [NSLocalizedDescriptionKey: "无法解压新的应用。"])
                }
                try self.validateStagedUpdate(staged, releaseTag: release.tag_name)
                try self.launchUpdater(stagedApp: staged, work: work)
            } catch {
                try? FileManager.default.removeItem(at: work)
                DispatchQueue.main.async { self.setBusy(false, message: "更新失败"); self.showError(error.localizedDescription) }
            }
        }.resume()
    }

    private func validateStagedUpdate(_ app: URL, releaseTag: String) throws {
        guard let bundle = Bundle(url: app),
              bundle.bundleIdentifier == "xyz.liuwa.codex-qq-skin",
              let version = bundle.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String,
              VersionPolicy.compare(version, releaseTag) == .orderedSame,
              VersionPolicy.serverUpdateAvailable(remote: version, current: appVersion) else {
            throw NSError(domain: "Updater", code: 4, userInfo: [NSLocalizedDescriptionKey: "更新包版本或应用身份与 Release 不匹配。"])
        }
        let verify = Process()
        verify.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        verify.arguments = ["--verify", "--deep", "--strict", app.path]
        try verify.run()
        verify.waitUntilExit()
        guard verify.terminationStatus == 0 else {
            throw NSError(domain: "Updater", code: 5, userInfo: [NSLocalizedDescriptionKey: "更新包代码签名校验失败。"])
        }
    }

    private func launchUpdater(stagedApp: URL, work: URL) throws {
        let current = Bundle.main.bundleURL
        let script = work.appendingPathComponent("install-update.sh")
        let q: (String) -> String = { "'" + $0.replacingOccurrences(of: "'", with: "'\\''") + "'" }
        let text = """
        #!/bin/bash
        while /bin/kill -0 \(ProcessInfo.processInfo.processIdentifier) 2>/dev/null; do /bin/sleep 0.2; done
        BACKUP=\(q(current.path + ".update-backup"))
        /bin/rm -rf "$BACKUP"
        /bin/mv \(q(current.path)) "$BACKUP" || exit 1
        if ! /usr/bin/ditto \(q(stagedApp.path)) \(q(current.path)) \
          || ! /usr/bin/codesign --verify --deep --strict \(q(current.path)); then
          /bin/rm -rf \(q(current.path))
          /bin/mv "$BACKUP" \(q(current.path))
          exit 1
        fi
        /bin/rm -rf "$BACKUP"
        /usr/bin/open \(q(current.path))
        /bin/rm -rf \(q(work.path))
        """
        try text.write(to: script, atomically: true, encoding: .utf8)
        try FileManager.default.setAttributes([.posixPermissions: 0o700], ofItemAtPath: script.path)
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/bin/bash")
        process.arguments = [script.path]
        try process.run()
        DispatchQueue.main.async { NSApp.terminate(nil) }
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool { true }

    private func buildWindow() {
        window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 540, height: 440),
            styleMask: [.titled, .closable, .miniaturizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Codex QQ Skin"
        window.center()
        window.isReleasedWhenClosed = false

        let root = NSStackView()
        root.orientation = .vertical
        root.alignment = .centerX
        root.spacing = 10
        root.edgeInsets = NSEdgeInsets(top: 14, left: 20, bottom: 14, right: 20)
        root.translatesAutoresizingMaskIntoConstraints = false

        tabControl = NSSegmentedControl(labels: ["启动", "皮肤库"], trackingMode: .selectOne, target: self, action: #selector(tabChanged))
        tabControl.segmentStyle = .rounded
        tabControl.selectedSegment = 0
        tabControl.translatesAutoresizingMaskIntoConstraints = false
        tabControl.widthAnchor.constraint(equalToConstant: 200).isActive = true

        statusLabel = NSTextField(labelWithString: "正在检查…")
        statusLabel.alignment = .center
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.widthAnchor.constraint(equalToConstant: 480).isActive = true

        buildLaunchPane()
        buildLibraryPane()
        libraryPane.isHidden = true

        [tabControl, launchPane, libraryPane, statusLabel].forEach(root.addArrangedSubview)
        window.contentView?.addSubview(root)
        NSLayoutConstraint.activate([
            root.leadingAnchor.constraint(equalTo: window.contentView!.leadingAnchor),
            root.trailingAnchor.constraint(equalTo: window.contentView!.trailingAnchor),
            root.topAnchor.constraint(equalTo: window.contentView!.topAnchor),
            root.bottomAnchor.constraint(equalTo: window.contentView!.bottomAnchor),
        ])
    }

    private func buildLaunchPane() {
        launchPane = NSStackView()
        launchPane.orientation = .vertical
        launchPane.alignment = .centerX
        launchPane.spacing = 10

        let icon = NSImageView(image: NSApp.applicationIconImage)
        icon.imageScaling = .scaleProportionallyUpOrDown
        icon.translatesAutoresizingMaskIntoConstraints = false
        icon.widthAnchor.constraint(equalToConstant: 52).isActive = true
        icon.heightAnchor.constraint(equalToConstant: 52).isActive = true

        let title = NSTextField(labelWithString: "Codex QQ Skin")
        title.font = .boldSystemFont(ofSize: 20)

        let subtitle = NSTextField(wrappingLabelWithString: "一键启动 QQ / 自定义皮肤。皮肤库请切换到上方「皮肤库」管理。")
        subtitle.alignment = .center
        subtitle.textColor = .secondaryLabelColor
        subtitle.maximumNumberOfLines = 2
        subtitle.translatesAutoresizingMaskIntoConstraints = false
        subtitle.widthAnchor.constraint(equalToConstant: 440).isActive = true

        primaryButton = NSButton(title: "一键安装并启动", target: self, action: #selector(primaryAction))
        primaryButton.bezelStyle = .rounded
        primaryButton.keyEquivalent = "\r"
        primaryButton.controlSize = .large
        stylePrimaryButton(primaryButton)

        skillButton = NSButton(title: "安装 Codex 深度皮肤助手", target: self, action: #selector(installDeepSkinSkill))
        skillButton.bezelStyle = .rounded
        skillButton.controlSize = .large
        skillButton.translatesAutoresizingMaskIntoConstraints = false
        skillButton.widthAnchor.constraint(equalToConstant: 320).isActive = true

        skillStatusLabel = NSTextField(labelWithString: "正在检查深度皮肤助手…")
        skillStatusLabel.alignment = .center
        skillStatusLabel.textColor = .secondaryLabelColor
        skillStatusLabel.font = .systemFont(ofSize: 12)
        skillStatusLabel.translatesAutoresizingMaskIntoConstraints = false
        skillStatusLabel.widthAnchor.constraint(equalToConstant: 440).isActive = true

        restoreButton = NSButton(title: "恢复官方外观", target: self, action: #selector(restore))
        restoreButton.bezelStyle = .rounded

        [icon, title, subtitle, primaryButton, skillButton, skillStatusLabel, restoreButton].forEach(launchPane.addArrangedSubview)
    }

    private func buildLibraryPane() {
        libraryPane = NSStackView()
        libraryPane.orientation = .vertical
        libraryPane.alignment = .leading
        libraryPane.spacing = 10
        libraryPane.translatesAutoresizingMaskIntoConstraints = false
        libraryPane.widthAnchor.constraint(equalToConstant: 500).isActive = true

        libraryLabel = NSTextField(labelWithString: "我的皮肤库")
        libraryLabel.font = .boldSystemFont(ofSize: 13)
        libraryLabel.alignment = .left
        libraryLabel.translatesAutoresizingMaskIntoConstraints = false
        libraryLabel.widthAnchor.constraint(equalToConstant: 500).isActive = true

        tableView = NSTableView()
        tableView.headerView = nil
        tableView.rowHeight = 36
        tableView.allowsEmptySelection = true
        tableView.allowsMultipleSelection = false
        tableView.usesAlternatingRowBackgroundColors = true
        tableView.selectionHighlightStyle = .none
        tableView.dataSource = self
        tableView.delegate = self
        let column = NSTableColumn(identifier: NSUserInterfaceItemIdentifier("theme"))
        column.title = "皮肤"
        column.width = 480
        tableView.addTableColumn(column)

        let scroll = NSScrollView()
        scroll.documentView = tableView
        scroll.hasVerticalScroller = true
        scroll.autohidesScrollers = true
        scroll.borderType = .bezelBorder
        scroll.translatesAutoresizingMaskIntoConstraints = false
        // Five visible rows; overflow scrolls.
        scroll.heightAnchor.constraint(equalToConstant: 36 * 5 + 2).isActive = true
        scroll.widthAnchor.constraint(equalToConstant: 500).isActive = true

        customizeButton = NSButton(title: "上传图片，生成我的皮肤…", target: self, action: #selector(customizeSkin))
        customizeButton.bezelStyle = .rounded
        customizeButton.controlSize = .large
        stylePrimaryButton(customizeButton)
        customizeButton.translatesAutoresizingMaskIntoConstraints = false
        customizeButton.widthAnchor.constraint(equalToConstant: 500).isActive = true

        [libraryLabel, scroll, customizeButton].forEach(libraryPane.addArrangedSubview)
    }

    private func stylePrimaryButton(_ button: NSButton) {
        button.bezelStyle = .rounded
        button.controlSize = .large
        if #available(macOS 11.0, *) {
            button.bezelColor = NSColor(calibratedRed: 0.22, green: 0.48, blue: 0.86, alpha: 1)
            button.contentTintColor = .white
        }
    }

    @objc private func tabChanged() {
        let showLibrary = tabControl.selectedSegment == 1
        launchPane.isHidden = showLibrary
        libraryPane.isHidden = !showLibrary
        if showLibrary { reloadThemeLibrary() }
    }

    func numberOfRows(in tableView: NSTableView) -> Int { themes.count }

    func tableView(_ tableView: NSTableView, viewFor tableColumn: NSTableColumn?, row: Int) -> NSView? {
        guard row >= 0, row < themes.count else { return nil }
        let item = themes[row]

        let rowView = NSTableCellView()
        let stack = NSStackView()
        stack.orientation = .horizontal
        stack.alignment = .centerY
        stack.spacing = 6
        stack.translatesAutoresizingMaskIntoConstraints = false
        stack.distribution = .fill

        let kind = item.kind == "qq-stable" ? "QQ 固定" : "自定义"
        let title = NSTextField(labelWithString: item.active ? "✓ \(item.name)  ·  \(kind)" : "\(item.name)  ·  \(kind)")
        title.isEditable = false
        title.isBordered = false
        title.drawsBackground = false
        title.backgroundColor = .clear
        title.font = item.active ? .boldSystemFont(ofSize: 12) : .systemFont(ofSize: 12)
        title.lineBreakMode = .byTruncatingTail
        title.setContentHuggingPriority(.defaultLow, for: .horizontal)
        title.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let spacer = NSView()
        spacer.setContentHuggingPriority(.defaultLow, for: .horizontal)
        spacer.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)

        let actions = NSStackView()
        actions.orientation = .horizontal
        actions.spacing = 6
        actions.alignment = .centerY
        actions.setContentHuggingPriority(.required, for: .horizontal)
        actions.setContentCompressionResistancePriority(.required, for: .horizontal)

        let apply = makeRowButton(title: "应用", themeId: item.id, action: #selector(applyThemeFromButton(_:)))
        let rename = makeRowButton(title: "重命名", themeId: item.id, action: #selector(renameThemeFromButton(_:)))
        let delete = makeRowButton(title: "删除", themeId: item.id, action: #selector(deleteThemeFromButton(_:)))
        let canDelete = !(item.kind == "qq-stable" || item.id.hasPrefix("preset-") || item.active)
        let canApply = !item.active
        apply.isEnabled = canApply && !busy
        delete.isEnabled = canDelete && !busy
        rename.isEnabled = !busy
        [apply, rename, delete].forEach(actions.addArrangedSubview)

        [title, spacer, actions].forEach(stack.addArrangedSubview)
        rowView.addSubview(stack)
        NSLayoutConstraint.activate([
            stack.leadingAnchor.constraint(equalTo: rowView.leadingAnchor, constant: 8),
            stack.trailingAnchor.constraint(equalTo: rowView.trailingAnchor, constant: -8),
            stack.topAnchor.constraint(equalTo: rowView.topAnchor, constant: 2),
            stack.bottomAnchor.constraint(equalTo: rowView.bottomAnchor, constant: -2),
        ])
        return rowView
    }

    private func makeRowButton(title: String, themeId: String, action: Selector) -> NSButton {
        let button = NSButton(title: title, target: self, action: action)
        button.bezelStyle = .rounded
        button.controlSize = .small
        button.identifier = NSUserInterfaceItemIdentifier(themeId)
        button.isEnabled = !busy
        return button
    }

    private func theme(for button: NSButton) -> ThemeLibraryItem? {
        guard let id = button.identifier?.rawValue else { return nil }
        return themes.first { $0.id == id }
    }

    private func refreshState() {
        let installed = FileManager.default.isExecutableFile(atPath: installedStart.path)
        let bundled = skinVersion(at: bundledRoot)
        let installedVersion = skinVersion(at: installedRoot)
        let bundledLabel = bundled ?? "未知"
        switch engineUpdateDecision() {
        case .install:
            statusLabel.stringValue = "尚未安装，点击下方按钮即可完成（App \(bundledLabel)）"
            primaryButton.title = "一键安装并启动"
        case .update:
            statusLabel.stringValue = "✓ 已安装 \(installedVersion ?? "旧版")，启动时会更新到 \(bundledLabel)"
            primaryButton.title = "更新并启动"
        case .repair:
            statusLabel.stringValue = "已安装 \(installedVersion ?? bundledLabel)，启动时会修复同版本引擎"
            primaryButton.title = "修复并启动"
        case .installedNewer:
            statusLabel.stringValue = "✓ 已安装 \(installedVersion ?? "较新版本")，高于此安装器内置 \(bundledLabel)，不会降级"
            primaryButton.title = "启动 Codex QQ Skin"
        case .current:
            statusLabel.stringValue = "✓ 已安装 \(installedVersion ?? bundledLabel)，可以直接启动"
            primaryButton.title = "启动 Codex QQ Skin"
        case .unknown:
            statusLabel.stringValue = "已检测到本地引擎，但无法安全比较版本；不会自动覆盖"
            primaryButton.title = "启动 Codex QQ Skin"
        }
        let enabled = installed && !busy
        let skillInstalled = FileManager.default.fileExists(atPath: installedSkill.path)
        let skillCurrent = skillInstalled && bundledSkillIsCurrent()
        if skillCurrent {
            skillButton.title = "✓ 已安装 Codex 深度皮肤助手"
            skillStatusLabel.stringValue = "用法：在 Codex 输入“用深度皮肤助手生成钢铁侠主题皮肤”"
        } else if skillInstalled {
            skillButton.title = "更新 Codex 深度皮肤助手"
            skillStatusLabel.stringValue = "检测到内置新版 Skill，可以安全更新"
        } else {
            skillButton.title = "安装 Codex 深度皮肤助手"
            skillStatusLabel.stringValue = "尚未安装 Codex 深度皮肤助手"
        }
        skillButton.isEnabled = !busy && !skillCurrent
        customizeButton.isEnabled = enabled
        restoreButton.isEnabled = installed && !busy
        libraryLabel.stringValue = installed ? "我的皮肤库（\(themes.count)）" : "我的皮肤库（安装后可用）"
        tableView.reloadData()
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

    private func engineHasCompatibilityIssue() -> Bool {
        if let start = try? String(contentsOf: installedStart, encoding: .utf8),
           start.contains("${MODE_ARGS[@]}") || start.contains("${mode_args[@]}") {
            return true
        }
        let required = [
            "scripts/list-themes-macos.sh",
            "scripts/remove-theme-macos.sh",
            "scripts/rename-theme-macos.sh",
        ]
        for relative in required {
            let path = installedRoot.appendingPathComponent(relative)
            if !FileManager.default.isExecutableFile(atPath: path.path) { return true }
        }
        return false
    }

    private func engineUpdateDecision() -> EngineUpdateDecision {
        VersionPolicy.engineDecision(
            bundled: skinVersion(at: bundledRoot),
            installed: skinVersion(at: installedRoot),
            engineExists: FileManager.default.isExecutableFile(atPath: installedStart.path),
            compatibilityIssue: engineHasCompatibilityIssue()
        )
    }

    private func engineNeedsUpdate() -> Bool {
        let decision = engineUpdateDecision()
        return decision == .install || decision == .update || decision == .repair
    }

    @objc private func reloadThemeLibrary() {
        guard FileManager.default.isExecutableFile(atPath: installedStart.path) else {
            themes = []
            refreshState()
            return
        }
        let script = scriptRoot.appendingPathComponent("scripts/list-themes-macos.sh")
        runCapturing(script: script, arguments: ["--json"]) { [weak self] code, output in
            guard let self else { return }
            if code != 0 {
                self.themes = []
                self.refreshState()
                return
            }
            guard let data = output.data(using: .utf8),
                  let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let rows = json["themes"] as? [[String: Any]] else {
                self.themes = []
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
            self.refreshState()
        }
    }

    @objc private func applyThemeFromButton(_ sender: NSButton) {
        guard let theme = theme(for: sender) else { return }
        let script = scriptRoot.appendingPathComponent("scripts/switch-theme-macos.sh")
        run(
            script: script,
            arguments: ["--id", theme.id],
            progress: "正在应用「\(theme.name)」…",
            success: "已切换到「\(theme.name)」。",
            announceSuccess: false,
            onSuccess: { [weak self] in self?.reloadThemeLibrary() }
        )
    }

    @objc private func renameThemeFromButton(_ sender: NSButton) {
        guard let theme = theme(for: sender) else { return }
        let alert = NSAlert()
        alert.messageText = "重命名「\(theme.name)」"
        alert.informativeText = "只改显示名称，不会改动图片文件。"
        let field = NSTextField(string: theme.name)
        field.frame = NSRect(x: 0, y: 0, width: 280, height: 24)
        alert.accessoryView = field
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "取消")
        guard alert.runModal() == .alertFirstButtonReturn else { return }
        let name = field.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else {
            showError("名称不能为空。")
            return
        }
        let script = scriptRoot.appendingPathComponent("scripts/rename-theme-macos.sh")
        run(
            script: script,
            arguments: ["--id", theme.id, "--name", name],
            progress: "正在重命名…",
            success: "已重命名为「\(name)」。",
            announceSuccess: false,
            onSuccess: { [weak self] in self?.reloadThemeLibrary() }
        )
    }

    @objc private func deleteThemeFromButton(_ sender: NSButton) {
        guard let theme = theme(for: sender) else { return }
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
            announceSuccess: false,
            onSuccess: { [weak self] in self?.reloadThemeLibrary() }
        )
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
                        announceSuccess: false,
                        onSuccess: { [weak self] in self?.reloadThemeLibrary() }
                    )
                }
            } else {
                run(
                    script: installedStart,
                    arguments: ["--prompt-restart"],
                    progress: "正在启动 QQ 皮肤版 Codex…",
                    success: "Codex QQ Skin 已启动。",
                    announceSuccess: false
                )
            }
        } else {
            installFresh()
        }
    }

    @objc private func installDeepSkinSkill() {
        let script = bundledRoot.appendingPathComponent("scripts/install-deep-skin-skill-macos.sh")
        run(
            script: script,
            arguments: ["install"],
            progress: "正在安装 Codex 深度皮肤助手…",
            success: "深度皮肤助手已安装。在 Codex 中输入：用 Codex 深度皮肤助手生成一个钢铁侠主题皮肤",
            onSuccess: { [weak self] in self?.refreshState() }
        )
    }

    private func installFresh() {
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
                success: "安装完成，Codex QQ Skin 已启动。",
                announceSuccess: false,
                onSuccess: { [weak self] in self?.reloadThemeLibrary() }
            )
        }
    }

    @objc private func customizeSkin() {
        guard FileManager.default.isExecutableFile(atPath: installedStart.path) else {
            showError("请先在「启动」页完成安装，再上传图片生成自定义皮肤。")
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
            announceSuccess: false,
            onSuccess: { [weak self] in self?.reloadThemeLibrary() }
        )
    }

    @objc private func restore() {
        let script = installedRoot.appendingPathComponent("scripts/restore-qq-skin-macos.sh")
        run(
            script: script,
            arguments: ["--restore-base-theme", "--restart-codex"],
            progress: "正在恢复官方外观…",
            success: "已恢复 Codex 官方外观。",
            announceSuccess: false
        )
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
        announceSuccess: Bool = true,
        onSuccess: (() -> Void)? = nil
    ) {
        guard !busy else { return }
        guard FileManager.default.fileExists(atPath: script.path) else {
            showError("缺少运行文件：\(script.lastPathComponent)。请重新下载完整应用，或再点一次主按钮以自动刷新引擎。")
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
                    if announceSuccess {
                        let alert = NSAlert()
                        alert.messageText = "完成"
                        alert.informativeText = success
                        alert.runModal()
                    }
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
            return "检测到旧版启动脚本。请再点一次主按钮，应用会自动刷新引擎后启动。"
        }
        if details.contains("currently active") { return "不能删除当前正在使用的皮肤，请先切换到其他皮肤。" }
        if details.contains("Built-in preset") { return "内置预设皮肤不能删除。" }
        return "操作没有完成。可以展开下方详情查看原因。"
    }

    private func setBusy(_ value: Bool, message: String) {
        busy = value
        statusLabel.stringValue = message
        primaryButton.isEnabled = !value
        skillButton.isEnabled = !value
        let installed = FileManager.default.isExecutableFile(atPath: installedStart.path)
        customizeButton.isEnabled = !value && installed
        restoreButton.isEnabled = !value && installed
        tabControl.isEnabled = !value
        tableView.reloadData()
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
