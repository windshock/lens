#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";
import { inflateRawSync } from "node:zlib";
import { domainToASCII } from "node:url";

const POPULAR_DOMAINS_PATH = new URL("../popular-domains.js", import.meta.url);

const DEFAULT_LIMIT = 2000;
const DEFAULT_SOURCE_LIMIT = 10000;

const SOURCE_WEIGHTS = {
  cloudflare: 1.25,
  tranco: 1.0,
  majestic: 0.75,
  umbrella: 0.65,
};

// Do not let public rankings turn user-controlled hosting/CDN suffixes into O6 trust.
const EXCLUDED_SUFFIXES = [
  "workers.dev",
  "pages.dev",
  "vercel.app",
  "netlify.app",
  "netlify.com",
  "replit.dev",
  "repl.co",
  "github.io",
  "gitlab.io",
  "weebly.com",
  "webflow.io",
  "web.app",
  "firebaseapp.com",
  "surge.sh",
  "onrender.com",
  "glitch.me",
  "wixsite.com",
  "squarespace.com",
  "wordpress.com",
  "blogspot.com",
  "tiiny.site",
  "herokuapp.com",
  "cyclic.app",
  "fly.dev",
  "deno.dev",
  "render.com",
  "ngrok.io",
  "ngrok-free.app",
  "trycloudflare.com",
  "amplifyapp.com",
  "amazonaws.com",
  "cloudfront.net",
  "azurewebsites.net",
  "azureedge.net",
  "azurestaticapps.net",
  "blob.core.windows.net",
  "web.core.windows.net",
  "storage.googleapis.com",
  "googleusercontent.com",
  "appspot.com",
  "run.app",
  "digitaloceanspaces.com",
  "ondigitalocean.app",
  "backblazeb2.com",
  "fastly.net",
  "b-cdn.net",
  "github.dev",
  "githubusercontent.com",
  "s3-website.amazonaws.com",
  "akamai.net",
  "akamaihd.net",
  "akamaiedge.net",
  "akamaized.net",
  "akadns.net",
  "edgesuite.net",
  "edgekey.net",
  "windows.net",
  "trafficmanager.net",
  "cloudapp.net",
  "azurefd.net",
  "sharepoint.com",
  "onedrive.live.com",
  "dropbox.com",
  "dropboxusercontent.com",
  "box.com",
  "app.box.com",
  "docs.google.com",
  "drive.google.com",
  "forms.gle",
  "sites.google.com",
  "bit.ly",
  "goo.gl",
  "t.co",
  "tinyurl.com",
  "ow.ly",
  "cutt.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "t.me",
  "telegram.me",
  "discord.gg",
  "wa.me",
  "medium.com",
  "tumblr.com",
  "notion.site",
  "notion.so",
  "canva.site",
  "substack.com",
  "myshopify.com",
  "blogger.com",
];

function getOption(name, envName, fallback) {
  const prefix = `--${name}=`;
  const withEquals = process.argv.find((arg) => arg.startsWith(prefix));
  if (withEquals) return withEquals.slice(prefix.length);

  const index = process.argv.indexOf(`--${name}`);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];

  return process.env[envName] || fallback;
}

