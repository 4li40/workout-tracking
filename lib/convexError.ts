import { ConvexError } from "convex/values";

export function getConvexErrorMessage(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (typeof data === "string" && data.trim().length > 0) {
      return data;
    }
    if (
      typeof data === "object" &&
      data !== null &&
      "message" in data &&
      typeof data.message === "string" &&
      data.message.trim().length > 0
    ) {
      return data.message;
    }
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return fallback;
}
