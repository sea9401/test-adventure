"use client";

import { useEffect, useRef, useState } from "react";
import { ImageSquare, Ticket } from "@phosphor-icons/react";
import { AvatarPicker, type AvatarCategory } from "@/adventure/profile/AvatarPicker";
import {
  PROFILE_IMAGE_MAX_BYTES,
  avatarImageSrc,
  type Avatar,
} from "@/adventure/profile/avatars";
import { Card } from "@/components/ui/Card";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SURFACE_INSET } from "@/components/ui/surfaces";
import { useGameState } from "./GameStateProvider";

type LoadState = {
  avatar: Avatar;
  permits: number;
  gameAvatarCooldownUntil: number | null;
};

const ERROR_TEXT: Record<string, string> = {
  permit_not_owned: "직접 이미지 등록에는 프로필 이미지 변경권이 필요합니다. 무슨 코인 상점에서 구매해 주세요.",
  game_avatar_cooldown: "게임 내 이미지는 24시간에 한 번 변경할 수 있습니다.",
  unchanged: "현재 사용 중인 이미지입니다.",
  invalid_avatar: "선택할 수 없는 이미지입니다.",
  invalid_file: "등록할 이미지 파일을 선택해 주세요.",
  not_image: "JPG, PNG, WebP 이미지 파일만 등록할 수 있습니다.",
  image_too_large: "이미지는 2MB 이하여야 합니다.",
  image_dimensions:
    "이미지는 프레임당 가로·세로 4096px, 애니메이션은 120프레임 이하여야 합니다.",
  storage_unavailable: "이미지 저장소를 준비 중입니다. 잠시 후 다시 시도해 주세요.",
  storage_error: "이미지 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
};

