import { useEffect, useRef, useState } from "react";
import { judgePose } from "../postureJudge.js";

const WASM = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const MODEL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const BONES = [[11, 12], [11, 23], [12, 24], [23, 24], [11, 13], [13, 15], [12, 14], [14, 16], [23, 25], [25, 27], [24, 26], [26, 28], [0, 11], [0, 12]];

export default function Posture() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const poseRef = useRef(null);
  const streamRef = useRef(null);
  const audioRef = useRef(null);
  const alarmRef = useRef(null);
  const loopRef = useRef(0);
  const stampRef = useRef(0);
  const badStreak = useRef(0);
  const alertRef = useRef(false);
  const noteRef = useRef("");
  const [phase, setPhase] = useState("lista");
  const [alertOn, setAlertOn] = useState(false);
  const [note, setNote] = useState("Inicia la cámara. La imagen se mira en este navegador y no se guarda.");
  const [error, setError] = useState("");

  useEffect(() => () => stopAll(), []);

  function stopAlarm() {
    if (!alarmRef.current) return;
    alarmRef.current();
    alarmRef.current = null;
    alertRef.current = false;
    setAlertOn(false);
  }

  function ensureAudio() {
    if (audioRef.current) return audioRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    const ctx = new Ctx();
    audioRef.current = ctx;
    ctx.resume();
    return ctx;
  }

  function soundAlarm() {
    if (alarmRef.current) return;
    const ctx = ensureAudio();
    if (!ctx) return;
    const low = ctx.createOscillator();
    const high = ctx.createOscillator();
    const gain = ctx.createGain();
    low.type = "square";
    high.type = "square";
    low.frequency.value = 620;
    high.frequency.value = 880;
    gain.gain.value = 0.0001;
    low.connect(gain);
    high.connect(gain);
    gain.connect(ctx.destination);
    low.start();
    high.start();
    const pulse = () => {
      const time = ctx.currentTime;
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(0.0001, time);
      gain.gain.linearRampToValueAtTime(0.32, time + 0.02);
      gain.gain.setValueAtTime(0.32, time + 0.16);
      gain.gain.linearRampToValueAtTime(0.0001, time + 0.26);
    };
    pulse();
    const timer = setInterval(pulse, 480);
    alarmRef.current = () => {
      clearInterval(timer);
      gain.gain.cancelScheduledValues(ctx.currentTime);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      try { low.stop(); high.stop(); } catch { /* already stopped */ }
    };
    alertRef.current = true;
    setAlertOn(true);
  }

  function stopAll() {
    cancelAnimationFrame(loopRef.current);
    stopAlarm();
    poseRef.current?.close?.();
    poseRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    audioRef.current?.close?.();
    audioRef.current = null;
  }

  function draw(landmarks) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const person = landmarks?.[0];
    if (!person) return;
    const x = (point) => point.x * canvas.width;
    const y = (point) => point.y * canvas.height;
    ctx.lineWidth = 4;
    ctx.strokeStyle = alertRef.current ? "#c4554a" : "#f4e7c4";
    ctx.fillStyle = alertRef.current ? "#c4554a" : "#f4e7c4";
    BONES.forEach(([from, to]) => {
      const a = person[from];
      const b = person[to];
      if (!a || !b) return;
      ctx.beginPath();
      ctx.moveTo(x(a), y(a));
      ctx.lineTo(x(b), y(b));
      ctx.stroke();
    });
    [0, 11, 12, 23, 24].forEach((index) => {
      const point = person[index];
      if (!point) return;
      ctx.beginPath();
      ctx.arc(x(point), y(point), 6, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function watch(result) {
    const reading = judgePose(result?.landmarks);
    if (noteRef.current !== reading.reason) {
      noteRef.current = reading.reason;
      setNote(reading.reason);
    }
    if (reading.seen && reading.bad) {
      badStreak.current += 1;
      if (badStreak.current >= 6) soundAlarm();
      return;
    }
    badStreak.current = 0;
    stopAlarm();
  }

  function loop() {
    const video = videoRef.current;
    const pose = poseRef.current;
    if (video && pose && video.readyState >= 2) {
      const now = performance.now();
      if (now > stampRef.current) {
        stampRef.current = now;
        const result = pose.detectForVideo(video, now);
        watch(result);
        draw(result.landmarks);
      }
    }
    loopRef.current = requestAnimationFrame(loop);
  }

  async function openPose(files, PoseLandmarker, delegate) {
    return PoseLandmarker.createFromOptions(files, {
      baseOptions: { modelAssetPath: MODEL, delegate },
      runningMode: "VIDEO",
      numPoses: 1,
    });
  }

  async function start() {
    setError("");
    stopAll();
    badStreak.current = 0;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError("Esta página necesita una cámara en una dirección segura, como el enlace del taller.");
      return;
    }
    setPhase("modelo");
    setNote("Cargando la lectura de postura…");
    try {
      ensureAudio();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
      });
      streamRef.current = stream;
      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      const { FilesetResolver, PoseLandmarker } = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14");
      const files = await FilesetResolver.forVisionTasks(WASM);
      let pose;
      try {
        pose = await openPose(files, PoseLandmarker, "GPU");
      } catch {
        pose = await openPose(files, PoseLandmarker, "CPU");
      }
      poseRef.current = pose;
      setPhase("mirando");
      setNote("Mírate de frente. Si la postura se ve bien, no suena nada.");
      loop();
    } catch (err) {
      stopAll();
      setPhase("lista");
      setError(err?.name === "NotAllowedError"
        ? "El navegador no dio permiso para la cámara."
        : "No se pudo abrir la cámara o la lectura de postura.");
    }
  }

  function stop() {
    stopAll();
    setPhase("lista");
    setNote("La cámara está apagada. La alarma también.");
  }

  return (
    <section className="page">
      <p className="eyebrow">NEXFLOR POSTURE</p>
      <h1>La cámara mira la postura</h1>
      <p className="lede">
        En la cama de trabajo, la cámara observa hombros, cabeza y torso. Si la postura se ve mal, suena una alarma. Si se ve bien, se queda en silencio. Es una ayuda preventiva: complementa la seguridad y salud en el trabajo, no reemplaza al personal de salud y no promete evitar toda lesión.
      </p>
      <div className="posture-layout">
        <article className={alertOn ? "card posture-bed alert" : "card posture-bed"}>
          <div className="posture-stage">
            <video ref={videoRef} autoPlay playsInline muted />
            <canvas ref={canvasRef} />
            {phase !== "mirando" && <p>{phase === "modelo" ? "Preparando la cámara…" : "La cámara está apagada."}</p>}
          </div>
          <p className={alertOn ? "face-result bad" : "face-result ok"}>{note}</p>
          {error && <p className="status error">{error}</p>}
          <div className="face-actions">
            <button type="button" className="button" onClick={start} disabled={phase === "modelo"}>
              {phase === "mirando" ? "Reiniciar cámara" : "Iniciar cámara"}
            </button>
            <button type="button" onClick={stop} disabled={phase === "lista"}>Apagar cámara</button>
          </div>
        </article>
        <article className="card">
          <p className="eyebrow">Cómo avisa</p>
          <h2>Tres pasos en la cama</h2>
          <ol className="posture-steps">
            <li><strong>Cámara.</strong> La persona se pone frente a la cámara de la cama.</li>
            <li><strong>Lectura.</strong> Se miran los hombros, la cabeza y el torso.</li>
            <li><strong>Alarma.</strong> Suena si la postura se ve mal y se calla cuando se acomoda.</li>
          </ol>
        </article>
      </div>
    </section>
  );
}
