import { useState, type KeyboardEvent } from "react";

type Props = {
  tags: string[];
  onChange: (tags: string[]) => void;
  id?: string;
  disabled?: boolean;
};

/**
 * The tag box of the Draft form: every tag is a chip that removes itself when clicked, and
 * a bare entry at the end takes the next one. Enter or a comma commits, Backspace on an
 * empty entry takes the last chip back.
 */
export function TagInput({ tags, onChange, id, disabled = false }: Props) {
  const [draft, setDraft] = useState("");

  function commit(text: string) {
    const next = [...tags];
    for (const raw of text.split(",")) {
      const tag = raw.trim();
      if (tag.length > 0 && !next.includes(tag)) next.push(tag);
    }
    setDraft("");
    if (next.length !== tags.length) onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === "Backspace" && draft === "" && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  }

  return (
    <div className="tag-input">
      {tags.map((tag) => (
        <button
          key={tag}
          type="button"
          className="tag tag-neutral"
          aria-label={`Remove tag ${tag}`}
          disabled={disabled}
          onClick={() => onChange(tags.filter((t) => t !== tag))}
        >
          {tag} ×
        </button>
      ))}
      <input
        id={id}
        className="tag-entry"
        aria-label="Add a tag"
        placeholder="Add a tag"
        value={draft}
        disabled={disabled}
        onChange={(e) =>
          e.target.value.includes(",") ? commit(e.target.value) : setDraft(e.target.value)
        }
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}
