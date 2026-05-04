import { buildBasicAuthHeader } from "./auth.js";
import { RestRequestError } from "./errors.js";
import { redactSensitiveText, summarizePayloadForError } from "./redact.js";

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

export interface RestClient {
  getJson<T>(url: string): Promise<RestResponse<T>>;
  getText(url: string, options?: { maxBytes?: number }): Promise<RestResponse<string>>;
}

const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_TEXT_BYTES = 8_000;

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

  async function getText(url: string, opts: { maxBytes?: number } = {}): Promise<RestResponse<string>> {
    const maxBytes = opts.maxBytes ?? DEFAULT_MAX_TEXT_BYTES;
    const { response, rawBody } = await request(url, "text/plain, text/*, */*");
    return {
      status: response.status,
      data: rawBody.slice(0, maxBytes),
      headers: response.headers,
    };
  }

  return {
    getJson,
    getText,
  };
}
