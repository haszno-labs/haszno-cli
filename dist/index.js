#!/usr/bin/env node

// src/index.ts
import { Command as Command2 } from "commander";

// src/client/error.ts
var HasznoApiError = class extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
    this.name = "HasznoApiError";
  }
  status;
};

// src/client/http.ts
function buildAuthHeader(opts) {
  const bearerToken = opts.apiKey ?? process.env["HASZNO_API_TOKEN"] ?? process.env["HASZNO_API_KEY"] ?? // silent migration alias
  process.env["ARFUTAR_API_KEY"];
  if (bearerToken) return { Authorization: `Bearer ${bearerToken}` };
  const basic = opts.basicAuth ?? process.env["HASZNO_BASIC"] ?? process.env["ARFUTAR_BASIC"];
  if (basic) {
    const encoded = Buffer.from(basic).toString("base64");
    return { Authorization: `Basic ${encoded}` };
  }
  return {};
}
async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function request(method, path, body, opts) {
  const baseUrl = (opts.baseUrl ?? process.env["HASZNO_API_URL"] ?? process.env["ARFUTAR_API_URL"] ?? "https://haszno.com").replace(/\/$/, "");
  const url = `${baseUrl}${path}`;
  const fetchFn = opts.fetch ?? fetch;
  const maxRetries = opts.maxRetries ?? 3;
  const retryDelayMs = opts.retryDelayMs ?? 500;
  const timeoutMs = opts.timeoutMs ?? 3e4;
  const headers = {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "User-Agent": "haszno-cli/0.1.0",
    ...buildAuthHeader(opts)
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

// src/client/index.ts
function createClient(opts = {}) {
  const o = opts;
  return {
    health: {
      check: () => get("/api/health", o)
    },
    settings: {
      get: () => get("/api/settings", o),
      update: (body) => put("/api/settings", body, o)
    },
    products: {
      list: (params) => {
        const qs = params?.all ? "?all=1" : "";
        return get(`/api/products${qs}`, o);
      },
      update: (id, body) => patch(`/api/products/${id}`, body, o),
      setListing: (id, body) => post(`/api/products/${id}/listing`, body, o),
      generateAiDescription: (id) => post(`/api/products/${id}/ai-description`, null, o),
      applyPrices: (body) => post("/api/products/apply-prices", body ?? {}, o)
    },
    stats: {
      get: () => get("/api/stats", o),
      getImpact: (params) => {
        const qs = params?.days != null ? `?days=${params.days}` : "";
        return get(`/api/impact${qs}`, o);
      }
    },
    suppliers: {
      list: () => get("/api/suppliers", o)
    },
    feeds: {
      importFeed: (body) => post("/api/feeds/import", body, o),
      importMarketPrices: (body) => post("/api/market-prices/import", body, o)
    },
    orders: {
      list: () => get("/api/orders", o),
      receiveOrder: (body) => post("/api/webhooks/order", body, o),
      ship: (id) => post(`/api/orders/${id}/ship`, null, o),
      createDemo: () => post("/api/demo/order", null, o)
    },
    recommendations: {
      get: () => get("/api/recommendations", o),
      getAiShortlist: () => post("/api/recommendations/ai", null, o),
      fillTrendKeywords: () => post("/api/trends/keywords", null, o)
    },
    rules: {
      listTemplates: () => get("/api/rules/templates", o),
      list: () => get("/api/rules", o),
      create: (body) => post("/api/rules", body, o),
      update: (id, body) => patch(`/api/rules/${id}`, body, o),
      delete: (id) => del(`/api/rules/${id}`, o),
      run: (id) => post(`/api/rules/${id}/run`, null, o),
      runAll: () => post("/api/rules/run-all", null, o),
      trigger: (body) => post("/api/rules/trigger", body, o),
      listRuns: (params) => {
        const qs = params?.limit != null ? `?limit=${params.limit}` : "";
        return get(`/api/rule-runs${qs}`, o);
      },
      undoUnlists: (body) => post("/api/rule-runs/undo", body, o)
    },
    proposals: {
      list: (params) => {
        const qs = params?.status ? `?status=${params.status}` : "";
        return get(`/api/proposals${qs}`, o);
      },
      approve: (body) => post("/api/proposals/approve", body ?? {}, o),
      reject: (body) => post("/api/proposals/reject", body, o),
      rollback: (body) => post("/api/proposals/rollback", body, o)
    },
    automation: {
      get: () => get("/api/automation", o),
      set: (body) => put("/api/automation", body, o)
    },
    network: {
      listSuppliers: () => get("/api/network/suppliers", o),
      getSupplierProducts: (id) => get(`/api/network/suppliers/${id}/products`, o),
      connect: (id) => post(`/api/network/suppliers/${id}/connect`, null, o),
      disconnect: (id) => post(`/api/network/suppliers/${id}/disconnect`, null, o),
      sync: (id) => post(`/api/network/suppliers/${id}/sync`, null, o),
      getSupplierView: (supplierId) => get(`/api/network/supplier-view/${supplierId}`, o)
    },
    catalogue: {
      search: (params) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set("q", params.q);
        if (params.cats) qs.set("cats", params.cats);
        if (params.partner != null) qs.set("partner", String(params.partner));
        if (params.minMarginPct != null) qs.set("minMarginPct", String(params.minMarginPct));
        if (params.maxPrice != null) qs.set("maxPrice", String(params.maxPrice));
        if (params.minPrice != null) qs.set("minPrice", String(params.minPrice));
        if (params.inStock) qs.set("inStock", "1");
        if (params.hasImage) qs.set("hasImage", "1");
        if (params.country) qs.set("country", params.country);
        if (params.sort) qs.set("sort", params.sort);
        if (params.page != null) qs.set("page", String(params.page));
        if (params.pageSize != null) qs.set("pageSize", String(params.pageSize));
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        return get(`/api/catalogue/products${suffix}`, o);
      }
    },
    importList: {
      list: (params) => {
        const qs = new URLSearchParams();
        if (params?.status) qs.set("status", params.status);
        if (params?.partner != null) qs.set("partner", String(params.partner));
        if (params?.q) qs.set("q", params.q);
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        return get(`/api/import-list${suffix}`, o);
      },
      add: (body) => post("/api/import-list", body, o),
      // Routes to the correct endpoint depending on whether a target connection is given.
      push: ((body) => {
        if (body.targetConnectionId != null) {
          return post(
            `/api/connect/stores/${body.targetConnectionId}/push`,
            { importListIds: body.ids },
            o
          );
        }
        return post("/api/import-list/push", { ids: body.ids }, o);
      })
    },
    connections: {
      list: () => get("/api/connect/stores", o),
      get: (id) => get(`/api/connect/stores/${id}`, o)
    },
    peers: {
      createInvite: (body) => post("/api/peers/invites", body, o),
      listInvites: () => get("/api/peers/invites", o),
      revokeInvite: (code) => del(`/api/peers/invites/${code}`, o),
      acceptInvite: (code, body) => post(`/api/peers/invites/${code}/accept`, body, o),
      listLinks: () => get("/api/peers/links", o),
      removeLink: (id) => del(`/api/peers/links/${id}`, o),
      setVisibility: (id, body) => put(`/api/peers/suppliers/${id}/visibility`, body, o)
    },
    blog: {
      list: (params) => {
        const qs = new URLSearchParams();
        if (params?.period) qs.set("period", params.period);
        if (params?.page != null) qs.set("page", String(params.page));
        if (params?.perPage != null) qs.set("perPage", String(params.perPage));
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        return get(`/api/blog${suffix}`, o);
      },
      get: (slug) => get(`/api/blog/${slug}`, o)
    },
    agent: {
      products: () => get("/api/agent/products", o),
      orders: () => get("/api/agent/orders", o),
      proposals: () => get("/api/agent/proposals", o),
      createProposal: (body) => post("/api/agent/proposals", body, o)
    }
  };
}

// src/commands/catalog.ts
function registerCatalogCommands(_program, _client) {
}

// src/commands/products.ts
import readline from "readline";
var NOT_AVAILABLE_MSG = "Nem el\xE9rhet\u0151 bolt API-kulccsal. Ez a m\u0171velet session tokent (webes bejelentkez\xE9st) ig\xE9nyel.\nHaszn\xE1ld a Haszno webes fel\xFCletet a v\xE9grehajt\xE1shoz.";
function fmtFt(n) {
  return n.toLocaleString("hu-HU") + " Ft";
}
function fmtPct(n) {
  return n.toFixed(1) + "%";
}
function padEnd(s, n) {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}
function printTable(headers, rows, widths) {
  const headerLine = headers.map((h, i) => padEnd(h, widths[i] ?? 8)).join(" \u2502 ");
  const divider = widths.map((w) => "\u2500".repeat(w)).join("\u2500\u253C\u2500");
  console.log(headerLine);
  console.log(divider);
  for (const row of rows) {
    console.log(row.map((cell, i) => padEnd(cell, widths[i] ?? 8)).join(" \u2502 "));
  }
}
function statusLabel(p) {
  if (p.current.marginPct < 0) return "VESZTES\xC9GES";
  if (!p.listed) return "nincs list\xE1n";
  return "OK";
}
async function cmdList(client2, opts) {
  let rows = await client2.agent.products();
  if (opts.losing) rows = rows.filter((p) => p.current.marginPct < 0);
  if (opts.cats) {
    const cats = opts.cats.toLowerCase().split(",").map((c) => c.trim()).filter(Boolean);
    rows = rows.filter((p) => cats.some((c) => p.supplierName.toLowerCase().includes(c)));
  }
  if (opts.json) {
    console.log(JSON.stringify(rows, null, 2));
    return;
  }
  if (rows.length === 0) {
    console.log("Nincs tal\xE1lat.");
    return;
  }
  printTable(
    ["ID", "SKU", "Term\xE9k", "\xC1r (Ft)", "Aj\xE1nlott", "Marzs", "K\xE9szlet", "St\xE1tusz"],
    rows.map((p) => [
      String(p.id),
      p.sku.slice(0, 18),
      p.name.slice(0, 30),
      fmtFt(p.priceGross),
      fmtFt(p.recommended.priceGross),
      fmtPct(p.current.marginPct),
      String(p.stock),
      statusLabel(p)
    ]),
    [5, 18, 30, 11, 11, 7, 7, 12]
  );
  console.log(`
${rows.length} term\xE9k`);
}
async function cmdShow(client2, id, opts) {
  const products = await client2.agent.products();
  const p = products.find((x) => x.id === id);
  if (!p) {
    console.error(`Nem tal\xE1lhat\xF3 term\xE9k: ${id}`);
    process.exitCode = 1;
    return;
  }
  if (opts.json) {
    console.log(JSON.stringify(p, null, 2));
    return;
  }
  console.log(`ID:            ${p.id}`);
  console.log(`SKU:           ${p.sku}`);
  console.log(`Neve:          ${p.name}`);
  console.log(`Besz\xE1ll\xEDt\xF3:    ${p.supplierName}`);
  console.log(`Elad\xE1si \xE1r:    ${fmtFt(p.priceGross)} (brutt\xF3)`);
  console.log(`Aj\xE1nlott \xE1r:   ${fmtFt(p.recommended.priceGross)}`);
  console.log(`Marzs (aktu):  ${fmtPct(p.current.marginPct)} (${fmtFt(p.current.marginNet)} nett\xF3)`);
  console.log(`Marzs (aj\xE1nl): ${fmtPct(p.recommended.marginPct)} (${fmtFt(p.recommended.marginNet)} nett\xF3)`);
  console.log(`K\xE9szlet:       ${p.stock}`);
  console.log(`List\xE1n:        ${p.listed ? "igen" : "nem"}`);
}
async function cmdUpdate(_client, _id, _opts) {
  console.error(NOT_AVAILABLE_MSG);
  process.exitCode = 1;
}
async function cmdListing(_client, _id, _opts) {
  console.error(NOT_AVAILABLE_MSG);
  process.exitCode = 1;
}
async function cmdApplyPrices(_client, _opts) {
  console.error(NOT_AVAILABLE_MSG);
  process.exitCode = 1;
}
async function cmdDescribe(_client, _id, _opts) {
  console.error(NOT_AVAILABLE_MSG);
  process.exitCode = 1;
}
async function cmdStats(_client, _opts) {
  console.error(NOT_AVAILABLE_MSG);
  process.exitCode = 1;
}
async function cmdImpact(_client, _opts) {
  console.error(NOT_AVAILABLE_MSG);
  process.exitCode = 1;
}
function handleError(err) {
  if (err instanceof Error) {
    console.error("Hiba:", err.message);
  } else {
    console.error("Ismeretlen hiba:", String(err));
  }
  process.exit(1);
}
function registerProductsCommands(program2, client2) {
  const products = program2.command("products").description("Saj\xE1t bolt term\xE9kei \xE9s \xE1raz\xE1s");
  products.command("list").description("Term\xE9kek list\xE1ja marginnal \xE9s \xE1r\xE1llapottal (agent endpoint, bolt token)").option("--losing", "Csak vesztes\xE9ges term\xE9kek (marzs < 0)").option("--cats <nevek>", 'Sz\u0171r\xE9s besz\xE1ll\xEDt\xF3n\xE9vre \u2014 vessz\u0151vel elv\xE1lasztott r\xE9szsztringek, pl. "auto,kert"').action(async (opts) => {
    const root = program2.opts();
    await cmdList(client2, { ...opts, json: root.json }).catch(handleError);
  });
  products.command("show <id>").description("Term\xE9k r\xE9szletes adatlapja").action(async (id) => {
    const root = program2.opts();
    await cmdShow(client2, Number(id), { json: root.json }).catch(handleError);
  });
  products.command("update <id>").description("Piaci \xE1r / bolt neve / elad\xE1si \xE1r friss\xEDt\xE9se [\xCDR\xC1S]").option("--market-min <ft>", 'Piaci minimum \xE1r (Ft brutt\xF3; "null" = t\xF6rl\xE9s)').option("--market-shop <nev>", 'Piaci forr\xE1s neve ("null" = t\xF6rl\xE9s)').option("--price <ft>", "Saj\xE1t elad\xE1si \xE1r (Ft brutt\xF3)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (id, opts) => {
    const root = program2.opts();
    await cmdUpdate(client2, Number(id), { ...opts, json: root.json }).catch(handleError);
  });
  products.command("listing <id>").description("Term\xE9k list\xE1z\xE1sa vagy lev\xE9tele [\xCDR\xC1S]").option("--on", "Tegye list\xE1ra").option("--off", "Vegye le a list\xE1r\xF3l").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (id, opts) => {
    const root = program2.opts();
    await cmdListing(client2, Number(id), { ...opts, json: root.json }).catch(handleError);
  });
  products.command("apply-prices").description("Alkalmazza az AI \xE1ltal javasolt \xE1rakat [\xCDR\xC1S]").option("--ids <ids>", 'Csak ezekre a term\xE9k-ID-kra (vessz\u0151vel elv\xE1lasztva), pl. "12,34,56"').option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts) => {
    const root = program2.opts();
    await cmdApplyPrices(client2, { ...opts, json: root.json }).catch(handleError);
  });
  products.command("describe <id>").description("AI term\xE9kle\xEDr\xE1s gener\xE1l\xE1sa [\xCDR\xC1S]").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (id, opts) => {
    const root = program2.opts();
    await cmdDescribe(client2, Number(id), { ...opts, json: root.json }).catch(handleError);
  });
  products.command("stats").description("Term\xE9k dashboard \xF6sszes\xEDt\u0151").action(async () => {
    const root = program2.opts();
    await cmdStats(client2, { json: root.json }).catch(handleError);
  });
  products.command("impact").description("Haszon-m\xE9r\u0151: becs\xFClt extra profit az aj\xE1nlott \xE1rakb\xF3l").option("--days <n>", "Visszatekint\xE9si ablak napokban (alap\xE9rtelmez\xE9s: 30)").action(async (opts) => {
    const root = program2.opts();
    await cmdImpact(client2, { ...opts, json: root.json }).catch(handleError);
  });
}

