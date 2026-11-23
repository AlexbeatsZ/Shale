#define UNICODE
#define _UNICODE
#include <algorithm>
#include <windows.h>
#include <imm.h>
#include <iostream>
#include <sstream>
#include <string>
#include <regex>
#include <stdexcept>
#include <vector>

// IMM control messages used by established IME controllers (e.g. IME.ahk).
// These constants are omitted by current desktop SDK imm.h.
constexpr WPARAM IMC_GETCONVERSIONMODE = 0x0001;
constexpr WPARAM IMC_SETCONVERSIONMODE = 0x0002;
constexpr WPARAM IMC_GETOPENSTATUS = 0x0005;
constexpr WPARAM IMC_SETOPENSTATUS = 0x0006;

// Same keyboard-layout API used by daipeihust/im-select, with focused-window
// validation and IME state preservation. No registry writes or simulated keys.
static HWND focused(DWORD expected) {
    HWND foreground = GetForegroundWindow();
    DWORD pid = 0;
    DWORD thread = GetWindowThreadProcessId(foreground, &pid);
    if (pid != expected) throw std::runtime_error("Shale is not the foreground application");
    GUITHREADINFO info{}; info.cbSize = sizeof(info);
    if (!GetGUIThreadInfo(thread, &info) || !info.hwndFocus ||
        GetAncestor(info.hwndFocus, GA_ROOT) != foreground)
        throw std::runtime_error("Shale has no focused input window");
    return info.hwndFocus;
}
static std::string id(HKL layout) {
    std::ostringstream out; out << std::hex << reinterpret_cast<UINT_PTR>(layout); return out.str();
}
static LRESULT ime(HWND window, WPARAM action, LPARAM value = 0) {
    HWND target = ImmGetDefaultIMEWnd(window);
    if (!target) throw std::runtime_error("The focused input method has no control window");
    DWORD_PTR result = 0;
    if (!SendMessageTimeoutW(target, WM_IME_CONTROL, action, value, SMTO_ABORTIFHUNG, 200, &result))
        throw std::runtime_error("Input method control timed out");
    return static_cast<LRESULT>(result);
}
static HKL layout(HWND window) { return GetKeyboardLayout(GetWindowThreadProcessId(window, nullptr)); }
static bool isIME(HKL value) { return ImmIsIME(value) != FALSE; }
static bool isEnglish(HKL value) { return PRIMARYLANGID(LOWORD(reinterpret_cast<UINT_PTR>(value))) == LANG_ENGLISH; }
static std::string snapshot(HWND window) {
    HKL value = layout(window);
    std::ostringstream out; out << "{\"source\":\"" << id(value) << "\"";
    if (isIME(value)) out << ",\"open\":" << (ime(window, IMC_GETOPENSTATUS) ? "true" : "false")
        << ",\"conversion\":" << ime(window, IMC_GETCONVERSIONMODE);
    out << "}"; return out.str();
}
int main(int argc, char** argv) {
    try {
        if (argc < 2) throw std::runtime_error("Missing action");
        std::string action = argv[1];
        int count = GetKeyboardLayoutList(0, nullptr);
        std::vector<HKL> layouts(count); GetKeyboardLayoutList(count, layouts.data());
        if (action == "list") {
            bool first = true, english = false;
            std::cout << "[";
            for (auto value : layouts) {
                if (!first) std::cout << ","; first = false;
                english = english || isEnglish(value);
                std::cout << "{\"id\":\"" << id(value) << "\",\"label\":\"Keyboard " << id(value)
                    << "\",\"english\":" << (isEnglish(value) ? "true" : "false") << "}";
            }
            // A Chinese IME can supply English without an installed US keyboard.
            if (!english) for (auto value : layouts) if (isIME(value)) {
                if (!first) std::cout << ","; first = false;
                std::cout << "{\"id\":\"ime:" << id(value) << "\",\"label\":\"IME English mode " << id(value)
                    << "\",\"english\":true}";
            }
            std::cout << "]\n"; return 0;
        }
        if (argc < 3) throw std::runtime_error("Missing foreground process");
        DWORD pid = std::stoul(argv[2]);
        HWND window = focused(pid);
        if (action == "get") { std::cout << snapshot(window) << "\n"; return 0; }
        if (action != "select" || argc != 4) throw std::runtime_error("Invalid action");
        std::string state = argv[3]; std::smatch match;
        if (!std::regex_search(state, match, std::regex("\"source\"\\s*:\\s*\"(ime:)?([0-9a-fA-F]+)\"")))
            throw std::runtime_error("Invalid input source");
        bool englishMode = match[1].matched;
        HKL target = reinterpret_cast<HKL>(static_cast<UINT_PTR>(std::stoull(match[2].str(), nullptr, 16)));
        if (std::find(layouts.begin(), layouts.end(), target) == layouts.end())
            throw std::runtime_error("Input source is not enabled");
        if (layout(window) != target) {
            PostMessageW(window, WM_INPUTLANGCHANGEREQUEST, 0, reinterpret_cast<LPARAM>(target));
            for (int n = 0; n < 25 && layout(window) != target; n++) { Sleep(10); focused(pid); }
            if (layout(window) != target) throw std::runtime_error("Keyboard layout verification failed");
        }
        focused(pid);
        if (isIME(target)) {
            if (std::regex_search(state, match, std::regex("\"conversion\"\\s*:\\s*([0-9]+)")))
                ime(window, IMC_SETCONVERSIONMODE, std::stoul(match[1].str()));
            bool hasOpen = std::regex_search(state, match, std::regex("\"open\"\\s*:\\s*(true|false)"));
            if (englishMode || hasOpen) {
                bool open = !englishMode && match[1].str() == "true";
                ime(window, IMC_SETOPENSTATUS, open);
                if (bool(ime(window, IMC_GETOPENSTATUS)) != open)
                    throw std::runtime_error("Input method state verification failed");
            }
        }
        std::cout << snapshot(window) << "\n";
    } catch (const std::exception& error) { std::cerr << error.what() << "\n"; return 1; }
}
