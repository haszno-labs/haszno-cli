#!/usr/bin/env node
import {
  resolveConnection
} from "./chunk-HOIDK4EJ.js";

// src/client/error.ts
var HasznoApiError = class extends Error {
  constructor(status, message, code, requestId) {
    super(message);
    this.status = status;
    this.code = code;
    this.requestId = requestId;
    this.name = "HasznoApiError";
  }
  status;
  code;
  requestId;
};

// src/client/http.ts
var SHOP_TOKEN_PREFIX = "haszno_";
function isShopToken(key) {
  return !!key?.startsWith(SHOP_TOKEN_PREFIX);
}
var CLI_VERSION = "0.3.0";
function buildAuthHeader(conn) {
  if (conn.apiKey) {
    if (isShopToken(conn.apiKey)) return { Authorization: `Bearer ${conn.apiKey}` };
    return { "x-api-key": conn.apiKey };
  }
  if (conn.basicAuth) {
    const encoded = Buffer.from(conn.basicAuth).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function request(method, path, body, opts) {
  const conn = resolveConnection(opts, process.env, opts.readConfig);
  const url = `${conn.baseUrl}${path}`;
  const fetchFn = opts.fetch ?? fetch;
  const maxRetries = opts.maxRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 3e4;
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": `haszno-cli/${CLI_VERSION}`,
    ...buildAuthHeader(conn)
  };
  let lastError;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    if (attempt > 0) await sleep(retryDelayMs * Math.pow(2, attempt - 1));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let response;
    try {
      response = await fetchFn(url, {
        method,
        headers,
        body: body !== void 0 ? JSON.stringify(body) : void 0,
        signal: controller.signal
      });
    } catch (err) {
      lastError = err;
      continue;
    } finally {
      clearTimeout(timer);
    }
    if ((response.status === 429 || response.status >= 500) && attempt < maxRetries - 1) {
      lastError = new HasznoApiError(response.status, `HTTP ${response.status}`);
      continue;
    }
    if (!response.ok) {
      let message = `HTTP ${response.status}`;
      let code;
      let requestId;
      try {
        const json = await response.json();
        if (json.error) message = json.error;
        if (json.code) code = json.code;
        if (json.requestId) requestId = json.requestId;
      } catch {
      }
      if (!requestId) {
        const hdr = response.headers.get("x-request-id");
        if (hdr) requestId = hdr;
      }
      throw new HasznoApiError(response.status, message, code, requestId);
    }
    const text = await response.text();
    if (!text) return void 0;
    return JSON.parse(text);
  }
  if (lastError instanceof HasznoApiError) throw lastError;
  throw new Error(`Network error after ${maxRetries} attempts: ${String(lastError)}`);
}
function get(path, opts) {
  return request("GET", path, void 0, opts);
}
function post(path, body, opts) {
  return request("POST", path, body, opts);
}
function put(path, body, opts) {
  return request("PUT", path, body, opts);
}
function patch(path, body, opts) {
  return request("PATCH", path, body, opts);
}
function del(path, opts) {
  return request("DELETE", path, void 0, opts);
}

export {
  HasznoApiError,
  SHOP_TOKEN_PREFIX,
  isShopToken,
  request,
  get,
  post,
  put,
  patch,
  del
};
//# sourceMappingURL=chunk-VM33OE5G.js.map