// src/commands/proposals.ts
import { randomUUID } from "crypto";
var NOT_AVAILABLE_MSG2 = "Nem el\xE9rhet\u0151 bolt API-kulccsal. A j\xF3v\xE1hagy\xE1s/elutas\xEDt\xE1s/visszag\xF6rget\xE9s emberi d\xF6nt\xE9st ig\xE9nyel \u2014 haszn\xE1ld a Haszno webes fel\xFCletet (\xC1raz\xE1s \u2192 Javaslatok).\nEz sz\xE1nd\xE9kos: a bolt token csak PENDING javaslatot tud l\xE9trehozni.";
function isJsonMode(cmd) {
  let c = cmd;
  while (c.parent) c = c.parent;
  return !!c.opts().json;
}
function printJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function fmtPrice(n) {
  return n.toLocaleString("hu-HU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/ /g, " ") + " Ft";
}
function fmtDate(s) {
  if (!s) return "\u2014";
  return new Date(s).toLocaleDateString("hu-HU");
}
function printProposalTable(rows) {
  if (rows.length === 0) {
    process.stdout.write("Nincs tal\xE1lat.\n");
    return;
  }
  const idW = 6;
  const skuW = Math.min(20, Math.max(4, ...rows.map((r) => (r.productSku ?? "\u2014").length)));
  const nameW = Math.min(28, Math.max(6, ...rows.map((r) => (r.productName ?? "\u2014").length)));
  const oldW = 12;
  const newW = 12;
  const dateW = 12;
  function padR2(s, w) {
    return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
  }
  function padL2(s, w) {
    return s.length >= w ? s.slice(0, w) : " ".repeat(w - s.length) + s;
  }
  const header = padL2("ID", idW) + "  " + padR2("SKU", skuW) + "  " + padR2("Term\xE9k", nameW) + "  " + padL2("R\xE9gi \xE1r", oldW) + "  " + padL2("Javasolt", newW) + "  " + padR2("D\xE1tum", dateW);
  process.stdout.write(header + "\n" + "-".repeat(header.length) + "\n");
  for (const r of rows) {
    const line = padL2(String(r.id), idW) + "  " + padR2(r.productSku ?? "\u2014", skuW) + "  " + padR2(r.productName ?? "\u2014", nameW) + "  " + padL2(fmtPrice(r.oldPriceGross), oldW) + "  " + padL2(fmtPrice(r.proposedPriceGross), newW) + "  " + padR2(fmtDate(r.createdAt), dateW);
    process.stdout.write(line + "\n");
  }
}
function handleApiError(err) {
  if (err instanceof HasznoApiError) {
    switch (err.status) {
      case 401:
        console.error("Hiba: \xC9rv\xE9nytelen, lej\xE1rt vagy visszavont API-kulcs. Hozz l\xE9tre \xFAjat: Haszno \u2192 Integr\xE1ci\xF3 \u2192 API-kulcsok.");
        break;
      case 403:
        console.error("Hiba: A bolt token nem jogosult erre a m\u0171veletre. Ellen\u0151rizd a token hat\xE1sk\xF6r\xE9t.");
        break;
      case 404:
        console.error("Hiba: A term\xE9k nem tal\xE1lhat\xF3 a boltban. Csak saj\xE1t term\xE9kazonos\xEDt\xF3ra lehet javaslatot tenni.");
        break;
      case 409:
        console.error("Hiba: Duplik\xE1lt nonce \u2014 ez a javaslat m\xE1r l\xE9tezik. Az \xFAjra-futtat\xE1s automatikusan \xFAj nonce-t gener\xE1l.");
        break;
      case 429:
        console.error("Hiba: T\xFAl sok sikertelen k\xEDs\xE9rlet. V\xE1rj n\xE9h\xE1ny percet.");
        break;
      default:
        console.error(`API hiba (${err.status}): ${err.message}`);
    }
  } else {
    console.error("V\xE1ratlan hiba:", err instanceof Error ? err.message : String(err));
  }
  process.exit(1);
}
function die(msg, code = 1) {
  process.stderr.write(`Hiba: ${msg}
`);
  process.exit(code);
}
function registerProposalsCommands(program2, client2) {
  const proposals = program2.command("proposals").description("\xC1raz\xE1si javaslatok kezel\xE9se (agent endpoint, bolt token)");
  proposals.command("list").description("F\xFCgg\u0151 (pending) javaslatok list\xE1z\xE1sa").action(async (_opts, cmd) => {
    let rows;
    try {
      rows = await client2.agent.proposals();
    } catch (err) {
      handleApiError(err);
      return;
    }
    if (isJsonMode(cmd)) {
      printJson(rows);
    } else {
      printProposalTable(rows);
      process.stdout.write(`
\xD6sszesen: ${rows.length} f\xFCgg\u0151 javaslat
`);
      if (rows.length > 0) {
        process.stdout.write("(J\xF3v\xE1hagy\xE1shoz: Haszno webes fel\xFClet \u2192 \xC1raz\xE1s \u2192 Javaslatok)\n");
      }
    }
  });
  proposals.command("show <id>").description("Egy f\xFCgg\u0151 javaslat r\xE9szletei ID alapj\xE1n").action(async (idStr, _opts, cmd) => {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) {
      die(`\xC9rv\xE9nytelen ID: "${idStr}"`, 2);
      return;
    }
    let rows;
    try {
      rows = await client2.agent.proposals();
    } catch (err) {
      handleApiError(err);
      return;
    }
    const row = rows.find((r) => r.id === id);
    if (!row) {
      die(`Nem tal\xE1lhat\xF3 f\xFCgg\u0151 javaslat ID=${id}. Csak pending javaslatok el\xE9rhet\u0151k bolt tokennel.`, 1);
      return;
    }
    if (isJsonMode(cmd)) {
      printJson(row);
    } else {
      process.stdout.write(
        `ID:          ${row.id}
Term\xE9k:      ${row.productName ?? "\u2014"} (ID: ${row.productId})
SKU:         ${row.productSku ?? "\u2014"}
R\xE9gi \xE1r:     ${fmtPrice(row.oldPriceGross)}
Javasolt \xE1r: ${fmtPrice(row.proposedPriceGross)}
Ok:          ${row.reason}
\xC1llapot:     ${row.status}
L\xE9trehozva:  ${fmtDate(row.createdAt)}
`
      );
    }
  });
  proposals.command("create").description("\xDAj \xE1raz\xE1si javaslat l\xE9trehoz\xE1sa (pending \u2014 j\xF3v\xE1hagy\xE1s a webes fel\xFCleten)").requiredOption("--product-id <id>", "Term\xE9k ID (eg\xE9sz sz\xE1m)").requiredOption("--price <ft>", "Javasolt brutt\xF3 \xE1r (eg\xE9sz Ft)").requiredOption("--reason <szoveg>", "Az \xE1raz\xE1s indokl\xE1sa (1\u2013500 karakter)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    const productId = Number(opts.productId);
    if (!Number.isInteger(productId) || productId <= 0) {
      die(`\xC9rv\xE9nytelen term\xE9k ID: "${opts.productId}"`, 2);
      return;
    }
    const proposedPriceGross = Number(opts.price);
    if (!Number.isInteger(proposedPriceGross) || proposedPriceGross <= 0) {
      die(`Az \xE1r eg\xE9sz pozit\xEDv sz\xE1m kell legyen: "${opts.price}"`, 2);
      return;
    }
    const reason = opts.reason.trim();
    if (reason.length < 1 || reason.length > 500) {
      die("Az indokl\xE1s 1\u2013500 karakter lehet.", 2);
      return;
    }
    if (!opts.yes && process.stdin.isTTY) {
      const { createInterface: createInterface4 } = await import("readline");
      const rl = createInterface4({ input: process.stdin, output: process.stdout });
      const answer = await new Promise((resolve) => {
        rl.question(
          `Javaslatot adsz be: term\xE9k #${productId}, \xE1r: ${fmtPrice(proposedPriceGross)}, ok: "${reason}".
Folytatod? [i/n] `,
          (a) => {
            rl.close();
            resolve(a.trim().toLowerCase());
          }
        );
      });
      if (answer !== "i") {
        console.log("Megszak\xEDtva.");
        process.exit(0);
      }
    }
    const nonce = randomUUID();
    let result;
    try {
      result = await client2.agent.createProposal({ productId, proposedPriceGross, reason, nonce });
    } catch (err) {
      handleApiError(err);
      return;
    }
    if (isJsonMode(cmd)) {
      printJson({ ...result, nonce });
    } else {
      process.stdout.write(
        `Javaslat l\xE9trehozva (ID: ${result.id})
\xC1llapot:     ${result.status}
L\xE9trehozva:  ${fmtDate(result.createdAt)}
(J\xF3v\xE1hagy\xE1shoz: Haszno webes fel\xFClet \u2192 \xC1raz\xE1s \u2192 Javaslatok)
`
      );
    }
  });
  proposals.command("approve").description("Javaslatok j\xF3v\xE1hagy\xE1sa \u2014 NEM EL\xC9RHET\u0150 bolt API-kulccsal").option("--ids <ids>", "ID-k").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async () => {
    console.error(NOT_AVAILABLE_MSG2);
    process.exit(1);
  });
  proposals.command("reject").description("Javaslatok elutas\xEDt\xE1sa \u2014 NEM EL\xC9RHET\u0150 bolt API-kulccsal").option("--ids <ids>", "ID-k").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async () => {
    console.error(NOT_AVAILABLE_MSG2);
    process.exit(1);
  });
  proposals.command("rollback").description("Batch visszag\xF6rget\xE9se \u2014 NEM EL\xC9RHET\u0150 bolt API-kulccsal").option("--batch <batchId>", "Batch ID").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async () => {
    console.error(NOT_AVAILABLE_MSG2);
    process.exit(1);
  });
}

