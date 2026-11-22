import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export type AuthErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "NOT_FOUND";

export type UserOwnedTableName =
  | "userSettings"
  | "userExerciseNotes"
  | "workoutTemplates"
  | "templateExercises"
  | "workouts"
  | "workoutExercises"
  | "sets"
  | "exerciseRecords";

// Fails to compile if any table in UserOwnedTableName lacks a `userId` field,
// which keeps the cast in `requireOwnedById` honest.
type AssertAllUserOwnedTablesHaveUserId<T extends { userId: Id<"users"> }> = T;
type VerifiedUserOwnedDoc = AssertAllUserOwnedTablesHaveUserId<
  Doc<UserOwnedTableName>
>;

export async function requireAuthUserId(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new ConvexError({
      code: "UNAUTHENTICATED" satisfies AuthErrorCode,
      message: "You must be signed in to perform this action.",
    });
  }
  return userId;
}

export function requireUserOwnedDoc<T extends { userId: Id<"users"> }>(
  doc: T | null,
  userId: Id<"users">,
  resourceName = "Resource",
): T {
  if (doc === null) {
    throw new ConvexError({
      code: "NOT_FOUND" satisfies AuthErrorCode,
      message: `${resourceName} not found.`,
    });
  }
  if (doc.userId !== userId) {
    throw new ConvexError({
      code: "FORBIDDEN" satisfies AuthErrorCode,
      message: `You do not have access to this ${resourceName}.`,
    });
  }
  return doc;
}

export async function requireOwnedById<TableName extends UserOwnedTableName>(
  ctx: QueryCtx | MutationCtx,
  table: TableName,
  id: Id<TableName>,
  userId: Id<"users">,
): Promise<Doc<TableName>> {
  const doc = (await ctx.db.get(table, id)) as
    (Doc<TableName> & VerifiedUserOwnedDoc) | null;
  return requireUserOwnedDoc(doc, userId, table);
}

export async function requireReadableExercise(
  ctx: QueryCtx | MutationCtx,
  exerciseId: Id<"exercises">,
  userId: Id<"users">,
): Promise<Doc<"exercises">> {
  const exercise = await ctx.db.get("exercises", exerciseId);
  if (exercise === null) {
    throw new ConvexError({
      code: "NOT_FOUND" satisfies AuthErrorCode,
      message: "Exercise not found.",
    });
  }
  if (exercise.userId !== undefined && exercise.userId !== userId) {
    throw new ConvexError({
      code: "FORBIDDEN" satisfies AuthErrorCode,
      message: "You do not have access to this exercise.",
    });
  }
  return exercise;
}

export async function requireEditableExercise(
  ctx: QueryCtx | MutationCtx,
  exerciseId: Id<"exercises">,
  userId: Id<"users">,
): Promise<Doc<"exercises">> {
  const exercise = await ctx.db.get("exercises", exerciseId);
  if (exercise === null) {
    throw new ConvexError({
      code: "NOT_FOUND" satisfies AuthErrorCode,
      message: "Exercise not found.",
    });
  }
  if (exercise.userId === undefined || exercise.userId !== userId) {
    throw new ConvexError({
      code: "FORBIDDEN" satisfies AuthErrorCode,
      message: "You can only modify your own custom exercises.",
    });
  }
  return exercise;
}
