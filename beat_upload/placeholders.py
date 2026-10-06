"""The Placeholder rule: a ``[[...]]`` marker is Metadata that is not written yet.

A Template carries Placeholders and a Draft may keep them while the owner works on it, so
this is not part of the Metadata validator. Only sending refuses them. The web form mirrors
the rule in ``web/src/features/beat/placeholders.ts``.
"""

import re

PLACEHOLDER_OPEN = "[["
# Up to the closing ``]]``, or to the end of the line when the owner deleted it.
_PLACEHOLDER = re.compile(r"\[\[[^\[\]\n]*(?:\]\])?")


def placeholders_in(text: str) -> list[str]:
    """Every Placeholder in ``text``, in order."""
    return _PLACEHOLDER.findall(text)


def fields_with_placeholder(title: str, description: str, tags: list[str]) -> list[str]:
    """Which of ``title``, ``description``, ``tags`` still hold a Placeholder, in that order."""
    fields = {"title": title, "description": description, "tags": "\n".join(tags)}
    return [name for name, text in fields.items() if PLACEHOLDER_OPEN in text]