function parseLimit(value, name) {
  const normalized = String(value).trim().toLowerCase();
  if (["all", "full", "none", "unlimited", "0"].includes(normalized)) {
    return Number.POSITIVE_INFINITY;
  }

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer or "unlimited", got ${value}`);
  }
  return parsed;
}

function formatLimit(value) {
  return Number.isFinite(value) ? String(value) : "unlimited";
}

function isExcludedSuffix(domain) {
  return EXCLUDED_SUFFIXES.some((suffix) => domain === suffix || domain.endsWith(`.${suffix}`));
}

function normalizeDomain(raw) {
  let domain = String(raw || "").trim().toLowerCase();
  if (!domain) return null;

  if (/^https?:\/\//i.test(domain)) {
    try {
      domain = new URL(domain).hostname;
    } catch {
      return null;
    }
  }

  domain = domain.replace(/^\*\./, "").replace(/\.$/, "");
  if (domain.startsWith("www.")) domain = domain.slice(4);

  const ascii = domainToASCII(domain);
  if (!ascii || ascii.length > 253) return null;
  if (!ascii.includes(".")) return null;
  if (ascii.includes("..")) return null;
  if (!/^[a-z0-9.-]+$/.test(ascii)) return null;
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(ascii)) return null;
  if (isExcludedSuffix(ascii)) return null;

  return ascii;
}

async function fetchWithRetry(url, options = {}, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "user-agent": "windshock-lens-domain-updater/1.0",
          ...(options.headers || {}),
        },
      });
      if (res.ok) return res;
      lastError = new Error(`${res.status} ${res.statusText}`);
    } catch (err) {
      lastError = err;
    }
    if (attempt < attempts) {
      await new Promise((resolve) => setTimeout(resolve, 750 * attempt));
    }
  }
  throw new Error(`Failed to fetch ${url}: ${lastError?.message || lastError}`);
}

async function fetchText(url, options = {}) {
  const res = await fetchWithRetry(url, options);
  return res.text();
}

async function fetchBuffer(url, options = {}) {
  const res = await fetchWithRetry(url, options);
  return Buffer.from(await res.arrayBuffer());
}

function unzipFirstFile(buffer) {
  let eocdOffset = -1;
  const minOffset = Math.max(0, buffer.length - 65557);
  for (let i = buffer.length - 22; i >= minOffset; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error("ZIP end-of-central-directory record not found");
  }

  const entryCount = buffer.readUInt16LE(eocdOffset + 10);
  const centralDirectorySize = buffer.readUInt32LE(eocdOffset + 12);
  const centralDirectoryOffset = buffer.readUInt32LE(eocdOffset + 16);
  const centralDirectoryEnd = centralDirectoryOffset + centralDirectorySize;

  let ptr = centralDirectoryOffset;
  for (let entry = 0; entry < entryCount && ptr < centralDirectoryEnd; entry += 1) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error("Invalid ZIP central directory header");
    }

    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const fileNameLength = buffer.readUInt16LE(ptr + 28);
    const extraLength = buffer.readUInt16LE(ptr + 30);
    const commentLength = buffer.readUInt16LE(ptr + 32);
    const localHeaderOffset = buffer.readUInt32LE(ptr + 42);
    const fileName = buffer.toString("utf8", ptr + 46, ptr + 46 + fileNameLength);

    ptr += 46 + fileNameLength + extraLength + commentLength;

    if (fileName.endsWith("/")) continue;

    if (buffer.readUInt32LE(localHeaderOffset) !== 0x04034b50) {
      throw new Error("Invalid ZIP local file header");
    }

    const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) return compressed.toString("utf8");
    if (method === 8) return inflateRawSync(compressed).toString("utf8");
    throw new Error(`Unsupported ZIP compression method ${method}`);
  }

  throw new Error("ZIP archive did not contain a file");
}

function maybeUnzipText(buffer) {
  if (buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50) {
    return unzipFirstFile(buffer);
  }
  return buffer.toString("utf8");
}

function parseRankedCsv(text, { domainColumn = 1, sourceLimit }) {
  const domains = [];
  const seen = new Set();

  for (const line of text.split(/\r?\n/)) {
    if (domains.length >= sourceLimit) break;
    if (!line.trim()) continue;

    const cols = line.split(",");
    const rank = Number.parseInt(cols[0], 10);
    if (!Number.isFinite(rank)) continue;

    const domain = normalizeDomain(cols[domainColumn]);
    if (!domain || seen.has(domain)) continue;

    seen.add(domain);
    domains.push(domain);
  }

  return domains;
}

async function fetchCsvPrefix(url, { sourceLimit, domainColumn = 1 }) {
  const res = await fetchWithRetry(url);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  const domains = [];
  const seen = new Set();
  let pending = "";

  while (domains.length < sourceLimit) {
    const { value, done } = await reader.read();
    if (done) break;

    pending += decoder.decode(value, { stream: true });
    const lines = pending.split(/\r?\n/);
    pending = lines.pop() || "";

    for (const line of lines) {
      if (domains.length >= sourceLimit) break;
      if (!line.trim()) continue;

      const cols = line.split(",");
      const rank = Number.parseInt(cols[0], 10);
      if (!Number.isFinite(rank)) continue;

      const domain = normalizeDomain(cols[domainColumn]);
      if (!domain || seen.has(domain)) continue;

      seen.add(domain);
      domains.push(domain);
    }
  }

  await reader.cancel().catch(() => {});
  return domains;
}

async function fetchCloudflareTop(sourceLimit) {
  const token = process.env.CLOUDFLARE_API_TOKEN || "";
  if (!token) {
    return {
      name: "cloudflare",
      label: "Cloudflare Radar skipped (missing CLOUDFLARE_API_TOKEN)",
      domains: [],
      optional: true,
    };
  }

  const url = new URL("https://api.cloudflare.com/client/v4/radar/ranking/top");
  url.searchParams.set("name", "top");
  url.searchParams.set("limit", String(Math.min(sourceLimit, 100)));
  url.searchParams.set("format", "JSON");

  const text = await fetchText(url, {
    headers: { authorization: `Bearer ${token}` },
  });
  const json = JSON.parse(text);
  if (!json.success) {
    const message = json.errors?.map((err) => err.message).join("; ") || "unknown Cloudflare API error";
    throw new Error(message);
  }

  const rows = Object.values(json.result || {}).find(Array.isArray) || [];
  const domains = [];
  const seen = new Set();
  for (const row of rows) {
    const domain = normalizeDomain(row?.domain);
    if (!domain || seen.has(domain)) continue;
    seen.add(domain);
    domains.push(domain);
  }

  return {
    name: "cloudflare",
    label: `Cloudflare Radar top ${domains.length}`,
    domains,
    optional: true,
  };
}

async function fetchTranco(sourceLimit, trancoSize) {
  const meta = JSON.parse(await fetchText("https://tranco-list.eu/api/lists/date/latest"));
  if (!meta.available || meta.failed || !meta.download) {
    throw new Error(`latest Tranco list is unavailable: ${JSON.stringify(meta)}`);
  }

  const downloadUrl = trancoSize === "full"
    ? `https://tranco-list.eu/download/${meta.list_id}/full`
    : meta.download;
  const text = maybeUnzipText(await fetchBuffer(downloadUrl));
  const domains = parseRankedCsv(text, { sourceLimit });

  return {
    name: "tranco",
    label: `Tranco ${meta.list_id} ${trancoSize} top ${domains.length} (${meta.created_on})`,
    domains,
  };
}

