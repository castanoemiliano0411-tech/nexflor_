import { useEffect, useState } from "react";

export const WORKER_KEY = "trigal-worker";

export function workerToken() {
  return sessionStorage.getItem(WORKER_KEY) || "";
}

export async function api(path, options = {}) {
  const worker = workerToken();
  const { headers: extraHeaders, ...rest } = options;
  const response = await fetch(`/api${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      ...(worker ? { Authorization: `Bearer ${worker}` } : {}),
      ...(extraHeaders || {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || "No se pudo completar la solicitud.");
  return body;
}

export function useApi(path) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let active = true;
    setState({ loading: true, error: "", data: null });
    api(path)
      .then((data) => {
        if (active) setState({ loading: false, error: "", data });
      })
      .catch((error) => {
        if (active) setState({ loading: false, error: error.message, data: null });
      });
    return () => {
      active = false;
    };
  }, [path, tick]);

  return { ...state, reload: () => setTick((value) => value + 1) };
}
