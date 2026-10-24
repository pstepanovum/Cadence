export const RAW_DIR: string;
export const RAW_NAME: RegExp;
export function readPngSize(file: string): Promise<{ width: number; height: number; colorType: number } | null>;
export function rawManifest(rawDir?: string): Promise<Record<string, { width: number; height: number; mtime: number }>>;
