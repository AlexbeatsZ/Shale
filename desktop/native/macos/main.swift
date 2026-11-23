import Cocoa
import Carbon

// No registration, preference writes, simulated keys or temporary focus windows.
func property(_ source: TISInputSource, _ key: CFString) -> AnyObject? {
    guard let value = TISGetInputSourceProperty(source, key) else { return nil }
    return Unmanaged<AnyObject>.fromOpaque(value).takeUnretainedValue()
}
func sourceID(_ source: TISInputSource) -> String {
    return property(source, kTISPropertyInputSourceID) as? String ?? ""
}
func sources() -> [TISInputSource] {
    return (TISCreateInputSourceList(nil, false).takeRetainedValue() as! [TISInputSource]).filter {
        property($0, kTISPropertyInputSourceIsSelectCapable) as? Bool == true &&
        property($0, kTISPropertyInputSourceIsEnabled) as? Bool == true
    }
}
func current() -> [String: Any] {
    return ["source": sourceID(TISCopyCurrentKeyboardInputSource().takeRetainedValue())]
}
func emit(_ value: Any) throws {
    let data = try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
}
struct Failure: Error, CustomStringConvertible {
    let description: String
    init(_ message: String) { description = message }
}
do {
    let args = CommandLine.arguments
    guard args.count >= 2 else { throw Failure("Missing action") }
    let action = args[1]
    if action == "list" {
        try emit(sources().map { source -> [String: Any] in
            let languages = property(source, kTISPropertyInputSourceLanguages) as? [String] ?? []
            let type = property(source, kTISPropertyInputSourceType) as? String ?? ""
            return ["id": sourceID(source),
                    "label": property(source, kTISPropertyLocalizedName) as? String ?? sourceID(source),
                    "english": type == (kTISTypeKeyboardLayout as String) && languages.contains { $0 == "en" || $0.hasPrefix("en-") }]
        })
    } else {
        guard args.count >= 3, let pid = Int32(args[2]),
              NSWorkspace.shared.frontmostApplication?.processIdentifier == pid
        else { throw Failure("Shale is not the foreground application") }
        if action == "get" { try emit(current()) }
        else if action == "select" {
            guard args.count == 4,
                  let state = try JSONSerialization.jsonObject(with: Data(args[3].utf8)) as? [String: Any],
                  let id = state["source"] as? String,
                  let source = sources().first(where: { sourceID($0) == id })
            else { throw Failure("Input source is not enabled") }
            let languages = property(source, kTISPropertyInputSourceLanguages) as? [String] ?? []
            let cjk = languages.contains { $0.hasPrefix("zh") || ["ja", "ko", "vi"].contains($0) }
            if cjk {
                guard selectInFocusedApp(source, expectedPID: pid) else {
                    throw Failure("The focused application could not activate the input method")
                }
            } else if TISSelectInputSource(source) != noErr {
                throw Failure("Could not select the English keyboard layout")
            }
            guard current()["source"] as? String == id else { throw Failure("Input source verification failed") }
            try emit(current())
        } else { throw Failure("Unknown action") }
    }
} catch {
    FileHandle.standardError.write(Data("\(error)\n".utf8))
    exit(1)
}
