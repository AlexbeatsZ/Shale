import type { IncomingMessage, ServerResponse } from 'node:http';
export function routeShale(request: IncomingMessage, response: ServerResponse, options?: { port?: number; maxBlobBytes?: number }): boolean;

export { routeShale as routeWebObsidian };
