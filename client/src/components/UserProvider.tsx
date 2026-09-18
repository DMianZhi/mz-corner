import { createContext, useContext, useState, useEffect } from "react";
import type { ReactNode } from "react";
import { wps365 } from "@/utils";

export interface WpsUserInfo {
  id: string;
  user_name: string;
  avatar: string;
  company_id: string;
  ex_user_id: string;
}

interface UserContextValue {
  user: WpsUserInfo | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function useCurrentUser() {
  const ctx = useContext(UserContext);
  if (!ctx) {
    throw new Error("useCurrentUser must be used within a UserProvider");
  }
  return ctx;
}

async function fetchCurrentUser(): Promise<WpsUserInfo> {
  const raw = await wps365.request.get<{ code: number; msg?: string; message?: string; data: WpsUserInfo }>(
    "/v7/users/current",
  );
  if (raw.code !== undefined && raw.code !== 0) {
    throw new Error(
      `WPS API error ${raw.code}: ${raw.msg ?? raw.message ?? "unknown"}`,
    );
  }
  return raw.data;
}

export function UserProvider(props: { children: ReactNode }) {
  const [user, setUser] = useState<WpsUserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = () => {
    setLoading(true);
    setError(null);
    fetchCurrentUser()
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
  }, []);

  return (
    <UserContext value={{ user, loading, error, refetch }}>
      {props.children}
    </UserContext>
  );
}
