export function bridgeRequest(url: string, method: string, payload?: unknown, headerFile?: string, binaryFile?: string, responseType?: 'json' | 'binary'): Promise<any>;
export function closeBridge(): void;
