import Foundation

@main
struct VersionPolicyTests {
    static func require(_ condition: @autoclosure () -> Bool, _ message: String) {
        if !condition() {
            FileHandle.standardError.write(Data("FAIL: \(message)\n".utf8))
            exit(1)
        }
    }

    static func main() {
        require(VersionPolicy.serverUpdateAvailable(remote: "v2.5.0", current: "2.4.0"), "newer server release should update")
        require(!VersionPolicy.serverUpdateAvailable(remote: "v2.4.0", current: "2.4.0"), "equal versions must not update")
        require(!VersionPolicy.serverUpdateAvailable(remote: "v2.4.0", current: "2.5.0"), "older server release must not downgrade")
        require(!VersionPolicy.serverUpdateAvailable(remote: "v2.5.0-beta", current: "2.4.0"), "malformed or prerelease tags must not update")
        require(VersionPolicy.compare("2.5", "2.5.0") == .orderedSame, "missing patch should normalize to zero")

        require(VersionPolicy.engineDecision(bundled: "2.5.0", installed: nil, engineExists: false, compatibilityIssue: false) == .install, "missing engine should install")
        require(VersionPolicy.engineDecision(bundled: "2.5.0", installed: "2.4.0", engineExists: true, compatibilityIssue: false) == .update, "newer bundle should update")
        require(VersionPolicy.engineDecision(bundled: "2.5.0", installed: "2.5.0", engineExists: true, compatibilityIssue: false) == .current, "equal engine should stay current")
        require(VersionPolicy.engineDecision(bundled: "2.5.0", installed: "2.5.0", engineExists: true, compatibilityIssue: true) == .repair, "equal broken engine should repair")
        require(VersionPolicy.engineDecision(bundled: "2.4.0", installed: "2.5.0", engineExists: true, compatibilityIssue: true) == .installedNewer, "older bundle must never downgrade even for repair")
        require(VersionPolicy.engineDecision(bundled: "bad", installed: "2.5.0", engineExists: true, compatibilityIssue: false) == .unknown, "unknown versions must not overwrite")
        print("PASS: version policy prevents equal-version updates and all downgrade paths.")
    }
}
