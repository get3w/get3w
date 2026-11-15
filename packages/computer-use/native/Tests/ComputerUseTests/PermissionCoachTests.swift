import AppKit
import XCTest
@testable import ComputerUse

final class PermissionCoachTests: XCTestCase {
    func testGuideLanguagesAndFallback() {
        for language in ["zh", "zh-CN", "zh_Hans"] {
            let strings = PermissionCoachStrings(language: language)
            XCTAssertEqual(strings.title(.screenRecording), "允许查看窗口")
            XCTAssertEqual(strings.settings(.accessibility), "辅助功能")
        }
        for language in ["en", "en-US", "fr"] {
            let strings = PermissionCoachStrings(language: language)
            XCTAssertEqual(strings.title(.screenRecording), "Allow window viewing")
            XCTAssertEqual(strings.settings(.accessibility), "Accessibility")
        }
    }

    @MainActor
    func testPermissionNamesFollowTheCurrentStep() {
        let environment = ["GET3W_COMPUTER_USE_ENTRY": "Get3W Computer Use",
                           "GET3W_COMPUTER_USE_SCREEN_ENTRY": "Get3W"]
        XCTAssertEqual(PermissionCoach.permissionEntry(.accessibility, environment: environment), "Get3W Computer Use")
        XCTAssertEqual(PermissionCoach.permissionEntry(.screenRecording, environment: environment), "Get3W")
        XCTAssertNil(PermissionCoach.permissionEntry(.screenRecording, environment: [:]))
        XCTAssertNil(PermissionCoach.permissionEntry(.screenRecording, environment: ["GET3W_COMPUTER_USE_SCREEN_ENTRY": " "]))
    }

    @MainActor
    func testGuideCannotTakeKeyboardFocusFromThePasswordPrompt() {
        _ = NSApplication.shared
        let panel = PermissionCoachPanel(contentRect: .zero,
                                        styleMask: [.borderless, .nonactivatingPanel],
                                        backing: .buffered, defer: false)
        panel.isReleasedWhenClosed = false
        defer { panel.close() }

        XCTAssertFalse(panel.canBecomeKey)
        XCTAssertFalse(panel.canBecomeMain)
    }

    @MainActor
    func testGuideActionsWorkWithoutRequestingKeyboardFocus() {
        _ = NSApplication.shared
        let target = ActionTarget()
        let button = PermissionCoachButton(title: "Open settings", target: target, action: #selector(ActionTarget.invoke))
        for role in [PermissionCoachButton.Role.primary, .quiet, .close] {
            button.role = role
            XCTAssertFalse(button.needsPanelToBecomeKey)
            XCTAssertFalse(button.acceptsFirstResponder)
            button.performClick(nil)
        }
        XCTAssertEqual(target.invocations, 3)
    }

    @MainActor
    private final class ActionTarget: NSObject {
        var invocations = 0
        @objc func invoke() { invocations += 1 }
    }
}