export function ProfileImagePanel() {
  const { refreshGameState } = useGameState();
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<LoadState | null>(null);
  const [category, setCategory] = useState<AvatarCategory>("character");
  const [selected, setSelected] = useState<Avatar | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/profile/avatar", { cache: "no-store" })
      .then(async (res) => {
        const json = (await res.json()) as LoadState & { ok?: boolean };
        if (!res.ok || !json.ok) throw new Error("load_failed");
        if (!cancelled) {
          setState({
            avatar: json.avatar,
            permits: json.permits,
            gameAvatarCooldownUntil: json.gameAvatarCooldownUntil ?? null,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setNotice({ kind: "error", text: "프로필 정보를 불러오지 못했습니다." });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const applyGameImage = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ avatar: selected }),
      });
      const json = (await res.json().catch(() => null)) as
        | {
            ok?: boolean;
            error?: string;
            avatar?: Avatar;
            permits?: number;
            gameAvatarCooldownUntil?: number | null;
          }
        | null;
      if (!res.ok || !json?.ok || !json.avatar) {
        if (typeof json?.gameAvatarCooldownUntil === "number") {
          setState((current) =>
            current
              ? {
                  ...current,
                  gameAvatarCooldownUntil: json.gameAvatarCooldownUntil ?? null,
                }
              : current,
          );
        }
        throw new Error(json?.error ?? "change_failed");
      }
      setState({
        avatar: json.avatar,
        permits: json.permits ?? state?.permits ?? 0,
        gameAvatarCooldownUntil: json.gameAvatarCooldownUntil ?? null,
      });
      setSelected(null);
      setNotice({
        kind: "ok",
        text: "게임 내 프로필 이미지로 변경했습니다. 24시간 후 다시 변경할 수 있습니다.",
      });
      await refreshGameState().catch(() => undefined);
    } catch (error) {
      const code = error instanceof Error ? error.message : "change_failed";
      setNotice({ kind: "error", text: ERROR_TEXT[code] ?? "변경에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  };

  const uploadCustomImage = async () => {
    if (!file || busy) return;
    setBusy(true);
    setNotice(null);
    try {
      const form = new FormData();
      form.set("image", file);
      const res = await fetch("/api/profile/image", { method: "POST", body: form });
      const json = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; avatar?: Avatar; permits?: number }
        | null;
      if (!res.ok || !json?.ok || !json.avatar) {
        throw new Error(json?.error ?? "upload_failed");
      }
      setState((current) => ({
        avatar: json.avatar!,
        permits: json.permits ?? 0,
        gameAvatarCooldownUntil: current?.gameAvatarCooldownUntil ?? null,
      }));
      setFile(null);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      setNotice({ kind: "ok", text: "직접 등록한 이미지로 변경했습니다. 변경권 1개가 사용되었습니다." });
      await refreshGameState().catch(() => undefined);
    } catch (error) {
      const code = error instanceof Error ? error.message : "upload_failed";
      setNotice({ kind: "error", text: ERROR_TEXT[code] ?? "등록에 실패했습니다. 잠시 후 다시 시도해 주세요." });
    } finally {
      setBusy(false);
    }
  };

  const gameAvatarCooldownMs = Math.max(
    0,
    (state?.gameAvatarCooldownUntil ?? 0) - now,
  );
  const gameAvatarCooldownActive = gameAvatarCooldownMs > 0;
  const cooldownTotalMinutes = Math.ceil(gameAvatarCooldownMs / (60 * 1_000));
  const cooldownHours = Math.floor(cooldownTotalMinutes / 60);
  const cooldownMinutes = cooldownTotalMinutes % 60;
  const gameAvatarCooldownLabel =
    cooldownHours > 0
      ? `${cooldownHours}시간${cooldownMinutes > 0 ? ` ${cooldownMinutes}분` : ""}`
      : `${Math.max(1, cooldownMinutes)}분`;

  return (
    <div className="space-y-3">
      {notice ? <StatusBanner tone={notice.kind === "ok" ? "success" : "error"}>{notice.text}</StatusBanner> : null}

      <Card className="flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
          {state ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatarImageSrc(state.avatar)} alt="현재 프로필" className="h-full w-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0">
          <div className="font-semibold">현재 프로필 이미지</div>
          <div className="mt-1 flex items-center gap-1 text-sm text-amber-700 dark:text-amber-300">
            <Ticket size={17} weight="duotone" /> 변경권 {state?.permits ?? 0}개
          </div>
          <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">변경권은 직접 이미지를 등록할 때만 1개가 사용됩니다.</p>
        </div>
      </Card>

      <Card>
        <h2 className="flex items-center gap-1.5 font-semibold"><ImageSquare size={20} weight="duotone" /> 직접 이미지 등록</h2>
        <p className="mb-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">JPG·PNG·WebP(움직이는 WebP 포함), 2MB 이하. 중앙을 기준으로 정사각형 이미지로 변환됩니다.</p>
        <div className={`${SURFACE_INSET} flex items-center gap-3 p-3`}>
          <div className="h-16 w-16 shrink-0 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={previewUrl} alt="등록 이미지 미리보기" className="h-full w-full object-cover" />
            ) : null}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
            onChange={(event) => {
              const next = event.target.files?.[0] ?? null;
              if (next && (!["image/jpeg", "image/png", "image/webp"].includes(next.type) || next.size > PROFILE_IMAGE_MAX_BYTES)) {
                event.target.value = "";
                setFile(null);
                setPreviewUrl(null);
                setNotice({ kind: "error", text: next.size > PROFILE_IMAGE_MAX_BYTES ? ERROR_TEXT.image_too_large : ERROR_TEXT.not_image });
                return;
              }
              setFile(next);
              setPreviewUrl(next ? URL.createObjectURL(next) : null);
              setNotice(null);
            }}
            className="min-w-0 flex-1 text-xs file:mr-2 file:rounded file:border-0 file:bg-zinc-700 file:px-2.5 file:py-1.5 file:text-white dark:file:bg-zinc-200 dark:file:text-zinc-900"
          />
        </div>
        <button
          type="button"
          onClick={() => void uploadCustomImage()}
          disabled={busy || !file || (state?.permits ?? 0) < 1}
          className="mt-3 w-full rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
        >
          {busy ? "등록 중…" : "직접 등록 이미지로 변경"}
        </button>
      </Card>

      <Card>
        <h2 className="font-semibold">게임 내 이미지</h2>
        <p className="mb-3 mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          변경권 없이 캐릭터·NPC·몬스터 이미지 중에서 선택할 수 있습니다. 변경 후 24시간의
          대기 시간이 적용됩니다.
        </p>
        <AvatarPicker category={category} onCategoryChange={setCategory} selected={selected} onSelect={setSelected} />
        {gameAvatarCooldownActive ? (
          <p className="mt-3 text-center text-xs font-medium text-amber-700 dark:text-amber-300">
            다시 변경할 수 있을 때까지 {gameAvatarCooldownLabel}
          </p>
        ) : null}
        <button
          type="button"
          onClick={() => void applyGameImage()}
          disabled={busy || !selected || gameAvatarCooldownActive}
          className="mt-3 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy
            ? "변경 중…"
            : gameAvatarCooldownActive
              ? `${gameAvatarCooldownLabel} 후 변경 가능`
              : "선택한 이미지로 변경"}
        </button>
      </Card>
    </div>
  );
}
