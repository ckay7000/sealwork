import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { PropsWithChildren } from "react";
import type { AgentBuild, Job, PublicConfig } from "../shared/types";
import built from "../deployments/builds.json" with { type: "json" };

export const SOURCE_URL = "https://github.com/NSEVEjk0/sealwork";
export interface PrivateSession {
  job_id: string;
  buyer_key: string;
  salt: string;
  input_commitment: string;
  capability?: string;
  started?: boolean;
  transaction_hash?: string;
}
export function privateSession(id: string): PrivateSession | null {
  try {
    return JSON.parse(
      sessionStorage.getItem(`sealwork:private:${id}`) || "null",
    ) as PrivateSession | null;
  } catch {
    return null;
  }
}
export function savePrivate(value: PrivateSession): void {
  try {
    sessionStorage.setItem(
      `sealwork:private:${value.job_id}`,
      JSON.stringify(value),
    );
    window.dispatchEvent(new Event("sealwork-private-updated"));
  } catch {
    throw new Error(
      "Enable browser session storage so you can receive your private delivery.",
    );
  }
}
export class ApiError extends Error {
  constructor(
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
export async function api<T>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    signal: AbortSignal.timeout(240000),
  });
  const result = (await response.json()) as Record<string, unknown>;
  if (!response.ok)
    throw new ApiError(
      typeof result.error === "string"
        ? result.error
        : "This request could not complete.",
      result,
    );
  return result as T;
}
export const post = <T,>(url: string, data: unknown): Promise<T> =>
  api<T>(url, { method: "POST", body: JSON.stringify(data) });
const fallbackBuilds: AgentBuild[] = built.builds
  .filter((build) => build.feature !== "verifier")
  .map((build) => ({
    ...build,
    wasm_url: `/wasm/${build.hash}.wasm`,
    created_at: "0",
    accepted: 0,
    rejected: 0,
    timed_out: 0,
    execution_errors: 0,
    earned: "0",
  }));
interface Data {
  config: PublicConfig | null;
  builds: AgentBuild[];
  jobs: Job[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  toast: (message: string) => void;
}
const Context = createContext<Data | null>(null);
export function DataProvider({ children }: PropsWithChildren) {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const refresh = useCallback(async () => {
    try {
      const value = await api<PublicConfig>("/api/config");
      setConfig(value);
      setError("");
    } catch {
      setError(
        "The testnet connection is temporarily unavailable. Your submitted jobs remain onchain.",
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 5000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    <Context.Provider
      value={{
        config,
        builds: config?.builds.length ? config.builds : fallbackBuilds,
        jobs: config?.jobs || [],
        loading,
        error,
        refresh,
        toast: setNotice,
      }}
    >
      {children}
      {notice && (
        <div className="toast" role="status">
          {notice}
          <button
            aria-label="Dismiss notification"
            onClick={() => setNotice("")}
          >
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  );
}
export function useData(): Data {
  const value = useContext(Context);
  if (!value) throw new Error("Missing workspace context");
  return value;
}
export function downloadJson(name: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2) + "\n"], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
