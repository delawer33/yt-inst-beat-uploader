import type { components } from "@/api/schema";

export type CoverStyle = components["schemas"]["CoverStyle"];

/** Every Cover Style in picker order, default first. The record makes the compiler refuse a
 * style the server adds and this list forgets. */
const NAMES: Record<CoverStyle, string> = {
  purple_yellow_5tone: "Purple Yellow 5-tone",
  purple_yellow_thick_ink: "Purple Yellow Thick Ink",
  golden_wind: "Golden Wind",
  dio_green: "Dio Green",
  diamond_pink_cyan: "Diamond Pink Cyan",
  stone_ocean: "Stone Ocean",
  blood_3tone: "Blood 3-tone",
};

export const COVER_STYLES = Object.keys(NAMES) as CoverStyle[];

export function coverStyleName(style: CoverStyle): string {
  return NAMES[style];
}

/** The first frame of the video in `style`: cover, Cover Style and Label, as the server
 * renders it. */
export function previewUrl(beatId: string, style: CoverStyle): string {
  return `/api/beats/${beatId}/preview/${style}`;
}
