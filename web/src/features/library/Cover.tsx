import { useState } from "react";
import { Music } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = { src: string | null; title: string; className?: string };

/** 16:9 cover image; a placeholder when there is no cover or it fails to load. */
export function Cover({ src, title, className }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = src !== null && !failed;
  return (
    <div
      className={cn(
        "flex aspect-video w-full items-center justify-center overflow-hidden bg-muted",
        className,
      )}
    >
      {showImage ? (
        <img
          src={src}
          alt={`Cover of ${title}`}
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <Music aria-hidden="true" className="size-10 text-muted-foreground" />
      )}
    </div>
  );
}
