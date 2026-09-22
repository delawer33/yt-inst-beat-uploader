import createClient from "openapi-fetch";
import type { paths } from "./schema";

// Same origin: FastAPI serves the SPA and the API; in dev, vite proxies /api.
export const api = createClient<paths>({ baseUrl: "" });