async function fetchMajestic(sourceLimit) {
  const domains = await fetchCsvPrefix("https://downloads.majestic.com/majestic_million.csv", {
    sourceLimit,
    domainColumn: 2,
  });

  return {
    name: "majestic",
    label: `Majestic Million top ${domains.length}`,
    domains,
  };
}

async function fetchUmbrella(sourceLimit) {
  const text = maybeUnzipText(await fetchBuffer("https://s3-us-west-1.amazonaws.com/umbrella-static/top-1m.csv.zip"));
  const domains = parseRankedCsv(text, { sourceLimit });

  return {
    name: "umbrella",
    label: `Cisco Umbrella top ${domains.length}`,
    domains,
  };
}

function mergeSources(sources, limit) {
  const entries = new Map();

  for (const source of sources) {
    const weight = SOURCE_WEIGHTS[source.name] || 1;
    source.domains.forEach((domain, index) => {
      const rank = index + 1;
      const score = weight / Math.sqrt(rank);
      const current = entries.get(domain) || {
        domain,
        score: 0,
        bestRank: Number.POSITIVE_INFINITY,
        sources: [],
      };

      current.score += score;
      current.bestRank = Math.min(current.bestRank, rank);
      current.sources.push(`${source.name}:${rank}`);
      entries.set(domain, current);
    });
  }

  const merged = [...entries.values()]
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.bestRank !== b.bestRank) return a.bestRank - b.bestRank;
      return a.domain.localeCompare(b.domain);
    });

  return Number.isFinite(limit) ? merged.slice(0, limit) : merged;
}

