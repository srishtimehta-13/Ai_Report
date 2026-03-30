const configured = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

/** Backend base URL. In dev, defaults to Vite proxy `/api` → http://127.0.0.1:8000. */
export const API_BASE =
  import.meta.env.DEV && !configured
    ? "/api"
    : configured || "http://127.0.0.1:8000";
