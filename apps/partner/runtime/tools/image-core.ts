// Imported from LamplitIsles/dsh-plugins (Apache-2.0); see docs/IMPORTS.md.
/** A host-independent boundary for Kepos's `/codex/images` bridge endpoint. */

export const DEFAULT_BRIDGE_URL = "http://codex-bridge.localhost:17480";
export const MAX_BRIDGE_JSON_BYTES = 32 * 1024 * 1024;

const encoder = new TextEncoder();
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const supportedMediaTypes = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export type ImageMediaType = (typeof supportedMediaTypes)[number];

export class ImagegenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImagegenError";
  }
}

export interface ImageResult {
  data: Uint8Array;
  mediaType: "image/png";
}

export interface RequestImageOptions {
  fetch: typeof globalThis.fetch;
  model: string;
  prompt: string;
  images?: readonly string[] | undefined;
  baseUrl?: string;
  signal?: AbortSignal | undefined;
}

export function normalizeBridgeUrl(value: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ImagegenError("Enter a valid Kepos bridge address.");
  }
  const trimmed = value.trim();
  if (trimmed.includes("?") || trimmed.includes("#")) {
    throw new ImagegenError("Enter a valid Kepos bridge address.");
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new ImagegenError("Enter a valid Kepos bridge address.");
  }

  if (
    (url.protocol !== "http:" && url.protocol !== "https:") ||
    url.hostname === "" ||
    url.username !== "" ||
    url.password !== "" ||
    (url.pathname !== "" && url.pathname !== "/") ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new ImagegenError("Enter a valid Kepos bridge address.");
  }

  return `${url.protocol}//${url.host}`;
}

export function assertNonblankPrompt(
  prompt: unknown,
): asserts prompt is string {
  if (typeof prompt !== "string" || prompt.trim() === "") {
    throw new ImagegenError("A nonblank image prompt is required.");
  }
}

export function assertNonblankModel(model: unknown): asserts model is string {
  if (typeof model !== "string" || model.trim() === "") {
    throw new ImagegenError("A nonblank image model is required.");
  }
}

export function normalizeModel(model: unknown): string {
  assertNonblankModel(model);
  return model.trim();
}

export function isSupportedMediaType(value: unknown): value is ImageMediaType {
  return (
    typeof value === "string" &&
    supportedMediaTypes.includes(value as ImageMediaType)
  );
}

export function encodeImageDataUrl(
  data: Uint8Array,
  mediaType: ImageMediaType,
): string {
  if (!isSupportedMediaType(mediaType) || data.byteLength === 0) {
    throw new ImagegenError("The source image is invalid.");
  }

  return `data:${mediaType};base64,${encodeBase64(data)}`;
}

export function decodeImageDataUrl(value: unknown): {
  data: Uint8Array;
  mediaType: ImageMediaType;
} {
  if (typeof value !== "string") {
    throw new ImagegenError(
      "The image data returned by the service is invalid.",
    );
  }

  const match =
    /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]*={0,2})$/.exec(
      value,
    );
  if (!match || !match[1] || match[2] === undefined) {
    throw new ImagegenError(
      "The image data returned by the service is invalid.",
    );
  }

  const mediaType = match[1] as ImageMediaType;
  const encoded = match[2];
  if (
    encoded === "" ||
    encoded.length % 4 !== 0 ||
    /=[^=]/.test(encoded) ||
    (encoded.includes("=") && !/={1,2}$/.test(encoded))
  ) {
    throw new ImagegenError(
      "The image data returned by the service is invalid.",
    );
  }

  let data: Uint8Array;
  try {
    data = decodeBase64(encoded);
  } catch {
    throw new ImagegenError(
      "The image data returned by the service is invalid.",
    );
  }

  if (data.byteLength === 0 || encodeBase64(data) !== encoded) {
    throw new ImagegenError(
      "The image data returned by the service is invalid.",
    );
  }

  return { data, mediaType };
}

