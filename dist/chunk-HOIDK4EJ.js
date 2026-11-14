#!/usr/bin/env node

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

export {
  CONFIG_PATH,
  LEGACY_CONFIG_PATH,
  DEFAULT_API_URL,
  readConfigObject,
  readConfigFile,
  resolveConnection
};
//# sourceMappingURL=chunk-HOIDK4EJ.js.map