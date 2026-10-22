import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
let tf;
let faceapi;
let ready = false;
let failed = "";

const modelPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "../node_modules/@vladmandic/face-api/model");

export function engineStatus() {
  if (ready) return { ready: true, message: "El reconocimiento facial está listo." };
  if (failed) return { ready: false, message: failed };
  return { ready: false, message: "El reconocimiento facial se está preparando. El acceso no se concede hasta que esté listo." };
}

async function load() {
  if (ready) return;
  if (failed) {
    const error = new Error(failed);
    error.status = 503;
    throw error;
  }
  try {
    if (!fs.existsSync(modelPath)) throw new Error("Faltan los modelos de reconocimiento.");
    const tfName = "@tensorflow/" + "tfjs";
    const faceName = "@vladmandic/" + "face-api";
    tf = await import(tfName);
    faceapi = await import(faceName);
    await tf.setBackend("cpu");
    await tf.ready();
    await faceapi.nets.tinyFaceDetector.loadFromDisk(modelPath);
    await faceapi.nets.faceLandmark68Net.loadFromDisk(modelPath);
    await faceapi.nets.faceRecognitionNet.loadFromDisk(modelPath);
    ready = true;
  } catch (error) {
    console.error("Reconocimiento facial:", error instanceof Error ? error.message : error);
    failed = "El motor de reconocimiento no está listo en este servidor (Node 24 no trae el binario de TensorFlow y aquí no hay Python para compilarlo). El acceso por rostro no se concede.";
    const failure = new Error(failed);
    failure.status = 503;
    throw failure;
  }
}

function parseFrame(value) {
  const match = String(value || "").match(/^data:image\/jpeg;base64,([A-Za-z0-9+/=\s]+)$/);
  if (!match) return null;
  const buffer = Buffer.from(match[1].replace(/\s/g, ""), "base64");
  if (buffer.length < 800 || buffer.length > 1_200_000) return null;
  return buffer;
}

function downscale(pixels, width, height) {
  const maxWidth = 480;
  if (width <= maxWidth) return { pixels, width, height };
  const nextWidth = maxWidth;
  const nextHeight = Math.max(1, Math.round(height * (maxWidth / width)));
  const out = new Uint8Array(nextWidth * nextHeight * 3);
  for (let y = 0; y < nextHeight; y += 1) {
    const sourceY = Math.min(height - 1, Math.floor((y * height) / nextHeight));
    for (let x = 0; x < nextWidth; x += 1) {
      const sourceX = Math.min(width - 1, Math.floor((x * width) / nextWidth));
      const from = (sourceY * width + sourceX) * 4;
      const to = (y * nextWidth + x) * 3;
      out[to] = pixels[from];
      out[to + 1] = pixels[from + 1];
      out[to + 2] = pixels[from + 2];
    }
  }
  return { pixels: out, width: nextWidth, height: nextHeight };
}

function eyeAspect(points, start) {
  const point = (offset) => points[start + offset];
  const span = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const horizontal = span(point(0), point(3));
  if (!horizontal) return 0;
  return (span(point(1), point(5)) + span(point(2), point(4))) / (2 * horizontal);
}

function average(list) {
  const out = new Array(128).fill(0);
  for (const item of list) {
    for (let index = 0; index < 128; index += 1) out[index] += item[index];
  }
  let norm = 0;
  for (let index = 0; index < 128; index += 1) {
    out[index] /= list.length;
    norm += out[index] * out[index];
  }
  norm = Math.sqrt(norm) || 1;
  return out.map((value) => Number((value / norm).toFixed(6)));
}

async function readFace(buffer) {
  const { default: jpeg } = await import("jpeg-js");
  const decoded = jpeg.decode(buffer, { useTArray: true, formatAsRGBA: true });
  if (!decoded?.width || decoded.width < 80 || decoded.height < 80) return null;
  const image = downscale(decoded.data, decoded.width, decoded.height);
  const tensor = tf.tensor3d(image.pixels, [image.height, image.width, 3], "int32");
  try {
    const options = new faceapi.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.25 });
    const faces = await faceapi.detectAllFaces(tensor, options).withFaceLandmarks().withFaceDescriptors();
    if (!faces.length) return null;
    const face = faces.reduce((best, item) => (item.detection.box.width > best.detection.box.width ? item : best));
    const points = face.landmarks.positions;
    return {
      descriptor: Array.from(face.descriptor),
      ear: (eyeAspect(points, 36) + eyeAspect(points, 42)) / 2,
      noseX: points[30].x,
      boxWidth: face.detection.box.width,
    };
  } finally {
    tensor.dispose();
  }
}

export async function analyzeFrames(dataUrls) {
  await load();
  const frames = (Array.isArray(dataUrls) ? dataUrls : []).slice(0, 4).map(parseFrame).filter(Boolean);
  if (frames.length < 3) return { quality: false, liveness: false, staticImage: false, descriptor: null };
  const hashes = frames.map((frame) => createHash("sha256").update(frame).digest("hex"));
  const staticImage = hashes.every((hash) => hash === hashes[0]);
  const samples = [];
  for (const frame of frames) {
    const sample = await readFace(frame);
    if (sample) samples.push(sample);
  }
  if (samples.length < 2) return { quality: false, liveness: false, staticImage, descriptor: null };
  const ears = samples.map((sample) => sample.ear);
  const noses = samples.map((sample) => sample.noseX);
  const moved = Math.max(...noses) - Math.min(...noses) > samples[0].boxWidth * 0.012;
  const blinked = Math.max(...ears) - Math.min(...ears) >= 0.02;
  const liveness = blinked || moved;
  return {
    quality: true,
    liveness,
    staticImage: staticImage && !liveness,
    descriptor: average(samples.map((sample) => sample.descriptor)),
  };
}

export function startEngine() {
  load().catch(() => {});
}
