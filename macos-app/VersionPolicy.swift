import Foundation

enum EngineUpdateDecision: Equatable {
    case install
    case update
    case repair
    case current
    case installedNewer
    case unknown
}

enum VersionPolicy {
    static func components(_ value: String) -> [Int]? {
        var normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        if normalized.first == "v" || normalized.first == "V" { normalized.removeFirst() }
        let parts = normalized.split(separator: ".", omittingEmptySubsequences: false)
        guard !parts.isEmpty, parts.count <= 4 else { return nil }
        var result: [Int] = []
        for part in parts {
            guard !part.isEmpty, part.allSatisfy({ $0.isNumber }), let number = Int(part), number >= 0 else { return nil }
            result.append(number)
        }
        while result.count < 3 { result.append(0) }
        return result
    }

    static func compare(_ lhs: String, _ rhs: String) -> ComparisonResult? {
        guard let left = components(lhs), let right = components(rhs) else { return nil }
        for index in 0..<max(left.count, right.count) {
            let a = index < left.count ? left[index] : 0
            let b = index < right.count ? right[index] : 0
            if a < b { return .orderedAscending }
            if a > b { return .orderedDescending }
        }
        return .orderedSame
    }

    static func serverUpdateAvailable(remote: String, current: String) -> Bool {
        compare(remote, current) == .orderedDescending
    }

    static func engineDecision(
        bundled: String?,
        installed: String?,
        engineExists: Bool,
        compatibilityIssue: Bool
    ) -> EngineUpdateDecision {
        guard engineExists else { return .install }
        guard let bundled, let installed else {
            return installed == nil && bundled != nil ? .update : .unknown
        }
        guard let relation = compare(bundled, installed) else { return .unknown }
        if relation == .orderedDescending { return .update }
        if relation == .orderedAscending { return .installedNewer }
        return compatibilityIssue ? .repair : .current
    }
}
