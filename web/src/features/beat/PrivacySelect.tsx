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
};

/** Native select styled with the design tokens, like the one in YouTube Studio. */
export function PrivacySelect({ value, onChange, allowScheduled = false, disabled = false, id }: Props) {
  const shown = allowScheduled ? options : options.filter((o) => o.value !== "scheduled");
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as PrivacyChoice)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {shown.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