// src/commands/rules.ts
function isJsonMode2(cmd) {
  let c = cmd;
  while (c.parent) c = c.parent;
  return !!c.opts().json;
}
function printJson2(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function fmtDate2(s) {
  if (!s) return "\u2014";
  return new Date(s).toLocaleDateString("hu-HU");
}
function fmtBool(v) {
  return v ? "igen" : "nem";
}
function die2(msg, code = 1) {
  process.stderr.write(`Hiba: ${msg}
`);
  process.exit(code);
}
function padR(s, w) {
  return s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
}
function padL(s, w) {
  return s.length >= w ? s.slice(0, w) : " ".repeat(w - s.length) + s;
}
function printRuleTable(rows) {
  if (rows.length === 0) {
    process.stdout.write("Nincs szab\xE1ly.\n");
    return;
  }
  const idW = 4;
  const nameW = Math.min(32, Math.max(4, ...rows.map((r) => r.name.length)));
  const trigW = Math.min(20, Math.max(7, ...rows.map((r) => r.trigger.length)));
  const tplW = Math.min(20, Math.max(8, ...rows.map((r) => (r.template ?? "\u2014").length)));
  const condW = 6;
  const enW = 6;
  const dateW = 12;
  const header = padL("ID", idW) + "  " + padR("N\xE9v", nameW) + "  " + padR("Trigger", trigW) + "  " + padR("Sablon", tplW) + "  " + padL("Felt.", condW) + "  " + padR("Akt\xEDv", enW) + "  " + padR("L\xE9trehozva", dateW);
  process.stdout.write(header + "\n" + "-".repeat(header.length) + "\n");
  for (const r of rows) {
    const line = padL(String(r.id), idW) + "  " + padR(r.name, nameW) + "  " + padR(r.trigger, trigW) + "  " + padR(r.template ?? "\u2014", tplW) + "  " + padL(String(r.conditions.length), condW) + "  " + padR(fmtBool(r.enabled), enW) + "  " + padR(fmtDate2(r.createdAt), dateW);
    process.stdout.write(line + "\n");
  }
}
function printTemplateTable(rows) {
  if (rows.length === 0) {
    process.stdout.write("Nincs sablon.\n");
    return;
  }
  const keyW = Math.min(24, Math.max(5, ...rows.map((r) => r.key.length)));
  const nameW = Math.min(28, Math.max(4, ...rows.map((r) => r.name.length)));
  const trigW = Math.min(20, Math.max(7, ...rows.map((r) => r.trigger.length)));
  const descW = Math.min(40, Math.max(5, ...rows.map((r) => r.description.length)));
  const header = padR("Kulcs", keyW) + "  " + padR("N\xE9v", nameW) + "  " + padR("Trigger", trigW) + "  " + padR("Le\xEDr\xE1s", descW);
  process.stdout.write(header + "\n" + "-".repeat(header.length) + "\n");
  for (const r of rows) {
    const line = padR(r.key, keyW) + "  " + padR(r.name, nameW) + "  " + padR(r.trigger, trigW) + "  " + padR(r.description, descW);
    process.stdout.write(line + "\n");
  }
}
function printRunTable(rows) {
  if (rows.length === 0) {
    process.stdout.write("Nincs fut\xE1snapl\xF3-bejegyz\xE9s.\n");
    return;
  }
  const idW = 6;
  const ruleW = Math.min(24, Math.max(7, ...rows.map((r) => (r.ruleName ?? "\u2014").length)));
  const trigW = Math.min(20, Math.max(7, ...rows.map((r) => r.trigger.length)));
  const pidW = 8;
  const sumW = Math.min(40, Math.max(8, ...rows.map((r) => r.summary.length)));
  const dateW = 20;
  const header = padL("ID", idW) + "  " + padR("Szab\xE1ly", ruleW) + "  " + padR("Trigger", trigW) + "  " + padL("TerID", pidW) + "  " + padR("\xD6sszefoglal\xF3", sumW) + "  " + padR("Id\u0151pont", dateW);
  process.stdout.write(header + "\n" + "-".repeat(header.length) + "\n");
  for (const r of rows) {
    const line = padL(String(r.id), idW) + "  " + padR(r.ruleName ?? "\u2014", ruleW) + "  " + padR(r.trigger, trigW) + "  " + padL(r.productId != null ? String(r.productId) : "\u2014", pidW) + "  " + padR(r.summary, sumW) + "  " + padR(new Date(r.at).toLocaleString("hu-HU"), dateW);
    process.stdout.write(line + "\n");
  }
}
function printRunResult(result, label) {
  const applied = result.applied ?? 0;
  const skipped = result.skipped ?? 0;
  const errors = result.errors ?? 0;
  process.stdout.write(
    `${label}: alkalmazva=${applied}, kihagyva=${skipped}, hiba=${errors}
`
  );
}
function registerRulesCommands(program2, client2) {
  const rules = program2.command("rules").description("Automatiz\xE1l\xE1si szab\xE1lyok \xE9s kill switch kezel\xE9se (rule engine)");
  rules.command("list").description("Szab\xE1lyok list\xE1z\xE1sa").option("--enabled", "Csak az akt\xEDv szab\xE1lyokat mutatja").option("--disabled", "Csak az inakt\xEDv szab\xE1lyokat mutatja").action(async (opts, cmd) => {
    if (opts.enabled && opts.disabled) {
      die2("Az --enabled \xE9s --disabled kapcsol\xF3k kiz\xE1rj\xE1k egym\xE1st.", 2);
    }
    let rows;
    try {
      rows = await client2.rules.list();
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (opts.enabled) rows = rows.filter((r) => r.enabled);
    if (opts.disabled) rows = rows.filter((r) => !r.enabled);
    if (isJsonMode2(cmd)) {
      printJson2(rows);
    } else {
      printRuleTable(rows);
      process.stdout.write(`
\xD6sszesen: ${rows.length} szab\xE1ly
`);
    }
  });
  rules.command("templates").description("Be\xE9p\xEDtett sablonok list\xE1z\xE1sa").action(async (_opts, cmd) => {
    let rows;
    try {
      rows = await client2.rules.listTemplates();
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(rows);
    } else {
      printTemplateTable(rows);
      process.stdout.write(`
\xD6sszesen: ${rows.length} sablon
`);
    }
  });
  rules.command("create").description("\xDAj szab\xE1ly l\xE9trehoz\xE1sa sablon alapj\xE1n (write)").requiredOption("--template <key>", "Sablon kulcsa (ld. haszno rules templates)").requiredOption("--name <name>", "Az \xFAj szab\xE1ly neve").option("--disabled", "Inakt\xEDv \xE1llapotban hozza l\xE9tre (alap\xE9rtelmezett: akt\xEDv)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa (k\xF6telez\u0151 automatiz\xE1l\xE1shoz)").action(async (opts, cmd) => {
    let templates;
    try {
      templates = await client2.rules.listTemplates();
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    const tpl = templates.find((t) => t.key === opts.template);
    if (!tpl) {
      const keys = templates.map((t) => t.key).join(", ");
      die2(`Ismeretlen sablon: "${opts.template}". \xC9rv\xE9nyes kulcsok: ${keys || "(nincs sablon)"}`, 2);
    }
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] L\xE9trehozn\xE1nk: "${opts.name}" a "${tpl.name}" sablonb\xF3l (trigger: ${tpl.trigger}, enabled: ${!opts.disabled}).
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let rule;
    try {
      rule = await client2.rules.create({
        name: opts.name,
        enabled: !opts.disabled,
        trigger: tpl.trigger,
        conditions: tpl.conditions,
        actions: tpl.actions,
        template: tpl.key
      });
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(rule);
    } else {
      process.stdout.write(`Szab\xE1ly l\xE9trehozva: ID=${rule.id} "${rule.name}"
`);
    }
  });
  rules.command("enable <id>").description("Szab\xE1ly aktiv\xE1l\xE1sa (write)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (idStr, opts, cmd) => {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) die2(`\xC9rv\xE9nytelen ID: "${idStr}"`, 2);
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Aktiv\xE1ln\xE1nk: szab\xE1ly ID=${id}.
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let rule;
    try {
      rule = await client2.rules.update(id, { enabled: true });
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(rule);
    } else {
      process.stdout.write(`Szab\xE1ly aktiv\xE1lva: ID=${rule.id} "${rule.name}"
`);
    }
  });
  rules.command("disable <id>").description("Szab\xE1ly kikapcsol\xE1sa (write)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (idStr, opts, cmd) => {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) die2(`\xC9rv\xE9nytelen ID: "${idStr}"`, 2);
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Kikapcsoln\xE1nk: szab\xE1ly ID=${id}.
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let rule;
    try {
      rule = await client2.rules.update(id, { enabled: false });
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(rule);
    } else {
      process.stdout.write(`Szab\xE1ly kikapcsolva: ID=${rule.id} "${rule.name}"
`);
    }
  });
  rules.command("update <id>").description("Szab\xE1ly m\xF3dos\xEDt\xE1sa (write)").option("--name <name>", "\xDAj szab\xE1lyn\xE9v").option("--trigger <trigger>", "\xDAj trigger").option("--enable", "Aktiv\xE1l\xE1s").option("--disable", "Kikapcsol\xE1s").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (idStr, opts, cmd) => {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) die2(`\xC9rv\xE9nytelen ID: "${idStr}"`, 2);
    if (opts.enable && opts.disable) {
      die2("Az --enable \xE9s --disable kapcsol\xF3k kiz\xE1rj\xE1k egym\xE1st.", 2);
    }
    const patch2 = {};
    if (opts.name) patch2.name = opts.name;
    if (opts.trigger) patch2.trigger = opts.trigger;
    if (opts.enable) patch2.enabled = true;
    if (opts.disable) patch2.enabled = false;
    if (Object.keys(patch2).length === 0) {
      die2("Legal\xE1bb egy m\xF3dos\xEDt\xE1si kapcsol\xF3t meg kell adni (--name, --trigger, --enable, --disable).", 2);
    }
    if (!opts.yes) {
      const changes = Object.entries(patch2).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(", ");
      process.stdout.write(
        `[DRY-RUN] M\xF3dos\xEDtan\xE1nk: szab\xE1ly ID=${id} \u2192 ${changes}.
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let rule;
    try {
      rule = await client2.rules.update(id, patch2);
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(rule);
    } else {
      process.stdout.write(`Szab\xE1ly friss\xEDtve: ID=${rule.id} "${rule.name}"
`);
    }
  });
  rules.command("delete <id>").description("Szab\xE1ly t\xF6rl\xE9se (write, visszaford\xEDthatatlan!)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (idStr, opts, cmd) => {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) die2(`\xC9rv\xE9nytelen ID: "${idStr}"`, 2);
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] T\xF6r\xF6ln\xE9nk: szab\xE1ly ID=${id}. Ez a m\u0171velet visszaford\xEDthatatlan!
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.rules.delete(id);
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(result);
    } else {
      process.stdout.write(result.deleted ? `Szab\xE1ly t\xF6r\xF6lve: ID=${id}
` : `T\xF6rl\xE9s sikertelen: ID=${id}
`);
    }
  });
  rules.command("run <id>").description("Egy szab\xE1ly manu\xE1lis futtat\xE1sa (write)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (idStr, opts, cmd) => {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) die2(`\xC9rv\xE9nytelen ID: "${idStr}"`, 2);
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Lefuttatn\xE1nk: szab\xE1ly ID=${id}.
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.rules.run(id);
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(result);
    } else {
      printRunResult(result, `Szab\xE1ly ID=${id} futott`);
    }
  });
  rules.command("run-all").description("Az \xF6sszes manu\xE1lisan ind\xEDthat\xF3 szab\xE1ly futtat\xE1sa (write)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Lefuttatn\xE1nk az \xF6sszes manu\xE1lis szab\xE1lyt.
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.rules.runAll();
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(result);
    } else {
      printRunResult(result, "\xD6sszes szab\xE1ly futott");
    }
  });
  rules.command("trigger <name>").description("N\xE9vvel azonos\xEDtott trigger t\xFCzel\xE9se (write)").option("--ids <ids>", "Vessz\u0151vel elv\xE1lasztott term\xE9k ID-k (pl. 1,2,3); ha nincs: az \xF6sszes term\xE9k").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (triggerName, opts, cmd) => {
    let productIds;
    if (opts.ids) {
      try {
        productIds = opts.ids.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
          const n = Number(s);
          if (!Number.isInteger(n) || n <= 0) throw new Error(`\xC9rv\xE9nytelen ID: "${s}"`);
          return n;
        });
      } catch (err) {
        die2(err instanceof Error ? err.message : String(err), 2);
      }
    }
    if (!opts.yes) {
      const target = productIds ? `term\xE9kek: ${productIds.join(", ")}` : "az \xF6sszes term\xE9k";
      process.stdout.write(
        `[DRY-RUN] Triggert t\xFCzeln\xE9nk: "${triggerName}" (${target}).
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.rules.trigger({ trigger: triggerName, productIds });
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(result);
    } else {
      printRunResult(result, `Trigger "${triggerName}" futott`);
    }
  });
  rules.command("runs").description("Fut\xE1snapl\xF3 megjelen\xEDt\xE9se").option("--limit <n>", "Maxim\xE1lisan visszaadott bejegyz\xE9sek sz\xE1ma", "50").action(async (opts, cmd) => {
    const limit = Number(opts.limit);
    if (!Number.isInteger(limit) || limit <= 0) {
      die2(`\xC9rv\xE9nytelen limit: "${opts.limit}"`, 2);
    }
    let rows;
    try {
      rows = await client2.rules.listRuns({ limit });
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(rows);
    } else {
      printRunTable(rows);
      process.stdout.write(`
\xD6sszesen: ${rows.length} bejegyz\xE9s
`);
    }
  });
  const autoCmd = rules.command("automation").description("Automatiz\xE1l\xE1s kill switch \xE1llapota").action(async (_opts, cmd) => {
    let status;
    try {
      status = await client2.automation.get();
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(status);
    } else {
      const state = status.paused ? "SZ\xDCNETELTETETT (paused)" : "FUT\xD3 (running)";
      process.stdout.write(`Automatiz\xE1l\xE1s \xE1llapota: ${state}
`);
    }
  });
  autoCmd.command("pause").description("Automatiz\xE1l\xE1s sz\xFCneteltet\xE9se \u2013 az \xF6sszes automatikus szab\xE1ly le\xE1ll (write)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Sz\xFCneteltet\xE9sre ker\xFClne az automatiz\xE1l\xE1s.
Az \xF6sszes automatikus szab\xE1ly le\xE1ll v\xE9grehajt\xE1sig.
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.automation.set({ paused: true });
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(result);
    } else {
      process.stdout.write(`Automatiz\xE1l\xE1s sz\xFCneteltetve. \xC1llapot: ${result.paused ? "paused" : "running"}
`);
    }
  });
  autoCmd.command("resume").description("Automatiz\xE1l\xE1s folytat\xE1sa (write)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Folytatn\xE1nk az automatiz\xE1l\xE1st.
V\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.automation.set({ paused: false });
    } catch (err) {
      die2(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode2(cmd)) {
      printJson2(result);
    } else {
      process.stdout.write(`Automatiz\xE1l\xE1s folytatva. \xC1llapot: ${result.paused ? "paused" : "running"}
`);
    }
  });
}

