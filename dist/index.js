#!/usr/bin/env node
import {
  CONFIG_PATH,
  HasznoApiError,
  del,
  get,
  isShopToken,
  patch,
  post,
  put,
  readConfigFile,
  readConfigObject,
  resolveConnection
} from "./chunk-QXN2O5TR.js";

// src/index.ts
import { Command as Command2 } from "commander";

// src/client/index.ts
var ShopTokenNotSupportedError = class extends Error {
  isShopTokenNotSupported = true;
  operation;
  constructor(operation) {
    super(
      `"${operation}" nem \xE9rhet\u0151 el bolt API-tokennel \u2014 haszn\xE1lja a Haszno webalkalmaz\xE1st (https://haszno.com). Az \xFCgyn\xF6k-token csak olvas\xE1si (GET /api/agent/*) \xE9s javaslat-bek\xFCld\xE9si (POST /api/agent/proposals) m\u0171veletekre jogosult.`
    );
    this.name = "ShopTokenNotSupportedError";
    this.operation = operation;
  }
};
function notSupported(op) {
  return (..._args) => {
    return Promise.reject(new ShopTokenNotSupportedError(op));
  };
}
function createClient(opts = {}) {
  const conn = resolveConnection(opts, process.env, opts.readConfig);
  if (isShopToken(conn.apiKey)) {
    return createShopTokenClient(opts);
  }
  return createLegacyClient(opts);
}
function createShopTokenClient(opts) {
  const o = opts;
  return {
    health: {
      check: () => get("/api/health", o)
    },
    settings: {
      get: notSupported("settings.get"),
      update: notSupported("settings.update")
    },
    products: {
      list: (_params) => get("/api/agent/products", o),
      update: notSupported("products.update"),
      setListing: notSupported("products.setListing"),
      generateAiDescription: notSupported("products.generateAiDescription"),
      applyPrices: notSupported("products.applyPrices")
    },
    stats: {
      get: notSupported("stats.get"),
      getImpact: notSupported("stats.getImpact")
    },
    suppliers: {
      list: notSupported("suppliers.list")
    },
    feeds: {
      importFeed: notSupported("feeds.importFeed"),
      importMarketPrices: notSupported("feeds.importMarketPrices")
    },
    orders: {
      list: () => get("/api/agent/orders", o),
      receiveOrder: notSupported("orders.receiveOrder"),
      ship: notSupported("orders.ship"),
      createDemo: notSupported("orders.createDemo")
    },
    recommendations: {
      get: notSupported("recommendations.get"),
      getAiShortlist: notSupported("recommendations.getAiShortlist"),
      fillTrendKeywords: notSupported("recommendations.fillTrendKeywords")
    },
    rules: {
      listTemplates: notSupported("rules.listTemplates"),
      list: notSupported("rules.list"),
      create: notSupported("rules.create"),
      update: notSupported("rules.update"),
      delete: notSupported("rules.delete"),
      run: notSupported("rules.run"),
      runAll: notSupported("rules.runAll"),
      trigger: notSupported("rules.trigger"),
      listRuns: notSupported("rules.listRuns"),
      undoUnlists: notSupported("rules.undoUnlists")
    },
    proposals: {
      list: (_params) => get("/api/agent/proposals", o),
      approve: notSupported("proposals.approve"),
      reject: notSupported("proposals.reject"),
      rollback: notSupported("proposals.rollback"),
      propose: (body) => post("/api/agent/proposals", body, o)
    },
    automation: {
      get: notSupported("automation.get"),
      set: notSupported("automation.set")
    },
    network: {
      listSuppliers: notSupported("network.listSuppliers"),
      getSupplierProducts: notSupported("network.getSupplierProducts"),
      connect: notSupported("network.connect"),
      disconnect: notSupported("network.disconnect"),
      sync: notSupported("network.sync"),
      getSupplierView: notSupported("network.getSupplierView")
    },
    catalogue: {
      search: notSupported("catalogue.search")
    },
    importList: {
      list: notSupported("importList.list"),
      add: notSupported("importList.add"),
      push: notSupported("importList.push")
    },
    connections: {
      list: notSupported("connections.list"),
      get: notSupported("connections.get")
    },
    peers: {
      createInvite: notSupported("peers.createInvite"),
      listInvites: notSupported("peers.listInvites"),
      revokeInvite: notSupported("peers.revokeInvite"),
      acceptInvite: notSupported("peers.acceptInvite"),
      listLinks: notSupported("peers.listLinks"),
      removeLink: notSupported("peers.removeLink"),
      setVisibility: notSupported("peers.setVisibility")
    },
    blog: {
      list: notSupported("blog.list"),
      get: notSupported("blog.get")
    }
  };
}
function createLegacyClient(opts) {
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
      rollback: (body) => post("/api/proposals/rollback", body, o),
      propose: notSupported("proposals.propose (requires a shop API token)")
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
    }
  };
}

// src/commands/catalog.ts
function registerCatalogCommands(_program, _client) {
}

