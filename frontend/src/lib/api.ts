const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080/api/v1";
export class ApiError extends Error {
 constructor(message: string, public readonly status: number, public readonly details: unknown = null) { super(message); }
}
export async function request<T>(path: string, token: string, method = "GET", body?: unknown, signal?: AbortSignal, timeoutMs = 60000): Promise<T> {
 const timeout = AbortSignal.timeout(timeoutMs);
 let response: Response;
 try {
  response = await fetch(API_URL + path, { method, headers: { Authorization: "Bearer " + token, ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cache: "no-store" });
 } catch (error) {
  if (signal?.aborted) throw error;
  throw new ApiError(timeout.aborted ? "การเชื่อมต่อหมดเวลา กรุณาลองใหม่" : "เชื่อมต่อ API ไม่สำเร็จ", 0);
 }
 const data = await response.json();
 if (!response.ok) throw new ApiError(data.error?.message ?? "ไม่สามารถดำเนินการได้", response.status, data.report);
 return data as T;
}

