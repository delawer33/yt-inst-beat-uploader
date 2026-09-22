import { JobList } from "@/features/jobs/JobList";

export function LibraryPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-semibold">Library</h1>
      <JobList />
    </div>
  );
}
