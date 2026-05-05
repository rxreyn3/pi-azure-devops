import { buildBasicAuthHeader } from "./auth.js";
import { RestRequestError } from "./errors.js";
import { redactSensitiveText, summarizePayloadForError } from "./redact.js";
import { DEFAULT_LOG_MAX_BYTES } from "./limits.js";

export interface RestClientOptions {
  token: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  additionalSensitiveValues?: string[];
}

export interface RestResponse<T> {
  status: number;
  data: T;
  headers: Headers;
}

export interface RestTextResponse {
  status: number;
  data: string;
  headers: Headers;
  /** Total length (in JS string code units) of the unsliced response body. */
  totalBytes: number;
  /** True when the returned `data` is shorter than the full response body. */
  truncated: boolean;
}

export interface BinaryRequestOptions {
  accept?: string;
  maxBytes?: number;
  additionalSensitiveValues?: string[];
  auth?: "azureDevOps" | "none";
}

export interface RestClient {
  getJson<T>(url: string): Promise<RestResponse<T>>;
  getText(url: string, options?: { maxBytes?: number }): Promise<RestTextResponse>;
  getBinary(url: string, options?: BinaryRequestOptions): Promise<RestResponse<Uint8Array>>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
export const DEFAULT_MAX_ARTIFACT_BYTES = 100 * 1024 * 1024; // 100 MiB
export const ABSOLUTE_MAX_ARTIFACT_BYTES = 500 * 1024 * 1024; // hard upper clamp

function asRedactedMessage(message: string, sensitiveValues: string[]): string {
  return redactSensitiveText(message, sensitiveValues);
}

export function createReadOnlyRestClient(options: RestClientOptions): RestClient {
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const authHeader = buildBasicAuthHeader(options.token);
  const sensitiveValues = [options.token, authHeader, ...(options.additionalSensitiveValues ?? [])];

  async function request(url: string, accept: string): Promise<{ response: Response; rawBody: string }> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetchImpl(url, {
        method: "GET",
        headers: {
          Authorization: authHeader,
          Accept: accept,
        },
        signal: controller.signal,
      });

      const rawBody = await response.text();

      if (!response.ok) {
        const summary = summarizePayloadForError(rawBody);
        throw new RestRequestError(
          asRedactedMessage(`HTTP ${response.status} ${response.statusText}: ${summary}`, sensitiveValues),
          url,
          response.status,
        );
      }

      return { response, rawBody };
    } catch (error) {
      if (error instanceof RestRequestError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new RestRequestError(
          asRedactedMessage(`Request timed out after ${timeoutMs}ms`, sensitiveValues),
          url,
          undefined,
          error,
        );
      }

      const message = error instanceof Error ? error.message : "Unknown request failure";
      throw new RestRequestError(asRedactedMessage(message, sensitiveValues), url, undefined, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  async function getJson<T>(url: string): Promise<RestResponse<T>> {
    const { response, rawBody } = await request(url, "application/json");
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("application/json")) {
      throw new RestRequestError(
        asRedactedMessage(`Expected JSON response but received ${contentType || "unknown content type"}`, sensitiveValues),
        url,
        response.status,
      );
    }

    try {
      const data = JSON.parse(rawBody) as T;
      return {
        status: response.status,
        data,
        headers: response.headers,
      };
    } catch (error) {
      throw new RestRequestError(
        asRedactedMessage("Failed to parse JSON response", sensitiveValues),
        url,
        response.status,
        error,
      );
    }
  }

  async function getText(url: string, opts: { maxBytes?: number } = {}): Promise<RestTextResponse> {
    const maxBytes = opts.maxBytes ?? DEFAULT_LOG_MAX_BYTES;
    const { response, rawBody } = await request(url, "text/plain, text/*, */*");
    const totalBytes = rawBody.length;
    const data = rawBody.slice(0, maxBytes);
    return {
      status: response.status,
      data,
      headers: response.headers,
      totalBytes,
      truncated: totalBytes > data.length,
    };
  }

  async function getBinary(url: string, opts: BinaryRequestOptions = {}): Promise<RestResponse<Uint8Array>> {
    const accept = opts.accept ?? "application/zip, application/octet-stream, */*";
    const requestedMax = Number.isFinite(opts.maxBytes) ? (opts.maxBytes as number) : DEFAULT_MAX_ARTIFACT_BYTES;
    const maxBytes = Math.min(Math.max(1, Math.floor(requestedMax)), ABSOLUTE_MAX_ARTIFACT_BYTES);
    const auth = opts.auth ?? "azureDevOps";
    const localSensitive = [
      ...sensitiveValues,
      ...(opts.additionalSensitiveValues ?? []),
      url,
    ];

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const headers: Record<string, string> = { Accept: accept };
      if (auth === "azureDevOps") {
        headers.Authorization = authHeader;
      }

      const response = await fetchImpl(url, {
        method: "GET",
        headers,
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const summary = summarizePayloadForError(body);
        throw new RestRequestError(
          asRedactedMessage(`HTTP ${response.status} ${response.statusText}: ${summary}`, localSensitive),
          url,
          response.status,
        );
      }

      const reader = response.body?.getReader?.();
      let bytes: Uint8Array;
      if (reader) {
        const chunks: Uint8Array[] = [];
        let total = 0;
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            total += value.byteLength;
            if (total > maxBytes) {
              try {
                await reader.cancel();
              } catch {
                /* swallow cancel errors */
              }
              throw new RestRequestError(
                asRedactedMessage(`Binary response exceeded maxBytes=${maxBytes}`, localSensitive),
                url,
                response.status,
              );
            }
            chunks.push(value);
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {
            /* swallow release errors */
          }
        }
        bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes.set(chunk, offset);
          offset += chunk.byteLength;
        }
      } else {
        const buf = new Uint8Array(await response.arrayBuffer());
        if (buf.byteLength > maxBytes) {
          throw new RestRequestError(
            asRedactedMessage(`Binary response exceeded maxBytes=${maxBytes}`, localSensitive),
            url,
            response.status,
          );
        }
        bytes = buf;
      }

      return {
        status: response.status,
        data: bytes,
        headers: response.headers,
      };
    } catch (error) {
      if (error instanceof RestRequestError) {
        throw error;
      }
      if (error instanceof Error && error.name === "AbortError") {
        throw new RestRequestError(
          asRedactedMessage(`Request timed out after ${timeoutMs}ms`, localSensitive),
          url,
          undefined,
          error,
        );
      }
      const message = error instanceof Error ? error.message : "Unknown request failure";
      throw new RestRequestError(asRedactedMessage(message, localSensitive), url, undefined, error);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    getJson,
    getText,
    getBinary,
  };
}
