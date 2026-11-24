import type { Effect } from "./queries";

type Props = {
  effects: Effect[];
  value: string;
  /** The Effect the Reel is (being) rendered in. */
  applied: string;
  onChange: (effect: string) => void;
  /** Render the Reel again in the picked Effect. */
  onApply: () => void;
  /** While a save is on its way. */
  disabled?: boolean;
};

function nameOf(effects: Effect[], id: string): string {
  return effects.find((e) => e.id === id)?.name ?? id;
}

/**
 * One radio per Effect with its name and what it does. The Effect moves the Reel, the video
 * for Instagram; the YouTube video stays Still (ADR 0012). Picking one only marks it;
 * "Apply" saves it and the server renders the Reel again (an Effect that moves takes
 * minutes: every frame is drawn).
 */
export function EffectPicker({
  effects,
  value,
  applied,
  onChange,
  onApply,
  disabled = false,
}: Props) {
  return (
    <div className="field">
      <span className="group-label" id="effect-label">
        Effect · {nameOf(effects, value)}
      </span>
      <span className="text-soft">
        How the Reel for Instagram moves. The YouTube video stays the cover in its Cover
        Style.
      </span>
      <div
        className="flex flex-col gap-2"
        role="radiogroup"
        aria-labelledby="effect-label"
      >
        {effects.map((effect) => (
          <label key={effect.id} className="radio items-start">
            <input
              type="radio"
              name="effect"
              value={effect.id}
              checked={value === effect.id}
              disabled={disabled}
              onChange={() => onChange(effect.id)}
            />
            <span className="dot mt-0.5" />
            <span className="flex flex-col">
              <span>{effect.name}</span>
              <span className="text-soft">{effect.blurb}</span>
            </span>
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
            Apply {nameOf(effects, value)}
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            disabled={disabled}
            onClick={() => onChange(applied)}
          >
            Keep {nameOf(effects, applied)}
          </button>
        </div>
      )}
    </div>
  );
}
