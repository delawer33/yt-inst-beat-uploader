import { useEffect, useState, type FormEvent } from "react";
import { Field } from "./Field";
import { useSaveSettings, useSettings } from "./queries";

export function parseTags(text: string): string[] {
  return text
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
}

/**
 * Title, description and tag templates. Every new Beat starts from them; `{name}` is
 * replaced by the beat folder's name.
 */
export function TemplatesRow() {
  const settings = useSettings();
  const save = useSaveSettings();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState("");
  const loaded = settings.data;

  useEffect(() => {
    if (!loaded) return;
    setTitle(loaded.title_template);
    setDescription(loaded.description_template);
    setTags(loaded.tags_template.join(", "));
  }, [loaded]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded) return;
    save.mutate({
      stats_hour: loaded.stats_hour,
      title_template: title,
      description_template: description,
      tags_template: parseTags(tags),
    });
  }

  return (
    <section className="settings-row">
      <div className="what">
        <b>Templates</b>
        <p>
          What a new Beat starts with. <span className="num">{"{name}"}</span> becomes the name of
          the dropped beat.
        </p>
      </div>
      <div className="how">
        <form onSubmit={onSubmit} className="flex flex-col gap-3.5">
          <Field label="Title" htmlFor="title_template" hint="{name}">
            <input
              id="title_template"
              name="title_template"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={settings.isPending}
            />
          </Field>
          <Field label="Description" htmlFor="description_template" hint="{name}">
            <textarea
              id="description_template"
              name="description_template"
              className="input"
              rows={5}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={settings.isPending}
            />
          </Field>
          <Field label="Tags (comma separated)" htmlFor="tags_template">
            <input
              id="tags_template"
              name="tags_template"
              className="input"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              disabled={settings.isPending}
            />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              className="btn btn-secondary"
              disabled={save.isPending || settings.isPending}
            >
              {save.isPending ? "Saving…" : "Save"}
            </button>
            {save.isError && (
              <span role="alert" className="text-accent">
                {save.error.message}
              </span>
            )}
            {save.isSuccess && !save.isPending && <span className="text-muted">Saved.</span>}
          </div>
        </form>
      </div>
    </section>
  );
}
