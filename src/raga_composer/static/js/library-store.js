const DB_NAME = "swaramala-library";
const DB_VERSION = 1;
const MAX_RECORDING_BYTES = 50 * 1024 * 1024;
const MAX_IMPORT_BYTES = 75 * 1024 * 1024;
const EXPORT_VERSION = 1;

let dbPromise = null;
let persistRequested = false;
const recordingUrls = new Map();

function now() {
  return new Date().toISOString();
}

function quotaError(error) {
  const message = "Your browser doesn't have enough storage for this library item. Delete old recordings or export your library, then try again.";
  const err = new Error(message);
  err.cause = error;
  err.status = 507;
  return err;
}

function requestToPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error);
    tx.onerror = () => reject(tx.error);
  });
}

function openDb() {
  if (dbPromise) return dbPromise;
  if (!("indexedDB" in globalThis)) {
    return Promise.reject(new Error("This browser doesn't support IndexedDB, so it can't store your library."));
  }
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("lines")) {
        const lines = db.createObjectStore("lines", { keyPath: "id", autoIncrement: true });
        lines.createIndex("by_raga_position", ["ragaKey", "position", "id"]);
      }
      if (!db.objectStoreNames.contains("recordings")) {
        db.createObjectStore("recordings", { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  return dbPromise;
}

async function requestPersistence() {
  if (persistRequested) return;
  persistRequested = true;
  if (navigator.storage?.persist) await navigator.storage.persist().catch(() => false);
}

function normalizeRaga(value) {
  return String(value || "").trim();
}

function ragaKey(value) {
  return normalizeRaga(value).toLocaleLowerCase();
}

function lineOut(line) {
  const { ragaKey: _key, ...out } = line;
  return out;
}

async function readAll(storeName) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const items = await requestToPromise(tx.objectStore(storeName).getAll());
  await txDone(tx);
  return items;
}

async function readOne(storeName, id) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  const item = await requestToPromise(tx.objectStore(storeName).get(Number(id)));
  await txDone(tx);
  return item;
}

export async function listLines(raga = null) {
  const lines = await readAll("lines");
  const key = raga ? ragaKey(raga) : null;
  return lines
    .filter((line) => !key || line.ragaKey === key)
    .sort((a, b) => a.raga.localeCompare(b.raga) || a.position - b.position || a.id - b.id)
    .map(lineOut);
}

export async function createLine(data) {
  await requestPersistence();
  const existing = await readAll("lines");
  const db = await openDb();
  const tx = db.transaction("lines", "readwrite");
  const store = tx.objectStore("lines");
  const key = ragaKey(data.raga);
  const position = existing.filter((line) => line.ragaKey === key).reduce((max, line) => Math.max(max, line.position), -1) + 1;
  const line = {
    raga: normalizeRaga(data.raga),
    ragaKey: key,
    title: String(data.title || "").slice(0, 120),
    tokens: Array.isArray(data.tokens) ? data.tokens.map(String).slice(0, 512) : [],
    notes_per_beat: Number(data.notes_per_beat) || 1,
    taal: data.taal || null,
    intention: String(data.intention || "").slice(0, 500),
    position,
    created_at: now(),
  };
  try {
    const id = await requestToPromise(store.add(line));
    await txDone(tx);
    return lineOut({ ...line, id });
  } catch (error) {
    throw error?.name === "QuotaExceededError" ? quotaError(error) : error;
  }
}

export async function patchLine(id, patch) {
  await requestPersistence();
  const line = await readOne("lines", id);
  if (!line) {
    const error = new Error("Line not found.");
    error.status = 404;
    throw error;
  }
  const db = await openDb();
  const tx = db.transaction("lines", "readwrite");
  const store = tx.objectStore("lines");
  if (patch.title !== undefined) line.title = String(patch.title || "").slice(0, 120);
  if (patch.tokens !== undefined) line.tokens = Array.isArray(patch.tokens) ? patch.tokens.map(String).slice(0, 512) : line.tokens;
  if (patch.notes_per_beat !== undefined) line.notes_per_beat = Number(patch.notes_per_beat) || line.notes_per_beat;
  if (patch.taal !== undefined) line.taal = patch.taal || null;
  if (patch.position !== undefined) line.position = Number(patch.position);
  try {
    await requestToPromise(store.put(line));
    await txDone(tx);
    return lineOut(line);
  } catch (error) {
    throw error?.name === "QuotaExceededError" ? quotaError(error) : error;
  }
}

export async function deleteLine(id) {
  const db = await openDb();
  const tx = db.transaction("lines", "readwrite");
  await requestToPromise(tx.objectStore("lines").delete(Number(id)));
  await txDone(tx);
}

