const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION = 2048;

const HEIC_TYPES = new Set(["image/heic", "image/heif", "image/heic-sequence", "image/heif-sequence"]);

/** Copy bytes so iOS Safari keeps the file after the &lt;input&gt; is reset. */
export async function retainFile(file: File): Promise<File> {
  const buffer = await file.arrayBuffer();
  const type = file.type || "image/jpeg";
  const name = file.name || "photo.jpg";
  return new File([buffer], name, { type, lastModified: file.lastModified || Date.now() });
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("Could not read preview"));
    };
    reader.onerror = () => reject(new Error("Could not read preview"));
    reader.readAsDataURL(file);
  });
}

function needsCompression(file: File): boolean {
  const type = file.type.toLowerCase();
  if (HEIC_TYPES.has(type)) return true;
  if (!type || type === "application/octet-stream") return true;
  if (file.size > MAX_OUTPUT_BYTES) return true;
  return false;
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      void img.decode().then(() => resolve(img)).catch(() => resolve(img));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode image"));
    };
    img.src = url;
  });
}

async function drawFileToCanvas(file: File): Promise<HTMLCanvasElement> {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare canvas");

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close?.();
      return canvas;
    } catch {
      /* fall through to Image() */
    }
  }

  const img = await loadImageElement(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(img.naturalWidth, img.naturalHeight));
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

async function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not encode JPEG"));
      },
      "image/jpeg",
      quality
    );
  });
}

/** Resize / re-encode so iPhone HEIC and large camera photos work in the browser and API. */
export async function prepareImageFile(file: File): Promise<File> {
  const retained = await retainFile(file);
  if (!needsCompression(retained)) return retained;

  const canvas = await drawFileToCanvas(retained);

  let quality = 0.9;
  let blob = await canvasToJpegBlob(canvas, quality);
  while (blob.size > MAX_OUTPUT_BYTES && quality > 0.45) {
    quality -= 0.08;
    blob = await canvasToJpegBlob(canvas, quality);
  }

  if (blob.size > MAX_OUTPUT_BYTES) {
    throw new Error("Image is still too large after compression");
  }

  const baseName = retained.name.replace(/\.[^.]+$/, "") || "photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
}
