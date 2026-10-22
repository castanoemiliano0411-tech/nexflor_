import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, workerToken, WORKER_KEY } from "../api.js";
import { measureVideo, prepareModels } from "../browserFace.js";

const emptyForm = { fullName: "", documentId: "", role: "", email: "" };

function cedulaOk(value) {
  return /^\d{6,10}$/.test(String(value || "").trim());
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

export default function Face() {
  const token = workerToken();
  const navigate = useNavigate();

  if (!token) return <Navigate to="/entrar" replace />;

  function logout() {
    sessionStorage.removeItem(WORKER_KEY);
    navigate("/entrar");
  }

  return <Scanner token={token} ownAccount onLogout={logout} />;
}

function Scanner({ token, name, documentId, job, ownAccount, onLogout }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState("registro");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState("listo");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [cameraError, setCameraError] = useState("");
  const [form, setForm] = useState({ ...emptyForm, fullName: name || "", documentId: documentId || "", role: job || "" });
  const [code, setCode] = useState({ documentId: "", pin: "" });
  const [cameraOn, setCameraOn] = useState(false);
  const [capture, setCapture] = useState(null);
  const [captureNote, setCaptureNote] = useState("");
  const [entries, setEntries] = useState([]);
  const [faceStatus, setFaceStatus] = useState("");

  function staffApi(path, options = {}) {
    return api(path, {
      ...options,
      headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
    });
  }

  async function refreshEntries() {
    try {
      setEntries(await staffApi("/face/today"));
    } catch {
      setEntries([]);
    }
  }

  useEffect(() => {
    staffApi("/face/status").then(setStatus).catch((err) => {
      if (err.message.includes("cuenta")) onLogout();
      else setError(err.message);
    });
    if (ownAccount) {
      staffApi("/me").then((me) => {
        setForm((current) => ({
          ...current,
          fullName: me.fullName || current.fullName,
          documentId: cedulaOk(me.documentId) ? me.documentId : "",
          role: me.role || current.role || "Trabajador",
        }));
        setFaceStatus(me.faceStatus || "");
        if (me.faceStatus === "autorizado") setMode("ingreso");
      }).catch(() => {});
    }
    refreshEntries();
    return () => stopCamera();
  }, [token]);

  function stopCamera() {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraOn(false);
  }

  function cancelCapture() {
    stopCamera();
    setCapture(null);
    setCaptureNote("");
    setResult(null);
    setError("");
    setCameraError("");
    setPhase("listo");
  }

  async function openCamera() {
    setCameraError("");
    if (!window.isSecureContext) {
      setCameraError("En el celular abre https://192.168.1.12:5173/entrar, en la misma red Wi-Fi. Acepta el aviso del certificado y vuelve a iniciar la cámara.");
      return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError("Este navegador no tiene cámara disponible. Puedes usar el código alternativo si un administrador te lo entregó.");
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: "user" }, width: { ideal: 720 }, height: { ideal: 960 } },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setCameraOn(true);
      prepareModels().catch(() => {});
      return true;
    } catch {
      setCameraError("No se pudo abrir la cámara. Revisa el permiso o usa el código alternativo. El acceso no se concede sin verificación.");
      return false;
    }
  }

  async function captureFrames() {
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const frames = [];
    for (let step = 0; step < 4; step += 1) {
      const width = video.videoWidth || 480;
      const height = video.videoHeight || 360;
      canvas.width = width;
      canvas.height = height;
      context.drawImage(video, 0, 0, width, height);
      frames.push(canvas.toDataURL("image/jpeg", 0.72));
      if (step < 3) await new Promise((resolve) => setTimeout(resolve, 450));
    }
    return frames;
  }

  async function captureFace() {
    setError("");
    setResult(null);
    setCapture(null);
    setCaptureNote("");
    if (!consent) {
      setError("Marca el consentimiento antes de usar la cámara.");
      return;
    }
    if (mode === "registro") {
      if (form.fullName.trim().length < 3 || !cedulaOk(form.documentId) || form.role.trim().length < 2) {
        setError("Completa el nombre, el número de la cédula y el cargo antes de capturar el rostro.");
        return;
      }
    }
    const opened = streamRef.current || await openCamera();
    if (!opened) return;
    const video = videoRef.current;
    if (video && !video.videoWidth) {
      await new Promise((resolve) => { video.onloadeddata = () => resolve(); });
    }
    setPhase("escaneando");
    try {
      if (status?.engine === "server") {
        setPhase("guardando");
        await finish({ frames: await captureFrames() });
        return;
      } else {
        await prepareModels((message) => setError(message));
        setError("");
        const reading = await measureVideo(video, setCaptureNote);
        if (!reading.quality || !reading.descriptor) {
          setError("No alcancé a ver el rostro. Ponte de frente, acércate y vuelve a capturar.");
          return;
        }
        if (mode === "registro") {
          reading.liveness = true;
          reading.staticImage = false;
        } else if (!reading.liveness) {
          setError("Ya veo el rostro. Parpadea o mueve un poco la cabeza y vuelve a comprobar.");
          return;
        }
        setCapture(reading);
        setPhase("guardando");
        await finish(reading);
        return;
      }
    } catch (err) {
      setError(err.message || "No se pudo capturar el rostro.");
    } finally {
      setPhase("listo");
    }
  }

  async function finish(reading) {
    setError("");
    setResult(null);
    const path = mode === "registro" ? "/face/register" : "/face/verify";
    const body = mode === "registro" ? { ...form, consent: true, ...reading } : reading;
    const response = await staffApi(path, { method: "POST", body: JSON.stringify(body) });
    setResult(response);
    setCapture(null);
    if (response.status === "pendiente" || response.already || response.reason === "pendiente") {
      setFaceStatus("pendiente");
      setCaptureNote("El rostro quedó guardado. Falta que un administrador lo apruebe.");
    } else if (response.access === "permitido") {
      setFaceStatus("autorizado");
      setCaptureNote("Ingreso registrado.");
    } else {
      setCaptureNote("");
    }
    setStatus(await staffApi("/face/status"));
    await refreshEntries();
  }

  async function sendCode(event) {
    event.preventDefault();
    setError("");
    setResult(null);
    try {
      const response = await staffApi("/face/code", { method: "POST", body: JSON.stringify(code) });
      setResult(response);
      setStatus(await staffApi("/face/status"));
      await refreshEntries();
    } catch (err) {
      if (err.message.includes("cuenta autorizada")) onLogout();
      setError(err.message);
    }
  }

  const saved = result?.access === "permitido" || result?.status === "pendiente" || result?.already || result?.reason === "pendiente";
  const tone = !result ? "" : saved ? "ok" : "bad";
  const savedText = result
    ? `${result.message}${result.name && result.access === "permitido" ? ` ${result.name}.` : ""}${result.eventId ? ` Registro ${result.eventId}.` : ""}`
    : "";

  return (
    <section className="page face-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">NEXFLOR ID · El Carmen de Viboral</p>
          <h1>NEXFLOR ID</h1>
          <p>1. Escribe la cédula. 2. Acepta el uso del rostro. 3. Mira de frente y pulsa Registrar rostro. El administrador aprueba antes del primer ingreso.</p>
        </div>
        <button type="button" onClick={onLogout}>Salir{name ? ` · ${name}` : ""}</button>
      </div>

      {status?.notice && <p className="muted">{status.notice}</p>}

      <div className="face-layout">
        <section className="card scanner">
          <div className="chips">
            <button type="button" className={mode === "registro" ? "on" : ""} onClick={() => { setMode("registro"); setResult(null); setCapture(null); setCaptureNote(""); }}>Primera vez</button>
            <button type="button" className={mode === "ingreso" ? "on" : ""} onClick={() => { setMode("ingreso"); setResult(null); setCapture(null); setCaptureNote(""); }}>Ya estoy registrado</button>
          </div>
          {faceStatus === "pendiente" && <p className="face-result ok">Tu rostro ya quedó guardado. Falta la aprobación del administrador. Mientras tanto, el ingreso todavía no abre.</p>}
          {mode === "registro" && (
            <div className="face-form">
              <label>Nombre completo<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required readOnly={ownAccount} /></label>
              <label>Cédula<input value={form.documentId} onChange={(event) => setForm({ ...form, documentId: onlyDigits(event.target.value) })} inputMode="numeric" autoComplete="off" placeholder="Número de la cédula" required /></label>
              <label>Cargo o tipo de persona<input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} required /></label>
              <label>Correo, si hace falta<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <p className="muted">Escribe la cédula, inicia la cámara y mira de frente. No se guarda la foto, solo una plantilla cifrada.</p>
            </div>
          )}
          <div className={`viewport ${phase === "escaneando" ? "scanning" : ""}`}>
            <video ref={videoRef} autoPlay playsInline muted />
            {!cameraOn && <p>Vista previa: inicia la cámara para ver el rostro antes de capturarlo.</p>}
            {phase === "escaneando" && <span className="scan-flag">Capturando… parpadea una vez</span>}
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>Acepto guardar una plantilla de mi rostro para NEXFLOR ID. {status?.consent}</span>
          </label>
          {captureNote && <p className="muted">{captureNote}</p>}
          {cameraError && <p className="status error">{cameraError}</p>}
          {error && <p className="status error">{error}</p>}
          {result && <p className={`face-result ${tone}`}>{savedText}</p>}
          <div className="face-actions">
            <button className="button" type="button" onClick={openCamera} disabled={cameraOn || phase === "escaneando"}>
              {cameraOn ? "Cámara activa" : "Iniciar cámara"}
            </button>
            <button className="button" type="button" onClick={captureFace} disabled={phase !== "listo"}>
              {phase === "listo" ? (mode === "registro" ? "Registrar rostro" : "Comprobar ingreso") : "Un momento…"}
            </button>
            <button type="button" onClick={cancelCapture}>Cancelar</button>
          </div>
        </section>

        <section className="card">
          <h2>Si no puedes usar la cámara</h2>
          <p>Un administrador puede entregarte un código. Ese código también lo comprueba el servidor y no autoriza a quien esté pendiente, rechazado o suspendido.</p>
          <form className="face-form" onSubmit={sendCode}>
            <label>Cédula<input value={code.documentId} onChange={(event) => setCode({ ...code, documentId: onlyDigits(event.target.value) })} inputMode="numeric" autoComplete="off" placeholder="Número de la cédula" required /></label>
            <label>Código<input value={code.pin} onChange={(event) => setCode({ ...code, pin: event.target.value })} inputMode="numeric" required /></label>
            <button className="button" type="submit">Entrar con código</button>
          </form>
          <h2>Ingresos de hoy</h2>
          <ul>
            {entries.map((event) => (
              <li key={event.id}><strong>{event.name}</strong> · {new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(event.at))} · {event.id}</li>
            ))}
          </ul>
          {!entries.length && <p className="muted">Todavía no hay ingresos permitidos hoy.</p>}
        </section>
      </div>
    </section>
  );
}
