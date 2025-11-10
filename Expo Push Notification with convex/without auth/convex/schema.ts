import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  devices: defineTable({
    pushToken: v.string(),
    deviceId: v.optional(v.string()), // Unique device identifier
    platform: v.optional(v.string()), // ios/android
    appVersion: v.optional(v.string()),
    lastSeen: v.number(), // Timestamp of last activity
    isActive: v.optional(v.boolean()), // Whether device should receive notifications
  })
    .index("pushToken", ["pushToken"])
    .index("deviceId", ["deviceId"]),
  
  // Additional tables can be added here as needed
});