import { formatDateTime } from "@/lib/format";
import { coverStyleName, previewUrl, type CoverStyle } from "./coverStyles";
import { sharedTags, titleFit, type SharedTags } from "./metadata";

type Props = {
  title: string;
  tags: string[];
  /** The Cover Style the video will have; null when the Beat has no cover to render. */
  coverStyle: CoverStyle | null;
  /** The plain cover, shown when the server could not render the still. */
  coverUrl: string | null;
  /** The channel from the connection, when there is one; nothing is shown otherwise. */
  channel: string | null;
  /** UTC ISO publish time when the Draft is scheduled, else null. */
  publishAt: string | null;
  /** The rest of the Library, for "Tags shared with". */
  library: { id: string; title: string; tags: string[] }[];
  beatId: string;
};

/**
 * How the video will look on YouTube while it is still a Draft: its first frame as the server
 * renders it (cover in its Cover Style, the Label, letterboxed in 16:9), the title as typed, the channel, the schedule — then the facts that decide
 * whether it reads well in a search result.
 */
export function YouTubePreview({
  title,
  tags,
  coverStyle,
  coverUrl,
  channel,
  publishAt,
  library,
  beatId,
}: Props) {
  const fit = titleFit(title);
  const shared: SharedTags | null = sharedTags(tags, library, beatId);
  const line = [channel, publishAt ? `Scheduled ${formatDateTime(publishAt)}` : null]
    .filter((part) => part !== null)
    .join(" · ");

  return (
    <>
      <div className="label">As it will appear on YouTube</div>
      <div className="flex flex-col gap-2.5">
        <div className="yt-frame">
          {coverStyle && (
            <img
              src={previewUrl(beatId, coverStyle)}
              alt=""
              onError={(e) => {
                if (coverUrl && !e.currentTarget.src.endsWith(coverUrl)) e.currentTarget.src = coverUrl;
              }}
            />
          )}
        </div>
        <div className="yt-meta">
          <div className="thumb md" />
          <div className="flex flex-col gap-0.5">
            <div className="yt-title">{title || "Untitled"}</div>
            {line && <div className="text-muted num">{line}</div>}
          </div>
        </div>
      </div>
      <hr className="hr" />
      <div className="flex flex-col gap-2">
        <div className="fact-row">
          <span className="text-muted">Search result title</span>
          <span>
            {fit.verdict} · <span className="num">{fit.chars}</span> chars
          </span>
        </div>
        {coverStyle && (
          <div className="fact-row">
            <span className="text-muted">Cover in 16:9 frame</span>
            <span>{coverStyleName(coverStyle)}, label, letterboxed</span>
          </div>
        )}
        {shared && (
          <div className="fact-row">
            <span className="text-muted">Tags shared with “{shared.title}”</span>
            <span className="num">
              {shared.shared} of {shared.total}
            </span>
          </div>
        )}
      </div>
    </>
  );
}
