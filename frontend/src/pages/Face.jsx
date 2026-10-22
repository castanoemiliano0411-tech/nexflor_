import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api, workerToken, WORKER_KEY } from "../api.js";
import { measureVideo, prepareModels } from "../browserFace.js";

const emptyForm = { fullName: "", documentId: "", role: "", email: "" };

function cedulaOk(value) {
  return /^\d{6,10}$/.test(String(value || "").trim());
}

function plainDescriptor(value) {
  if (!Array.isArray(value) || value.length !== 128) return null;
  const numbers = value.map((item) => Number(item));
  return numbers.every((item) => Number.isFinite(item)) ? numbers : null;
}

function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "").slice(0, 10);
}

function waitForFrame(video) {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      if (video && video.videoWidth > 20) resolve(true);
      else if (Date.now() - start > 4000) resolve(false);
      else setTimeout(tick, 100);
    };
    tick();
  });
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
  const [form, setForm] = useState({ ...emptyForm, fullName: "", documentId: documentId || "", role: job || "Trabajador" });
  const [code, setCode] = useState({ documentId: "", pin: "" });
  const [cameraOn, setCameraOn] = useState(false);
  const [capture, setCapture] = useState(null);
  const [captureNote, setCaptureNote] = useState("");
  const [entries, setEntries] = useState([]);
  const [faceStatus, setFaceStatus] = useState("");
  const [nameLocked, setNameLocked] = useState(false);

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
        const matched = me.matched === true && Boolean(me.fullName);
        setNameLocked(matched);
        setForm((current) => ({
          ...current,
          fullName: matched ? me.fullName : "",
          documentId: cedulaOk(me.documentId) ? me.documentId : "",
          role: matched ? (me.role || "Trabajador") : (current.role || "Trabajador"),
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
    const ready = await waitForFrame(video);
    if (!ready) {
      setError("La cámara no mostró imagen. Revisa el permiso, acércate y vuelve a intentar.");
      return;
    }
    setPhase("escaneando");
    try {
      await prepareModels((message) => setError(message));
      setError("");
      const reading = await measureVideo(video, setCaptureNote);
      const descriptor = plainDescriptor(reading.descriptor);
      if (!reading.quality || !descriptor) {
        setError("No alcancé a ver el rostro. Ponte de frente, acércate y vuelve a capturar.");
        return;
      }
      reading.descriptor = descriptor;
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
          <p>Escribe la cédula, acepta y mira de frente. No se guarda la foto.</p>
        </div>
      </div>

      <div className="face-layout">
        <section className="card scanner">
          <div className="chips">
            <button type="button" className={mode === "registro" ? "on" : ""} onClick={() => { setMode("registro"); setResult(null); setCapture(null); setCaptureNote(""); }}>Primera vez</button>
            <button type="button" className={mode === "ingreso" ? "on" : ""} onClick={() => { setMode("ingreso"); setResult(null); setCapture(null); setCaptureNote(""); }}>Ya estoy registrado</button>
          </div>
          {faceStatus === "pendiente" && <p className="face-result ok">Tu rostro ya está guardado. Falta que un administrador lo apruebe para poder entrar.</p>}

          <div className={`viewport ${cameraOn ? "live" : "idle"} ${phase === "escaneando" ? "scanning" : ""}`}>
            <video ref={videoRef} autoPlay playsInline muted />
            {cameraOn && <span className="face-guide" aria-hidden="true" />}
            {!cameraOn && (
              <div className="viewport-idle">
                <strong>Cámara apagada</strong>
                <span>Al registrar se abre aquí. Ponte de frente y con luz.</span>
              </div>
            )}
            {(phase === "escaneando" || captureNote) && <span className="scan-flag">{captureNote || "Buscando el rostro…"}</span>}
          </div>

          {mode === "registro" && (
            <div className="face-fields">
              <label className="wide">Cédula<input value={form.documentId} onChange={(event) => setForm({ ...form, documentId: onlyDigits(event.target.value) })} inputMode="numeric" autoComplete="off" placeholder="Número de la cédula" required /></label>
              <label>Nombre<input value={form.fullName} onChange={(event) => setForm({ ...form, fullName: event.target.value })} required readOnly={nameLocked} /></label>
              <label>Cargo<input value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} required /></label>
            </div>
          )}

          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(event) => setConsent(event.target.checked)} />
            <span>Acepto guardar la plantilla de mi rostro solo para comprobar el ingreso.</span>
          </label>
          <p className="legal">{status?.consent || "Flores El Trigal, en El Carmen de Viboral, usa esa plantilla únicamente para NEXFLOR ID. Un administrador aprueba el primer ingreso."}</p>

          {cameraError && <p className="face-result bad">{cameraError}</p>}
          {error && <p className="face-result bad">{error}</p>}
          {result && <p className={`face-result ${tone}`}>{savedText}</p>}

          <div className="face-actions">
            <button className="button" type="button" onClick={captureFace} disabled={phase !== "listo"}>
              {phase === "listo" ? (mode === "registro" ? "Registrar rostro" : "Comprobar ingreso") : "Un momento…"}
            </button>
            {cameraOn && <button type="button" onClick={cancelCapture}>Apagar cámara</button>}
          </div>
        </section>

        <section className="card face-side">
          <h2>Entrar con código</h2>
          <p>Si la cámara no sirve, un administrador te entrega un código.</p>
          <form className="face-form" onSubmit={sendCode}>
            <label>Cédula<input value={code.documentId} onChange={(event) => setCode({ ...code, documentId: onlyDigits(event.target.value) })} inputMode="numeric" autoComplete="off" placeholder="Número de la cédula" required /></label>
            <label>Código<input value={code.pin} onChange={(event) => setCode({ ...code, pin: event.target.value })} inputMode="numeric" required /></label>
            <button className="button" type="submit">Entrar con código</button>
          </form>
          <h2>Ingresos de hoy</h2>
          <ul>
            {entries.map((event) => (
              <li key={event.id}><strong>{event.name}</strong> · {new Intl.DateTimeFormat("es-CO", { hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" }).format(new Date(event.at))}</li>
            ))}
          </ul>
          {!entries.length && <p className="muted">Todavía no hay ingresos permitidos hoy.</p>}
        </section>
      </div>
    </section>
  );
}
