export function createFakeMenuImagesBucket() {
  const objects = new Map<string, { bytes: Uint8Array; httpMetadata?: { contentType?: string }; httpEtag: string }>();
  let etagCounter = 0;
  return {
    objects, // exposed for tests to assert exact contents/count directly
    async put(
      key: string,
      value: File | Blob | ArrayBuffer | ArrayBufferView | ReadableStream | string,
      options?: { httpMetadata?: { contentType?: string } },
    ) {
      const bytes = new Uint8Array(await new Response(value as BodyInit).arrayBuffer());
      const httpEtag = `"fake-etag-${etagCounter++}"`;
      objects.set(key, { bytes, httpMetadata: options?.httpMetadata, httpEtag });
      return { key, httpEtag };
    },
    async get(key: string) {
      const object = objects.get(key);
      if (!object) return null;
      return { ...object, body: new Response(object.bytes).body };
    },
    async delete(keys: string | string[]) {
      for (const key of Array.isArray(keys) ? keys : [keys]) objects.delete(key);
    },
  };
}
