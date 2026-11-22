import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import {
  equipmentValidator,
  muscleGroupValidator,
  setTypeValidator,
  weightUnitValidator,
  workoutStatusValidator,
} from "./lib/validators";

export default defineSchema({
  users: defineTable({}),

  userSettings: defineTable({
    userId: v.id("users"),
    unit: weightUnitValidator,
    defaultRestSeconds: v.number(),
    onboardingCompleted: v.boolean(),
  }).index("by_user", ["userId"]),

  exercises: defineTable({
    userId: v.optional(v.id("users")),
    slug: v.optional(v.string()),
    name: v.string(),
    muscleGroup: muscleGroupValidator,
    equipment: equipmentValidator,
    isBodyweight: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_muscleGroup", ["muscleGroup"])
    .index("by_slug", ["slug"]),

  userExerciseNotes: defineTable({
    userId: v.id("users"),
    exerciseId: v.id("exercises"),
    notes: v.string(),
  }).index("by_user_exercise", ["userId", "exerciseId"]),

  workoutTemplates: defineTable({
    userId: v.id("users"),
    title: v.string(),
    sortOrder: v.number(),
    lastPerformedAt: v.optional(v.number()),
  }).index("by_user_order", ["userId", "sortOrder"]),

  templateExercises: defineTable({
    userId: v.id("users"),
    templateId: v.id("workoutTemplates"),
    exerciseId: v.id("exercises"),
    orderIndex: v.number(),
    targetSets: v.number(),
    targetReps: v.optional(v.string()),
    restSeconds: v.number(),
  })
    .index("by_template_order", ["templateId", "orderIndex"])
    .index("by_user_exercise", ["userId", "exerciseId"]),

  workouts: defineTable({
    userId: v.id("users"),
    templateId: v.optional(v.id("workoutTemplates")),
    title: v.string(),
    status: workoutStatusValidator,
    startedAt: v.number(),
    finishedAt: v.optional(v.number()),
    notes: v.optional(v.string()),
    restTimerEndsAt: v.optional(v.number()),
  })
    .index("by_user_status", ["userId", "status"])
    .index("by_user_finishedAt", ["userId", "finishedAt"]),

  workoutExercises: defineTable({
    userId: v.id("users"),
    workoutId: v.id("workouts"),
    exerciseId: v.id("exercises"),
    orderIndex: v.number(),
    restSeconds: v.number(),
    workoutStatus: workoutStatusValidator,
    completedAt: v.optional(v.number()),
  })
    .index("by_workout_order", ["workoutId", "orderIndex"])
    .index("by_user_exercise_completedAt", [
      "userId",
      "exerciseId",
      "completedAt",
    ]),

  sets: defineTable({
    userId: v.id("users"),
    workoutId: v.id("workouts"),
    workoutExerciseId: v.id("workoutExercises"),
    exerciseId: v.id("exercises"),
    setNumber: v.number(),
    setType: setTypeValidator,
    weightKg: v.number(),
    enteredUnit: weightUnitValidator,
    reps: v.number(),
    completed: v.boolean(),
    completedAt: v.optional(v.number()),
  })
    .index("by_workoutExercise_number", ["workoutExerciseId", "setNumber"])
    .index("by_user_exercise_completedAt", [
      "userId",
      "exerciseId",
      "completedAt",
    ])
    .index("by_workout", ["workoutId"]),

  exerciseRecords: defineTable({
    userId: v.id("users"),
    exerciseId: v.id("exercises"),
    bestWeightKg: v.optional(v.number()),
    bestE1rmKg: v.optional(v.number()),
    bestSessionVolumeKg: v.optional(v.number()),
    bestBodyweightReps: v.optional(v.number()),
    bestBodyweightSessionReps: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_user_exercise", ["userId", "exerciseId"]),
});
