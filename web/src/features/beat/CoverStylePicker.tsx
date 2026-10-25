import {
  COVER_STYLES,
  coverStyleName,
  previewUrl,
  type CoverStyle,
} from "./coverStyles";

type Props = {
  beatId: string;
  value: CoverStyle;
  /** The style the video is (being) rendered in. */
  applied: CoverStyle;
  onChange: (style: CoverStyle) => void;
  /** Render the video again in the picked style. */
  onApply: () => void;
  /** Only a Draft may change its Cover Style. */
  disabled?: boolean;
};

/**
 * One tile per Cover Style, each this Beat's cover as the server renders it in that style.
 * Picking one only previews it; "Apply" saves it and the server renders the video again.
 */
export function CoverStylePicker({
  beatId,
  value,
  applied,
  onChange,
  onApply,
  disabled = false,
}: Props) {
  return (
    <div className="field">
      <span className="group-label" id="cover-style-label">
        Cover style · {coverStyleName(value)}
      </span>
      <div
        className="style-pick"
        role="radiogroup"
        aria-labelledby="cover-style-label"
      >
        {COVER_STYLES.map((style) => (
          <label
            key={style}
            className="style-opt"
            title={coverStyleName(style)}
          >
            <input
              type="radio"
              name="cover-style"
              value={style}
              checked={value === style}
              disabled={disabled}
              onChange={() => onChange(style)}
            />
            <img
              src={previewUrl(beatId, style)}
              alt={coverStyleName(style)}
              loading="lazy"
            />
          </label>
        ))}
      </div>
      {value !== applied && (
        <div className="job-actions">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={disabled}
            onClick={onApply}
          >
            Apply {coverStyleName(value)}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled}
            onClick={() => onChange(applied)}
          >
            Keep {coverStyleName(applied)}
          </button>
        </div>
      )}
    </div>
  );
}
