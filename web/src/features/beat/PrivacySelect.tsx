import type { Privacy } from "@/features/library/queries";

const options: { value: Privacy; label: string }[] = [
  { value: "private", label: "Private" },
  { value: "unlisted", label: "Unlisted" },
  { value: "public", label: "Public" },
];

type Props = {
  value: Privacy;
  onChange: (privacy: Privacy) => void;
  disabled?: boolean;
  id?: string;
};

/** Native select styled with the design tokens; changes go straight to YouTube. */
export function PrivacySelect({ value, onChange, disabled = false, id }: Props) {
  return (
    <select
      id={id}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as Privacy)}
      className="h-9 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}