// src/commands/orders.ts
var NOT_AVAILABLE_MSG3 = "Nem el\xE9rhet\u0151 bolt API-kulccsal. Ez a m\u0171velet session tokent (webes bejelentkez\xE9st) ig\xE9nyel.\nHaszn\xE1ld a Haszno webes fel\xFCletet a v\xE9grehajt\xE1shoz.";
function isJsonMode3(cmd) {
  let p = cmd;
  while (p) {
    const opts = p.opts();
    if (opts.json) return true;
    p = p.parent;
  }
  return false;
}
function fmt(n) {
  return `${n.toLocaleString("hu-HU")} Ft`;
}
function statusEmoji(status) {
  switch (status) {
    case "received":
      return "[uj]";
    case "forwarded":
      return "[kuldve]";
    case "shipped":
      return "[szallitva]";
    case "error":
      return "[hiba]";
    default:
      return "?";
  }
}
function printOrdersTable(orders) {
  if (orders.length === 0) {
    console.log("Nincs megjelen\xEDthet\u0151 rendel\xE9s.");
    return;
  }
  const header = ["ID", "K\xFCls\u0151 ID", "Vev\u0151", "\xC1llapot", "\xD6sszeg", "D\xE1tum"];
  const rows = orders.map((o) => [
    String(o.id),
    o.externalId,
    o.customerName,
    `${statusEmoji(o.status)} ${o.status}`,
    fmt(o.totalGross),
    new Date(o.createdAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })
  ]);
  const all = [header, ...rows];
  const widths = header.map((_, ci) => Math.max(...all.map((r) => r[ci].length)));
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const fmtRow = (r) => r.map((c, i) => c.padEnd(widths[i])).join(" | ");
  console.log(fmtRow(header));
  console.log(sep);
  for (const row of rows) console.log(fmtRow(row));
}
function printOrderDetail(o) {
  console.log(`
Rendel\xE9s #${o.id}`);
  console.log(`  K\xFCls\u0151 ID:      ${o.externalId}`);
  console.log(`  Vev\u0151:          ${o.customerName}`);
  console.log(`  \xC1llapot:       ${statusEmoji(o.status)} ${o.status}`);
  console.log(`  \xD6sszeg:        ${fmt(o.totalGross)}`);
  console.log(`  L\xE9trehozva:    ${new Date(o.createdAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}`);
  if (o.items.length > 0) {
    console.log("\n  T\xE9telek:");
    for (const item of o.items) {
      console.log(`    - ${item.name} (SKU: ${item.sku})  ${item.qty} db  \xD7 ${fmt(item.priceGross)}`);
    }
  }
  console.log();
}
var VALID_STATUSES = ["received", "forwarded", "shipped", "error"];
function registerOrdersCommands(program2, client2) {
  const orders = program2.command("orders").description("Rendel\xE9sek kezel\xE9se");
  orders.command("list").description("Az utols\xF3 20 rendel\xE9s list\xE1z\xE1sa (agent endpoint, bolt token)").option(
    "--status <\xE1llapot>",
    `Sz\u0171r\xE9s \xE1llapotra (${VALID_STATUSES.join(", ")})`
  ).action(async (opts, cmd) => {
    if (opts.status && !VALID_STATUSES.includes(opts.status)) {
      console.error(`Hiba: \xE9rv\xE9nytelen \xE1llapot "${opts.status}". Lehets\xE9ges \xE9rt\xE9kek: ${VALID_STATUSES.join(", ")}`);
      process.exit(2);
    }
    let list;
    try {
      list = await client2.agent.orders();
    } catch (err) {
      console.error("API hiba:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    if (opts.status) {
      list = list.filter((o) => o.status === opts.status);
    }
    if (isJsonMode3(cmd)) {
      process.stdout.write(JSON.stringify(list, null, 2) + "\n");
    } else {
      printOrdersTable(list);
    }
  });
  orders.command("show <id>").description("Egy rendel\xE9s t\xE9telei (agent endpoint, bolt token; c\xEDm/tracking nem el\xE9rhet\u0151)").action(async (idStr, _opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) {
      console.error("Hiba: az <id> eg\xE9sz sz\xE1m kell legyen.");
      process.exit(2);
    }
    let list;
    try {
      list = await client2.agent.orders();
    } catch (err) {
      console.error("API hiba:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    const order = list.find((o) => o.id === id);
    if (!order) {
      console.error(`Hiba: a #${id} rendel\xE9s nem tal\xE1lhat\xF3 az utols\xF3 20 k\xF6z\xF6tt.`);
      process.exit(1);
    }
    if (isJsonMode3(cmd)) {
      process.stdout.write(JSON.stringify(order, null, 2) + "\n");
    } else {
      printOrderDetail(order);
    }
  });
  orders.command("ship <id>").description("Rendel\xE9s megjel\xF6l\xE9se sz\xE1ll\xEDtottk\xE9nt \u2014 NEM EL\xC9RHET\u0150 bolt API-kulccsal").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (_idStr) => {
    console.error(NOT_AVAILABLE_MSG3);
    process.exit(1);
  });
  orders.command("demo").description("Demo rendel\xE9s l\xE9trehoz\xE1sa \u2014 NEM EL\xC9RHET\u0150 bolt API-kulccsal").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async () => {
    console.error(NOT_AVAILABLE_MSG3);
    process.exit(1);
  });
}

