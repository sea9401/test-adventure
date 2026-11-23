"use client";

import { useEffect, useMemo, useState } from "react";

// 직접 등록할 이미지를 적용 전에 보여 준다. 서버가 가운데 기준 정사각형으로 자르므로
// 같은 방식(object-cover)으로 그려 실제 등록 결과와 맞춘다. 틀 모양은 GuildEmblemImage 와 같다.
export function GuildEmblemUploadPreview({ file }: { file: File | null }) {
  const previewUrl = useMemo(
    () => (file ? URL.createObjectURL(file) : null),
    [file],
  );
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const showImage = previewUrl !== null && failedUrl !== previewUrl;

  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-300 bg-zinc-100 text-center text-xs leading-tight text-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
      {showImage ? (
        // 선택한 파일의 blob 주소라 next/image 최적화 대상이 아니다.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewUrl}
          alt="적용할 엠블럼 미리보기"
          className="h-full w-full object-cover"
          onError={() => setFailedUrl(previewUrl)}
        />
      ) : (
        <span className="px-1">
          {previewUrl ? "열 수 없는 이미지" : "미리보기"}
        </span>
      )}
    </div>
  );
}
