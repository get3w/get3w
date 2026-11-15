import Foundation

/// Native permission UI follows Get3W's language, independently of macOS.
struct PermissionCoachStrings {
    let chinese: Bool
    init(language: String) {
        chinese = language.lowercased().replacingOccurrences(of: "_", with: "-").hasPrefix("zh")
    }
    func text(_ english: String, _ chinese: String) -> String { self.chinese ? chinese : english }
    func settings(_ permission: GuidePermission) -> String {
        permission == .accessibility ? text("Accessibility", "辅助功能") : text("Screen Recording", "录屏")
    }
    func title(_ permission: GuidePermission) -> String {
        permission == .accessibility ? text("Allow app control", "允许控制应用") : text("Allow window viewing", "允许查看窗口")
    }
}