// src/commands/ideas.ts
import { Command } from "commander";
import * as readline2 from "readline";
function fmt2(n) {
  return `${Math.round(n).toLocaleString("hu-HU")} Ft`;
}
function fmtPct2(n) {
  return `${n.toFixed(1)}%`;
}
function isJson(rootProgram) {
  return rootProgram.opts().json === true;
}
function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline2.createInterface({ input: process.stdin, output: process.stderr });
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y" || answer.trim().toLowerCase() === "igen");
    });
  });
}
function printTable2(headers, rows) {
  const widths = headers.map(
    (h, i) => Math.max(h.length, ...rows.map((r) => (r[i] ?? "").length))
  );
  const sep = widths.map((w) => "-".repeat(w)).join("  ");
  const line = (cols) => cols.map((c, i) => c.padEnd(widths[i] ?? 0)).join("  ");
  console.log(line(headers));
  console.log(sep);
  for (const row of rows) {
    console.log(line(row));
  }
}
function buildListCommand(rootProgram, client2) {
  return new Command("list").description("AI-term\xE9k\xF6tlet lista pontsz\xE1m-r\xE9szletez\u0151vel (csak olvas\xE1s)").option("--min-score <n>", "minim\xE1lis trendpontsz\xE1m sz\u0171r\u0151 (0\u2013100)", parseFloat).option("--supplier <name>", "sz\u0171r\xE9s besz\xE1ll\xEDt\xF3ra (r\xE9szleges egyez\xE9s, kis/nagybet\u0171-\xE9rz\xE9ketlen)").option("--limit <n>", "maxim\xE1lisan megjelen\xEDtett t\xE9telek sz\xE1ma", parseInt).action(async (opts) => {
    const json = isJson(rootProgram);
    let recs;
    try {
      recs = await client2.recommendations.get();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (json) {
        console.error(JSON.stringify({ error: msg }));
      } else {
        console.error(`Hiba a javaslatok lek\xE9r\xE9sekor: ${msg}`);
      }
      process.exit(1);
    }
    let items = recs.items ?? [];
    if (opts.minScore != null) {
      if (isNaN(opts.minScore) || opts.minScore < 0 || opts.minScore > 100) {
        console.error("Hiba: --min-score 0 \xE9s 100 k\xF6z\xF6tti sz\xE1m legyen.");
        process.exit(2);
      }
      items = items.filter((it) => (it.trendScore ?? 0) >= opts.minScore);
    }
    if (opts.supplier) {
      const q = opts.supplier.toLowerCase();
      items = items.filter((it) => it.supplierName.toLowerCase().includes(q));
    }
    items = [...items].sort((a, b) => {
      const tsDiff = (b.trendScore ?? 0) - (a.trendScore ?? 0);
      if (tsDiff !== 0) return tsDiff;
      return (b.recommended?.marginPct ?? 0) - (a.recommended?.marginPct ?? 0);
    });
    if (opts.limit != null) {
      if (isNaN(opts.limit) || opts.limit < 1) {
        console.error("Hiba: --limit legal\xE1bb 1 legyen.");
        process.exit(2);
      }
      items = items.slice(0, opts.limit);
    }
    if (json) {
      console.log(
        JSON.stringify({
          anchor: recs.anchor,
          geo: recs.geo,
          total: (recs.items ?? []).length,
          filtered: items.length,
          items: items.map((it, i) => ({
            rank: i + 1,
            id: it.id,
            sku: it.sku,
            name: it.name,
            supplier: it.supplierName,
            stock: it.stock,
            costNet: it.costNet,
            suggestedPriceGross: it.recommended?.priceGross,
            marginNet: it.recommended?.marginNet,
            marginPct: it.recommended?.marginPct,
            trendScore: it.trendScore ?? null
          }))
        })
      );
      return;
    }
    console.log(`
Haszno AI term\xE9k\xF6tlet lista  |  referencia: ${recs.anchor}  |  r\xE9gi\xF3: ${recs.geo}`);
    console.log(`\xD6sszesen ${(recs.items ?? []).length} javaslat${items.length < (recs.items ?? []).length ? `, sz\u0171r\xE9s ut\xE1n: ${items.length}` : ""}
`);
    if (items.length === 0) {
      console.log("Nincs a felt\xE9teleknek megfelel\u0151 term\xE9k\xF6tlet.");
      return;
    }
    const rows = items.map((it, i) => [
      String(i + 1),
      it.sku,
      it.name.length > 36 ? it.name.slice(0, 33) + "..." : it.name,
      it.supplierName,
      String(it.stock),
      fmt2(it.recommended?.priceGross ?? 0),
      fmtPct2(it.recommended?.marginPct ?? 0),
      it.trendScore != null ? String(it.trendScore) : "\u2014"
    ]);
    printTable2(
      ["#", "SKU", "Term\xE9k", "Besz\xE1ll\xEDt\xF3", "K\xE9szlet", "Jav.\xE1r (brutt\xF3)", "Fedezet%", "Trend"],
      rows
    );
    console.log();
  });
}
function buildFillKeywordsCommand(rootProgram, client2) {
  return new Command("fill-keywords").description("Hi\xE1nyz\xF3 trendkulcsszavak AI-os felt\xF6lt\xE9se (\xEDr\xE1s \u2014 sz\xFCks\xE9ges --yes)").option("--yes", "meger\u0151s\xEDt\xE9s n\xE9lk\xFCl fut le").action(async (opts) => {
    const json = isJson(rootProgram);
    const confirmed = opts.yes ? true : json ? false : await confirm("Kulcssz\xF3friss\xEDt\xE9s elind\xEDt\xE1sa AI-jal? Ez val\xF3di API-h\xEDv\xE1st kezdem\xE9nyez.");
    if (!confirmed) {
      const msg = "Megszak\xEDtva. Haszn\xE1ld a --yes kapcsol\xF3t a meger\u0151s\xEDt\xE9shez.";
      if (json) {
        console.error(JSON.stringify({ error: msg, hint: "pass --yes to confirm" }));
      } else {
        console.log(msg);
      }
      process.exit(0);
    }
    let result;
    try {
      result = await client2.recommendations.fillTrendKeywords();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (json) {
        console.error(JSON.stringify({ error: msg }));
      } else {
        console.error(`Hiba a kulcssz\xF3friss\xEDt\xE9s sor\xE1n: ${msg}`);
      }
      process.exit(1);
    }
    if (json) {
      console.log(JSON.stringify({ updated: result.updated }));
      return;
    }
    console.log(`Kulcssz\xF3friss\xEDt\xE9s k\xE9sz: ${result.updated} term\xE9k friss\xEDtve.`);
  });
}
function registerIdeasCommands(program2, client2) {
  const ideas = new Command("ideas").description("AI term\xE9k\xF6tletek \xE9s trendkulcsszavak kezel\xE9se");
  ideas.addCommand(buildListCommand(program2, client2));
  ideas.addCommand(buildFillKeywordsCommand(program2, client2));
  program2.addCommand(ideas);
}