// src/commands/products.ts
import readline from "readline";
function fmtFt(n) {
  return n.toLocaleString("hu-HU") + " Ft";
}
function fmtPct(n) {
  return n.toFixed(1) + "%";
}
function fmtDate(iso) {
  return iso.slice(0, 10);
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
  if (p.marketMinGross !== null && p.priceGross > p.marketMinGross) return "PIAC FELETT";
  if (!p.listed) return "nincs list\xE1n";
  return "OK";
}
async function askConfirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${question} [y/N] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}
async function cmdList(client2, opts) {
  let rows = await client2.products.list({ all: opts.all });
  if (opts.losing) rows = rows.filter((p) => p.current.marginPct < 0);
  if (opts.overMarket) rows = rows.filter((p) => p.marketMinGross !== null && p.priceGross > p.marketMinGross);
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
    ["ID", "SKU", "Term\xE9k", "Beszer.", "\xC1r (Ft)", "Piac min", "Aj\xE1nlott", "Marzs", "St\xE1tusz"],
    rows.map((p) => [
      String(p.id),
      p.sku.slice(0, 18),
      p.name.slice(0, 30),
      fmtFt(p.costNet),
      fmtFt(p.priceGross),
      p.marketMinGross !== null ? fmtFt(p.marketMinGross) : "\u2013",
      fmtFt(p.recommended.priceGross),
      fmtPct(p.current.marginPct),
      statusLabel(p)
    ]),
    [5, 18, 30, 11, 11, 11, 11, 7, 12]
  );
  console.log(`
${rows.length} term\xE9k`);
}
async function cmdShow(client2, id, opts) {
  const products = await client2.products.list({ all: true });
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
  console.log(`Beszerz\xE9si \xE1r: ${fmtFt(p.costNet)} (nett\xF3)`);
  console.log(`Elad\xE1si \xE1r:    ${fmtFt(p.priceGross)} (brutt\xF3)`);
  console.log(`Piaci min:     ${p.marketMinGross !== null ? fmtFt(p.marketMinGross) : "\u2013"}${p.marketShop ? ` (${p.marketShop})` : ""}`);
  console.log(`Aj\xE1nlott \xE1r:   ${fmtFt(p.recommended.priceGross)}`);
  console.log(`Marzs (aktu):  ${fmtPct(p.current.marginPct)} (${fmtFt(p.current.marginNet)} nett\xF3)`);
  console.log(`Marzs (aj\xE1nl): ${fmtPct(p.recommended.marginPct)} (${fmtFt(p.recommended.marginNet)} nett\xF3)`);
  console.log(`K\xE9szlet:       ${p.stock}`);
  console.log(`List\xE1n:        ${p.listed ? "igen" : "nem"}`);
  console.log(`Friss\xEDtve:     ${fmtDate(p.updatedAt)}`);
}
async function cmdUpdate(client2, id, opts) {
  const body = {};
  if (opts.marketMin !== void 0) body.marketMinGross = opts.marketMin === "null" ? null : Number(opts.marketMin);
  if (opts.marketShop !== void 0) body.marketShop = opts.marketShop === "null" ? null : opts.marketShop;
  if (opts.price !== void 0) body.priceGross = Number(opts.price);
  if (Object.keys(body).length === 0) {
    console.error("Legal\xE1bb egy mez\u0151t meg kell adni: --market-min, --market-shop vagy --price");
    process.exitCode = 2;
    return;
  }
  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`Friss\xEDti a term\xE9k #${id} adatait?`));
    const ok = await confirmFn();
    if (!ok) {
      console.log("Megszak\xEDtva.");
      return;
    }
  }
  const updated = await client2.products.update(id, body);
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
  } else {
    console.log(`Term\xE9k #${updated.id} friss\xEDtve.`);
    if (body.priceGross !== void 0) console.log(`  Elad\xE1si \xE1r:   ${fmtFt(updated.priceGross)}`);
    if (body.marketMinGross !== void 0) console.log(`  Piaci min:    ${updated.marketMinGross !== null ? fmtFt(updated.marketMinGross) : "\u2013"}`);
    if (body.marketShop !== void 0) console.log(`  Piaci forr\xE1s: ${updated.marketShop ?? "\u2013"}`);
  }
}
async function cmdListing(client2, id, opts) {
  if (!opts.on && !opts.off) {
    console.error("Add meg: --on (list\xE1z) vagy --off (levesz a list\xE1r\xF3l)");
    process.exitCode = 2;
    return;
  }
  const listed = Boolean(opts.on);
  const action = listed ? "list\xE1ra tegyem" : "levegyem a list\xE1r\xF3l";
  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`Term\xE9k #${id}: ${action}?`));
    const ok = await confirmFn();
    if (!ok) {
      console.log("Megszak\xEDtva.");
      return;
    }
  }
  const updated = await client2.products.setListing(id, { listed });
  if (opts.json) {
    console.log(JSON.stringify(updated, null, 2));
  } else {
    console.log(`Term\xE9k #${updated.id}: ${updated.listed ? "list\xE1n van \u2713" : "nincs list\xE1n \u2717"}.`);
  }
}
async function cmdApplyPrices(client2, opts) {
  const ids = opts.ids ? opts.ids.split(",").map((x) => Number(x.trim())).filter((n) => Number.isFinite(n) && n > 0) : void 0;
  const scope = ids ? `${ids.length} db kiv\xE1lasztott term\xE9k` : "\xF6sszes term\xE9k";
  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`Alkalmazza az aj\xE1nlott \xE1rakat (${scope})?`));
    const ok = await confirmFn();
    if (!ok) {
      console.log("Megszak\xEDtva.");
      return;
    }
  }
  const result = await client2.products.applyPrices(ids ? { ids } : void 0);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`K\xE9sz: ${result.changed}/${result.total} term\xE9k \xE1ra friss\xEDtve.`);
  }
}
async function cmdDescribe(client2, id, opts) {
  if (!opts.yes) {
    const confirmFn = opts.confirm ?? (() => askConfirm(`AI term\xE9kle\xEDr\xE1s gener\xE1l\xE1sa (term\xE9k #${id})?`));
    const ok = await confirmFn();
    if (!ok) {
      console.log("Megszak\xEDtva.");
      return;
    }
  }
  const result = await client2.products.generateAiDescription(id);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(result.text);
  }
}
async function cmdStats(client2, opts) {
  const stats = await client2.stats.get();
  if (opts.json) {
    console.log(JSON.stringify(stats, null, 2));
    return;
  }
  console.log("Term\xE9kek \xF6sszesen:   " + stats.products);
  console.log("Vesztes\xE9ges:         " + stats.losing);
  console.log("Piac felett \xE1razott: " + stats.overMarket);
  console.log("Jav\xEDt\xE1sra szorul:    " + stats.toFix);
  console.log("Rendel\xE9sek:          " + stats.orders);
}
async function cmdImpact(client2, opts) {
  const days = opts.days !== void 0 ? Number(opts.days) : void 0;
  const impact = await client2.stats.getImpact(days !== void 0 ? { days } : void 0);
  if (opts.json) {
    console.log(JSON.stringify(impact, null, 2));
    return;
  }
  console.log(`Haszon-m\xE9r\u0151 (${impact.days} nap)`);
  console.log("\u2500".repeat(40));
  console.log(`Alap profit:          ${fmtFt(impact.baseline)}`);
  console.log(`Extra profit:         ${fmtFt(impact.extraProfit)}`);
  console.log(`Profit n\xF6veked\xE9s:     +${fmtPct(impact.pctGain)}`);
  console.log(`Rendel\xE9sek:           ${impact.orders}`);
  console.log(`Auto-tov\xE1bb\xEDtott:     ${impact.autoForwardedOrders}`);
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
  products.command("list").description("Term\xE9kek list\xE1ja marginnal \xE9s \xE1r\xE1llapottal").option("--all", "Minden term\xE9k, ne csak a list\xE1zottak").option("--losing", "Csak vesztes\xE9ges term\xE9kek (marzs < 0)").option("--over-market", "Csak a piaci minimum f\xF6l\xE9 \xE1r\xE1zott term\xE9kek").option("--cats <nevek>", 'Sz\u0171r\xE9s besz\xE1ll\xEDt\xF3n\xE9vre \u2014 vessz\u0151vel elv\xE1lasztott r\xE9szsztringek, pl. "auto,kert"').action(async (opts) => {
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
function isJsonMode(cmd) {
  let c = cmd;
  while (c.parent) c = c.parent;
  return !!c.opts().json;
}
function printJson(data) {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}
function fmtPrice(n) {
  return n.toLocaleString("hu-HU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " Ft";
}
function fmtDate2(s) {
  if (!s) return "\u2014";
  return new Date(s).toLocaleDateString("hu-HU");
}
function statusLabel2(s) {
  switch (s) {
    case "pending":
      return "pending";
    case "approved":
      return "approved";
    case "rejected":
      return "rejected";
    case "rolled_back":
      return "rolled_back";
    default:
      return s;
  }
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
  const srcW = 10;
  const statusW = 11;
  const dateW = 12;
  function padR2(s, w) {
    const t = s.length >= w ? s.slice(0, w) : s + " ".repeat(w - s.length);
    return t;
  }
  function padL2(s, w) {
    return s.length >= w ? s.slice(0, w) : " ".repeat(w - s.length) + s;
  }
  const header = padL2("ID", idW) + "  " + padR2("SKU", skuW) + "  " + padR2("Term\xE9k", nameW) + "  " + padL2("R\xE9gi \xE1r", oldW) + "  " + padL2("\xDAj \xE1r", newW) + "  " + padR2("Forr\xE1s", srcW) + "  " + padR2("\xC1llapot", statusW) + "  " + padR2("D\xE1tum", dateW);
  process.stdout.write(header + "\n" + "-".repeat(header.length) + "\n");
  for (const r of rows) {
    const line = padL2(String(r.id), idW) + "  " + padR2(r.productSku ?? "\u2014", skuW) + "  " + padR2(r.productName ?? "\u2014", nameW) + "  " + padL2(fmtPrice(r.oldPriceGross), oldW) + "  " + padL2(fmtPrice(r.proposedPriceGross), newW) + "  " + padR2(r.source, srcW) + "  " + padR2(statusLabel2(r.status), statusW) + "  " + padR2(fmtDate2(r.createdAt), dateW);
    process.stdout.write(line + "\n");
  }
}
function parseIds(raw) {
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map((s) => {
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) throw new Error(`\xC9rv\xE9nytelen ID: "${s}"`);
    return n;
  });
}
function die(msg, code = 1) {
  process.stderr.write(`Hiba: ${msg}
`);
  process.exit(code);
}
function registerProposalsCommands(program2, client2) {
  const proposals = program2.command("proposals").description("\xC1raz\xE1si javaslatok kezel\xE9se (price proposals)");
  proposals.command("list").description("Javaslatok list\xE1z\xE1sa \xE1llapot szerint (alap\xE9rtelmezett: pending)").option(
    "-s, --status <status>",
    "Sz\u0171r\xE9s \xE1llapotra: pending | approved | rejected | rolled_back",
    "pending"
  ).action(async (opts, cmd) => {
    const allowedStatuses = ["pending", "approved", "rejected", "rolled_back"];
    if (!allowedStatuses.includes(opts.status)) {
      die(
        `\xC9rv\xE9nytelen \xE1llapot: "${opts.status}". Lehets\xE9ges \xE9rt\xE9kek: ${allowedStatuses.join(", ")}`,
        2
      );
    }
    let rows;
    try {
      rows = await client2.proposals.list({ status: opts.status });
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode(cmd)) {
      printJson(rows);
    } else {
      printProposalTable(rows);
      process.stdout.write(`
\xD6sszesen: ${rows.length} javaslat
`);
    }
  });
  proposals.command("show <id>").description("Egy javaslat r\xE9szletei ID alapj\xE1n").action(async (idStr, _opts, cmd) => {
    const id = Number(idStr);
    if (!Number.isInteger(id) || id <= 0) die(`\xC9rv\xE9nytelen ID: "${idStr}"`, 2);
    let row;
    try {
      const all = await Promise.all([
        client2.proposals.list({ status: "pending" }),
        client2.proposals.list({ status: "approved" }),
        client2.proposals.list({ status: "rejected" }),
        client2.proposals.list({ status: "rolled_back" })
      ]);
      row = all.flat().find((r) => r.id === id);
    } catch (err) {
      die(err instanceof Error ? err.message : String(err));
    }
    if (!row) die(`Nem tal\xE1lhat\xF3 javaslat ID=${id}`, 1);
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
Forr\xE1s:      ${row.source}
\xC1llapot:     ${statusLabel2(row.status)}
Batch ID:    ${row.batchId ?? "\u2014"}
L\xE9trehozva:  ${fmtDate2(row.createdAt)}
Eld\xF6ntve:    ${fmtDate2(row.decidedAt)}
`
      );
    }
  });
  proposals.command("approve").description(
    "Javaslatok j\xF3v\xE1hagy\xE1sa. --ids n\xE9lk\xFCl az \xF6sszes pending javaslat j\xF3v\xE1hagy\xF3dik."
  ).option("--ids <ids>", "Vessz\u0151vel elv\xE1lasztott ID-k (pl. 1,2,3); ha nincs: az \xF6sszes pending").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa (k\xF6telez\u0151 automatiz\xE1l\xE1shoz)").action(async (opts, cmd) => {
    let ids;
    if (opts.ids) {
      try {
        ids = parseIds(opts.ids);
      } catch (err) {
        die(err instanceof Error ? err.message : String(err), 2);
      }
    }
    if (!opts.yes) {
      const target = ids ? `ID: ${ids.join(", ")}` : "az \xF6sszes f\xFCgg\u0151 javaslat";
      process.stdout.write(
        `[DRY-RUN] J\xF3v\xE1hagy\xE1sra ker\xFClne: ${target}.
Futtat\xE1s v\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.proposals.approve(ids ? { ids } : {});
    } catch (err) {
      if (err instanceof ShopTokenNotSupportedError) die(err.message, 1);
      die(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode(cmd)) {
      printJson(result);
    } else {
      process.stdout.write(
        `J\xF3v\xE1hagyva: ${result.applied} javaslat` + (result.batchId ? ` (batch: ${result.batchId})` : "") + "\n"
      );
    }
  });
  proposals.command("reject").description("Javaslatok elutas\xEDt\xE1sa (k\xF6telez\u0151: --ids)").requiredOption("--ids <ids>", "Vessz\u0151vel elv\xE1lasztott ID-k (pl. 1,2,3)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa (k\xF6telez\u0151 automatiz\xE1l\xE1shoz)").action(async (opts, cmd) => {
    let ids;
    try {
      ids = parseIds(opts.ids);
    } catch (err) {
      die(err instanceof Error ? err.message : String(err), 2);
    }
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Elutas\xEDt\xE1sra ker\xFClne: ID ${ids.join(", ")}.
Futtat\xE1s v\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.proposals.reject({ ids });
    } catch (err) {
      if (err instanceof ShopTokenNotSupportedError) die(err.message, 1);
      die(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode(cmd)) {
      printJson(result);
    } else {
      process.stdout.write(`Elutas\xEDtva: ${result.rejected} javaslat
`);
    }
  });
  proposals.command("rollback").description("Egy j\xF3v\xE1hagyott batch visszag\xF6rget\xE9se").requiredOption("--batch <batchId>", "A visszag\xF6rgetend\u0151 batch ID (approve adja vissza)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa (k\xF6telez\u0151 automatiz\xE1l\xE1shoz)").action(async (opts, cmd) => {
    if (!opts.yes) {
      process.stdout.write(
        `[DRY-RUN] Visszag\xF6rget\xE9sre ker\xFClne: batch "${opts.batch}".
Futtat\xE1s v\xE9grehajt\xE1shoz add meg a --yes kapcsol\xF3t.
`
      );
      process.exit(0);
    }
    let result;
    try {
      result = await client2.proposals.rollback({ batchId: opts.batch });
    } catch (err) {
      if (err instanceof ShopTokenNotSupportedError) die(err.message, 1);
      die(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode(cmd)) {
      printJson(result);
    } else {
      process.stdout.write(`Visszag\xF6rgetett javaslatok: ${result.rolledBack}
`);
    }
  });
  proposals.command("propose").description(
    '\xC1rjavaslat bek\xFCld\xE9se bolt API-tokennel (shop token) \u2014 emberi j\xF3v\xE1hagy\xE1st ig\xE9nyel.\nCsak "haszno_" el\u0151tag\xFA tokennel (HASZNO_API_TOKEN vagy --api-key) m\u0171k\xF6dik.'
  ).requiredOption("--product-id <id>", "A term\xE9k azonos\xEDt\xF3ja (integer)").requiredOption("--price <gross>", "Javasolt brutt\xF3 \xE1r eg\xE9sz forintban").requiredOption("--reason <text>", "Sz\xF6veges indokl\xE1s (1\u2013500 karakter) a bolt tulajdonos\xE1nak").action(async (opts, cmd) => {
    const productId = Number(opts.productId);
    if (!Number.isInteger(productId) || productId <= 0) die(`\xC9rv\xE9nytelen term\xE9k ID: "${opts.productId}"`, 2);
    const price = Number(opts.price);
    if (!Number.isInteger(price) || price <= 0) die(`\xC9rv\xE9nytelen \xE1r: "${opts.price}"`, 2);
    if (!opts.reason.trim() || opts.reason.length > 500) die("Az indokl\xE1s 1\u2013500 karakter lehet.", 2);
    const nonce = randomUUID();
    let result;
    try {
      result = await client2.proposals.propose({
        productId,
        proposedPriceGross: price,
        reason: opts.reason.trim(),
        nonce
      });
    } catch (err) {
      if (err instanceof ShopTokenNotSupportedError) die(err.message, 1);
      die(err instanceof Error ? err.message : String(err));
    }
    if (isJsonMode(cmd)) {
      printJson(result);
    } else {
      process.stdout.write(
        `Javaslat bek\xFCldve (ID: ${result.id}, \xE1llapot: ${result.status}).
Az \xE1r nem v\xE1ltozott \u2014 a bolt tulajdonos\xE1nak j\xF3v\xE1 kell hagynia a Haszno webalkalmaz\xE1sban.
`
      );
    }
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
function fmtDate3(s) {
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
    const line = padL(String(r.id), idW) + "  " + padR(r.name, nameW) + "  " + padR(r.trigger, trigW) + "  " + padR(r.template ?? "\u2014", tplW) + "  " + padL(String(r.conditions.length), condW) + "  " + padR(fmtBool(r.enabled), enW) + "  " + padR(fmtDate3(r.createdAt), dateW);
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
  return `${(n / 100).toFixed(0)} Ft`;
}
function statusEmoji(status) {
  switch (status) {
    case "received":
      return "\u{1F4E5}";
    case "forwarded":
      return "\u{1F4E4}";
    case "shipped":
      return "\u{1F69A}";
    case "error":
      return "\u274C";
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
  console.log(`  C\xEDm:           ${o.address}`);
  console.log(`  \xC1llapot:       ${statusEmoji(o.status)} ${o.status}`);
  if (o.supplierOrderId) console.log(`  Sz\xE1ll\xEDt\xF3i ID:  ${o.supplierOrderId}`);
  if (o.trackingNumber) console.log(`  Tracking:      ${o.trackingNumber}`);
  console.log(`  \xD6sszeg:        ${fmt(o.totalGross)}`);
  console.log(`  L\xE9trehozva:    ${new Date(o.createdAt).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" })}`);
  if (o.items.length > 0) {
    console.log("\n  T\xE9telek:");
    for (const item of o.items) {
      console.log(`    - ${item.name} (SKU: ${item.sku})  ${item.qty} db  \xD7 ${fmt(item.priceGross)}`);
    }
  }
  if (o.events.length > 0) {
    console.log("\n  Esem\xE9nynapl\xF3:");
    for (const ev of o.events) {
      const ts = new Date(ev.at).toLocaleString("hu-HU", { timeZone: "Europe/Budapest" });
      console.log(`    [${ts}] ${ev.text}`);
    }
  }
  console.log();
}
async function interactiveConfirm(question) {
  if (!process.stdin.isTTY) return false;
  const { createInterface: createInterface5 } = await import("readline");
  const rl = createInterface5({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(`${question} [i/n] `, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "i");
    });
  });
}
var VALID_STATUSES = ["received", "forwarded", "shipped", "error"];
function registerOrdersCommands(program2, client2) {
  const orders = program2.command("orders").description("Rendel\xE9sek kezel\xE9se");
  orders.command("list").description("Az utols\xF3 50 rendel\xE9s list\xE1z\xE1sa").option(
    "--status <\xE1llapot>",
    `Sz\u0171r\xE9s \xE1llapotra (${VALID_STATUSES.join(", ")})`
  ).action(async (opts, cmd) => {
    if (opts.status && !VALID_STATUSES.includes(opts.status)) {
      console.error(`Hiba: \xE9rv\xE9nytelen \xE1llapot "${opts.status}". Lehets\xE9ges \xE9rt\xE9kek: ${VALID_STATUSES.join(", ")}`);
      process.exit(2);
    }
    let list;
    try {
      list = await client2.orders.list();
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
  orders.command("show <id>").description("Egy rendel\xE9s r\xE9szletes adatai t\xE9telekkel \xE9s esem\xE9nynapl\xF3val").action(async (idStr, _opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) {
      console.error("Hiba: az <id> eg\xE9sz sz\xE1m kell legyen.");
      process.exit(2);
    }
    let list;
    try {
      list = await client2.orders.list();
    } catch (err) {
      console.error("API hiba:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    const order = list.find((o) => o.id === id);
    if (!order) {
      console.error(`Hiba: a #${id} rendel\xE9s nem tal\xE1lhat\xF3.`);
      process.exit(1);
    }
    if (isJsonMode3(cmd)) {
      process.stdout.write(JSON.stringify(order, null, 2) + "\n");
    } else {
      printOrderDetail(order);
    }
  });
  orders.command("ship <id>").description("Rendel\xE9s megjel\xF6l\xE9se sz\xE1ll\xEDtottk\xE9nt (\xEDr\xE1s \u2014 sz\xFCks\xE9ges: --yes)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) {
      console.error("Hiba: az <id> eg\xE9sz sz\xE1m kell legyen.");
      process.exit(2);
    }
    if (!opts.yes) {
      const ok = await interactiveConfirm(`Biztosan sz\xE1ll\xEDtottk\xE9nt jel\xF6led a #${id} rendel\xE9st?`);
      if (!ok) {
        console.log("Megszak\xEDtva.");
        process.exit(0);
      }
    }
    let updated;
    try {
      updated = await client2.orders.ship(id);
    } catch (err) {
      console.error("API hiba:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    if (isJsonMode3(cmd)) {
      process.stdout.write(JSON.stringify(updated, null, 2) + "\n");
    } else {
      console.log(`\u2713 #${id} rendel\xE9s \xE1llapota: ${updated.status}`);
    }
  });
  orders.command("demo").description("Demo rendel\xE9s l\xE9trehoz\xE1sa (csak demo m\xF3dban \u2014 sz\xFCks\xE9ges: --yes)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(async (opts, cmd) => {
    if (!opts.yes) {
      const ok = await interactiveConfirm("Demo rendel\xE9st hozol l\xE9tre. Folytatod?");
      if (!ok) {
        console.log("Megszak\xEDtva.");
        process.exit(0);
      }
    }
    let result;
    try {
      result = await client2.orders.createDemo();
    } catch (err) {
      console.error("API hiba:", err instanceof Error ? err.message : String(err));
      process.exit(1);
    }
    if (isJsonMode3(cmd)) {
      process.stdout.write(JSON.stringify(result, null, 2) + "\n");
    } else {
      console.log(`\u2713 Demo rendel\xE9s l\xE9trehozva: #${result.id}`);
    }
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
  return resolveConnection({ baseUrl: opts.apiUrl, apiKey: opts.apiKey }).baseUrl;
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
async function askConfirm2(question) {
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
  const ok = await askConfirm2(message);
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
import { writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import { createInterface as createInterface3 } from "readline";

// src/client/shop.ts
import { readFileSync } from "fs";
var CLI_VERSION = "0.3.0";
async function uploadShopImage(filePath, opts) {
  const conn = resolveConnection(opts, process.env, opts.readConfig);
  const fetchFn = opts.fetch ?? fetch;
  const fileContent = readFileSync(filePath);
  let contentType = "image/jpeg";
  if (fileContent[0] === 137 && fileContent[1] === 80) contentType = "image/png";
  else if (fileContent[0] === 71 && fileContent[1] === 73) contentType = "image/gif";
  else if (fileContent[0] === 82 && fileContent[1] === 73 && fileContent[8] === 87) contentType = "image/webp";
  const headers = {
    "Content-Type": contentType,
    "User-Agent": `haszno-cli/${CLI_VERSION}`,
    Accept: "application/json"
  };
  if (conn.apiKey) {
    if (isShopToken(conn.apiKey)) {
      headers["Authorization"] = `Bearer ${conn.apiKey}`;
    } else {
      headers["x-api-key"] = conn.apiKey;
    }
  }
  if (conn.basicAuth) {
    headers["Authorization"] = `Basic ${Buffer.from(conn.basicAuth).toString("base64")}`;
  }
  const url = `${conn.baseUrl}/api/v1/shop/images`;
  const response = await fetchFn(url, { method: "POST", headers, body: fileContent });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json.error) message = json.error;
    } catch {
    }
    throw new HasznoApiError(response.status, message);
  }
  return response.json();
}
async function cliLogin(body, opts) {
  const conn = resolveConnection({ baseUrl: opts.baseUrl }, process.env, () => ({}));
  const fetchFn = opts.fetch ?? fetch;
  const url = `${conn.baseUrl}/api/v1/auth/cli-login`;
  const response = await fetchFn(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": `haszno-cli/${CLI_VERSION}`
    },
    body: JSON.stringify(body)
  });
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json.error) message = json.error;
    } catch {
    }
    throw new HasznoApiError(response.status, message);
  }
  return response.json();
}
var SORT_MAP = {
  newest: "uj",
  price_asc: "ar_nov",
  price_desc: "ar_csokk"
};
function createShopClient(opts) {
  const o = opts;
  return {
    categories: {
      list: async () => {
        const taxonomy = await get("/api/v1/shop/taxonomy", o);
        return taxonomy.categories;
      }
    },
    ads: {
      search: (params = {}) => {
        const qs = new URLSearchParams();
        if (params.q) qs.set("q", params.q);
        if (params.category) qs.set("cat", params.category);
        if (params.subcategory) qs.set("sub", params.subcategory);
        if (params.minPrice != null) qs.set("min", String(params.minPrice));
        if (params.maxPrice != null) qs.set("max", String(params.maxPrice));
        if (params.condition) qs.set("cond", params.condition);
        if (params.county) qs.set("county", params.county);
        if (params.city) qs.set("city", params.city);
        if (params.sort) qs.set("sort", SORT_MAP[params.sort] ?? params.sort);
        if (params.page != null) qs.set("page", String(params.page));
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        return get(`/api/v1/shop/ads${suffix}`, o);
      },
      get: (id) => get(`/api/v1/shop/ads/${id}`, o),
      priceHint: async (params = {}) => {
        const qs = new URLSearchParams();
        if (params.category) qs.set("cat", params.category);
        if (params.subcategory) qs.set("sub", params.subcategory);
        const suffix = qs.toString() ? `?${qs.toString()}` : "";
        return get(`/api/v1/shop/assist/price-hint${suffix}`, o);
      }
    },
    myAds: {
      list: () => get("/api/v1/shop/my/ads", o),
      post: (body) => post("/api/v1/shop/ads", body, o),
      edit: async (id, partial) => {
        const existing = await get(`/api/v1/shop/my/ads/${id}`, o);
        const merged = {
          category: existing.category,
          subcategory: existing.subcategory ?? null,
          title: existing.title,
          description: existing.description ?? "",
          priceGross: existing.priceGross,
          negotiable: existing.negotiable,
          condition: existing.condition,
          county: existing.county,
          city: existing.city,
          images: existing.images,
          attrs: existing.attrs,
          contactName: existing.contactName ?? "",
          contactPhone: existing.contactPhone ?? null,
          contactEmail: existing.contactEmail,
          showPhone: existing.showPhone,
          resellable: existing.resellable,
          partnerCommissionPct: existing.partnerCommissionPct,
          ...partial
        };
        return put(`/api/v1/shop/ads/${id}`, merged, o);
      },
      pause: (id) => post(`/api/v1/shop/ads/${id}/status`, { status: "szunetel" }, o),
      activate: (id) => post(`/api/v1/shop/ads/${id}/status`, { status: "aktiv" }, o),
      sold: (id, body = {}) => post(`/api/v1/shop/ads/${id}/sold`, body, o),
      renew: (id) => post(`/api/v1/shop/ads/${id}/renew`, null, o),
      delete: (id) => post(`/api/v1/shop/ads/${id}/status`, { status: "torolve" }, o),
      uploadImage: (filePath) => uploadShopImage(filePath, o),
      fromPhotos: (imageIds) => post("/api/v1/shop/assist/from-photos", { imageIds }, o)
    },
    inquiries: {
      listReceived: async () => {
        const result = await get("/api/v1/shop/my/inquiries", o);
        return result.items;
      },
      send: (adId, body) => post(`/api/v1/shop/ads/${adId}/inquiries`, body, o),
      reply: (id, message) => post(`/api/v1/shop/my/inquiries/${id}/reply`, { message }, o)
    },
    favorites: {
      list: () => get("/api/v1/shop/my/favorites", o),
      add: (adId) => put(`/api/v1/shop/ads/${adId}/favorite`, null, o),
      remove: (adId) => del(`/api/v1/shop/ads/${adId}/favorite`, o)
    },
    reservations: {
      create: (adId, body) => post(`/api/v1/shop/ads/${adId}/reservations`, body, o),
      list: (params = {}) => {
        const qs = new URLSearchParams();
        qs.set("role", params.role ?? "buyer");
        if (params.status) qs.set("status", params.status);
        if (params.page != null) qs.set("page", String(params.page));
        return get(`/api/v1/shop/my/reservations?${qs.toString()}`, o);
      },
      accept: (id, body = {}) => post(`/api/v1/shop/my/reservations/${id}/accept`, body, o),
      decline: (id) => post(`/api/v1/shop/my/reservations/${id}/decline`, null, o),
      cancel: (id) => post(`/api/v1/shop/my/reservations/${id}/cancel`, null, o),
      complete: (id, body = {}) => post(`/api/v1/shop/my/reservations/${id}/complete`, body, o),
      counter: (id, priceGross) => post(`/api/v1/shop/my/reservations/${id}/counter`, { priceGross }, o),
      acceptCounter: (id) => post(`/api/v1/shop/my/reservations/${id}/accept-counter`, {}, o),
      messages: (id) => get(`/api/v1/shop/my/reservations/${id}/messages`, o),
      message: (id, body) => post(`/api/v1/shop/my/reservations/${id}/messages`, { body }, o),
      review: (id, rating, comment) => post(`/api/v1/shop/my/reservations/${id}/review`, { rating, ...comment !== void 0 ? { comment } : {} }, o)
    },
    savedSearches: {
      list: () => get("/api/v1/shop/my/saved-searches", o),
      add: (params) => post("/api/v1/shop/my/saved-searches", params, o),
      remove: (id) => del(`/api/v1/shop/my/saved-searches/${id}`, o)
    },
    watch: {
      watch: (adId) => put(`/api/v1/shop/ads/${adId}/watch`, null, o),
      unwatch: (adId) => del(`/api/v1/shop/ads/${adId}/watch`, o)
    },
    urlImport: {
      importUrl: (url) => post("/api/v1/shop/assist/url-import", { url }, o)
    },
    draft: {
      show: () => get("/api/v1/shop/my/draft", o),
      save: (payload) => put("/api/v1/shop/my/draft", payload, o),
      clear: () => del("/api/v1/shop/my/draft", o)
    },
    images: {
      removeBg: (id) => post(`/api/v1/shop/images/${id}/remove-bg`, {}, o)
    },
    tokens: {
      list: () => get("/api/v1/auth/tokens", o),
      revoke: (id) => del(`/api/v1/auth/tokens/${id}`, o),
      revokeCurrent: () => post("/api/v1/auth/tokens/revoke-current", {}, o)
    },
    sellerProfile: {
      get: () => get("/api/v1/shop/my/seller-profile", o),
      set: (body) => put("/api/v1/shop/my/seller-profile", body, o)
    }
  };
}

// src/commands/account.ts
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
async function askConfirm3(message) {
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
async function readPasswordNoEcho(prompt) {
  if (!process.stdin.isTTY) {
    const rl = createInterface3({ input: process.stdin });
    return new Promise((resolve) => {
      rl.once("line", (line) => {
        rl.close();
        resolve(line.trim());
      });
    });
  }
  process.stderr.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  return new Promise((resolve) => {
    const chars = [];
    const onData = (buf) => {
      const ch = buf.toString();
      if (ch === "\r" || ch === "\n") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeListener("data", onData);
        process.stderr.write("\n");
        resolve(chars.join(""));
      } else if (ch === "") {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.exit(1);
      } else if (ch === "\x7F" || ch === "\b") {
        chars.pop();
      } else {
        chars.push(ch);
      }
    };
    process.stdin.on("data", onData);
  });
}
function registerAccountCommands(program2, client2, { configPath = CONFIG_PATH, httpOpts = {} } = {}) {
  program2.command("login").description("Bejelentkez\xE9s e-mail/jelsz\xF3val; az API-token elment\xE9se (~/.config/haszno/config.json)").option("--api-url <url>", "Haszno API alap URL-je (env: HASZNO_API_URL)").option("--label <name>", 'Token neve (alap\xE9rt.: "CLI")', "CLI").option("--show-token", "Token megjelen\xEDt\xE9se ment\xE9s ut\xE1n").action(
    async (opts, cmd) => {
      const globals = cmd?.optsWithGlobals() ?? {};
      const apiUrl = opts.apiUrl ?? globals.apiUrl ?? (process.env["HASZNO_API_URL"] || void 0);
      let email = process.env["HASZNO_EMAIL"] ?? "";
      let password = process.env["HASZNO_PASSWORD"] ?? "";
      if (!email || !password) {
        if (!process.stdin.isTTY) {
          process.stderr.write(
            "Interakt\xEDv m\xF3d TTY n\xE9lk\xFCl nem el\xE9rhet\u0151. \xC1ll\xEDtsd be a HASZNO_EMAIL \xE9s HASZNO_PASSWORD v\xE1ltoz\xF3kat.\n"
          );
          process.exit(2);
          return;
        }
        process.stdout.write("Haszno bejelentkez\xE9s\n");
        if (!email) email = await askInput("E-mail c\xEDm: ");
        if (!password) password = await readPasswordNoEcho("Jelsz\xF3: ");
      }
      try {
        const loginOpts = { ...httpOpts, baseUrl: apiUrl };
        const result = await cliLogin(
          { email, password, label: opts.label ?? "CLI" },
          loginOpts
        );
        const existing = {
          ...readConfigFile(configPath),
          ...readConfigObject(configPath)
        };
        existing.apiKey = result.token;
        if (apiUrl) existing.apiUrl = apiUrl;
        existing["userEmail"] = result.user.email;
        existing["userName"] = result.user.name;
        existing["shopName"] = result.user.shopName;
        writeConfigFile(existing, configPath);
        process.stdout.write(
          `Bejelentkezve: ${result.user.name} <${result.user.email}>${result.user.shopName ? ` (${result.user.shopName})` : ""}
Token elmentve: ${configPath}
`
        );
        if (opts.showToken) {
          process.stdout.write(`Token: ${result.token}
`);
        }
        process.stdout.write(
          "\nMegjegyz\xE9s: az MCP szerver (haszno-mcp) is ebb\u0151l a f\xE1jlb\xF3l olvas,\nez\xE9rt elegend\u0151 egyszer futtatni a `haszno login` parancsot.\n"
        );
      } catch (err) {
        handleError2(err);
      }
    }
  );
  program2.command("logout").description("API-token visszavon\xE1sa \xE9s t\xF6rl\xE9se a konfigur\xE1ci\xF3s f\xE1jlb\xF3l").action(async (_opts, _cmd) => {
    const existing = { ...readConfigObject(configPath) };
    const apiKey = existing["apiKey"];
    if (apiKey && apiKey.startsWith("haszno_")) {
      const apiUrl = existing["apiUrl"] ?? "https://haszno.com";
      try {
        const revokeOpts = { ...httpOpts, baseUrl: apiUrl, apiKey };
        const { post: httpPost } = await import("./http-5DXIMCSB.js");
        await httpPost("/api/v1/auth/tokens/revoke-current", {}, revokeOpts);
        process.stdout.write("Token visszavonva a szerveren.\n");
      } catch {
        process.stderr.write("Figyelmeztet\xE9s: a szerver oldali token visszavon\xE1s nem siker\xFClt (h\xE1l\xF3zati hiba vagy token m\xE1r \xE9rv\xE9nytelen). A helyi token t\xF6rl\xE9se folytat\xF3dik.\n");
      }
    }
    delete existing["apiKey"];
    delete existing["userEmail"];
    delete existing["userName"];
    delete existing["shopName"];
    writeConfigFile(existing, configPath);
    process.stdout.write(`Kijelentkezve. Token t\xF6r\xF6lve: ${configPath}
`);
  });
  program2.command("whoami").description("Aktu\xE1lis felhaszn\xE1l\xF3 \xE9s bejelentkez\xE9si \xE1llapot").action(async (_opts, cmd) => {
    const cfg = readConfigObject(configPath);
    const apiKey = cfg["apiKey"];
    const userEmail = cfg["userEmail"];
    const userName = cfg["userName"];
    const shopName = cfg["shopName"];
    const apiUrl = cfg["apiUrl"] ?? "https://haszno.com";
    const data = { userEmail, userName, shopName, apiUrl, authenticated: !!apiKey };
    if (getJsonFlag(cmd)) {
      printJson3(data);
    } else {
      if (!apiKey) {
        process.stdout.write("Nincs mentett token. Futtasd: haszno login\n");
        return;
      }
      process.stdout.write(`Felhaszn\xE1l\xF3: ${userName ?? "(ismeretlen)"}
`);
      process.stdout.write(`E-mail:      ${userEmail ?? "(ismeretlen)"}
`);
      if (shopName) process.stdout.write(`Bolt:        ${shopName}
`);
      process.stdout.write(`API URL:     ${apiUrl}
`);
      process.stdout.write(`Token:       ${apiKey.slice(0, 12)}...
`);
    }
  });
  const configureAction = async (opts, cmd) => {
    const globals = cmd?.optsWithGlobals() ?? {};
    let apiUrl = opts.apiUrl ?? globals.apiUrl;
    let apiKey = opts.apiKey ?? globals.apiKey;
    if (!apiUrl && !apiKey) {
      if (!process.stdin.isTTY) {
        process.stderr.write(
          "Interakt\xEDv m\xF3d TTY n\xE9lk\xFCl nem el\xE9rhet\u0151. Adj meg --api-url \xE9s/vagy --api-key param\xE9tert.\n"
        );
        process.exit(2);
        return;
      }
      process.stdout.write("Haszno CLI konfigur\xE1ci\xF3\n");
      process.stdout.write(`Konfigur\xE1ci\xF3s f\xE1jl: ${configPath}

`);
      apiUrl = await askInput("API URL (Enter = alap\xE9rtelmezett https://haszno.com): ");
      apiKey = await askInput("API kulcs: ");
    }
    const updated = { ...readConfigFile(configPath), ...readConfigObject(configPath) };
    if (apiUrl) updated.apiUrl = apiUrl;
    if (apiKey) updated.apiKey = apiKey;
    writeConfigFile(updated, configPath);
    process.stdout.write(`Konfigur\xE1ci\xF3s f\xE1jl elmentve: ${configPath}
`);
    process.stdout.write(
      "Az HASZNO_API_URL / HASZNO_API_KEY k\xF6rnyezeti v\xE1ltoz\xF3k \xE9s a\n--api-url / --api-key jelz\u0151k priorit\xE1st \xE9lveznek a f\xE1jllal szemben.\n\nMegjegyz\xE9s: az MCP szerver (haszno-mcp) is ebb\u0151l a f\xE1jlb\xF3l olvas,\nez\xE9rt elegend\u0151 egyszer futtatni a `haszno configure` parancsot.\n"
    );
  };
  program2.command("configure").description("API kulcs k\xF6zvetlen ment\xE9se (haszno configure --api-key <kulcs>)").option("--api-url <url>", "Haszno API alap URL-je").option("--api-key <key>", "Haszno API kulcs").action(configureAction);
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
      const ok = await askConfirm3("Biztosan frissited az arazasi beallitasokat?");
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
  const tokens = program2.command("tokens").description("API tokenek kezel\xE9se");
  tokens.command("list").description("Akt\xEDv API tokenek list\xE1ja (session-alap\xFA hiteles\xEDt\xE9s sz\xFCks\xE9ges)").action(async (_opts, cmd) => {
    try {
      const { get: httpGet } = await import("./http-5DXIMCSB.js");
      const items = await httpGet("/api/v1/auth/tokens", httpOpts);
      if (getJsonFlag(cmd)) {
        printJson3(items);
      } else {
        if (!Array.isArray(items) || items.length === 0) {
          process.stdout.write("Nincs akt\xEDv token.\n");
          return;
        }
        process.stdout.write("Akt\xEDv tokenek:\n");
        for (const t of items) {
          const expires = t.expiresAt ? t.expiresAt.slice(0, 10) : "nem j\xE1r le";
          const lastUsed = t.lastUsedAt ? t.lastUsedAt.slice(0, 10) : "soha";
          process.stdout.write(`  #${t.id}  ${t.name.padEnd(20)}  ${t.scope.padEnd(12)}  lej\xE1r: ${expires}  utolj\xE1ra: ${lastUsed}
`);
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  tokens.command("revoke <id>").description("API token visszavon\xE1sa azonos\xEDt\xF3 alapj\xE1n (session-alap\xFA hiteles\xEDt\xE9s sz\xFCks\xE9ges)").action(async (idStr, _opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id) || id <= 0) {
      process.stderr.write("\xC9rv\xE9nytelen token azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const { del: httpDel } = await import("./http-5DXIMCSB.js");
      const result = await httpDel(`/api/v1/auth/tokens/${id}`, httpOpts);
      if (getJsonFlag(cmd)) printJson3(result);
      else process.stdout.write(`Token #${id} visszavonva.
`);
    } catch (err) {
      handleError2(err);
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

// src/commands/shop.ts
import { createInterface as createInterface4 } from "readline";
import { readFileSync as readFileSync2, readdirSync, statSync } from "fs";
import { join, extname } from "path";
function getJsonFlag2(cmd) {
  try {
    return cmd.optsWithGlobals().json === true;
  } catch {
    return false;
  }
}
function fmt3(n) {
  return n.toLocaleString("hu-HU") + " Ft";
}
function printAdTable(ads) {
  if (ads.length === 0) {
    process.stdout.write("Nincs tal\xE1lat.\n");
    return;
  }
  for (const ad of ads) {
    const rawStatus = ad.status ?? "";
    const status = rawStatus === "aktiv" ? "akt\xEDv" : rawStatus;
    const reserved = ad.reserved ? " [foglalt]" : "";
    process.stdout.write(
      `  #${String(ad.id).padStart(5)}  ${fmt3(ad.priceGross ?? 0).padStart(12)}  ${status.padEnd(10)}${reserved}  ${ad.title}
`
    );
  }
}
function printReservation(r) {
  const full = r;
  process.stdout.write(`  Foglal\xE1s #${r.id}
`);
  if (full.ad) {
    process.stdout.write(`    Hirdet\xE9s:  #${full.adId} ${full.ad.title}
`);
  } else {
    process.stdout.write(`    Hirdet\xE9s:  #${r.adId}
`);
  }
  process.stdout.write(`    \xC1llapot:   ${r.status}
`);
  if (r.heldUntil) {
    process.stdout.write(`    Hat\xE1rid\u0151:  ${r.heldUntil}
`);
  }
  if (full.message) {
    process.stdout.write(`    \xDCzenet:    ${full.message}
`);
  }
  if (r.offerPriceGross) {
    process.stdout.write(`    Aj\xE1nlott \xE1r:    ${fmt3(r.offerPriceGross)}
`);
  }
  if (r.counterPriceGross) {
    process.stdout.write(`    Ellenaj\xE1nlat:   ${fmt3(r.counterPriceGross)}
`);
  }
  if (r.agreedPriceGross) {
    process.stdout.write(`    Elfogadott \xE1r:  ${fmt3(r.agreedPriceGross)}
`);
  }
  if (full.buyerPhone) {
    process.stdout.write(`    Vev\u0151 tel.:  ${full.buyerPhone}
`);
  }
  if (full.buyerEmail) {
    process.stdout.write(`    Vev\u0151 e-mail: ${full.buyerEmail}
`);
  }
  if (full.sellerPhone) {
    process.stdout.write(`    Elad\xF3 tel.:  ${full.sellerPhone}
`);
  }
  if (full.sellerEmail) {
    process.stdout.write(`    Elad\xF3 e-mail: ${full.sellerEmail}
`);
  }
  if (full.sellerName) {
    process.stdout.write(`    Elad\xF3 neve:  ${full.sellerName}
`);
  }
  process.stdout.write(`    L\xE9trehozva: ${r.createdAt}
`);
}
async function askConfirm4(message) {
  if (!process.stdin.isTTY) return false;
  const rl = createInterface4({ input: process.stdin, output: process.stderr });
  return new Promise((resolve) => {
    rl.question(`${message} [y/N] `, (ans) => {
      rl.close();
      resolve(ans.toLowerCase() === "y" || ans.toLowerCase() === "igen");
    });
  });
}
function parseAttrs(pairs) {
  const result = {};
  for (const pair of pairs) {
    const eq = pair.indexOf("=");
    if (eq < 1) {
      process.stderr.write(`\xC9rv\xE9nytelen --attr \xE9rt\xE9k: "${pair}" (form\xE1tum: kulcs=\xE9rt\xE9k)
`);
      process.exit(2);
    }
    result[pair.slice(0, eq)] = pair.slice(eq + 1);
  }
  return result;
}
function registerShopCommands(program2, shopClient2, _opts) {
  const shop = program2.command("shop").description("Haszno Shop hirdet\xE9si piac");
  shop.command("categories").description("Hirdet\xE9si kateg\xF3ri\xE1k \xE9s k\xF6telez\u0151 attrib\xFAtumok").action(async (_opts2, cmd) => {
    try {
      const cats = await shopClient2.categories.list();
      if (getJsonFlag2(cmd)) {
        printJson3(cats);
      } else {
        for (const cat of cats) {
          process.stdout.write(`${cat.key}  ${cat.label}
`);
          for (const sub of cat.subcategories ?? []) {
            const reqAttrs = sub.attrs?.filter((a) => a.required).map((a) => a.key).join(", ") ?? "";
            process.stdout.write(
              `  \u2514\u2500 ${sub.key.padEnd(30)} ${sub.label}${reqAttrs ? `  [k\xF6t.: ${reqAttrs}]` : ""}
`
            );
          }
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("search [query]").description("Hirdet\xE9sek keres\xE9se").option("--category <id>", "Kateg\xF3ria sz\u0171r\u0151").option("--subcategory <id>", "Alkateg\xF3ria sz\u0171r\u0151").option("--min-price <Ft>", "Minimum \xE1r (brutt\xF3 Ft)").option("--max-price <Ft>", "Maximum \xE1r (brutt\xF3 Ft)").option("--county <megye>", "Megye sz\u0171r\u0151").option("--city <v\xE1ros>", "V\xE1ros sz\u0171r\u0151").option("--sort <m\xF3d>", "Rendez\xE9s: newest, price_asc, price_desc", "newest").option("--page <n>", "Oldalsz\xE1m", "1").action(
    async (query, opts, cmd) => {
      try {
        const result = await shopClient2.ads.search({
          q: query,
          category: opts.category,
          subcategory: opts.subcategory,
          minPrice: opts.minPrice ? parseInt(opts.minPrice, 10) : void 0,
          maxPrice: opts.maxPrice ? parseInt(opts.maxPrice, 10) : void 0,
          county: opts.county,
          city: opts.city,
          sort: opts.sort,
          page: opts.page ? parseInt(opts.page, 10) : void 0
        });
        if (getJsonFlag2(cmd)) {
          printJson3(result);
        } else {
          const ads = Array.isArray(result) ? result : result.items ?? [];
          printAdTable(ads);
        }
      } catch (err) {
        handleError2(err);
      }
    }
  );
  shop.command("show <id>").description("Hirdet\xE9s r\xE9szletei").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen hirdet\xE9s-azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const ad = await shopClient2.ads.get(id);
      if (getJsonFlag2(cmd)) {
        printJson3(ad);
      } else {
        process.stdout.write(`#${ad.id}  ${ad.title}
`);
        process.stdout.write(`  \xC1r:        ${fmt3(ad.priceGross ?? 0)}${ad.negotiable ? " (alku)" : ""}
`);
        process.stdout.write(`  \xC1llapot:   ${ad.status}${ad.reserved ? " [foglalt]" : ""}
`);
        if (ad.condition) process.stdout.write(`  \xC1llapot:   ${ad.condition}
`);
        if (ad.county || ad.city) {
          process.stdout.write(`  Helysz\xEDn:  ${[ad.county, ad.city].filter(Boolean).join(", ")}
`);
        }
        if (ad.description) {
          process.stdout.write(`  Le\xEDr\xE1s:
${ad.description.split("\n").map((l) => `    ${l}`).join("\n")}
`);
        }
        if (Object.keys(ad.attrs ?? {}).length > 0) {
          process.stdout.write("  Attrib\xFAtumok:\n");
          for (const [k, v] of Object.entries(ad.attrs)) {
            process.stdout.write(`    ${k}: ${v}
`);
          }
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("price-hint").description("\xC1rjavaslat kateg\xF3ria alapj\xE1n").option("--category <id>", "Kateg\xF3ria").option("--subcategory <id>", "Alkateg\xF3ria").action(async (opts, cmd) => {
    try {
      const hint = await shopClient2.ads.priceHint({
        category: opts.category,
        subcategory: opts.subcategory
      });
      if (getJsonFlag2(cmd)) {
        printJson3(hint);
      } else {
        if (!hint) {
          process.stdout.write("Nincs elegend\u0151 adat az \xE1rjavaslathoz.\n");
        } else {
          process.stdout.write("\xC1rjavaslat:\n");
          process.stdout.write(`  25. percentilis: ${fmt3(hint.p25)}
`);
          process.stdout.write(`  75. percentilis: ${fmt3(hint.p75)}
`);
          process.stdout.write(`  Mintaalap: ${hint.count} hirdet\xE9s
`);
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("post").description("\xDAj hirdet\xE9s felad\xE1sa").option("--title <c\xEDm>", "Hirdet\xE9s c\xEDme").option("--category <kulcs>", "Kateg\xF3ria kulcsa (pl. elekt)").option("--subcategory <kulcs>", "Alkateg\xF3ria kulcsa").option("--price <Ft>", "V\xE9tel\xE1r (brutt\xF3 Ft, \xFCresen = \xE1r n\xE9lk\xFCl)").option("--negotiable", "Alkuk\xE9pes").option("--condition <\xE1llapot>", "\xC1llapot: uj | ujszeru | hasznalt | serult").option("--defects <sz\xF6veg>", "Hib\xE1k, s\xE9r\xFCl\xE9sek le\xEDr\xE1sa (k\xF6telez\u0151 hasznalt/serult \xE1llapotn\xE1l, min. 10 karakter)").option("--description <le\xEDr\xE1s>", "Hirdet\xE9s le\xEDr\xE1sa").option("--county <megye>", "Megye").option("--city <v\xE1ros>", "V\xE1ros").option("--contact-name <n\xE9v>", "Kapcsolattart\xF3 neve").option("--contact-phone <telefon>", "Kapcsolattart\xF3 telefonsz\xE1ma").option("--contact-email <email>", "Kapcsolattart\xF3 e-mail-c\xEDm (k\xF6telez\u0151)").option("--show-phone", "Telefonsz\xE1m megjelen\xEDt\xE9se").option("--resellable", "Viszontelad\xF3i jogok enged\xE9lyez\xE9se").option("--commission-pct <sz\xE1m>", "Viszontelad\xF3i jutal\xE9k (%)", "0").option("--attr <kulcs=\xE9rt\xE9k>", "Attrib\xFAtum (megism\xE9telhet\u0151)", (v, a) => [...a, v], []).option("--image <f\xE1jl>", "K\xE9pf\xE1jl felt\xF6lt\xE9se (megism\xE9telhet\u0151)", (v, a) => [...a, v], []).option("--from-photos", "AI-javaslatot k\xE9r a felt\xF6lt\xF6tt k\xE9pek alapj\xE1n").option("--remove-bg", "H\xE1tt\xE9r elt\xE1vol\xEDt\xE1sa a felt\xF6lt\xF6tt k\xE9pekr\u0151l (AI)").option("--dry-run", "Csak megjelen\xEDti a k\xE9r\xE9st, nem k\xFCldi el").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(
    async (opts, cmd) => {
      try {
        const imageUrls = [];
        const imageNumericIds = [];
        if (opts.image.length > 0) {
          process.stderr.write(`${opts.image.length} k\xE9p felt\xF6lt\xE9se...
`);
          for (const filePath of opts.image) {
            const uploaded = await shopClient2.myAds.uploadImage(filePath);
            let result = uploaded;
            if (opts.removeBg) {
              process.stderr.write(`H\xE1tt\xE9r elt\xE1vol\xEDt\xE1sa: k\xE9p #${uploaded.id}...
`);
              try {
                result = await shopClient2.images.removeBg(uploaded.id);
              } catch (err) {
                process.stderr.write(`Figyelmeztet\xE9s: h\xE1tt\xE9r-elt\xE1vol\xEDt\xE1s sikertelen (${err instanceof Error ? err.message : String(err)}), eredeti k\xE9p haszn\xE1lata.
`);
                result = uploaded;
              }
            }
            imageUrls.push(result.url);
            imageNumericIds.push(result.id);
          }
        }
        let aiSuggest = {};
        if (opts.fromPhotos && imageNumericIds.length > 0) {
          process.stderr.write("AI-javaslat k\xE9r\xE9se a k\xE9pekb\u0151l...\n");
          aiSuggest = await shopClient2.myAds.fromPhotos(imageNumericIds);
          process.stdout.write("AI-javaslat:\n");
          printJson3(aiSuggest);
        }
        const attrs = parseAttrs(opts.attr);
        const title = opts.title ?? aiSuggest.title ?? "";
        const category = opts.category ?? aiSuggest.categoryId ?? "";
        const condition = opts.condition ?? aiSuggest.condition ?? "";
        const county = opts.county ?? "";
        const city = opts.city ?? "";
        const contactEmail = opts.contactEmail ?? "";
        const body = {
          title,
          category,
          subcategory: opts.subcategory ?? aiSuggest.subcategoryId ?? null,
          priceGross: opts.price != null ? parseInt(opts.price, 10) : aiSuggest.suggestedPriceGross ?? null,
          negotiable: opts.negotiable ?? false,
          condition,
          defects: opts.defects ?? null,
          description: opts.description ?? aiSuggest.description ?? "",
          county,
          city,
          attrs: { ...aiSuggest.attrs, ...attrs },
          images: imageUrls,
          contactName: opts.contactName ?? "",
          contactPhone: opts.contactPhone ?? null,
          contactEmail,
          showPhone: opts.showPhone ?? false,
          resellable: opts.resellable ?? false,
          partnerCommissionPct: opts.commissionPct ? parseFloat(opts.commissionPct) : 0
        };
        if (!body.title) {
          process.stderr.write("A --title megad\xE1sa k\xF6telez\u0151 (vagy --from-photos az AI-javaslathoz).\n");
          process.exit(2);
          return;
        }
        if (opts.dryRun) {
          process.stdout.write("K\xE9r\xE9s (dry-run, NEM LETT ELK\xDCLDVE):\n");
          printJson3(body);
          return;
        }
        const missing = [];
        if (!body.category) missing.push("--category");
        if (!body.condition) missing.push("--condition");
        if (!body.county) missing.push("--county");
        if (!body.city) missing.push("--city");
        if (!body.contactName) missing.push("--contact-name");
        if (!body.contactEmail) missing.push("--contact-email");
        if (missing.length > 0) {
          process.stderr.write(`Hi\xE1nyz\xF3 k\xF6telez\u0151 mez\u0151${missing.length > 1 ? "k" : ""}: ${missing.join(", ")}
`);
          process.exit(2);
          return;
        }
        if (!opts.yes) {
          process.stdout.write("Hirdet\xE9s tervezett adatai:\n");
          printJson3(body);
          const ok = await askConfirm4("Feladjuk \xEDgy?");
          if (!ok) {
            process.stdout.write("Megszak\xEDtva.\n");
            process.exit(0);
            return;
          }
        }
        const ad = await shopClient2.myAds.post(body);
        if (getJsonFlag2(cmd)) {
          printJson3(ad);
        } else {
          process.stdout.write(`Hirdet\xE9s feladva: #${ad.id}  ${ad.title}
`);
        }
      } catch (err) {
        handleError2(err);
      }
    }
  );
  shop.command("my").description("Saj\xE1t hirdet\xE9sek list\xE1ja").action(async (_opts2, cmd) => {
    try {
      const ads = await shopClient2.myAds.list();
      if (getJsonFlag2(cmd)) {
        printJson3(ads);
      } else {
        printAdTable(Array.isArray(ads) ? ads : []);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("edit <id>").description("Hirdet\xE9s szerkeszt\xE9se").option("--title <c\xEDm>", "\xDAj c\xEDm").option("--price <Ft>", "\xDAj \xE1r (brutt\xF3 Ft)").option("--negotiable", "Alkuk\xE9pes").option("--condition <\xE1llapot>", "\xC1llapot: uj | ujszeru | hasznalt | serult").option("--description <le\xEDr\xE1s>", "Le\xEDr\xE1s").option("--county <megye>", "Megye").option("--city <v\xE1ros>", "V\xE1ros").option("--attr <kulcs=\xE9rt\xE9k>", "Attrib\xFAtum", (v, a) => [...a, v], []).option("--contact-name <n\xE9v>", "Kapcsolattart\xF3 neve").option("--contact-phone <telefon>", "Kapcsolattart\xF3 telefonsz\xE1ma").option("--contact-email <email>", "Kapcsolattart\xF3 e-mail-c\xEDm").option("--show-phone", "Telefonsz\xE1m megjelen\xEDt\xE9se").option("--resellable", "Viszontelad\xF3i jogok enged\xE9lyez\xE9se").option("--commission-pct <sz\xE1m>", "Viszontelad\xF3i jutal\xE9k (%)").action(
    async (idStr, opts, cmd) => {
      const id = parseInt(idStr, 10);
      if (isNaN(id)) {
        process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
        process.exit(2);
        return;
      }
      try {
        const attrs = parseAttrs(opts.attr);
        const body = {};
        if (opts.title) body.title = opts.title;
        if (opts.price) body.priceGross = parseInt(opts.price, 10);
        if (opts.negotiable !== void 0) body.negotiable = opts.negotiable;
        if (opts.condition) body.condition = opts.condition;
        if (opts.description) body.description = opts.description;
        if (opts.county) body.county = opts.county;
        if (opts.city) body.city = opts.city;
        if (Object.keys(attrs).length > 0) body.attrs = attrs;
        if (opts.contactName) body.contactName = opts.contactName;
        if (opts.contactPhone) body.contactPhone = opts.contactPhone;
        if (opts.contactEmail) body.contactEmail = opts.contactEmail;
        if (opts.showPhone !== void 0) body.showPhone = opts.showPhone;
        if (opts.resellable !== void 0) body.resellable = opts.resellable;
        if (opts.commissionPct) body.partnerCommissionPct = parseFloat(opts.commissionPct);
        const ad = await shopClient2.myAds.edit(id, body);
        if (getJsonFlag2(cmd)) {
          printJson3(ad);
        } else {
          process.stdout.write(`Hirdet\xE9s #${ad.id} friss\xEDtve.
`);
        }
      } catch (err) {
        handleError2(err);
      }
    }
  );
  shop.command("pause <id>").description("Hirdet\xE9s sz\xFCneteltet\xE9se").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const ad = await shopClient2.myAds.pause(id);
      if (getJsonFlag2(cmd)) printJson3(ad);
      else process.stdout.write(`Hirdet\xE9s #${id} sz\xFCneteltetve.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("activate <id>").description("Hirdet\xE9s aktiv\xE1l\xE1sa").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const ad = await shopClient2.myAds.activate(id);
      if (getJsonFlag2(cmd)) printJson3(ad);
      else process.stdout.write(`Hirdet\xE9s #${id} aktiv\xE1lva.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("sold <id>").description("Hirdet\xE9s eladottnak jel\xF6l\xE9se").option("--price <Ft>", "T\xE9nyleges elad\xE1si \xE1r (brutt\xF3 Ft)").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const body = opts.price ? { soldPriceGross: parseInt(opts.price, 10) } : {};
      const ad = await shopClient2.myAds.sold(id, body);
      if (getJsonFlag2(cmd)) printJson3(ad);
      else process.stdout.write(`Hirdet\xE9s #${id} eladottnak jel\xF6lve.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("renew <id>").description("Hirdet\xE9s meg\xFAj\xEDt\xE1sa").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const ad = await shopClient2.myAds.renew(id);
      if (getJsonFlag2(cmd)) printJson3(ad);
      else process.stdout.write(`Hirdet\xE9s #${id} meg\xFAj\xEDtva.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("delete <id>").description("Hirdet\xE9s t\xF6rl\xE9se").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const result = await shopClient2.myAds.delete(id);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write(`Hirdet\xE9s #${id} t\xF6r\xF6lve.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("inquiries").description("Be\xE9rkezett \xFCzenetek list\xE1ja").action(async (_opts2, cmd) => {
    try {
      const items = await shopClient2.inquiries.listReceived();
      if (getJsonFlag2(cmd)) {
        printJson3(items);
      } else {
        if (!Array.isArray(items) || items.length === 0) {
          process.stdout.write("Nincs be\xE9rkezett \xFCzenet.\n");
          return;
        }
        for (const item of items) {
          const read = item.readAt ? "" : " [\xFAj]";
          process.stdout.write(`  #${item.id}${read}  Hirdet\xE9s #${item.adId}  ${item.name}
`);
          process.stdout.write(`    ${item.message.slice(0, 80)}
`);
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("inquire <adId>").description("\xDCzenet k\xFCld\xE9se elad\xF3nak").option("--name <n\xE9v>", "A felad\xF3 neve (k\xF6telez\u0151)").option("--email <email>", "A felad\xF3 e-mail-c\xEDm (k\xF6telez\u0151)").option("--phone <telefon>", "A felad\xF3 telefonsz\xE1ma (opcion\xE1lis)").option("--message <sz\xF6veg>", "\xDCzenet sz\xF6vege (k\xF6telez\u0151)").action(async (adIdStr, opts, cmd) => {
    const adId = parseInt(adIdStr, 10);
    if (isNaN(adId)) {
      process.stderr.write("\xC9rv\xE9nytelen hirdet\xE9s-azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    if (!opts.name) {
      process.stderr.write("--name megad\xE1sa k\xF6telez\u0151.\n");
      process.exit(2);
      return;
    }
    if (!opts.email) {
      process.stderr.write("--email megad\xE1sa k\xF6telez\u0151.\n");
      process.exit(2);
      return;
    }
    if (!opts.message) {
      process.stderr.write("--message megad\xE1sa k\xF6telez\u0151.\n");
      process.exit(2);
      return;
    }
    try {
      const body = {
        name: opts.name,
        email: opts.email,
        message: opts.message
      };
      if (opts.phone) body.phone = opts.phone;
      const result = await shopClient2.inquiries.send(adId, body);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write("\xDCzenet elk\xFCldve.\n");
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("favorite <adId>").description("Hirdet\xE9s ment\xE9se kedvencekbe").action(async (adIdStr, _opts2, cmd) => {
    const adId = parseInt(adIdStr, 10);
    if (isNaN(adId)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const result = await shopClient2.favorites.add(adId);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write(`Hirdet\xE9s #${adId} hozz\xE1adva a kedvencekhez.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("unfavorite <adId>").description("Hirdet\xE9s elt\xE1vol\xEDt\xE1sa kedvencekb\u0151l").action(async (adIdStr, _opts2, cmd) => {
    const adId = parseInt(adIdStr, 10);
    if (isNaN(adId)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const result = await shopClient2.favorites.remove(adId);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write(`Hirdet\xE9s #${adId} elt\xE1vol\xEDtva a kedvencekb\u0151l.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("favorites").description("Kedvenc hirdet\xE9sek list\xE1ja").action(async (_opts2, cmd) => {
    try {
      const ads = await shopClient2.favorites.list();
      if (getJsonFlag2(cmd)) {
        printJson3(ads);
      } else {
        printAdTable(Array.isArray(ads) ? ads : []);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("reserve <adId>").description("Hirdet\xE9s lefoglal\xE1sa (ingyenes \u2014 a fizet\xE9s k\xF6zvetlen\xFCl az elad\xF3val zajlik)").option("--message <sz\xF6veg>", "\xDCzenet az elad\xF3nak (max. 1000 karakter)").option("--offer <Ft>", "Aj\xE1nlott \xE1r (brutt\xF3 Ft, ellenjavaslat)").option("--phone <telefon>", "Telefonsz\xE1m (az elad\xF3nak \xE1tadva elfogad\xE1skor, max. 50 kar.)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa").action(
    async (adIdStr, opts, cmd) => {
      const adId = parseInt(adIdStr, 10);
      if (isNaN(adId)) {
        process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
        process.exit(2);
        return;
      }
      if (!opts.yes) {
        process.stdout.write(
          "A foglal\xE1s INGYENES \u2014 a fizet\xE9s \xE9s az \xE1tad\xE1s k\xF6zvetlen\xFCl az elad\xF3val t\xF6rt\xE9nik.\n"
        );
        const ok = await askConfirm4(`Lefoglalod a #${adId} hirdet\xE9st?`);
        if (!ok) {
          process.stdout.write("Megszak\xEDtva.\n");
          process.exit(0);
          return;
        }
      }
      try {
        const body = {};
        if (opts.message) body.message = opts.message;
        if (opts.offer) body.offerPriceGross = parseInt(opts.offer, 10);
        if (opts.phone) body.phone = opts.phone;
        const { reservation: reservation2 } = await shopClient2.reservations.create(adId, body);
        if (getJsonFlag2(cmd)) {
          printJson3(reservation2);
        } else {
          process.stdout.write("Foglal\xE1s l\xE9trehozva:\n");
          printReservation(reservation2);
        }
      } catch (err) {
        handleError2(err);
      }
    }
  );
  shop.command("reservations").description("Foglal\xE1saim list\xE1ja").option("--as <buyer|seller>", "Szerep: buyer (vev\u0151, alap\xE9rt.) vagy seller (elad\xF3)", "buyer").option("--status <\xE1llapot>", "\xC1llapot sz\u0171r\u0151").option("--page <n>", "Oldalsz\xE1m", "1").action(
    async (opts, cmd) => {
      try {
        const result = await shopClient2.reservations.list({
          role: opts.as ?? "buyer",
          status: opts.status,
          page: opts.page ? parseInt(opts.page, 10) : void 0
        });
        if (getJsonFlag2(cmd)) {
          printJson3(result);
        } else {
          const items = result.items ?? [];
          if (items.length === 0) {
            process.stdout.write("Nincs foglal\xE1s.\n");
            return;
          }
          for (const r of items) {
            printReservation(r);
            process.stdout.write("\n");
          }
        }
      } catch (err) {
        handleError2(err);
      }
    }
  );
  const reservation = shop.command("reservation").description("Foglal\xE1s kezel\xE9se (elfogad / elutas\xEDt / lemond / teljes\xEDt)");
  reservation.command("accept <id>").description("Foglal\xE1s elfogad\xE1sa (elad\xF3k\xE9nt)").option("--held-until <ISO>", "Hat\xE1rid\u0151 a vev\u0151nek (ISO-8601 d\xE1tum/id\u0151)").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const { reservation: r } = await shopClient2.reservations.accept(id, { heldUntil: opts.heldUntil });
      if (getJsonFlag2(cmd)) printJson3(r);
      else process.stdout.write(`Foglal\xE1s #${id} elfogadva (\xE1llapot: ${r.status}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("decline <id>").description("Foglal\xE1s elutas\xEDt\xE1sa (elad\xF3k\xE9nt)").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const { reservation: r } = await shopClient2.reservations.decline(id);
      if (getJsonFlag2(cmd)) printJson3(r);
      else process.stdout.write(`Foglal\xE1s #${id} elutas\xEDtva.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("cancel <id>").description("Foglal\xE1s lemond\xE1sa (vev\u0151k\xE9nt)").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const { reservation: r } = await shopClient2.reservations.cancel(id);
      if (getJsonFlag2(cmd)) printJson3(r);
      else process.stdout.write(`Foglal\xE1s #${id} visszavonva.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("complete <id>").description("Foglal\xE1s teljes\xEDt\xE9se (elad\xF3k\xE9nt)").option("--price <Ft>", "T\xE9nyleges elad\xE1si \xE1r (brutt\xF3 Ft)").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const body = opts.price ? { soldPriceGross: parseInt(opts.price, 10) } : {};
      const { reservation: r } = await shopClient2.reservations.complete(id, body);
      if (getJsonFlag2(cmd)) printJson3(r);
      else process.stdout.write(`Foglal\xE1s #${id} teljes\xEDtve.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("counter <id>").description("Ellenaj\xE1nlat k\xFCld\xE9se (elad\xF3k\xE9nt, am\xEDg a foglal\xE1s f\xFCgg\u0151ben van)").requiredOption("--price <Ft>", "Ellenaj\xE1nlott \xE1r (brutt\xF3 Ft)").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    const price = parseInt(opts.price, 10);
    if (isNaN(price) || price <= 0) {
      process.stderr.write("\xC9rv\xE9nytelen \xE1r.\n");
      process.exit(2);
      return;
    }
    try {
      const { reservation: r } = await shopClient2.reservations.counter(id, price);
      if (getJsonFlag2(cmd)) printJson3(r);
      else process.stdout.write(`Ellenaj\xE1nlat elk\xFCldve: ${fmt3(price)} (foglal\xE1s #${id}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("accept-counter <id>").description("Elad\xF3i ellenaj\xE1nlat elfogad\xE1sa (vev\u0151k\xE9nt)").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const { reservation: r } = await shopClient2.reservations.acceptCounter(id);
      if (getJsonFlag2(cmd)) printJson3(r);
      else process.stdout.write(`Ellenaj\xE1nlat elfogadva (foglal\xE1s #${id}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("messages <id>").description("Foglal\xE1s \xFCzenetei").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const { items } = await shopClient2.reservations.messages(id);
      if (getJsonFlag2(cmd)) {
        printJson3(items);
      } else {
        if (items.length === 0) {
          process.stdout.write("Nincs \xFCzenet.\n");
          return;
        }
        for (const m of items) {
          const who = m.author === "buyer" ? "Vev\u0151" : "Elad\xF3";
          process.stdout.write(`  [${m.createdAt.slice(0, 16)}] ${who}: ${m.body}
`);
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("message <id>").description("\xDCzenet k\xFCld\xE9se a foglal\xE1son").requiredOption("--text <sz\xF6veg>", "\xDCzenet sz\xF6vege (1\u20132000 karakter)").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    if (!opts.text.trim()) {
      process.stderr.write("--text megad\xE1sa k\xF6telez\u0151.\n");
      process.exit(2);
      return;
    }
    try {
      const { message: m } = await shopClient2.reservations.message(id, opts.text);
      if (getJsonFlag2(cmd)) printJson3(m);
      else process.stdout.write(`\xDCzenet elk\xFCldve (#${m.id}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  reservation.command("review <id>").description("\xC9rt\xE9kel\xE9s lead\xE1sa teljes\xEDtett foglal\xE1sra").requiredOption("--rating <1-5>", "\xC9rt\xE9kel\xE9s (1\u20135 csillag)").option("--comment <sz\xF6veg>", "Sz\xF6veges megjegyz\xE9s (max. 1000 karakter)").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    const rating = parseInt(opts.rating, 10);
    if (isNaN(rating) || rating < 1 || rating > 5) {
      process.stderr.write("--rating \xE9rt\xE9ke 1 \xE9s 5 k\xF6z\xE9 kell essen.\n");
      process.exit(2);
      return;
    }
    try {
      const { review } = await shopClient2.reservations.review(id, rating, opts.comment);
      if (getJsonFlag2(cmd)) printJson3(review);
      else process.stdout.write(`\xC9rt\xE9kel\xE9s leadva: ${rating} csillag (foglal\xE1s #${id}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  const inquiry = shop.command("inquiry").description("\xC9rdekl\u0151d\xE9s kezel\xE9se (elad\xF3k\xE9nt)");
  inquiry.command("reply <id>").description("V\xE1lasz k\xFCld\xE9se \xE9rdekl\u0151d\u0151nek (elad\xF3k\xE9nt)").requiredOption("--message <sz\xF6veg>", "V\xE1lasz sz\xF6vege (1\u20132000 karakter)").action(async (idStr, opts, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    if (!opts.message.trim()) {
      process.stderr.write("--message megad\xE1sa k\xF6telez\u0151.\n");
      process.exit(2);
      return;
    }
    try {
      const { reply } = await shopClient2.inquiries.reply(id, opts.message);
      if (getJsonFlag2(cmd)) printJson3(reply);
      else process.stdout.write(`V\xE1lasz elk\xFCldve az \xE9rdekl\u0151d\u0151nek (\xE9rdekl\u0151d\xE9s #${reply.inquiryId}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  const savedSearch = shop.command("saved-search").description("Mentett keres\xE9sek kezel\xE9se");
  savedSearch.command("list").description("Mentett keres\xE9sek list\xE1ja").action(async (_opts2, cmd) => {
    try {
      const items = await shopClient2.savedSearches.list();
      if (getJsonFlag2(cmd)) {
        printJson3(items);
      } else {
        if (items.length === 0) {
          process.stdout.write("Nincs mentett keres\xE9s.\n");
          return;
        }
        for (const s of items) {
          const alert = s.alertEnabled ? " [\xE9rtes\xEDt\u0151: be]" : "";
          process.stdout.write(`  #${s.id}  ${s.name}${alert}
`);
          const f = s.filters;
          const parts = [];
          if (f.q) parts.push(`\u201E${f.q}"`);
          if (f.cat) parts.push(`kat:${f.cat}`);
          if (f.sub) parts.push(`alkat:${f.sub}`);
          if (f.min != null) parts.push(`min ${fmt3(f.min)}`);
          if (f.max != null) parts.push(`max ${fmt3(f.max)}`);
          if (f.county) parts.push(f.county);
          if (f.cond) parts.push(f.cond);
          if (parts.length > 0) process.stdout.write(`       ${parts.join(", ")}
`);
        }
      }
    } catch (err) {
      handleError2(err);
    }
  });
  savedSearch.command("add").description('\xDAj mentett keres\xE9s (ugyanazok a sz\u0171r\u0151k, mint a "search" parancsn\xE1l)').requiredOption("--name <n\xE9v>", "A mentett keres\xE9s neve").option("--query <sz\xF6veg>", "Keres\u0151sz\xF6veg").option("--category <id>", "Kateg\xF3ria").option("--subcategory <id>", "Alkateg\xF3ria").option("--min-price <Ft>", "Minimum \xE1r").option("--max-price <Ft>", "Maximum \xE1r").option("--county <megye>", "Megye").option("--condition <\xE1llapot>", "\xC1llapot: uj | ujszeru | hasznalt | serult").option("--no-alert", "E-mail \xE9rtes\xEDt\u0151 kikapcsol\xE1sa (alap\xE9rt.: be)").action(async (opts, cmd) => {
    const filters = {};
    if (opts.query) filters.q = opts.query;
    if (opts.category) filters.cat = opts.category;
    if (opts.subcategory) filters.sub = opts.subcategory;
    if (opts.minPrice) filters.min = parseInt(opts.minPrice, 10);
    if (opts.maxPrice) filters.max = parseInt(opts.maxPrice, 10);
    if (opts.county) filters.county = opts.county;
    if (opts.condition) filters.cond = opts.condition;
    try {
      const s = await shopClient2.savedSearches.add({ name: opts.name, filters, alertEnabled: opts.alert !== false });
      if (getJsonFlag2(cmd)) printJson3(s);
      else process.stdout.write(`Mentett keres\xE9s l\xE9trehozva: #${s.id}  ${s.name}
`);
    } catch (err) {
      handleError2(err);
    }
  });
  savedSearch.command("remove <id>").description("Mentett keres\xE9s t\xF6rl\xE9se").action(async (idStr, _opts2, cmd) => {
    const id = parseInt(idStr, 10);
    if (isNaN(id)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const result = await shopClient2.savedSearches.remove(id);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write(`Mentett keres\xE9s #${id} t\xF6r\xF6lve.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("watch <adId>").description("Feliratkoz\xE1s \xE1res\xE9s-\xE9rtes\xEDt\u0151re egy hirdet\xE9sn\xE9l").action(async (adIdStr, _opts2, cmd) => {
    const adId = parseInt(adIdStr, 10);
    if (isNaN(adId)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const result = await shopClient2.watch.watch(adId);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write(`Hirdet\xE9s #${adId} \xE1res\xE9s-\xE9rtes\xEDt\u0151re feliratkozva.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("unwatch <adId>").description("Leiratkoz\xE1s \xE1res\xE9s-\xE9rtes\xEDt\u0151r\u0151l").action(async (adIdStr, _opts2, cmd) => {
    const adId = parseInt(adIdStr, 10);
    if (isNaN(adId)) {
      process.stderr.write("\xC9rv\xE9nytelen azonos\xEDt\xF3.\n");
      process.exit(2);
      return;
    }
    try {
      const result = await shopClient2.watch.unwatch(adId);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write(`Hirdet\xE9s #${adId} \xE1res\xE9s-\xE9rtes\xEDt\u0151r\u0151l leiratkozva.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("import-url <url>").description("Hirdet\xE9s import\xE1l\xE1sa URL-b\u0151l (kinyeri a metaadatokat)").option("--post", "Import\xE1lt adatok alapj\xE1n hirdet\xE9st ad fel (interakt\xEDv)").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa (csak --post-tal)").action(async (url, opts, cmd) => {
    try {
      process.stderr.write("URL elemz\xE9se...\n");
      const data = await shopClient2.urlImport.importUrl(url);
      if (getJsonFlag2(cmd)) {
        printJson3(data);
        return;
      }
      process.stdout.write("Kinyert adatok:\n");
      if (data.title) process.stdout.write(`  C\xEDm:      ${data.title}
`);
      if (data.price) process.stdout.write(`  \xC1r:       ${fmt3(data.price)}
`);
      if (data.description) {
        process.stdout.write(`  Le\xEDr\xE1s:   ${data.description.slice(0, 120)}${data.description.length > 120 ? "\u2026" : ""}
`);
      }
      if (data.images.length > 0) {
        process.stdout.write(`  K\xE9pek:    ${data.images.length} db
`);
      }
      if (Object.keys(data.parsed).length > 0) {
        process.stdout.write("  Elemzett:\n");
        for (const [k, v] of Object.entries(data.parsed)) {
          process.stdout.write(`    ${k}: ${v}
`);
        }
      }
      if (opts.post) {
        if (!opts.yes) {
          const ok = await askConfirm4("Hirdet\xE9st adsz fel ezekkel az adatokkal?");
          if (!ok) {
            process.stdout.write("Megszak\xEDtva.\n");
            process.exit(0);
            return;
          }
        }
        const body = {
          title: data.title ?? "",
          description: data.description ?? "",
          priceGross: data.price ?? null,
          negotiable: false,
          condition: "hasznalt",
          county: "",
          city: "",
          category: "",
          images: data.images,
          attrs: {},
          contactName: "",
          contactPhone: null,
          contactEmail: "",
          showPhone: false,
          resellable: false,
          partnerCommissionPct: 0
        };
        if (!body.title) {
          process.stderr.write('Nem siker\xFClt automatikusan feladni: c\xEDm hi\xE1nyzik. Adj meg --title \xE9s a k\xF6telez\u0151 mez\u0151ket k\xE9zzel a "haszno shop post" paranccsal.\n');
          process.exit(2);
          return;
        }
        const ad = await shopClient2.myAds.post(body);
        process.stdout.write(`Hirdet\xE9s feladva: #${ad.id}  ${ad.title}
`);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  const draft = shop.command("draft").description("Hirdet\xE9sv\xE1zlat kezel\xE9se (szerver oldal)");
  draft.command("show").description("Aktu\xE1lis v\xE1zlat megjelen\xEDt\xE9se").action(async (_opts2, cmd) => {
    try {
      const d = await shopClient2.draft.show();
      if (getJsonFlag2(cmd)) {
        printJson3(d);
      } else {
        if (!d) {
          process.stdout.write("Nincs mentett v\xE1zlat.\n");
          return;
        }
        process.stdout.write(`V\xE1zlat (mentve: ${d.updatedAt}):
`);
        printJson3(d.payload);
      }
    } catch (err) {
      handleError2(err);
    }
  });
  draft.command("save").description("V\xE1zlat ment\xE9se (JSON a stdin-r\u0151l)").action(async (_opts2, cmd) => {
    try {
      process.stderr.write("JSON beolvas\xE1sa (stdin)...\n");
      const chunks = [];
      for await (const chunk of process.stdin) chunks.push(chunk);
      const rawText = Buffer.concat(chunks).toString("utf8").trim();
      if (!rawText) {
        process.stderr.write("\xDCres bemenet.\n");
        process.exit(2);
        return;
      }
      let payload;
      try {
        payload = JSON.parse(rawText);
      } catch {
        process.stderr.write("\xC9rv\xE9nytelen JSON.\n");
        process.exit(2);
        return;
      }
      const d = await shopClient2.draft.save(payload);
      if (getJsonFlag2(cmd)) printJson3(d);
      else process.stdout.write(`V\xE1zlat mentve (${d.updatedAt}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  draft.command("clear").description("V\xE1zlat t\xF6rl\xE9se").action(async (_opts2, cmd) => {
    try {
      const result = await shopClient2.draft.clear();
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write("V\xE1zlat t\xF6r\xF6lve.\n");
    } catch (err) {
      handleError2(err);
    }
  });
  shop.command("post-bulk <forr\xE1s>").description("T\xF6meges hirdet\xE9sfelad\xE1s CSV f\xE1jlb\xF3l vagy k\xF6nyvt\xE1rb\xF3l").option("--from-photos", "K\xF6nyvt\xE1r m\xF3d: alk\xF6nyvt\xE1rank\xE9nt egy hirdet\xE9s, AI-javaslat k\xE9pekb\u0151l").option("--dry-run", "Csak el\u0151n\xE9zet, nem ad fel").option("--yes", "Meger\u0151s\xEDt\xE9s kihagy\xE1sa (k\xF6telez\u0151 az \xE9les felt\xF6lt\xE9shez)").action(async (source, opts, cmd) => {
    try {
      let rows = [];
      let isDirectory = false;
      try {
        isDirectory = statSync(source).isDirectory();
      } catch {
      }
      if (opts.fromPhotos || isDirectory) {
        let entries;
        try {
          entries = readdirSync(source).filter((e) => {
            try {
              return statSync(join(source, e)).isDirectory();
            } catch {
              return false;
            }
          });
        } catch (err) {
          process.stderr.write(`Nem siker\xFClt beolvasni a k\xF6nyvt\xE1rat: ${err instanceof Error ? err.message : String(err)}
`);
          process.exit(2);
          return;
        }
        if (entries.length === 0) {
          process.stderr.write("Nincs alk\xF6nyvt\xE1r a megadott k\xF6nyvt\xE1rban.\n");
          process.exit(2);
          return;
        }
        rows = entries.map((e) => ({
          title: e,
          category: "",
          condition: "hasznalt",
          county: "",
          city: "",
          contact_name: "",
          contact_email: "",
          images: join(source, e)
        }));
      } else {
        let csvText;
        try {
          csvText = readFileSync2(source, "utf8");
        } catch (err) {
          process.stderr.write(`Nem siker\xFClt beolvasni a CSV f\xE1jlt: ${err instanceof Error ? err.message : String(err)}
`);
          process.exit(2);
          return;
        }
        const lines = csvText.split("\n").map((l) => l.trim()).filter(Boolean);
        if (lines.length < 2) {
          process.stderr.write("A CSV f\xE1jl \xFCres vagy csak fejl\xE9cet tartalmaz.\n");
          process.exit(2);
          return;
        }
        const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, "").toLowerCase().replace(/-/g, "_"));
        rows = lines.slice(1).map((line) => {
          const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
          const obj = {};
          headers.forEach((h, i) => {
            obj[h] = values[i] ?? "";
          });
          return obj;
        });
      }
      process.stdout.write(`
El\u0151n\xE9zet \u2014 ${rows.length} hirdet\xE9s:
`);
      process.stdout.write("  #   C\xEDm".padEnd(45) + "  Kateg\xF3ria  \xC1r\n");
      process.stdout.write("  " + "-".repeat(60) + "\n");
      rows.forEach((r, i) => {
        const price = r.price ? fmt3(parseInt(r.price, 10)) : "\u2014";
        process.stdout.write(`  ${String(i + 1).padStart(3)}  ${r.title.slice(0, 36).padEnd(36)}  ${(r.category || "\u2014").padEnd(10)}  ${price}
`);
      });
      if (opts.dryRun) {
        process.stdout.write("\n(dry-run: nem lett feladva)\n");
        return;
      }
      if (!opts.yes) {
        const ok = await askConfirm4(`
Feladod mind a ${rows.length} hirdet\xE9st?`);
        if (!ok) {
          process.stdout.write("Megszak\xEDtva.\n");
          process.exit(0);
          return;
        }
      }
      let posted = 0;
      for (const row of rows) {
        try {
          if (opts.fromPhotos || isDirectory) {
            const dirPath = row.images ?? "";
            let imageFiles = [];
            try {
              imageFiles = readdirSync(dirPath).filter((f) => [".jpg", ".jpeg", ".png", ".webp"].includes(extname(f).toLowerCase())).map((f) => join(dirPath, f));
            } catch {
            }
            const imageUrls = [];
            const imageIds = [];
            for (const imgFile of imageFiles) {
              const uploaded = await shopClient2.myAds.uploadImage(imgFile);
              imageUrls.push(uploaded.url);
              imageIds.push(uploaded.id);
            }
            let aiSuggest = {};
            if (imageIds.length > 0) {
              process.stderr.write(`AI-javaslat k\xE9r\xE9se (${row.title})...
`);
              aiSuggest = await shopClient2.myAds.fromPhotos(imageIds);
            }
            const title = aiSuggest.title || row.title;
            const body = {
              title,
              category: aiSuggest.categoryId || row.category || "egyeb",
              subcategory: aiSuggest.subcategoryId ?? null,
              priceGross: aiSuggest.suggestedPriceGross ?? null,
              negotiable: false,
              condition: aiSuggest.condition || row.condition || "hasznalt",
              county: row.county || "",
              city: row.city || "",
              description: aiSuggest.description || row.description || "",
              images: imageUrls,
              attrs: aiSuggest.attrs || {},
              contactName: row.contact_name || "",
              contactPhone: row.contact_phone || null,
              contactEmail: row.contact_email || "",
              showPhone: false,
              resellable: false,
              partnerCommissionPct: 0
            };
            const ad = await shopClient2.myAds.post(body);
            process.stdout.write(`  \u2713 Feladva: #${ad.id}  ${ad.title}
`);
          } else {
            const body = {
              title: row.title,
              category: row.category,
              subcategory: row.subcategory || null,
              priceGross: row.price ? parseInt(row.price, 10) : null,
              negotiable: row.negotiable === "true" || row.negotiable === "1",
              condition: row.condition || "hasznalt",
              defects: row.defects || null,
              county: row.county,
              city: row.city,
              description: row.description || "",
              images: [],
              attrs: {},
              contactName: row.contact_name,
              contactPhone: row.contact_phone || null,
              contactEmail: row.contact_email,
              showPhone: row.show_phone === "true" || row.show_phone === "1",
              resellable: false,
              partnerCommissionPct: 0
            };
            const ad = await shopClient2.myAds.post(body);
            process.stdout.write(`  \u2713 Feladva: #${ad.id}  ${ad.title}
`);
          }
          posted++;
        } catch (err) {
          const msg = err instanceof HasznoApiError ? `HTTP ${err.status}: ${err.message}` : String(err);
          process.stdout.write(`  \u2717 Hiba (${row.title}): ${msg}
`);
          process.stdout.write(`
Meg\xE1ll\xE1s az els\u0151 hib\xE1n\xE1l. Feladva: ${posted}/${rows.length}
`);
          process.exit(1);
          return;
        }
      }
      process.stdout.write(`
K\xE9sz. Feladva: ${posted}/${rows.length} hirdet\xE9s.
`);
    } catch (err) {
      handleError2(err);
    }
  });
  const profile = shop.command("profile").description("Elad\xF3i profil kezel\xE9se");
  const sellerType = profile.command("seller-type").description("Elad\xF3i t\xEDpus be\xE1ll\xEDt\xE1sa (egyszer k\xF6telez\u0151 az els\u0151 hirdet\xE9s felad\xE1s\xE1hoz)");
  sellerType.command("maganszemely").description("Mag\xE1nszem\xE9ly elad\xF3k\xE9nt regisztr\xE1l").action(async (_opts2, cmd) => {
    try {
      const body = { sellerType: "maganszemely" };
      const result = await shopClient2.sellerProfile.set(body);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write("Elad\xF3i t\xEDpus be\xE1ll\xEDtva: mag\xE1nszem\xE9ly.\n");
    } catch (err) {
      handleError2(err);
    }
  });
  sellerType.command("kereskedo").description("Keresked\u0151k\xE9nt (c\xE9gk\xE9nt) regisztr\xE1l").requiredOption("--company-name <n\xE9v>", "C\xE9g neve").requiredOption("--company-address <c\xEDm>", "C\xE9g sz\xE9khelye").option("--company-reg-number <sz\xE1m>", "C\xE9gjegyz\xE9ksz\xE1m (opcion\xE1lis)").action(async (opts, cmd) => {
    try {
      const body = {
        sellerType: "kereskedo",
        companyName: opts.companyName,
        companyAddress: opts.companyAddress,
        companyRegNumber: opts.companyRegNumber ?? null
      };
      const result = await shopClient2.sellerProfile.set(body);
      if (getJsonFlag2(cmd)) printJson3(result);
      else process.stdout.write(`Elad\xF3i t\xEDpus be\xE1ll\xEDtva: keresked\u0151 (${opts.companyName}).
`);
    } catch (err) {
      handleError2(err);
    }
  });
  profile.command("show").description("Aktu\xE1lis elad\xF3i profil megjelen\xEDt\xE9se").action(async (_opts2, cmd) => {
    try {
      const result = await shopClient2.sellerProfile.get();
      if (getJsonFlag2(cmd)) printJson3(result);
      else {
        if (!result.sellerType) {
          process.stdout.write("Elad\xF3i t\xEDpus m\xE9g nincs be\xE1ll\xEDtva.\nHaszn\xE1ld: haszno shop profile seller-type maganszemely\n");
        } else {
          process.stdout.write(`Elad\xF3i t\xEDpus: ${result.sellerType}
`);
          if (result.companyName) process.stdout.write(`  C\xE9g neve: ${result.companyName}
`);
          if (result.companyAddress) process.stdout.write(`  Sz\xE9khely: ${result.companyAddress}
`);
          if (result.companyRegNumber) process.stdout.write(`  C\xE9gjegyz\xE9k: ${result.companyRegNumber}
`);
          if (result.declaredAt) process.stdout.write(`  Be\xE1ll\xEDtva: ${result.declaredAt}
`);
        }
      }
    } catch (err) {
      handleError2(err);
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
var sharedOpts = { baseUrl: argvFlag("--api-url"), apiKey: argvFlag("--api-key") };
var client = buildClient(sharedOpts);
var shopClient = createShopClient(sharedOpts);
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
registerShopCommands(program, shopClient);
program.parse();
//# sourceMappingURL=index.js.map