function renderPopularDomainsFile(domains, sourceLabels, { limit, sourceLimit }) {
  const domainLines = domains.map(({ domain }) => `  "${domain}",`).join("\n");

  return `// popular-domains.js — 공개 랭킹 기반 글로벌 인기 도메인 목록 (O6 false-positive cap).
// tools/update-popular-domains.mjs 가 .github/workflows/update-popular-domains.yml 에서 자동 갱신(직접 커밋).
// 손으로 편집하지 말 것 — 다음 자동 갱신 때 덮어쓰여집니다.

export const POPULAR_DOMAINS = new Set([
  // BEGIN AUTO-GENERATED POPULAR DOMAINS
  // Generated by tools/update-popular-domains.mjs. Do not edit by hand.
  // Final limit: ${formatLimit(limit)}; per-source read limit: ${formatLimit(sourceLimit)}
${sourceLabels.map((label) => `  // Source: ${label}`).join("\n")}
${domainLines}
  // END AUTO-GENERATED POPULAR DOMAINS
]);
`;
}

async function updatePopularDomainsFile(content) {
  let current = "";
  try { current = await readFile(POPULAR_DOMAINS_PATH, "utf8"); } catch {}
  if (current === content) return false;
  await writeFile(POPULAR_DOMAINS_PATH, content);
  return true;
}

async function main() {
  const limit = parseLimit(getOption("limit", "POPULAR_DOMAIN_LIMIT", String(DEFAULT_LIMIT)), "limit");
  const sourceLimit = parseLimit(
    getOption("source-limit", "POPULAR_DOMAIN_SOURCE_LIMIT", String(DEFAULT_SOURCE_LIMIT)),
    "source-limit",
  );
  const trancoSize = String(getOption("tranco-size", "TRANCO_LIST_SIZE", "1000000")).trim().toLowerCase();
  if (!["1000000", "full"].includes(trancoSize)) {
    throw new Error(`tranco-size must be "1000000" or "full", got ${trancoSize}`);
  }

  const sourceFetchers = [
    () => fetchCloudflareTop(sourceLimit),
    () => fetchTranco(sourceLimit, trancoSize),
    () => fetchMajestic(sourceLimit),
    () => fetchUmbrella(sourceLimit),
  ];

  const sources = [];
  for (const fetchSource of sourceFetchers) {
    try {
      const source = await fetchSource();
      console.log(source.label);
      sources.push(source);
    } catch (err) {
      console.warn(`Source failed: ${err.message}`);
    }
  }

  const rankedSources = sources.filter((source) => source.domains.length > 0);
  if (rankedSources.length === 0) {
    throw new Error("No popular-domain source returned domains");
  }

  const domains = mergeSources(rankedSources, limit);
  if (domains.length < Math.min(limit, 100)) {
    throw new Error(`Only ${domains.length} domains were generated; refusing to update`);
  }

  const content = renderPopularDomainsFile(
    domains,
    sources.map((source) => source.label),
    { limit, sourceLimit },
  );
  const changed = await updatePopularDomainsFile(content);

  console.log(`Generated ${domains.length} popular domains from ${rankedSources.length} ranked source(s).`);
  console.log(changed ? "popular-domains.js updated." : "popular-domains.js already up to date.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
