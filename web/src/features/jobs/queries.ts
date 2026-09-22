import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { applyJobEvent, jobKey, jobsKey, type Job } from "@/api/events";
import { unwrap } from "@/api/unwrap";

/** All recent jobs, or the jobs of one beat. Live-patched by `useEvents`. */
export function useJobs(beatId?: string) {
  return useQuery({
    queryKey: beatId ? [...jobsKey, { beatId }] : jobsKey,
    queryFn: () =>
      unwrap(api.GET("/api/jobs", { params: { query: beatId ? { beat_id: beatId } : {} } })),
  });
}

export function useJob(id: string) {
  return useQuery({
    queryKey: jobKey(id),
    queryFn: () => unwrap(api.GET("/api/jobs/{job_id}", { params: { path: { job_id: id } } })),
  });
}

function useJobMutation<TVars>(run: (vars: TVars) => Promise<Job>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: run,
    onSuccess: (job) => applyJobEvent(queryClient, job),
  });
}

export function useRetryJob() {
  return useJobMutation((id: string) =>
    unwrap(api.POST("/api/jobs/{job_id}/retry", { params: { path: { job_id: id } } })),
  );
}

export function useTriggerSync() {
  return useJobMutation(() => unwrap(api.POST("/api/sync")));
}