function publicRecording(recording) {
  if (recordingUrls.has(recording.id)) URL.revokeObjectURL(recordingUrls.get(recording.id));
  const audioUrl = URL.createObjectURL(recording.blob);
  recordingUrls.set(recording.id, audioUrl);
  const { blob: _blob, ...out } = recording;
  return { ...out, audio_url: audioUrl };
}

export async function listRecordings() {
  const recordings = await readAll("recordings");
  return recordings.sort((a, b) => b.id - a.id).map(publicRecording);
}

export async function createRecording(data) {
  await requestPersistence();
  const blob = data.file;
  if (!(blob instanceof Blob)) {
    const error = new Error("Recording is empty.");
    error.status = 422;
    throw error;
  }
  if (blob.size > MAX_RECORDING_BYTES) {
    const error = new Error("Recording is larger than 50 MB.");
    error.status = 413;
    throw error;
  }
  if (!blob.size) {
    const error = new Error("Recording is empty.");
    error.status = 422;
    throw error;
  }
  const db = await openDb();
  const tx = db.transaction("recordings", "readwrite");
  const recording = {
    title: String(data.title || "Untitled recording").slice(0, 120),
    raga: data.raga || null,
    tonic: data.tonic || null,
    taal: data.taal || null,
    tempo: data.tempo ? Number(data.tempo) : null,
    mime_type: blob.type || "application/octet-stream",
    size_bytes: blob.size,
    duration_seconds: data.duration_seconds ? Number(data.duration_seconds) : null,
    blob,
    created_at: now(),
  };
  try {
    const id = await requestToPromise(tx.objectStore("recordings").add(recording));
    await txDone(tx);
    return publicRecording({ ...recording, id });
  } catch (error) {
    throw error?.name === "QuotaExceededError" ? quotaError(error) : error;
  }
}

export async function deleteRecording(id) {
  const numericId = Number(id);
  if (recordingUrls.has(numericId)) {
    URL.revokeObjectURL(recordingUrls.get(numericId));
    recordingUrls.delete(numericId);
  }
  const db = await openDb();
  const tx = db.transaction("recordings", "readwrite");
  await requestToPromise(tx.objectStore("recordings").delete(numericId));
  await txDone(tx);
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",", 2)[1] || "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const chunks = [];
  for (let i = 0; i < binary.length; i += 32768) {
    const chunk = binary.slice(i, i + 32768);
    const bytes = new Uint8Array(chunk.length);
    for (let j = 0; j < chunk.length; j++) bytes[j] = chunk.charCodeAt(j);
    chunks.push(bytes);
  }
  return new Blob(chunks, { type: mimeType || "application/octet-stream" });
}

export async function exportLibrary() {
  const lines = await listLines();
  const recordings = await readAll("recordings");
  return {
    swaramala_library_version: EXPORT_VERSION,
    exported_at: now(),
    lines,
    recordings: await Promise.all(recordings.map(async ({ blob, ...recording }) => ({
      ...recording,
      audio_base64: await blobToBase64(blob),
    }))),
  };
}

function validateImport(payload, sizeBytes) {
  if (sizeBytes > MAX_IMPORT_BYTES) throw new Error("The import file is larger than 75 MB.");
  if (!payload || payload.swaramala_library_version !== EXPORT_VERSION) {
    throw new Error("Choose a Swaramala library export file.");
  }
  if (!Array.isArray(payload.lines) || !Array.isArray(payload.recordings)) {
    throw new Error("The library export is missing lines or recordings.");
  }
}

export async function importLibraryFile(file) {
  validateImport({ swaramala_library_version: EXPORT_VERSION, lines: [], recordings: [] }, file.size);
  const payload = JSON.parse(await file.text());
  validateImport(payload, file.size);
  await requestPersistence();

  let importedLines = 0;
  for (const line of payload.lines) {
    if (!line.raga || !Array.isArray(line.tokens) || !line.tokens.length) continue;
    await createLine(line);
    importedLines++;
  }

  let importedRecordings = 0;
  for (const recording of payload.recordings) {
    if (!recording.audio_base64 || typeof recording.audio_base64 !== "string") continue;
    const blob = base64ToBlob(recording.audio_base64, recording.mime_type);
    if (blob.size > MAX_RECORDING_BYTES) throw new Error(`Recording "${recording.title || "Untitled recording"}" is larger than 50 MB.`);
    await createRecording({ ...recording, file: blob });
    importedRecordings++;
  }
  return { lines: importedLines, recordings: importedRecordings };
}
