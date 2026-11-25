import Foundation
import Security
let previous = "@webobsidian/desktop"
let current = "Shale"
let query: [String: Any] = [kSecClass as String:kSecClassGenericPassword, kSecAttrService as String:previous + " Safe Storage", kSecReturnData as String:true, kSecMatchLimit as String:kSecMatchLimitOne]
var result: CFTypeRef?
let found = SecItemCopyMatching(query as CFDictionary, &result)
if found == errSecItemNotFound { print("No legacy encryption key to migrate"); exit(0) }
guard found == errSecSuccess, let data = result as? Data else { fputs("Cannot read existing encryption key: \(found)\n",stderr); exit(1) }
let lookup: [String: Any] = [kSecClass as String:kSecClassGenericPassword, kSecAttrService as String:current + " Safe Storage", kSecReturnData as String:true]
var existing: CFTypeRef?
let present=SecItemCopyMatching(lookup as CFDictionary, &existing)
if present == errSecSuccess {
 guard (existing as? Data) == data else { fputs("A different Shale encryption key already exists; preserved both\n",stderr);exit(2) }
 // Rewriting the access of an existing item asks for the keychain password; its
 // requirement-based ACL already trusts every build signed with the same identity.
 print("Shale encryption key already matches; left unchanged");exit(0)
}
guard present == errSecItemNotFound else { exit(3) }
var trusted = [SecTrustedApplication]()
for executable in [CommandLine.arguments[0]] + Array(CommandLine.arguments.dropFirst()) {
 var application: SecTrustedApplication?
 let result = executable.withCString { SecTrustedApplicationCreateFromPath($0, &application) }
 guard result == errSecSuccess, let application = application else { fputs("Cannot trust signed application: \(result)\n",stderr);exit(5) }
 trusted.append(application)
}
var access: SecAccess?
guard SecAccessCreate("Shale Safe Storage" as CFString, trusted as CFArray, &access) == errSecSuccess, let access = access else { exit(6) }
let add: [String: Any] = [kSecClass as String:kSecClassGenericPassword,kSecAttrService as String:current + " Safe Storage",kSecAttrAccount as String:current + " Key",kSecValueData as String:data,kSecAttrAccess as String:access]
let saved=SecItemAdd(add as CFDictionary,nil)
guard saved == errSecSuccess else { fputs("Cannot preserve encryption key: \(saved)\n",stderr);exit(4) }
print("Preserved existing encrypted data under Shale keychain identity")
