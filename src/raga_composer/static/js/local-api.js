import {
  createLine,
  createRecording,
  deleteLine,
  deleteRecording,
  exportLibrary as exportStoredLibrary,
  importLibraryFile,
  listLines,
  listRecordings,
  patchLine,
} from "./library-store.js";

let corePromise = null;
let dataPromise = null;

function errorWithStatus(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function loadCore() {
  if (!corePromise) corePromise = import("./core/index.js");
  return corePromise;
}

async function ensureData() {
  const core = await loadCore();
  if (!dataPromise) {
    dataPromise = core.loadData(async (path) => {
      const response = await fetch(path);
      if (!response.ok) throw errorWithStatus(response.status, `Couldn't load ${path}.`);
      return response.json();
    });
  }
  await dataPromise;
  return core;
}

function parseBody(options) {
  if (options.json !== undefined) return options.json;
  if (!options.body) return {};
  if (typeof options.body === "string") return JSON.parse(options.body || "{}");
  return options.body;
}

function ok(value) {
  return value === undefined ? null : value;
}

async function routeCore(pathname, searchParams, options) {
  const core = await ensureData();
  const method = (options.method || (options.json !== undefined || options.body ? "POST" : "GET")).toUpperCase();
  const parts = pathname.split("/").filter(Boolean);

  if (method === "GET" && pathname === "/api/config") return core.config();
  if (method === "GET" && pathname === "/api/taals") return core.listTaals();
  if (method === "GET" && pathname === "/api/ragas") return core.listRagas();
  if (method === "GET" && parts[0] === "api" && parts[1] === "ragas" && parts.length === 3) {
    return core.ragaDetail(decodeURIComponent(parts[2]));
  }
  if (method === "GET" && parts[0] === "api" && parts[1] === "ragas" && parts[3] === "improvisations") {
    const seed = searchParams.has("seed") ? Number(searchParams.get("seed")) : null;
    return core.improvisations(decodeURIComponent(parts[2]), {
      taal: searchParams.get("taal") || "Teentaal",
      seed,
      composition: searchParams.get("composition"),
    });
  }
  if (method === "POST" && pathname === "/api/intent") return core.parseIntent(parseBody(options));
  if (method === "POST" && pathname === "/api/generate") return core.generate(parseBody(options));
  if (method === "POST" && pathname === "/api/validate") return core.validateSequence(parseBody(options));
  if (method === "POST" && pathname === "/api/arrange") return core.arrange(parseBody(options));
  return null;
}

async function routeLibrary(pathname, searchParams, options) {
  const method = (options.method || (options.json !== undefined || options.body ? "POST" : "GET")).toUpperCase();
  const parts = pathname.split("/").filter(Boolean);

  if (parts[1] === "lines") {
    if (method === "GET" && parts.length === 2) return listLines(searchParams.get("raga"));
    if (method === "POST" && parts.length === 2) {
      const body = parseBody(options);
      const saved = await createLine(body);
      try {
        const core = await ensureData();
        const validated = core.validateSequence({ raga: saved.raga, tokens: saved.tokens });
        return { ...saved, violations: validated.violations };
      } catch (error) {
        if (error.status) throw error;
        return { ...saved, violations: [] };
      }
    }
    if (method === "PATCH" && parts.length === 3) return patchLine(parts[2], parseBody(options));
    if (method === "DELETE" && parts.length === 3) {
      await deleteLine(parts[2]);
      return null;
    }
  }

  if (parts[1] === "recordings") {
    if (method === "GET" && parts.length === 2) return listRecordings();
    if (method === "POST" && parts.length === 2) {
      const body = options.body;
      if (!(body instanceof FormData)) throw errorWithStatus(422, "Recording upload data is invalid.");
      return createRecording({
        file: body.get("file"),
        title: body.get("title"),
        raga: body.get("raga"),
        tonic: body.get("tonic"),
        taal: body.get("taal"),
        tempo: body.get("tempo"),
        duration_seconds: body.get("duration_seconds"),
      });
    }
    if (method === "DELETE" && parts.length === 3) {
      await deleteRecording(parts[2]);
      return null;
    }
  }

  return undefined;
}

export async function api(path, options = {}) {
  try {
    const url = new URL(path, window.location.href);
    const pathname = url.pathname.endsWith("/") && url.pathname !== "/" ? url.pathname.slice(0, -1) : url.pathname;
    const libraryResult = await routeLibrary(pathname, url.searchParams, options);
    if (libraryResult !== undefined) return ok(libraryResult);
    const coreResult = await routeCore(pathname, url.searchParams, options);
    if (coreResult !== null) return ok(coreResult);
    throw errorWithStatus(404, `Unknown local API path: ${pathname}`);
  } catch (error) {
    if (error?.name === "CoreError" || error?.status) throw errorWithStatus(error.status || 500, error.message);
    throw error;
  }
}

export async function exportLibrary() {
  const data = await exportStoredLibrary();
  const blob = new Blob([JSON.stringify(data, null, 2), "\n"], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `swaramala-library-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  // Revoking right away can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export { importLibraryFile };
