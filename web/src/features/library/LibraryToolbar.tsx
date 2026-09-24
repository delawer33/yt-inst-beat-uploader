import { LayoutGrid, List } from "lucide-react";
import { FILTERS, SORTS, type Filter, type Sort, type View } from "./filters";
import type { Prefs } from "./prefs";

type Props = {
  prefs: Prefs;
  counts: Record<Filter, number>;
  onChange: (patch: Partial<Prefs>) => void;
};

const VIEWS: { id: View; label: string; icon: typeof LayoutGrid }[] = [
  { id: "grid", label: "Grid view", icon: LayoutGrid },
  { id: "list", label: "List view", icon: List },
];

/** Mockup 1b/1c: filter by status with counts, sort, and the grid/list switch. */
export function LibraryToolbar({ prefs, counts, onChange }: Props) {
  return (
    <div className="toolbar">
      <div className="seg">
        {FILTERS.map((filter) => (
          <label className="seg-opt" key={filter.id}>
            <input
              type="radio"
              name="library-filter"
              checked={prefs.filter === filter.id}
              onChange={() => onChange({ filter: filter.id })}
            />
            {filter.label}
            {filter.id !== "all" && <span className="num text-muted">{counts[filter.id]}</span>}
          </label>
        ))}
      </div>
      <div className="toolbar-end">
        <span className="text-muted">Sort</span>
        <div className="seg">
          {SORTS.map((sort: { id: Sort; label: string }) => (
            <label className="seg-opt" key={sort.id}>
              <input
                type="radio"
                name="library-sort"
                checked={prefs.sort === sort.id}
                onChange={() => onChange({ sort: sort.id })}
              />
              {sort.label}
            </label>
          ))}
        </div>
        <div className="seg icon">
          {VIEWS.map((view) => (
            <label className="seg-opt" key={view.id}>
              <input
                type="radio"
                name="library-view"
                aria-label={view.label}
                checked={prefs.view === view.id}
                onChange={() => onChange({ view: view.id })}
              />
              <view.icon aria-hidden="true" size={14} />
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
