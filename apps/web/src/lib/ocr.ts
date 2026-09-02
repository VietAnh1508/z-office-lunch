import { createWorker } from "tesseract.js";

// Takes a Blob, not a URL string — passing a relative `/api/...` URL risks the
// tesseract worker resolving it against its own (CDN) origin instead of the page's.
// The caller fetches the blob from the same URL an `<img>` preview would use.
export async function recognizeMenuImage(imageBlob: Blob): Promise<string> {
  const worker = await createWorker(["eng", "vie"]);
  try {
    const { data } = await worker.recognize(imageBlob);
    return data.text;
  } finally {
    await worker.terminate();
  }
}
