import { useRef, useState } from "react";

export default function Posture() {
  const [alertOn, setAlertOn] = useState(false);
  const alarmRef = useRef(null);

  function stopAlarm() {
    alarmRef.current?.stop();
    alarmRef.current = null;
  }

  function soundAlarm() {
    stopAlarm();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    ctx.resume();
    const master = ctx.createGain();
    master.gain.value = 0.2;
    master.connect(ctx.destination);
    const oscillators = [0, 0.42, 0.84].map((start) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = 784;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(1, ctx.currentTime + start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.28);
      osc.connect(gain);
      gain.connect(master);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.3);
      return osc;
    });
    alarmRef.current = {
      stop() {
        oscillators.forEach((osc) => {
          try { osc.stop(); } catch { /* already stopped */ }
        });
        ctx.close();
      },
    };
  }

  function markBad() {
    setAlertOn(true);
    soundAlarm();
  }

  function markOk() {
    setAlertOn(false);
    stopAlarm();
  }

  return (
    <section className="page">
      <p className="eyebrow">NEXFLOR POSTURE</p>
      <h1>La cama avisa la postura</h1>
      <p className="lede">
        En la cama de trabajo, NEXFLOR POSTURE detecta cuando un trabajador adopta una mala postura y suena una alarma para que se acomode. Es una ayuda preventiva. Complementa la seguridad y salud en el trabajo. No reemplaza al personal de salud y no promete evitar toda lesión.
      </p>

      <div className="posture-layout">
        <article className={alertOn ? "card posture-bed alert" : "card posture-bed"}>
          <img src="/flores/cosecha-amarilla.jpg" alt="Trabajo en las camas de Flores El Trigal" />
          <p className={alertOn ? "face-result bad" : "face-result ok"}>
            {alertOn ? "Mala postura. La alarma está sonando." : "Postura adecuada. La cama está en calma."}
          </p>
          <div className="face-actions">
            <button type="button" className="button" onClick={markBad}>Simular mala postura</button>
            <button type="button" onClick={markOk}>Postura adecuada</button>
          </div>
        </article>
        <article className="card">
          <p className="eyebrow">Cómo avisa</p>
          <h2>Tres pasos en la cama</h2>
          <ol className="posture-steps">
            <li><strong>Detección.</strong> Observa la postura mientras la persona trabaja.</li>
            <li><strong>Alarma.</strong> Si la postura no conviene, suena un aviso.</li>
            <li><strong>Acomodo.</strong> La persona corrige la postura y la alarma se detiene.</li>
          </ol>
        </article>
      </div>
    </section>
  );
}
