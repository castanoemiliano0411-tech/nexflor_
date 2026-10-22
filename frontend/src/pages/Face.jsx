import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, workerToken, WORKER_KEY } from "../api.js";
import { measureVideo, prepareModels } from "../browserFace.js";

const emptyForm = { fullName: "", documentId: "", role: "", email: "" };

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
  const [mode, setMode] = useState("ingreso");
  const [consent, setConsent] = useState(false);
  const [phase, setPhase] = useState("listo");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState({ ...emptyForm, fullName: name || "", documentId: documentId || "", role: job || "" });
  const [code, setCode] = useState({ documentId: "", pin: "" });
  const [cameraOn, setCameraOn] = useState(false);
  const [capture, setCapture] = useState(null);
  const [captureNote, setCaptureNote] = useState("");
  const [entries, setEntries] = useState([]);

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
          documentId: me.id || current.documentId,
          role: me.role || current.role || "Trabajador",
        }));
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
      if (form.fullName.trim().length < 3 || form.documentId.trim().length < 4 || form.role.trim().length < 2) {
        setError("Completa nombre, identificación y cargo antes de capturar el rostro.");
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
        setCapture({ frames: await captureFrames() });
        setCaptureNote("Imágenes tomadas. Al guardar, el servidor compara el rostro con las personas autorizadas. Todavía no está identificado.");
      } else {
        await prepareModels((message) => setError(message));
        setError("");
        const reading = await measureVideo(video);
        if (!reading.quality || !reading.descriptor) {
          setError("No hay un rostro estable para comparar. Acércate, mira a la cámara y vuelve a capturar. Esto no es una identificación.");
          return;
        }
        if (!reading.liveness) {
          setError("Se detectó un rostro, pero no se comprobó que sea una persona presente. Parpadea o mueve un poco la cabeza y captura de nuevo.");
          return;
        }
        setCapture(reading);
        setCaptureNote("Rostro detectado en este dispositivo. Al guardar, el servidor lo compara con los registros. Detectar un rostro no significa que ya esté identificado.");
      }
    } catch (err) {
      setError(err.message || "No se pudo capturar el rostro.");
    } finally {
      setPhase("listo");
    }
  }

  async function saveRecord() {
    if (!capture) {
      setError("Primero inicia la cámara y captura el rostro.");
      return;
    }
    if (mode === "registro") {
      if (form.fullName.trim().length < 3 || form.documentId.trim().length < 4 || form.role.trim().length < 2) {
        setError("Nombre, identificación y cargo son obligatorios.");
        return;
      }
    }
    setPhase("guardando");
    setError("");
    setResult(null);
    try {
      const path = mode === "registro" ? "/face/register" : "/face/verify";
      const body = mode === "registro" ? { ...form, consent: true, ...capture } : capture;
      const response = await staffApi(path, { method: "POST", body: JSON.stringify(body) });
      setResult(response);
      setCapture(null);
      setCaptureNote("");
      if (response.already === false) setForm({ ...emptyForm, fullName: name || "", documentId: documentId || "", role: job || "" });
      setStatus(await staffApi("/face/status"));
      await refreshEntries();
    } catch (err) {
      if (err.message.includes("cuenta autorizada")) onLogout();
      setError(err.message);
      setResult(null);
    } finally {
      setPhase("listo");
    }
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

  const tone = result?.access === "permitido" ? "ok" : result ? "bad" : "";
  const savedText = result
    ? `${result.message}${result.name && result.access === "permitido" ? ` ${result.name}.` : ""}${result.eventId ? ` Registro ${result.eventId}.` : ""}`
    : "";

  return (
    <section className="page face-page">
      <div className="page-head">
        <div>
          <p className="eyebrow">NEXFLOR ID · El Carmen de Viboral</p>
          <h1>NEXFLOR ID</h1>
          <p>La cámara muestra una vista previa. Capturar detecta el rostro; guardar lo compara con las personas autorizadas. Detectar una cara no es identificar a alguien.</p>
        </div>
        <button type="button" onClick={onLogout}>Salir{name ? ` · ${name}` : ""}</button>
      </div>

      {status?.notice && <p className={status.engine === "server" && status.modelReady ? "muted" : "status"}>{status.notice}</p>}

      <div className="face-layout">
        <section className="card scanner">
          <div className="chips">
            <button type="button" className={mode === "ingreso" ? "on" : ""} onClick={() => { setMode("ingreso"); setResult(null); setCapture(null); setCaptureNote(""); }}>Ya estoy registrado</button>
            <button type="button" className={mode === "registro" ? "on" : ""} onClick={() => { setMode("registro"); setResult(null); setCapture(null); setCaptureNote(""); }}>Primera vez</button>
          </div>
          <div className={`viewport ${phase === "escaneando" ? "scanning" : ""}`}>
            <video ref={videoRef} autoPlay playsInline muted />
            {!cameraOn && <p>Vista previa: inicia la cámara para ver el rostro antes de capturarlo.</p>}
            {phase === "escaneando" && <span className="scan-flag">Capturando… parpadea una vez</span>}
          </div>
          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>{status?.consent}</span>
          </label>
          {mode === "registro" && (
            <div className="face-form">
              <label>Nombre completo<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required readOnly={ownAccount} /></label>
              <label>Identificación<input value={form.documentId} onChange={(event) => setForm({ ...form, documentId: event.target.value })} required readOnly={ownAccount} /></label>
              <label>Cargo o tipo de persona<input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} required /></label>
              <label>Correo, si hace falta<input type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></label>
              <p className="muted">El registro queda pendiente hasta que un administrador lo apruebe. No se guarda la foto, solo una plantilla cifrada.</p>
            </div>
          )}
          {captureNote && <p className="muted">{captureNote}</p>}
          {cameraError && <p className="status error">{cameraError}</p>}
          {error && <p className="status error">{error}</p>}
          {result && <p className={`face-result ${tone}`}>{savedText}</p>}
          <div className="face-actions">
            <button className="button" type="button" onClick={openCamera} disabled={cameraOn || phase === "escaneando"}>
              {cameraOn ? "Cámara activa" : "Iniciar cámara"}
            </button>
            <button className="button" type="button" onClick={captureFace} disabled={phase !== "listo"}>
              {phase === "escaneando" ? "Capturando…" : "Capturar rostro"}
            </button>
            <button className="button" type="button" onClick={saveRecord} disabled={!capture || phase !== "listo"}>
              {phase === "guardando" ? "Guardando…" : mode === "registro" ? "Guardar registro" : "Guardar ingreso"}
            </button>
            <button type="button" onClick={cancelCapture}>Cancelar</button>
          </div>
        </section>

        <section className="card">
          <h2>Si no puedes usar la cámara</h2>
          <p>Un administrador puede entregarte un código. Ese código también lo comprueba el servidor y no autoriza a quien esté pendiente, rechazado o suspendido.</p>
          <form className="face-form" onSubmit={sendCode}>
            <label>Identificación<input value={code.documentId} onChange={(event) => setCode({ ...code, documentId: event.target.value })} required /></label>
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
