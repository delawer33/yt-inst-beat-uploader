/** Turn an openapi-fetch result into data-or-throw, with the server's `detail` as message. */
export async function unwrap<T>(promise: Promise<{ data?: T; error?: unknown }>): Promise<T> {
  const { data, error } = await promise;
  if (error !== undefined || data === undefined) {
    throw new Error(describe(error));
  }
  return data;
}

export function describe(error: unknown): string {
  if (error && typeof error === "object" && "detail" in error) {
    const detail = (error as { detail: unknown }).detail;
    if (typeof detail === "string") return detail;
  }
  return "Request failed";
}