// src/commands/feeds.ts
import { readFile } from "fs/promises";
import { createInterface as createInterface2 } from "readline";
import { InvalidArgumentError } from "commander";
function getJson(cmd) {
  return Boolean(cmd.optsWithGlobals().json);
}
function getBaseUrl(cmd) {
  const opts = cmd.optsWithGlobals();
  const raw = opts.apiUrl ?? process.env["HASZNO_API_URL"] ?? process.env["ARFUTAR_API_URL"] ?? // silent fallback
  "https://haszno.com";
  return raw.replace(/\/$/, "");
}
async function readContent(filePath) {
  if (filePath) {
    return readFile(filePath, "utf-8");
  }
  if (process.stdin.isTTY) {
    throw new Error(
      "Adj meg --file param\xE9tert, vagy adj meg adatot a standard bemeneten (stdin-en)."
    );
  }
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
async function askConfirm(question) {
  const rl = createInterface2({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === "y");
    });
  });
}
async function requireConfirm(yes, message) {
  if (yes) return true;
  if (!process.stdin.isTTY) {
    console.error(
      "Hiba: \xEDr\xE1si m\u0171velethez add meg a --yes kapcsol\xF3t nem-interakt\xEDv m\xF3dban."
    );
    process.exit(2);
    return false;
  }
  const ok = await askConfirm(message);
  if (!ok) console.log("Megszak\xEDtva.");
  return ok;
}
function exitWithError(err) {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Hiba: ${msg}`);
  process.exit(1);
}
function printFeedImportResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  const rows = [
    ["L\xE9trehozva", String(result.created)],
    ["Friss\xEDtve", String(result.updated)],
    ["\xD6sszesen", String(result.total)]
  ];
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(12)} ${value}`);
  }
}
function printMarketImportResult(result, json) {
  if (json) {
    console.log(JSON.stringify(result));
    return;
  }
  const rows = [
    ["Egyeztetett", String(result.matched)],
    ["\xD6sszesen", String(result.total)]
  ];
  for (const [label, value] of rows) {
    console.log(`${label.padEnd(12)} ${value}`);
  }
}
function buildFeedUrls(base) {
  return [
    { name: "\xC1rukeres\u0151", url: `${base}/feed/arukereso.xml` },
    { name: "Google Shopping", url: `${base}/feed/google.xml` }
  ];
}
function registerFeedsCommands(program2, client2) {
  const feeds = program2.command("feeds").description("Feed kezel\xE9s \u2014 term\xE9kfeed import/export, kimen\u0151 feed URL-ek");
  feeds.command("import-supplier").description("Partner/sz\xE1ll\xEDt\xF3 term\xE9kfeedet import\xE1l (CSV vagy XML)").requiredOption(
    "--supplier <id>",
    "Sz\xE1ll\xEDt\xF3 azonos\xEDt\xF3ja (eg\xE9sz sz\xE1m)",
    (v) => {
      const n = parseInt(v, 10);
      if (isNaN(n) || n <= 0)
        throw new InvalidArgumentError(
          `\xC9rv\xE9nytelen sz\xE1ll\xEDt\xF3 azonos\xEDt\xF3: "${v}". Pozit\xEDv eg\xE9sz sz\xE1m sz\xFCks\xE9ges.`
        );
      return n;
    }
  ).requiredOption(
    "--format <format>",
    "Feed form\xE1tum: csv vagy xml",
    (v) => {
      if (v !== "csv" && v !== "xml")
        throw new InvalidArgumentError(
          `\xC9rv\xE9nytelen form\xE1tum: "${v}". Elfogadott \xE9rt\xE9kek: csv, xml`
        );
      return v;
    }
  ).option("--file <path>", "Feed f\xE1jl el\xE9r\xE9si \xFAtja (alap\xE9rtelmezett: stdin)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(
    async (opts, cmd) => {
      const confirmed = await requireConfirm(
        Boolean(opts.yes),
        `Import\xE1lja a(z) ${opts.supplier} azonos\xEDt\xF3j\xFA sz\xE1ll\xEDt\xF3 feedj\xE9t (${opts.format})?`
      );
      if (!confirmed) return;
      let content;
      try {
        content = await readContent(opts.file);
      } catch (err) {
        exitWithError(err);
        return;
      }
      if (content === void 0) return;
      let result;
      try {
        result = await client2.feeds.importFeed({
          supplierId: opts.supplier,
          format: opts.format,
          content
        });
      } catch (err) {
        exitWithError(err);
        return;
      }
      if (result === void 0) return;
      printFeedImportResult(result, getJson(cmd));
    }
  );
  feeds.command("import-market").description("Piaci \xF6sszehasonl\xEDt\xF3 \xE1rakat import\xE1l CSV-b\u0151l").option("--file <path>", "CSV f\xE1jl el\xE9r\xE9si \xFAtja (alap\xE9rtelmezett: stdin)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    const confirmed = await requireConfirm(
      Boolean(opts.yes),
      "Import\xE1lja a piaci \xE1rakat?"
    );
    if (!confirmed) return;
    let content;
    try {
      content = await readContent(opts.file);
    } catch (err) {
      exitWithError(err);
      return;
    }
    if (content === void 0) return;
    let result;
    try {
      result = await client2.feeds.importMarketPrices({ content });
    } catch (err) {
      exitWithError(err);
      return;
    }
    if (result === void 0) return;
    printMarketImportResult(result, getJson(cmd));
  });
  feeds.command("urls").description(
    "Kimen\u0151 feed URL-ek megjelen\xEDt\xE9se (\xC1rukeres\u0151, Google Shopping); --fetch eset\xE9n let\xF6lti a tartalmat"
  ).option("--fetch", "Feedek let\xF6lt\xE9se \xE9s megjelen\xEDt\xE9se a URL-ek ut\xE1n").action(async (opts, cmd) => {
    const base = getBaseUrl(cmd);
    const feedUrls = buildFeedUrls(base);
    const json = getJson(cmd);
    if (opts.fetch) {
      const results = [];
      for (const f of feedUrls) {
        try {
          const res = await fetch(f.url);
          const content = await res.text();
          results.push({ ...f, content });
        } catch (err) {
          const error = err instanceof Error ? err.message : String(err);
          results.push({ ...f, error });
        }
      }
      if (json) {
        console.log(JSON.stringify(results));
      } else {
        for (const r of results) {
          console.log(`
\u2500\u2500 ${r.name} \u2500\u2500`);
          console.log(`URL: ${r.url}`);
          if (r.error) {
            console.error(`Let\xF6lt\xE9si hiba: ${r.error}`);
          } else {
            console.log(r.content ?? "");
          }
        }
      }
      return;
    }
    if (json) {
      console.log(JSON.stringify(feedUrls));
      return;
    }
    const nameWidth = Math.max(...feedUrls.map((f) => f.name.length)) + 2;
    for (const f of feedUrls) {
      console.log(`${f.name.padEnd(nameWidth)} ${f.url}`);
    }
  });
}

