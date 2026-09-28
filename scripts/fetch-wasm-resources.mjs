/**
 * JAP@Tool --- refresh the bundled VoIP WASM resources from WhatsApp Web.
 *
 * Default mode uses WhatsApp Web's public bootloader endpoint, so no logged-in
 * browser is required:
 *
 *   npm run voip:fetch-wasm
 *
 * If the public endpoint changes, fallback to a running WhatsApp Web browser:
 *
 *   CALL_WASM_FETCH_MODE=browser \
 *   CALL_CHROME_DEBUGGER_JSON_URL=http://127.0.0.1:9222/json/list \
 *   node --experimental-websocket scripts/fetch-wasm-resources.mjs
 */
import { writeFileSync } from "fs";
import { createHash } from "crypto";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = resolve(__dirname, "../lib/assets/wasm");
const DEBUGGER_URL = process.env.CALL_CHROME_DEBUGGER_JSON_URL || "http://127.0.0.1:9222/json/list";
const WASM_ID = process.env.CALL_BROWSER_WASM_ID || process.env.CALL_WASM_ID || "32180";
const FETCH_MODE = (process.env.CALL_WASM_FETCH_MODE || "auto").toLowerCase();
const BOOTLOADER_ENDPOINT = process.env.CALL_WA_BOOTLOADER_ENDPOINT || "https://web.whatsapp.com/ajax/bootloader-endpoint/";
const BOOTLOADER_MODULE = process.env.CALL_WA_WASM_MODULE || "WAWebVoipWebWasmLoader";

const DEFAULT_HEADERS = {
  "accept": "*/*",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "referer": "https://web.whatsapp.com/",
  "sec-fetch-site": "same-origin",
  "user-agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
};

const sha = (buf) => createHash("sha256").update(buf).digest("hex");

async function fetchOk(url, options = {}) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    headers: { ...DEFAULT_HEADERS, ...(options.headers || {}) }
  });
  if (!response.ok) {
    throw new Error(`GET ${url} failed: ${response.status} ${response.statusText}`);
  }
  return response;
}

async function fetchText(url, options = {}) {
  return await (await fetchOk(url, options)).text();
}

function parseBootloaderPayload(raw) {
  const json = raw.replace(/^for \(;;\);/, "");
  return JSON.parse(json);
}

function findDefine(payload, name) {
  return payload?.hrp?.jsmods?.define?.find((row) => Array.isArray(row) && row[0] === name);
}

async function fetchLatestClientRevision() {
  const raw = await fetchText("https://web.whatsapp.com/sw.js", {
    headers: { "sec-fetch-site": "none", "referer": "https://web.whatsapp.com/" }
  });
  const match = raw.match(/\\?"client_revision\\?":\s*(\d+)/);
  return match?.[1] || null;
}

async function findLoaderResourceUrl(payload) {
  const rsrcMap = payload?.hrp?.hsrp?.hblp?.rsrcMap || {};
  const resources = payload?.hrp?.allResources || Object.keys(rsrcMap);
  const moduleNeedle = `__d("${BOOTLOADER_MODULE}"`;

  for (const id of resources) {
    const entry = rsrcMap[id];
    if (entry?.type !== "js" || !entry.src) continue;
    const code = await fetchText(entry.src);
    if (code.includes(moduleNeedle) || code.includes(`__d('${BOOTLOADER_MODULE}'`)) {
      return { url: entry.src, code };
    }
  }
  return { url: null, code: null };
}

async function fetchFromBootloaderEndpoint() {
  const latestClientRevision = await fetchLatestClientRevision().catch(() => null);
  const url = new URL(BOOTLOADER_ENDPOINT);
  url.searchParams.set("modules", BOOTLOADER_MODULE);
  // Minimal params accepted for public logged-out WhatsApp Web bootloader data.
  url.searchParams.set("__a", "1");
  url.searchParams.set("__user", "0");
  url.searchParams.set("__comet_req", "15");
  // Ask the bootloader for the same live revision advertised by sw.js; without
  // these hints, some CDN edges can serve an older logged-out cohort.
  if (latestClientRevision) {
    url.searchParams.set("__spin_r", latestClientRevision);
    url.searchParams.set("__spin_b", "trunk");
    url.searchParams.set("__spin_t", String(Math.floor(Date.now() / 1000)));
  }

  const payload = parseBootloaderPayload(await fetchText(url));
  const bxData = payload?.hrp?.hsrp?.hsdp?.bxData || {};
  const wasmUrl = bxData[WASM_ID]?.uri || Object.values(bxData).find((v) => /\.wasm(?:$|\?)/.test(v?.uri || ""))?.uri;
  const workerDef = findDefine(payload, "WAWebVoipWebWasmWorkerResource");
  const workerUrl = workerDef?.[2]?.url;
  const clientRevision = workerDef?.[2]?.dynamicModules?.SiteData?.client_revision
    || workerDef?.[2]?.dynamicModules?.SiteData?.__spin_r
    || latestClientRevision
    || null;
  const { url: loaderUrl, code: loaderCode } = await findLoaderResourceUrl(payload);

  if (!workerUrl) throw new Error("WAWebVoipWebWasmWorkerResource.url not found in bootloader payload");
  if (!wasmUrl) throw new Error(`WASM URL not found in bootloader bxData (wanted id ${WASM_ID}; ids: ${Object.keys(bxData).join(", ")})`);
  if (!loaderUrl) throw new Error(`${BOOTLOADER_MODULE} resource not found in bootloader JS resources`);

  return {
    source: "bootloader-endpoint",
    clientRevision,
    workerUrl,
    wasmUrl,
    loaderUrl,
    loaderCode,
    availableWasmIds: Object.keys(bxData)
  };
}

