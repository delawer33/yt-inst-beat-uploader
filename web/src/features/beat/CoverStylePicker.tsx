import { COVER_STYLES, coverStyleName, previewUrl, type CoverStyle } from "./coverStyles";

type Props = {
  beatId: string;
  value: CoverStyle;
  onChange: (style: CoverStyle) => void;
  /** Only a Draft may change its Cover Style. */
  disabled?: boolean;
};

/**
 * One tile per Cover Style, each this Beat's cover as the server renders it in that style.
 * Picking one changes the form; the autosave sends it and the server renders the video again.
 */
export function CoverStylePicker({ beatId, value, onChange, disabled = false }: Props) {
  return (
    <div className="field">
      <span className="group-label" id="cover-style-label">
        Cover style · {coverStyleName(value)}
      </span>
      <div className="style-pick" role="radiogroup" aria-labelledby="cover-style-label">
        {COVER_STYLES.map((style) => (
          <label key={style} className="style-opt" title={coverStyleName(style)}>
            <input
              type="radio"
              name="cover-style"
              value={style}
              checked={value === style}
              disabled={disabled}
              onChange={() => onChange(style)}
            />
            <img src={previewUrl(beatId, style)} alt={coverStyleName(style)} loading="lazy" />
          </label>
        ))}
      </div>
    </div>
  );
}
