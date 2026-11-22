import { ConvexError } from "convex/values";

export function getConvexErrorCode(error: unknown): string | null {
  if (error instanceof ConvexError) {
    const data: unknown = error.data;
    if (
      typeof data === "object" &&
      data !== null &&
      "code" in data &&
      typeof data.code === "string" &&
      data.code.trim().length > 0
    ) {
      return data.code;
    }
  }
  return null;
}

export function isUnauthenticatedConvexError(error: unknown): boolean {
  return getConvexErrorCode(error) === "UNAUTHENTICATED";
}

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
  return fallback;
}