// src/commands/account.ts
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { createInterface as createInterface3 } from "readline";
var CONFIG_PATH = join(homedir(), ".config", "haszno", "config.json");
var LEGACY_CONFIG_PATH = join(homedir(), ".config", "arfutar", "config.json");
function readConfigFile(configPath = CONFIG_PATH) {
  try {
    if (existsSync(configPath)) {
      const raw = readFileSync(configPath, "utf-8");
      return JSON.parse(raw);
    }
  } catch {
  }
  if (configPath === CONFIG_PATH) {
    try {
      if (existsSync(LEGACY_CONFIG_PATH)) {
        const raw = readFileSync(LEGACY_CONFIG_PATH, "utf-8");
        return JSON.parse(raw);
      }
    } catch {
    }
  }
  return {};
}
function writeConfigFile(config, configPath = CONFIG_PATH) {
  const dir = dirname(configPath);
  mkdirSync(dir, { recursive: true, mode: 448 });
  writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n", { mode: 384 });
}
function getJsonFlag(cmd) {
  try {
    return cmd.optsWithGlobals().json === true;
  } catch {
    return false;
  }
}
function printJson3(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function printKv(rows) {
  const maxLen = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    process.stdout.write(`  ${k.padEnd(maxLen)}  ${v}
`);
  }
}
function handleError2(err) {
  if (err instanceof HasznoApiError) {
    process.stderr.write(`Hiba: ${err.message} (HTTP ${err.status})
`);
  } else if (err instanceof Error) {
    process.stderr.write(`Hiba: ${err.message}
`);
  } else {
    process.stderr.write(`Hiba: ${String(err)}
`);
  }
  process.exit(1);
}
async function askConfirm2(message) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface3({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.toLowerCase() === "y" || ans.toLowerCase() === "igen");
    });
  });
}
async function askInput(message) {
  const rl = createInterface3({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(message, (ans) => {
      rl.close();
      resolve(ans.trim());
    });
  });
}
function registerAccountCommands(program2, client2, { configPath = CONFIG_PATH } = {}) {
  const loginAction = async (opts) => {
    let { apiUrl, apiKey } = opts;
    if (!apiUrl && !apiKey) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          "Interakt\xEDv m\xF3d TTY n\xE9lk\xFCl nem el\xE9rhet\u0151. Adj meg --api-url \xE9s/vagy --api-key param\xE9tert.\n"
        );
        process.exit(2);
        return;
      }
      process.stdout.write("Haszno CLI bejelentkez\xE9s\n");
      process.stdout.write(`Konfigur\xE1ci\xF3s f\xE1jl: ${configPath}

`);
      apiUrl = await askInput("API URL (Enter = alap\xE9rtelmezett https://haszno.com): ");
      apiKey = await askInput("API kulcs: ");
    }
    const existing = readConfigFile(configPath);
    const updated = { ...existing };
    if (apiUrl) updated.apiUrl = apiUrl;
    if (apiKey) updated.apiKey = apiKey;
    writeConfigFile(updated, configPath);
    process.stdout.write(`Konfigur\xE1ci\xF3s f\xE1jl elmentve: ${configPath}
`);
    process.stdout.write(
      "Az HASZNO_API_URL / HASZNO_API_KEY k\xF6rnyezeti v\xE1ltoz\xF3k \xE9s a\n--api-url / --api-key jelz\u0151k priorit\xE1st \xE9lveznek a f\xE1jllal szemben.\n\nMegjegyz\xE9s: az MCP szerver (haszno-mcp) is ebb\u0151l a f\xE1jlb\xF3l olvas,\nez\xE9rt elegend\u0151 egyszer futtatni a `haszno login` parancsot.\n"
    );
  };
  program2.command("login").description("Haszno API hiteles\xEDt\xE9si adatok ment\xE9se (~/.config/haszno/config.json)").option("--api-url <url>", "Haszno API alap URL-je").option("--api-key <key>", "Haszno API kulcs").action(loginAction);
  program2.command("configure").description("API hiteles\xEDt\xE9si adatok ment\xE9se (alias: haszno login)").option("--api-url <url>", "Haszno API alap URL-je").option("--api-key <key>", "Haszno API kulcs").action(loginAction);
  const account = program2.command("account").description("Fi\xF3k \xE1llapot, be\xE1ll\xEDt\xE1sok \xE9s eg\xE9szs\xE9g / account health & settings");
  account.command("ping").description("API el\xE9rhet\u0151s\xE9g ellen\u0151rz\xE9se (exit 0 = ok, 1 = hiba)").action(async (_opts, cmd) => {
    try {
      const result = await client2.health.check();
      if (getJsonFlag(cmd)) {
        printJson3(result);
      } else {
        process.stdout.write(result.ok ? "API: OK el\xE9rhet\u0151\n" : "API: nem v\xE1laszol\n");
      }
      if (!result.ok) process.exit(1);
    } catch (err) {
      handleError2(err);
    }
  });
  account.command("whoami").description("Azonos\xEDt\xE1s \xE9s be\xE1ll\xEDt\xE1sok \xF6sszefoglal\xF3ja / identity + settings summary").action(async (_opts, cmd) => {
    try {
      const [health, settings] = await Promise.all([
        client2.health.check(),
        client2.settings.get()
      ]);
      if (getJsonFlag(cmd)) {
        printJson3({ health, settings });
      } else {
        process.stdout.write("Kapcsolat:\n");
        printKv([["API:", health.ok ? "OK" : "HIBA"]]);
        process.stdout.write("\nArazasi beallitasok:\n");
        printKv([
          ["Alac\u0131nzas (undercutPct):", `${settings.undercutPct}%`],
          ["Min. haszon (minMarginPct):", `${settings.minMarginPct}%`],
          ["AFA (vatPct):", `${settings.vatPct}%`],
          ["Automatizmus:", settings.automationPaused ? "szunet" : "aktiv"]
        ]);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  account.command("stats").description("Iranyitopult osszefoglalo / dashboard product & order counts").action(async (_opts, cmd) => {
    try {
      const stats = await client2.stats.get();
      if (getJsonFlag(cmd)) {
        printJson3(stats);
      } else {
        process.stdout.write("Ir\xE1ny\xEDt\xF3pult:\n");
        printKv([
          ["Term\xE9kek:", stats.products],
          ["Vesztes\xE9ges:", stats.losing],
          ["Piaci max.:", stats.overMarket],
          ["Jav\xEDtand\xF3:", stats.toFix],
          ["Rendel\xE9sek:", stats.orders]
        ]);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  account.command("impact").description("Haszon-mero / profit impact metrics").option("--days <n>", "Visszatekintesi napok szama", "30").action(async (opts, cmd) => {
    const days = parseInt(opts.days, 10);
    if (isNaN(days) || days < 1) {
      process.stderr.write("Ervenytelen --days ertek; pozitiv egesz szamot adj meg.\n");
      process.exit(2);
      return;
    }
    try {
      const impact = await client2.stats.getImpact({ days });
      if (getJsonFlag(cmd)) {
        printJson3(impact);
      } else {
        process.stdout.write(`Haszon-m\xE9r\u0151 (utols\xF3 ${impact.days} nap):
`);
        printKv([
          ["Extra profit:", `${impact.extraProfit.toLocaleString("hu-HU")} Ft`],
          ["Alap profit:", `${impact.baseline.toLocaleString("hu-HU")} Ft`],
          ["N\xF6veked\xE9s:", `+${impact.pctGain.toFixed(1)}%`],
          ["Rendel\xE9sek:", impact.orders],
          ["Auto-forwarded:", impact.autoForwardedOrders]
        ]);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  account.command("suppliers").description("Sajat beszallitok listaja / list your suppliers").action(async (_opts, cmd) => {
    try {
      const suppliers = await client2.suppliers.list();
      if (getJsonFlag(cmd)) {
        printJson3(suppliers);
      } else {
        if (suppliers.length === 0) {
          process.stdout.write("Nincs hozzaadott beszallito.\n");
          return;
        }
        process.stdout.write(`Beszallitok (${suppliers.length}):
`);
        for (const s of suppliers) {
          const mode = s.orderMode === "email" ? "e-mail" : "szimulalt";
          const net = s.network ? " [halozat]" : "";
          process.stdout.write(
            `  #${String(s.id).padStart(3)}  ${s.name.padEnd(32)}  ${mode}${net}
`
          );
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  const settingsCmd = account.command("settings").description("Arazasi beallitasok megtekintese / show current pricing settings").action(async (_opts, cmd) => {
    try {
      const s = await client2.settings.get();
      if (getJsonFlag(cmd)) {
        printJson3(s);
      } else {
        process.stdout.write("Arazasi beallitasok:\n");
        printKv([
          ["Alac\u0131nzas (undercutPct):", `${s.undercutPct}%`],
          ["Min. haszon (minMarginPct):", `${s.minMarginPct}%`],
          ["AFA (vatPct):", `${s.vatPct}%`],
          ["Automatizmus:", s.automationPaused ? "szunet" : "aktiv"]
        ]);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  settingsCmd.command("update").description("Arazasi beallitasok frissitese (irasi muvelet)").option("--undercut-pct <n>", "Alac\u0131nzasi szazalek (pl. 2 = 2%-kal ar ala)").option("--min-margin-pct <n>", "Minimalis haszon % (pl. 10)").option("--vat-pct <n>", "AFA % (pl. 27)").option("--yes", "Megerosites keres nelkul / skip confirmation").action(async (opts, cmd) => {
    if (!opts.undercutPct && !opts.minMarginPct && !opts.vatPct) {
      process.stderr.write(
        "Legalabb egy opci\xF3t adj meg: --undercut-pct, --min-margin-pct, --vat-pct\n"
      );
      process.exit(2);
      return;
    }
    const undercutPct = opts.undercutPct !== void 0 ? parseFloat(opts.undercutPct) : void 0;
    const minMarginPct = opts.minMarginPct !== void 0 ? parseFloat(opts.minMarginPct) : void 0;
    const vatPct = opts.vatPct !== void 0 ? parseFloat(opts.vatPct) : void 0;
    if (undercutPct !== void 0 && (isNaN(undercutPct) || undercutPct < 0) || minMarginPct !== void 0 && (isNaN(minMarginPct) || minMarginPct < 0) || vatPct !== void 0 && (isNaN(vatPct) || vatPct < 0)) {
      process.stderr.write(
        "Ervenytelen szam; az ertekeknek nem negativ szamoknak kell lenniuk.\n"
      );
      process.exit(2);
      return;
    }
    if (!opts.yes) {
      if (!process.stdin.isTTY) {
        process.stderr.write("Irasi muvelethez --yes szukseges nem-interaktiv modban.\n");
        process.exit(2);
        return;
      }
      const ok = await askConfirm2("Biztosan frissited az arazasi beallitasokat?");
      if (!ok) {
        process.stdout.write("Megszakitva.\n");
        process.exit(0);
        return;
      }
    }
    try {
      const current = await client2.settings.get();
      const body = {
        undercutPct: undercutPct ?? current.undercutPct,
        minMarginPct: minMarginPct ?? current.minMarginPct,
        vatPct: vatPct ?? current.vatPct
      };
      const updated = await client2.settings.update(body);
      if (getJsonFlag(cmd)) {
        printJson3(updated);
      } else {
        process.stdout.write("Be\xE1ll\xEDt\xE1sok friss\xEDtve:\n");
        printKv([
          ["Al\xE1c\xEDnz\xE1s:", `${updated.undercutPct}%`],
          ["Min. haszon:", `${updated.minMarginPct}%`],
          ["\xC1FA:", `${updated.vatPct}%`]
        ]);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  account.command("version").description("CLI verzio es API kapcsolat ellenorzese / CLI version + connectivity check").action(async (_opts, cmd) => {
    let cliVersion = "0.1.0";
    try {
      let root = cmd;
      while (root.parent) root = root.parent;
      cliVersion = root.version() ?? cliVersion;
    } catch {
    }
    let apiStatus = "unreachable";
    try {
      const health = await client2.health.check();
      apiStatus = health.ok ? "ok" : "error";
    } catch {
    }
    const data = { version: cliVersion, api: apiStatus };
    if (getJsonFlag(cmd)) {
      printJson3(data);
    } else {
      process.stdout.write(`haszno ${cliVersion}
`);
      process.stdout.write(`API: ${apiStatus === "ok" ? "OK el\xE9rhet\u0151" : "nem el\xE9rhet\u0151"}
`);
    }
  });
}

// src/commands/catalogue.ts
function isJsonMode4(cmd) {
  let p = cmd;
  while (p) {
    const opts = p.opts();
    if (opts.json) return true;
    p = p.parent;
  }
  return false;
}
function fmtFt2(n) {
  if (n == null) return "n/a";
  return `${Math.round(n).toLocaleString("hu-HU")} Ft`;
}
function fmtPct3(n) {
  if (n == null) return "n/a";
  return `${n.toFixed(1)}%`;
}
function pushStatusLabel(s) {
  switch (s) {
    case "varakozik":
      return "v\xE1rakozik";
    case "kuldve":
      return "k\xFCldve";
    case "kesz":
      return "k\xE9sz";
    case "hiba":
      return "hiba";
    default:
      return s;
  }
}
function connStatusLabel(s) {
  switch (s) {
    case "uj":
      return "\xFAj";
    case "domain_ok":
      return "domain OK";
    case "kapcsolva":
      return "kapcsolva";
    case "hiba":
      return "hiba";
    default:
      return s;
  }
}
function printTable3(headers, rows) {
  if (rows.length === 0) {
    console.log("Nincs tal\xE1lat.");
    return;
  }
  const all = [headers, ...rows];
  const widths = headers.map((_, ci) => Math.max(...all.map((r) => (r[ci] ?? "").length)));
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const fmtRow = (r) => r.map((c, i) => (c ?? "").padEnd(widths[i])).join(" | ");
  console.log(fmtRow(headers));
  console.log(sep);
  for (const row of rows) console.log(fmtRow(row));
}
function printCatalogueTable(items) {
  printTable3(
    ["ID", "N\xE9v", "Partner", "Kateg\xF3ria", "Nagyker", "RRP", "Margin%", "K\xE9szlet"],
    items.map((i) => [
      String(i.id),
      i.name.slice(0, 40),
      i.partnerName.slice(0, 20),
      i.category ?? "-",
      fmtFt2(i.wholesaleNet),
      fmtFt2(i.rrpGross),
      fmtPct3(i.marginPct),
      String(i.stock)
    ])
  );
}
function printImportListTable(items) {
  printTable3(
    ["ID", "SKU", "N\xE9v", "Partner", "RRP", "\xC1llapot"],
    items.map((i) => [
      String(i.id),
      i.sku,
      i.name.slice(0, 36),
      i.partnerName.slice(0, 18),
      fmtFt2(i.rrpGross),
      pushStatusLabel(i.pushStatus)
    ])
  );
}
function printConnectionsTable(conns) {
  printTable3(
    ["ID", "Neve", "Platform", "Domain", "\xC1llapot", "Utols\xF3 szink."],
    conns.map((c) => [
      String(c.id),
      c.name.slice(0, 24),
      c.platform,
      c.domain ?? "-",
      connStatusLabel(c.status),
      c.lastSyncAt ? new Date(c.lastSyncAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }) : "-"
    ])
  );
}
function registerCatalogueCommands(program2, client2) {
  const catalogue = program2.command("catalogue").description("Partnerkatek\xF3gus b\xF6ng\xE9sz\u0151");
  catalogue.command("search").description("Term\xE9kek keres\xE9se a partnerkatek\xF3gusban").option("--q <sz\xF6veg>", "Szabad-sz\xF6veges keres\xE9s (n\xE9v vagy kateg\xF3ria)").option("--cats <kulcsok>", 'Kateg\xF3ria-kulcsok vessz\u0151vel elv\xE1lasztva, pl. "elektronika,ruh\xE1zat"').option("--partner <id>", "Sz\xE1ll\xEDt\xF3/partner azonos\xEDt\xF3ja", (v) => parseInt(v, 10)).option("--min-margin <pct>", "Minimum haszonkulcs %-ban, pl. 15", (v) => parseFloat(v)).option("--max-price <ft>", "Maximum RRP brutt\xF3 \xE1r forintban", (v) => parseInt(v, 10)).option("--min-price <ft>", "Minimum RRP brutt\xF3 \xE1r forintban", (v) => parseInt(v, 10)).option("--in-stock", "Csak k\xE9szleten l\xE9v\u0151 term\xE9kek").option("--country <k\xF3d>", "Sz\xE1ll\xEDt\xF3 orsz\xE1g k\xF3dja, pl. HU, DE").option("--sort <rendez\xE9s>", "Rendez\xE9s: margin_desc, price_asc, price_desc, name_asc", "name_asc").option("--page <n>", "Oldalsz\xE1m (1-t\xF3l)", (v) => parseInt(v, 10), 1).option("--page-size <n>", "Oldalm\xE9ret, max 100 (alap\xE9rtelmezett 24)", (v) => parseInt(v, 10), 24).action(async (opts, cmd) => {
    try {
      const result = await client2.catalogue.search({
        q: opts.q,
        cats: opts.cats,
        partner: opts.partner,
        minMarginPct: opts.minMargin,
        maxPrice: opts.maxPrice,
        minPrice: opts.minPrice,
        inStock: opts.inStock ?? false,
        country: opts.country,
        sort: opts.sort,
        page: opts.page,
        pageSize: opts.pageSize
      });
      if (isJsonMode4(cmd)) {
        console.log(JSON.stringify(result));
      } else {
        console.log(`
Tal\xE1latok: ${result.total} term\xE9k (${result.items.length} megjelen\xEDtve)
`);
        printCatalogueTable(result.items);
        if (result.total > result.items.length) {
          const pageSize = opts.pageSize ?? 24;
          console.log(`
... tov\xE1bb: --page ${(opts.page ?? 1) + 1} (\xF6sszesen ${Math.ceil(result.total / pageSize)} oldal)`);
        }
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
  const importCmd = program2.command("import").description("Import lista kezel\xE9se");
  importCmd.command("list").description("Import lista megjelen\xEDt\xE9se").option("--status <\xE1llapot>", "Sz\u0171r\xE9s \xE1llapotra: varakozik, kuldve, kesz, hiba").option("--partner <id>", "Sz\u0171r\xE9s sz\xE1ll\xEDt\xF3ra", (v) => parseInt(v, 10)).option("--q <sz\xF6veg>", "Szabad-sz\xF6veges keres\xE9s").action(async (opts, cmd) => {
    try {
      const items = await client2.importList.list({
        status: opts.status,
        partner: opts.partner,
        q: opts.q
      });
      if (isJsonMode4(cmd)) {
        console.log(JSON.stringify(items));
      } else {
        console.log(`
Import lista: ${items.length} t\xE9tel
`);
        printImportListTable(items);
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
  importCmd.command("add <ids...>").description("Term\xE9kek hozz\xE1ad\xE1sa az import list\xE1hoz katal\xF3gus-term\xE9k azonos\xEDt\xF3k alapj\xE1n").action(async (rawIds, _opts, cmd) => {
    try {
      const networkProductIds = rawIds.map((id) => {
        const n = parseInt(id, 10);
        if (isNaN(n) || n < 1) throw new Error(`\xC9rv\xE9nytelen ID: ${id}`);
        return n;
      });
      const result = await client2.importList.add({ networkProductIds });
      if (isJsonMode4(cmd)) {
        console.log(JSON.stringify(result));
      } else {
        console.log(`Hozz\xE1adva: ${result.added} term\xE9k, kihagyva (m\xE1r list\xE1n): ${result.skipped}`);
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
  importCmd.command("push").description("Import list\xE1s term\xE9kek kik\xFCld\xE9se a bek\xF6t\xF6tt webshopba").requiredOption("--ids <azonos\xEDt\xF3k>", 'Import lista t\xE9tel azonos\xEDt\xF3i vessz\u0151vel, pl. "1,2,3"').option("--target <connectionId>", "C\xE9lbolt kapcsolat azonos\xEDt\xF3ja (haszno connections list)", (v) => parseInt(v, 10)).option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    try {
      const ids = opts.ids.split(",").map((s) => {
        const n = parseInt(s.trim(), 10);
        if (isNaN(n)) throw new Error(`\xC9rv\xE9nytelen ID: ${s}`);
        return n;
      });
      if (!opts.yes) {
        const targetStr = opts.target ? ` \u2192 kapcsolat #${opts.target}` : "";
        console.log(`Kik\xFCld\xE9s: ${ids.length} term\xE9k${targetStr}.`);
        console.log("Add meg a --yes kapcsol\xF3t a meger\u0151s\xEDt\xE9shez.");
        process.exit(0);
        return;
      }
      if (opts.target != null) {
        const result = await client2.importList.push({ ids, targetConnectionId: opts.target });
        if (isJsonMode4(cmd)) {
          console.log(JSON.stringify(result));
        } else {
          console.log(`Kik\xFCldve: ${result.pushed}, sikertelen: ${result.failed}`);
          if (result.errors && result.errors.length > 0) {
            for (const err of result.errors) console.error(`  - ${err}`);
          }
        }
      } else {
        const result = await client2.importList.push({ ids });
        if (isJsonMode4(cmd)) {
          console.log(JSON.stringify(result));
        } else {
          console.log(`Kik\xFCldve: ${result.pushed}`);
        }
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
  const connections = program2.command("connections").description("Bek\xF6t\xF6tt webshop kapcsolatok");
  connections.command("list").description("Bek\xF6t\xF6tt webshopok list\xE1z\xE1sa").option("--status <\xE1llapot>", "Sz\u0171r\xE9s \xE1llapotra: uj, domain_ok, kapcsolva, hiba").action(async (opts, cmd) => {
    try {
      let conns = await client2.connections.list();
      if (opts.status) {
        conns = conns.filter((c) => c.status === opts.status);
      }
      if (isJsonMode4(cmd)) {
        console.log(JSON.stringify(conns));
      } else {
        console.log(`
Bek\xF6t\xF6tt boltok: ${conns.length}
`);
        printConnectionsTable(conns);
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
}

// src/commands/peers.ts
function isJsonMode5(cmd) {
  let p = cmd;
  while (p) {
    const opts = p.opts();
    if (opts.json) return true;
    p = p.parent;
  }
  return false;
}
function printInvitesTable(invites) {
  if (invites.length === 0) {
    console.log("Nincs megh\xEDv\xF3.");
    return;
  }
  const headers = ["K\xF3d", "Sz\xE1ll\xEDt\xF3 ID", "Lej\xE1r", "Elfogadta", "Visszavonva"];
  const rows = invites.map((inv) => [
    inv.code,
    String(inv.supplierId),
    new Date(inv.expiresAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }),
    inv.acceptedBy ?? "-",
    inv.revokedAt ? "igen" : "-"
  ]);
  const all = [headers, ...rows];
  const widths = headers.map((_, ci) => Math.max(...all.map((r) => r[ci].length)));
  const sep = widths.map((w) => "-".repeat(w)).join("-+-");
  const fmtRow = (r) => r.map((c, i) => c.padEnd(widths[i])).join(" | ");
  console.log(fmtRow(headers));
  console.log(sep);
  for (const row of rows) console.log(fmtRow(row));
}
function registerPeersCommands(program2, client2) {
  const peers = program2.command("peers").description("P2P partner megh\xEDv\xF3k kezel\xE9se");
  peers.command("invite").description("Megh\xEDv\xF3 k\xF3d l\xE9trehoz\xE1sa egy sz\xE1ll\xEDt\xF3hoz").requiredOption("--supplier <id>", "Sz\xE1ll\xEDt\xF3 azonos\xEDt\xF3ja", (v) => parseInt(v, 10)).requiredOption("--expires <datetime>", 'Lej\xE1rati id\u0151 ISO-8601-ben, pl. "2026-12-31T23:59:00Z"').option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    try {
      if (!opts.yes) {
        console.log(`Megh\xEDv\xF3 l\xE9trehoz\xE1sa: sz\xE1ll\xEDt\xF3 #${opts.supplier}, lej\xE1r: ${opts.expires}.`);
        console.log("Add meg a --yes kapcsol\xF3t a meger\u0151s\xEDt\xE9shez.");
        process.exit(1);
        return;
      }
      const invite = await client2.peers.createInvite({
        supplierId: opts.supplier,
        expiresAt: opts.expires
      });
      if (isJsonMode5(cmd)) {
        console.log(JSON.stringify(invite));
      } else {
        console.log(`
Megh\xEDv\xF3 l\xE9trehozva:`);
        console.log(`  K\xF3d:       ${invite.code}`);
        console.log(`  Sz\xE1ll\xEDt\xF3:  #${invite.supplierId}`);
        console.log(`  Lej\xE1r:     ${new Date(invite.expiresAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}`);
        console.log(`
Add \xE1t a k\xF3dot a partnernek: haszno peers accept ${invite.code} --acceptor <bolt_azonosito> --yes`);
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
  peers.command("list").description("Saj\xE1t megh\xEDv\xF3k list\xE1z\xE1sa").action(async (_opts, cmd) => {
    try {
      const invites = await client2.peers.listInvites();
      if (isJsonMode5(cmd)) {
        console.log(JSON.stringify(invites));
      } else {
        console.log(`
Megh\xEDv\xF3k: ${invites.length}
`);
        printInvitesTable(invites);
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
  peers.command("accept <code>").description("Partner megh\xEDv\xF3 elfogad\xE1sa").requiredOption("--acceptor <shop>", "Az elfogad\xF3 bolt/tenant azonos\xEDt\xF3ja").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (code, opts, cmd) => {
    try {
      if (!opts.yes) {
        console.log(`Elfogad\xE1s: "${code}" k\xF3d, "${opts.acceptor}" nev\xE9ben.`);
        console.log("Add meg a --yes kapcsol\xF3t a meger\u0151s\xEDt\xE9shez.");
        process.exit(0);
        return;
      }
      const link = await client2.peers.acceptInvite(code, { acceptorId: opts.acceptor });
      if (isJsonMode5(cmd)) {
        console.log(JSON.stringify(link));
      } else {
        console.log(`
Sikeres partnerkapcsolat!`);
        console.log(`  Link ID:   ${link.id}`);
        console.log(`  Sz\xE1ll\xEDt\xF3:  #${link.supplierId}`);
        console.log(`  Partner:   ${link.partner}`);
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
}

// src/commands/blog.ts
function isJsonMode6(cmd) {
  let p = cmd;
  while (p) {
    const opts = p.opts();
    if (opts.json) return true;
    p = p.parent;
  }
  return false;
}
function printPost(post2) {
  const pub = post2.publishedAt ? new Date(post2.publishedAt).toLocaleDateString("hu-HU", { timeZone: "Europe/Budapest" }) : "nincs k\xF6zz\xE9t\xE9ve";
  console.log(`
${"\u2500".repeat(60)}`);
  console.log(`${post2.title}`);
  console.log(`${pub} \xB7 ${post2.period === "het" ? "Heti" : "Havi"} \xF6sszefoglal\xF3`);
  console.log(`${post2.periodStart} \u2013 ${post2.periodEnd}`);
  console.log(`${"\u2500".repeat(60)}`);
  console.log(`
${post2.summary}
`);
  if (post2.data?.shopsCount != null) {
    console.log(`Adatforr\xE1s: ${post2.data.shopsCount} bolt aggreg\xE1lt adatai`);
  }
  if (post2.data?.rankedCategories?.length) {
    console.log(`
Top kateg\xF3ri\xE1k:`);
    for (const c of post2.data.rankedCategories.slice(0, 5)) {
      const bar = "\u2588".repeat(Math.round(c.score * 10));
      console.log(`  ${c.category.padEnd(20)} ${bar}`);
    }
  }
  console.log(`
${post2.bodyMd}`);
}
function registerBlogCommands(program2, client2) {
  const blog = program2.command("blog").description("Haszno piaci blog \xF6sszefoglal\xF3k");
  blog.command("latest").description("Legfrissebb piaci \xF6sszefoglal\xF3(k) megjelen\xEDt\xE9se").option("--period <id\u0151szak>", "Id\u0151szak: het (heti) vagy honap (havi)").option("--limit <n>", "Megjelen\xEDtend\u0151 bejegyz\xE9sek sz\xE1ma (alap\xE9rtelmezett 1)", (v) => parseInt(v, 10), 1).action(async (opts, cmd) => {
    try {
      const result = await client2.blog.list({
        period: opts.period,
        page: 1,
        perPage: opts.limit ?? 1
      });
      if (isJsonMode6(cmd)) {
        console.log(JSON.stringify(result));
      } else {
        if (result.posts.length === 0) {
          console.log("Nincs k\xF6zz\xE9tett bejegyz\xE9s.");
          return;
        }
        for (const post2 of result.posts) {
          printPost(post2);
        }
        if (result.total > result.posts.length) {
          console.log(`
... \xE9s m\xE9g ${result.total - result.posts.length} r\xE9gebbi bejegyz\xE9s. Haszn\xE1ld a --limit kapcsol\xF3t.`);
        }
      }
    } catch (e) {
      console.error("Hiba:", e instanceof Error ? e.message : String(e));
      process.exit(1);
    }
  });
}

// src/index.ts
var program = new Command2().name("haszno").description("Haszno dropshipping CLI").version("0.1.0").option("--json", "output machine-readable JSON").option("--api-url <url>", "Haszno API base URL (overrides HASZNO_API_URL)").option("--api-key <key>", "Haszno API key (overrides HASZNO_API_KEY)");
function buildClient(opts) {
  return createClient({
    baseUrl: opts.apiUrl,
    apiKey: opts.apiKey
  });
}
function argvFlag(name) {
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === name) return argv[i + 1];
    if (argv[i].startsWith(name + "=")) return argv[i].slice(name.length + 1);
  }
  return void 0;
}
var client = buildClient({ apiUrl: argvFlag("--api-url"), apiKey: argvFlag("--api-key") });
registerCatalogCommands(program, client);
registerProductsCommands(program, client);
registerProposalsCommands(program, client);
registerRulesCommands(program, client);
registerOrdersCommands(program, client);
registerIdeasCommands(program, client);
registerFeedsCommands(program, client);
registerAccountCommands(program, client);
registerCatalogueCommands(program, client);
registerPeersCommands(program, client);
registerBlogCommands(program, client);
program.parse();
//# sourceMappingURL=index.js.map