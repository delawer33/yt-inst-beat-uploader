import type { Privacy } from "@/features/library/queries";

/** The three YouTube privacies plus Scheduled: private with a publish time (ADR 0003). */
export type PrivacyChoice = Privacy | "scheduled";

const options: { value: PrivacyChoice; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
  { value: "scheduled", label: "Scheduled" },
];

type Props = {
  value: PrivacyChoice;
  onChange: (choice: PrivacyChoice) => void;
  /** Offer "Scheduled" too; the caller then shows the publish-time field. */
  allowScheduled?: boolean;
  disabled?: boolean;
  id?: string;
  "aria-label"?: string;
};

/** Native select in the Design System's `.input` skin, like the one in YouTube Studio. */
export function PrivacySelect({
  value,
  onChange,
  allowScheduled = false,
  disabled = false,
  id,
  "aria-label": ariaLabel,
}: Props) {
  const shown = allowScheduled ? options : options.filter((o) => o.value !== "scheduled");
  return (
    <select
      id={id}
      aria-label={ariaLabel}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PrivacyChoice)}
      className="input"
    >
      {shown.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
