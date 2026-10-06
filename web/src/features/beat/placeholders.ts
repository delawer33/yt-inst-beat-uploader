// Mirrors beat_upload/placeholders.py: a `[[...]]` marker is Metadata not written yet. The
// server refuses to send a Beat that holds one; the form says so before the owner tries.

const OPEN = "[[";
// Up to the closing `]]`, or to the end of the line when the owner deleted it.
const PLACEHOLDER = /\[\[[^[\]\n]*(?:\]\])?/g;

export function placeholdersIn(text: string): string[] {
  return text.match(PLACEHOLDER) ?? [];
}

/** The hint under Fill from title: the title is the input, so it has to be clean first. */
export function fillHint(title: string): string | null {
  const [first] = placeholdersIn(title);
  return first === undefined ? null : `Title still has ${first}`;
}

/** The hint under the send button, naming the fields that still hold a Placeholder. */
export function sendHint(form: { title: string; description: string; tags: string[] }): string | null {
  const fields = (
    [
      ["title", form.title],
      ["description", form.description],
      ["tags", form.tags.join("\n")],
    ] as const
  )
    .filter(([, text]) => text.includes(OPEN))
    .map(([name]) => name);
  if (fields.length === 0) return null;
  const last = fields.pop();
  const where = fields.length === 0 ? last : `${fields.join(", ")} and ${last}`;
  return `Fill the placeholders in the ${where}`;
}