export function remainingSourceBytes(
  model: string,
  prompt: string,
  currentImages: readonly string[],
  mediaType: ImageMediaType,
): number {
  const normalizedModel = normalizeModel(model);
  assertNonblankPrompt(prompt);
  if (!isSupportedMediaType(mediaType) || currentImages.length >= 5) {
    return 0;
  }
  for (const image of currentImages) {
    decodeImageDataUrl(image);
  }

  const prefix = `data:${mediaType};base64,`;
  const body = JSON.stringify({
    model: normalizedModel,
    prompt,
    images: [...currentImages, prefix],
  });
  const available = MAX_BRIDGE_JSON_BYTES - utf8Length(body);
  if (available < 4) {
    return 0;
  }
  return Math.floor(available / 4) * 3;
}

export function assertBridgePayloadFits(
  model: string,
  prompt: string,
  images?: readonly string[],
): void {
  const normalizedModel = normalizeModel(model);
  assertNonblankPrompt(prompt);
  if (images !== undefined) {
    if (images.length === 0 || images.length > 5) {
      throw new ImagegenError("Provide between one and five source images.");
    }
    for (const image of images) {
      decodeImageDataUrl(image);
    }
  }

  const body = JSON.stringify(
    images === undefined
      ? { model: normalizedModel, prompt }
      : { model: normalizedModel, prompt, images },
  );
  if (utf8Length(body) > MAX_BRIDGE_JSON_BYTES) {
    throw new ImagegenError(
      "The image request is too large for the Kepos bridge.",
    );
  }
}

export async function requestImage({
  fetch,
  model,
  prompt,
  images,
  baseUrl = DEFAULT_BRIDGE_URL,
  signal,
}: RequestImageOptions): Promise<ImageResult> {
  const normalizedBaseUrl = normalizeBridgeUrl(baseUrl);
  const normalizedModel = normalizeModel(model);
  assertBridgePayloadFits(normalizedModel, prompt, images);
  const body = JSON.stringify(
    images === undefined
      ? { model: normalizedModel, prompt }
      : { model: normalizedModel, prompt, images },
  );
  const request: RequestInit = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
    credentials: "omit",
  };
  if (signal !== undefined) {
    request.signal = signal;
  }

  let response: Response;
  try {
    response = await fetch(`${normalizedBaseUrl}/codex/images`, request);
  } catch {
    throw new ImagegenError("The Kepos image service could not be reached.");
  }

  if (!response.ok) {
    throw new ImagegenError("The Kepos image service rejected the request.");
  }

  let responseBody: unknown;
  try {
    responseBody = await response.json();
  } catch {
    throw new ImagegenError(
      "The Kepos image service returned an invalid response.",
    );
  }

  if (
    typeof responseBody !== "object" ||
    responseBody === null ||
    Array.isArray(responseBody) ||
    Object.keys(responseBody).length !== 1 ||
    !("image_url" in responseBody)
  ) {
    throw new ImagegenError(
      "The Kepos image service returned an invalid response.",
    );
  }

  const { data, mediaType } = decodeImageDataUrl(responseBody.image_url);
  if (mediaType !== "image/png" || !isPng(data)) {
    throw new ImagegenError(
      "The Kepos image service returned an invalid PNG image.",
    );
  }

  return { data, mediaType };
}

export function isPng(data: Uint8Array): boolean {
  return PNG_SIGNATURE.every((byte, index) => data[index] === byte);
}

function utf8Length(value: string): number {
  return encoder.encode(value).byteLength;
}

function encodeBase64(data: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(data).toString("base64");
  let binary = "";
  const chunkSize = 0x8000;
  for (let start = 0; start < data.length; start += chunkSize) {
    binary += String.fromCharCode(...data.subarray(start, start + chunkSize));
  }
  return btoa(binary);
}

function decodeBase64(value: string): Uint8Array {
  if (typeof Buffer !== "undefined") return Buffer.from(value, "base64");
  const binary = atob(value);
  const data = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    data[index] = binary.charCodeAt(index);
  }
  return data;
}