async function fetchFromBrowserDebugger() {
  const resp = await fetchOk(DEBUGGER_URL, { headers: {} });
  const targets = await resp.json();
  const page = targets.find(t => t.type === "page" && t.url?.includes("web.whatsapp.com"));
  if (!page?.webSocketDebuggerUrl) throw new Error("No WhatsApp Web page found");

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const myId = id++;
    const handler = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.id === myId) {
        ws.removeEventListener("message", handler);
        if (msg.error) reject(new Error(msg.error.message));
        else resolve(msg.result);
      }
    };
    ws.addEventListener("message", handler);
    ws.send(JSON.stringify({ id: myId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "eval error");
    return result.result.value;
  };

  await new Promise(r => ws.addEventListener("open", r));

  const resourceInfo = await evaluate(`(() => {
    try {
      const resource = require("WAWebVoipWebWasmWorkerResource");
      return {
        workerUrl: resource?.url || null,
        wasmUrl: resource?.hsdp?.bxData?.["${WASM_ID}"]?.uri || null,
        availableWasmIds: Object.keys(resource?.hsdp?.bxData || {}),
      };
    } catch(e) { return { error: e.message }; }
  })()`);
  ws.close();

  if (resourceInfo.error) throw new Error(`Browser eval failed: ${resourceInfo.error}`);
  if (!resourceInfo.workerUrl) throw new Error("Worker URL not found in browser");
  if (!resourceInfo.wasmUrl) {
    throw new Error(`WASM URL not found for ID ${WASM_ID}; available IDs: ${(resourceInfo.availableWasmIds || []).join(", ")}`);
  }

  return { source: "browser-debugger", ...resourceInfo, loaderUrl: null, loaderCode: null };
}

async function resolveResourceInfo() {
  if (FETCH_MODE === "browser") return await fetchFromBrowserDebugger();
  if (FETCH_MODE === "direct" || FETCH_MODE === "bootloader") return await fetchFromBootloaderEndpoint();
  try {
    return await fetchFromBootloaderEndpoint();
  } catch (directError) {
    console.warn(`Direct bootloader fetch failed: ${directError.message}`);
    console.warn("Falling back to Chrome remote-debugging mode...");
    return await fetchFromBrowserDebugger();
  }
}

async function main() {
  const resourceInfo = await resolveResourceInfo();
  console.log("Resource source:", resourceInfo.source);
  if (resourceInfo.clientRevision) console.log("Client revision:", resourceInfo.clientRevision);
  if (resourceInfo.availableWasmIds?.length) console.log("Available WASM IDs:", resourceInfo.availableWasmIds.join(", "));

  console.log("Fetching worker-modules.js from:", resourceInfo.workerUrl);
  const workerCode = await fetchText(resourceInfo.workerUrl);
  if (!/WAWebVoipWebWasmWorker/.test(workerCode)) {
    throw new Error("fetched worker bundle does not contain WAWebVoipWebWasmWorker — refusing to overwrite");
  }
  writeFileSync(resolve(RESOURCES_DIR, "worker-modules.js"), workerCode);
  console.log(`  Written: worker-modules.js (${workerCode.length} bytes)`);

  let loaderCode = resourceInfo.loaderCode;
  if (resourceInfo.loaderUrl && !loaderCode) {
    console.log("Fetching loader.js from:", resourceInfo.loaderUrl);
    loaderCode = await fetchText(resourceInfo.loaderUrl);
  }
  if (loaderCode) {
    if (!loaderCode.includes(BOOTLOADER_MODULE)) {
      throw new Error(`fetched loader bundle does not contain ${BOOTLOADER_MODULE} — refusing to overwrite`);
    }
    writeFileSync(resolve(RESOURCES_DIR, "loader.js"), loaderCode);
    console.log(`  Written: loader.js (${loaderCode.length} bytes)`);
  } else {
    console.log("  loader.js unchanged (browser-debugger mode did not expose a standalone loader URL)");
  }

  console.log("Fetching whatsapp.wasm from:", resourceInfo.wasmUrl);
  const wasmBuffer = Buffer.from(await (await fetchOk(resourceInfo.wasmUrl)).arrayBuffer());
  if (wasmBuffer.length < 8 || wasmBuffer.readUInt32LE(0) !== 0x6d736100) {
    throw new Error(`fetched whatsapp.wasm is not a valid wasm binary (${wasmBuffer.length} bytes) — refusing to overwrite`);
  }
  writeFileSync(resolve(RESOURCES_DIR, "whatsapp.wasm"), wasmBuffer);
  console.log(`  Written: whatsapp.wasm (${wasmBuffer.length} bytes)`);

  const files = {
    "whatsapp.wasm": { sha256: sha(wasmBuffer), size: wasmBuffer.length },
    "worker-modules.js": { sha256: sha(Buffer.from(workerCode)), size: Buffer.byteLength(workerCode) }
  };
  if (loaderCode) files["loader.js"] = { sha256: sha(Buffer.from(loaderCode)), size: Buffer.byteLength(loaderCode) };
  const manifest = {
    generatedAt: new Date().toISOString(),
    source: resourceInfo.source,
    clientRevision: resourceInfo.clientRevision || null,
    urls: {
      wasm: resourceInfo.wasmUrl,
      worker: resourceInfo.workerUrl,
      loader: resourceInfo.loaderUrl || null
    },
    files
  };
  writeFileSync(resolve(RESOURCES_DIR, "integrity.json"), JSON.stringify(manifest, null, 2));
  console.log("  Written: integrity.json (pinned sha256 manifest)");

  console.log("\nDone! Resources updated.");
}

main().catch(e => { console.error("Error:", e.message); process.exit(1); });
