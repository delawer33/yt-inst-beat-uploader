import type { ReactNode } from "react";

type Props = {
  label: string;
  htmlFor: string;
  hint?: ReactNode;
  children: ReactNode;
};

/** The Design System `.field`: a label (with an optional right-hand `.counter`) over a control. */
export function Field({ label, htmlFor, hint, children }: Props) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>
        {label}
        {hint && (
          <span className="counter text-muted">{hint}</span>
        )}
      </label>
      {children}
    </div>
  );
}
