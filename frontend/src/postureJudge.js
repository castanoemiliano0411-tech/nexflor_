function seen(point) {
  return point && (point.visibility ?? 1) > 0.45;
}

function apart(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function judgePose(landmarks) {
  const person = landmarks?.[0];
  if (!person) return { seen: false, bad: false, reason: "No hay una persona frente a la cámara." };
  const leftShoulder = person[11];
  const rightShoulder = person[12];
  const leftHip = person[23];
  const rightHip = person[24];
  const nose = person[0];
  const leftEar = person[7];
  const rightEar = person[8];
  if (!seen(leftShoulder) || !seen(rightShoulder) || !seen(leftHip) || !seen(rightHip)) {
    return { seen: false, bad: false, reason: "Acércate para que se vean los hombros y la cadera." };
  }
  const shoulders = apart(leftShoulder, rightShoulder);
  if (shoulders < 0.08) return { seen: false, bad: false, reason: "Acércate un poco a la cámara." };
  const shoulderTilt = Math.abs(leftShoulder.y - rightShoulder.y) / shoulders;
  const midShoulder = { x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 };
  const midHip = { x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 };
  const torso = apart(midShoulder, midHip) || 0.01;
  const lean = Math.abs(midShoulder.x - midHip.x) / torso;
  const dropped = seen(nose) && nose.y > midShoulder.y - 0.03;
  let tilt = 0;
  if (seen(leftEar) && seen(rightEar)) {
    tilt = Math.abs(leftEar.y - rightEar.y) / (apart(leftEar, rightEar) || 0.01);
  }
  if (shoulderTilt > 0.18) return { seen: true, bad: true, reason: "Mala postura: un hombro está más alto que el otro." };
  if (lean > 0.35) return { seen: true, bad: true, reason: "Mala postura: el torso está inclinado." };
  if (dropped) return { seen: true, bad: true, reason: "Mala postura: la cabeza está caída." };
  if (tilt > 0.28) return { seen: true, bad: true, reason: "Mala postura: la cabeza está ladeada." };
  return { seen: true, bad: false, reason: "Postura adecuada. La alarma está en silencio." };
}
