import AppKit
import ServiceManagement

struct CommandResult {
    let status: Int32
    let output: Data
}

enum AgentCommand {
    static var executable: URL { Bundle.main.bundleURL.appendingPathComponent("Contents/MacOS/remotelink") }
    static func run(_ arguments: [String], timeout: TimeInterval = 8) throws -> CommandResult {
        let process = Process()
        process.executableURL = executable
        process.arguments = arguments
        process.standardInput = FileHandle.nullDevice
        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = FileHandle.nullDevice
        let done = DispatchSemaphore(value: 0)
        process.terminationHandler = { _ in done.signal() }
        try process.run()
        if done.wait(timeout: .now() + timeout) == .timedOut {
            process.terminate()
            throw NSError(domain: "RemoteArc", code: 1, userInfo: [NSLocalizedDescriptionKey: "The Agent did not respond. Open Dashboard or try again."])
        }
        return CommandResult(status: process.terminationStatus, output: pipe.fileHandleForReading.readDataToEndOfFile())
    }
}

@available(macOS 13.0, *)
final class RemoteArcApp: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private var statusRow: NSMenuItem!
    private var startRow: NSMenuItem!
    private var stopRow: NSMenuItem!
    private var loginRow: NSMenuItem!
    private var agent: Process?
    private var logHandle: FileHandle?
    private var timer: Timer?
    private var checking = false
    private var stopping = false
    private var latestStatus: [String: Any] = [:]
    private let logDirectory = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent("Library/Logs/Remote Arc", isDirectory: true)
    private var logURL: URL { logDirectory.appendingPathComponent("agent.log") }

    func applicationDidFinishLaunching(_ notification: Notification) {
        guard !Bundle.main.bundleURL.path.hasPrefix("/Volumes/") else {
            alert("Install Remote Arc first", "Drag Remote Arc into Applications, then open it from Applications.")
            NSApp.terminate(nil)
            return
        }
        // Finder usually reopens an existing process. This also protects manual launches.
        if NSRunningApplication.runningApplications(withBundleIdentifier: Bundle.main.bundleIdentifier!).contains(where: { $0.processIdentifier != ProcessInfo.processInfo.processIdentifier }) {
            NSApp.terminate(nil)
            return
        }
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
        statusItem.button?.image = NSImage(systemSymbolName: "point.3.connected.trianglepath.dotted", accessibilityDescription: "Remote Arc")
        let menu = NSMenu()
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
        menu.addItem(withTitle: "Remote Arc \(version)", action: nil, keyEquivalent: "")
        statusRow = menu.addItem(withTitle: "Starting Agent…", action: nil, keyEquivalent: "")
        menu.addItem(.separator())
        add(menu, "Open Dashboard", #selector(openDashboard))
        add(menu, "Review device permissions", #selector(openDashboard))
        menu.addItem(.separator())
        startRow = add(menu, "Start Agent", #selector(startAgent))
        stopRow = add(menu, "Stop connection…", #selector(stopConnection))
        loginRow = add(menu, "Launch at login", #selector(toggleLogin))
        updateLoginState()
        menu.addItem(.separator())
        add(menu, "Download latest version…", #selector(openDownloads))
        add(menu, "Show local logs", #selector(showLogs))
        add(menu, "Quit Remote Arc", #selector(quit), "q")
        statusItem.menu = menu
        startAgent()
        timer = Timer.scheduledTimer(withTimeInterval: 5, repeats: true) { [weak self] _ in self?.refreshStatus() }
        refreshStatus()
    }

    @discardableResult
    private func add(_ menu: NSMenu, _ title: String, _ action: Selector, _ key: String = "") -> NSMenuItem {
        let item = menu.addItem(withTitle: title, action: action, keyEquivalent: key)
        item.target = self
        return item
    }

    @objc private func startAgent() {
        guard agent?.isRunning != true, !stopping else { return }
        do {
            try FileManager.default.createDirectory(at: logDirectory, withIntermediateDirectories: true, attributes: [.posixPermissions: 0o700])
            if !FileManager.default.fileExists(atPath: logURL.path) {
                FileManager.default.createFile(atPath: logURL.path, contents: nil, attributes: [.posixPermissions: 0o600])
            }
            let handle = try FileHandle(forWritingTo: logURL)
            // Bound the local console log. Execution journals keep their existing retention.
            if try handle.seekToEnd() > 1_048_576 { try handle.truncate(atOffset: 0) }
            logHandle = handle
            let process = Process()
            process.executableURL = AgentCommand.executable
            // Reuse the real Agent, pairing and execution lease. Never force an update,
            // reset pairing, request extra permissions or silently enable recovery.
            process.arguments = ["--foreground"]
            process.standardInput = FileHandle.nullDevice
            process.standardOutput = handle
            process.standardError = handle
            process.terminationHandler = { [weak self] finished in
                DispatchQueue.main.async {
                    guard let self = self, self.agent === finished else { return }
                    self.agent = nil
                    try? self.logHandle?.close()
                    self.logHandle = nil
                    self.startRow.isEnabled = !self.stopping
                    self.statusRow.title = finished.terminationStatus == 0 ? "Agent stopped" : "Agent stopped — see local logs"
                }
            }
            try process.run()
            agent = process
            statusRow.title = "Starting — complete pairing in your browser"
            startRow.isEnabled = false
        } catch { alert("Could not start Remote Arc", error.localizedDescription) }
    }

    private func refreshStatus() {
        guard !checking, !stopping else { return }
        checking = true
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let result = try? AgentCommand.run(["--status"])
            let object = result.flatMap { try? JSONSerialization.jsonObject(with: $0.output) as? [String: Any] }
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.checking = false
                self.latestStatus = object?["agent"] as? [String: Any] ?? [:]
                let status = self.latestStatus
                let active = status["pid"] != nil
                self.stopRow.isEnabled = active || self.agent?.isRunning == true
                self.startRow.isEnabled = self.agent?.isRunning != true && !self.stopping
                if let version = status["version"] as? String {
                    let paused = status["executionPaused"] as? Bool == true
                    let connected = status["connected"] as? Bool == true
                    self.statusRow.title = "\(paused ? "Paused" : connected ? "Connected" : "Reconnecting") · Agent \(version)"
                } else if self.agent?.isRunning == true {
                    self.statusRow.title = "Waiting for pairing or connection"
                }
            }
        }
    }

    @objc private func stopConnection() {
        guard !stopping else { return }
        let confirmation = NSAlert()
        confirmation.messageText = "Stop this computer’s connection?"
        confirmation.informativeText = "This stops the Agent and existing background recovery. Running commands and browser tasks may be interrupted. Your account pairing is kept."
        confirmation.addButton(withTitle: "Cancel")
        confirmation.addButton(withTitle: "Stop connection")
        guard confirmation.runModal() == .alertSecondButtonReturn else { return }
        stopping = true
        startRow.isEnabled = false
        stopRow.isEnabled = false
        // Close this app's owner/viewer before --stop, so a log viewer cannot
        // reacquire the execution lease while the requested stop is draining.
        agent?.terminate()
        DispatchQueue.global(qos: .utility).async { [weak self] in
            let result = try? AgentCommand.run(["--stop"], timeout: 25)
            DispatchQueue.main.async {
                guard let self = self else { return }
                self.stopping = false
                self.startRow.isEnabled = self.agent?.isRunning != true
                self.statusRow.title = result?.status == 0 ? "Connection stopped" : "Stop not confirmed — check Dashboard"
            }
        }
    }

    @objc private func toggleLogin() {
        do {
            if SMAppService.mainApp.status == .enabled { try SMAppService.mainApp.unregister() }
            else { try SMAppService.mainApp.register() }
            updateLoginState()
            if SMAppService.mainApp.status == .requiresApproval {
                alert("Allow Remote Arc at login", "Approve Remote Arc in System Settings → General → Login Items.")
            }
        } catch { alert("Could not update launch at login", error.localizedDescription) }
    }

    private func updateLoginState() { loginRow.state = SMAppService.mainApp.status == .enabled ? .on : .off }
    @objc private func openDashboard() { NSWorkspace.shared.open(URL(string: "https://agent.remotearc.app/devices")!) }
    @objc private func openDownloads() { NSWorkspace.shared.open(URL(string: "https://remotearc.app/downloads")!) }
    @objc private func showLogs() { NSWorkspace.shared.activateFileViewerSelecting([logURL]) }
    @objc private func quit() { NSApp.terminate(nil) }

    func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
        let work = latestStatus["activeWork"] as? [String: Any] ?? [:]
        let ownsExecution = (latestStatus["pid"] as? Int32) == agent?.processIdentifier
        if ownsExecution && work.values.contains(where: { ($0 as? Int ?? 0) > 0 }) {
            let confirmation = NSAlert()
            confirmation.messageText = "Quit while tasks are running?"
            confirmation.informativeText = "Quitting stops the Agent started by this app and may interrupt its commands and browser tasks."
            confirmation.addButton(withTitle: "Keep running")
            confirmation.addButton(withTitle: "Quit")
            if confirmation.runModal() != .alertSecondButtonReturn { return .terminateCancel }
        }
        return .terminateNow
    }

    func applicationWillTerminate(_ notification: Notification) {
        timer?.invalidate()
        agent?.terminate()
        // An existing separately configured Agent/recovery remains the user's
        // responsibility. Only the explicit Stop connection action disables it.
    }
    private func alert(_ title: String, _ detail: String) {
        let message = NSAlert(); message.messageText = title; message.informativeText = detail
        message.runModal()
    }
}

if CommandLine.arguments.contains("--version") {
    print(Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev")
} else if CommandLine.arguments.contains("--self-test") {
    // Non-interactive package acceptance: no pairing, network, login item or Agent startup.
    let result = try AgentCommand.run(["--version"])
    let expected = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "dev"
    guard result.status == 0, String(data: result.output, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines) == expected else {
        fatalError("Bundled Agent version mismatch")
    }
    print("PASS: native App launcher, executable bundle permissions and Agent version \(expected)")
} else if #available(macOS 13.0, *) {
    let app = NSApplication.shared
    let delegate = RemoteArcApp()
    app.delegate = delegate
    app.setActivationPolicy(.accessory)
    app.run()
}
