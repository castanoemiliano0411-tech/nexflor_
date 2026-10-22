let faceapi;
let ready;

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

export async function prepareModels(onProgress) {
  if (ready) return;
  onProgress?.("Cargando el modelo de rostros…");
  faceapi = await import("@vladmandic/face-api/dist/face-api.esm.js");
  await faceapi.nets.tinyFaceDetector.loadFromUri("/models");
  await faceapi.nets.faceLandmark68Net.loadFromUri("/models");
  await faceapi.nets.faceRecognitionNet.loadFromUri("/models");
  ready = true;
}

const PASSES = [
  { inputSize: 320, scoreThreshold: 0.2 },
  { inputSize: 224, scoreThreshold: 0.12 },
];

function largestFace(faces) {
  return faces.reduce((best, face) => (
    face.detection.box.width > best.detection.box.width ? face : best
  ));
}

async function findFace(canvas) {
  for (const pass of PASSES) {
    const faces = await faceapi.detectAllFaces(canvas, new faceapi.TinyFaceDetectorOptions(pass))
      .withFaceLandmarks()
      .withFaceDescriptors();
    if (faces.length) return largestFace(faces);
  }
  return null;
}

function facePrint(context, box) {
  const limitWidth = context.canvas.width;
  const limitHeight = context.canvas.height;
  const x = Math.max(0, Math.min(limitWidth - 1, Math.floor(box.x)));
  const y = Math.max(0, Math.min(limitHeight - 1, Math.floor(box.y)));
  const width = Math.max(1, Math.min(24, limitWidth - x, Math.floor(box.width)));
  const height = Math.max(1, Math.min(24, limitHeight - y, Math.floor(box.height)));
  const data = context.getImageData(x, y, width, height).data;
  let total = 0;
  for (let index = 0; index < data.length; index += 16) total += data[index];
  return total;
}

export function readingFromSamples(samples, prints) {
  if (samples.length < 2) return { quality: false, liveness: false, staticImage: false, descriptor: null };
  const ears = samples.map((sample) => sample.ear);
  const noses = samples.map((sample) => sample.noseX);
  const moved = Math.max(...noses) - Math.min(...noses) > samples[0].boxWidth * 0.012;
  const blinked = Math.max(...ears) - Math.min(...ears) >= 0.02;
  const frozen = prints.length > 1 && prints.every((print) => print === prints[0]);
  const liveness = blinked || moved || !frozen;
  return {
    quality: true,
    liveness,
    staticImage: frozen && !liveness,
    descriptor: average(samples.map((sample) => sample.descriptor)),
  };
}

export async function measureVideo(video, onStep) {
  await prepareModels();
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });
  const samples = [];
  const prints = [];
  await wait(400);
  for (let step = 0; step < 14 && samples.length < 3; step += 1) {
    onStep?.(samples.length
      ? `Rostro visto. Sigue mirando. ${samples.length} de 2`
      : "Buscando el rostro. Mira de frente, con luz.");
    const width = video.videoWidth || 0;
    const height = video.videoHeight || 0;
    if (width < 20 || height < 20) {
      if (step < 13 && samples.length < 3) await wait(200);
      continue;
    }
    canvas.width = width;
    canvas.height = height;
    context.drawImage(video, 0, 0, width, height);
    const face = await findFace(canvas);
    const box = face?.detection.box;
    if (face && box.width >= 32) {
      const points = face.landmarks.positions;
      prints.push(facePrint(context, box));
      samples.push({
        descriptor: Array.from(face.descriptor),
        ear: (eyeAspect(points, 36) + eyeAspect(points, 42)) / 2,
        noseX: points[30].x,
        boxWidth: box.width || 1,
      });
    } else if (!samples.length) {
      onStep?.(box ? "Te veo lejos. Acércate un poco más." : "Todavía no veo un rostro. Ponte frente a la cámara.");
    }
    if (step < 13 && samples.length < 3) await wait(200);
  }
  return readingFromSamples(samples, prints);
}
