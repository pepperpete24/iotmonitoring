/**
 * The boundary between the UI and data. The UI only ever calls `transport`.
 * MockTransport answers from the in-browser mock world with 80 to 250 ms of
 * latency; an HttpTransport for the FastAPI backend replaces it later.
 */
import { handle } from "@/mock/server";
import { mulberry32 } from "@/mock/seed";

export interface Transport {
  get<T>(path: string): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

class MockTransport implements Transport {
  private rand = mulberry32(0x7d3a);
  private latency() {
    return 80 + Math.round(this.rand() * 170);
  }
  private async respond<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
    await new Promise((r) => setTimeout(r, this.latency()));
    const res = handle(method, path, body);
    if (res.status >= 400) throw new ApiError(res.status, String(res.body));
    return structuredClone(res.body) as T;
  }
  get<T>(path: string) {
    return this.respond<T>("GET", path);
  }
  post<T>(path: string, body: unknown) {
    return this.respond<T>("POST", path, body);
  }
}

export const transport: Transport = new MockTransport();
