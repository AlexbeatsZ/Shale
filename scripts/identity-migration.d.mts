export const legacyBrand: string;
export const legacyVaultDirectory: string;
export function canonicalConfigurationPath(value: string): string;
export function canonicalEndpoint<T>(value: T): T;
export function migrateDesktopProfile(appData: string, destination?: string): string;
export function migrateVaultConfiguration(root: string): Promise<void>;
export function migrateRuntimeSettings(directory: string): Promise<void>;
