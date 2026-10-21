import { crc32, deflateSync } from "node:zlib";

// Small, valid files for upload tests: real enough for signature checks, image-size
// and the browser, without fixtures in the repository.

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** A solid-colour RGB PNG of the given size. */
export function pngBytes(
  width: number,
  height: number,
  rgb: [number, number, number] = [37, 99, 235],
): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const row = Buffer.concat([
    Buffer.from([0]),
    Buffer.from(Array.from({ length: width }, () => rgb).flat()),
  ]);
  const pixels = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", header),
    pngChunk("IDAT", deflateSync(pixels)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/** A minimal one-page PDF. */
export function pdfBytes(text = "Digital product"): Buffer {
  return Buffer.from(
    `%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n% ${text}\ntrailer<</Root 1 0 R>>\n%%EOF\n`,
  );
}

/** PUTs a body to a pre-signed upload URL the way the browser does. */
export async function putUpload(url: string, body: Buffer, contentType: string): Promise<number> {
  const response = await fetch(url, {
    method: "PUT",
    body: new Uint8Array(body),
    headers: { "Content-Type": contentType },
  });
  return response.status;
}
