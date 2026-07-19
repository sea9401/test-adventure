import Image from "next/image";
import {
  FARM_ITEMS,
  type FarmItemId,
} from "@/adventure/v2/farm";

export function FarmItemIcon({
  itemId,
  label,
  className = "h-12 w-12",
}: {
  itemId: FarmItemId;
  label?: string;
  className?: string;
}) {
  const item = FARM_ITEMS[itemId];

  return (
    <span
      role="img"
      aria-label={label ?? item.name}
      className={`relative block shrink-0 overflow-hidden rounded-md border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-700 dark:bg-zinc-900 ${className}`}
    >
      {item.imageSrc ? (
        <Image
          src={item.imageSrc}
          alt=""
          fill
          sizes="64px"
          unoptimized
          className="object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-full w-full items-center justify-center text-[1.75rem]"
        >
          {item.icon}
        </span>
      )}
    </span>
  );
}
