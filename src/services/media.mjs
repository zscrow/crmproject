let databasePromise;
const urls = new Map();
export function mediaDatabase() {
  if (!databasePromise)
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open("zapcaster-media", 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains("assets"))
          request.result.createObjectStore("assets", { keyPath: "id" });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  return databasePromise;
}
export async function storeAsset(id, blob) {
  const db = await mediaDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", "readwrite");
    tx.objectStore("assets").put({ id, blob });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () =>
      reject(tx.error || new Error("Não foi possível salvar o anexo."));
  });
}
export async function readAsset(id) {
  const db = await mediaDatabase();
  return new Promise((resolve, reject) => {
    const req = db.transaction("assets").objectStore("assets").get(id);
    req.onsuccess = () => resolve(req.result?.blob || null);
    req.onerror = () => reject(req.error);
  });
}
export async function assetUrl(id) {
  if (!urls.has(id))
    urls.set(
      id,
      readAsset(id).then((blob) => (blob ? URL.createObjectURL(blob) : null)),
    );
  return urls.get(id);
}
export function revokeAssetUrls() {
  for (const promise of urls.values())
    promise.then((url) => {
      if (url) URL.revokeObjectURL(url);
    });
  urls.clear();
}
export async function persistAttachments(items) {
  const result = [];
  for (const item of items) {
    const mediaId = crypto.randomUUID();
    await storeAsset(mediaId, item.blob);
    result.push({
      mediaId,
      name: item.name,
      kind: item.kind,
      mime: item.blob.type,
      size: item.blob.size,
    });
  }
  return result;
}
