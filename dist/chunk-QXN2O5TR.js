#!/usr/bin/env node

// src/client/error.ts
var HasznoApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HasznoApiError";
  }
  status;
};

// src/client/config.ts
import { existsSync, readFileSync } from "fs";
import { homedir } from "os";
import { join } from "path";
var CONFIG_PATH = join(homedir(), ".config", "haszno", "config.json");
var LEGACY_CONFIG_PATH = join(homedir(), ".config", "arfutar", "config.json");
var DEFAULT_API_URL = "https://haszno.com";
function parseConfig(raw) {
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const src = parsed;
  const out = {};
  for (const key of ["apiUrl", "apiKey", "basicAuth"]) {
    if (typeof src[key] === "string") out[key] = src[key];
  }
  return out;
}
function readConfigObject(configPath = CONFIG_PATH) {
  try {
    if (existsSync(configPath)) {
      const parsed = JSON.parse(readFileSync(configPath, "utf-8"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    }
  } catch {
  }
  return {};
}
function readConfigFile(configPath = CONFIG_PATH) {
  try {
    if (existsSync(configPath)) return parseConfig(readFileSync(configPath, "utf-8"));
  } catch {
  }
  if (configPath === CONFIG_PATH) {
    try {
      if (existsSync(LEGACY_CONFIG_PATH)) return parseConfig(readFileSync(LEGACY_CONFIG_PATH, "utf-8"));
    } catch {
    }
  }
  return {};
}
var normalizeUrl = (url) => url.replace(/\/+$/, "");
var nonEmpty = (v) => v ? v : void 0;
function resolveConnection(opts = {}, env = process.env, readConfig = readConfigFile) {
  let apiKey = nonEmpty(opts.apiKey) ?? nonEmpty(env["HASZNO_API_TOKEN"]) ?? nonEmpty(env["HASZNO_API_KEY"]) ?? nonEmpty(env["ARFUTAR_API_KEY"]);
  let basicAuth = nonEmpty(opts.basicAuth) ?? nonEmpty(env["HASZNO_BASIC"]) ?? nonEmpty(env["ARFUTAR_BASIC"]);
  let baseUrl = nonEmpty(opts.baseUrl) ?? nonEmpty(env["HASZNO_API_URL"]) ?? nonEmpty(env["ARFUTAR_API_URL"]);
  if (!apiKey && !basicAuth) {
    const config = readConfig();
    const configUrl = normalizeUrl(nonEmpty(config.apiUrl) ?? DEFAULT_API_URL);
    baseUrl ??= nonEmpty(config.apiUrl);
    if (normalizeUrl(baseUrl ?? DEFAULT_API_URL) === configUrl) {
      apiKey = nonEmpty(config.apiKey);
      basicAuth = nonEmpty(config.basicAuth);
    }
  }
  return { baseUrl: normalizeUrl(baseUrl ?? DEFAULT_API_URL), apiKey, basicAuth };
}

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
      try {
        const json = await response.json();
        if (json.error) message = json.error;
      } catch {
      }
      throw new HasznoApiError(response.status, message);
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
  CONFIG_PATH,
  readConfigObject,
  readConfigFile,
  resolveConnection,
  SHOP_TOKEN_PREFIX,
  isShopToken,
  request,
  get,
  post,
  put,
  patch,
  del
};
//# sourceMappingURL=chunk-QXN2O5TR.js.map