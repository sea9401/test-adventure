"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AdminRole = "readonly" | "reward" | "sanction" | "super";

type AdminCapabilities = {
  read: boolean;
  reward: boolean;
  sanction: boolean;
  super: boolean;
};

type AdminMe = {
  email: string;
  role: AdminRole | null;
  capabilities: AdminCapabilities;
  roleConfig: Record<AdminRole, number>;
};

type AdminContextValue = {
  readOnly: boolean;
  setReadOnly: (next: boolean) => void;
  adminMe: AdminMe | null;
  loadingAdminMe: boolean;
  // 어드민에서 localStorage 변경이 일어났음을 다른 탭/컴포넌트에 알리는 카운터.
  // 각 탭은 이 값을 의존해 데이터를 다시 load 한다.
  bumpVersion: number;
  bump: () => void;
  toast: string | null;
  showToast: (text: string) => void;
};

const Ctx = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [readOnly, setReadOnly] = useState(true);
  const [adminMe, setAdminMe] = useState<AdminMe | null>(null);
  const [loadingAdminMe, setLoadingAdminMe] = useState(true);
  const [bumpVersion, setBumpVersion] = useState(0);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch("/api/admin/me")
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json: { ok?: boolean } & AdminMe) => {
        if (alive && json.ok) setAdminMe(json);
      })
      .catch(() => {
        if (alive) setAdminMe(null);
      })
      .finally(() => {
        if (alive) setLoadingAdminMe(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const bump = useCallback(() => {
    setBumpVersion((v) => v + 1);
  }, []);

  const showToast = useCallback((text: string) => {
    setToast(text);
    setTimeout(() => setToast(null), 2500);
  }, []);

  const value = useMemo(
    () => ({
      readOnly,
      setReadOnly,
      adminMe,
      loadingAdminMe,
      bumpVersion,
      bump,
      toast,
      showToast,
    }),
    [readOnly, adminMe, loadingAdminMe, bumpVersion, bump, toast, showToast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin must be used inside <AdminProvider>");
  return v;
}
