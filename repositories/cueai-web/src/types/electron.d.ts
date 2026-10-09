/**
 * Type-only shim. Desktop licensing modules import `electron`;
 * cueai-web never ships Electron. Used so Next/tsc can check sibling sources.
 */
declare module "electron" {
  export const safeStorage: {
    isEncryptionAvailable(): boolean;
    encryptString(plainText: string): Buffer;
    decryptString(encrypted: NodeJS.ArrayBufferView | string): string;
  };
}
