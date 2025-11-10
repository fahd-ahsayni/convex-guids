import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Helper function to get current user
async function getCurrentUser(ctx: any) {
  const userId = await getAuthUserId(ctx);
  if (!userId) {
    return null;
  }
  return await ctx.db.get(userId);
}

// Initialize the push notifications component
const pushNotifications = new PushNotifications<Id<"users">>(
  components.pushNotifications,
  {
    logLevel: "INFO",
  }
);

/**
 * Record a push notification token for the current authenticated user
 */
export const recordPushToken = mutation({
  args: {
    token: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError("User must be authenticated to record push token");
    }

    // Store the token in the component's system
    await pushNotifications.recordToken(ctx, {
      userId: user._id,
      pushToken: args.token,
    });

    // Also store in user record for convenience
    await ctx.db.patch(user._id, {
      pushToken: args.token,
    });

    return null;
  },
});

/**
 * Remove push notification token for the current user
 */
export const removePushToken = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError("User must be authenticated");
    }

    await pushNotifications.removeToken(ctx, {
      userId: user._id,
    });

    // Also remove from user record
    await ctx.db.patch(user._id, {
      pushToken: undefined,
    });

    return null;
  },
});

/**
 * Send a push notification to a specific user
 */
export const sendNotificationToUser = mutation({
  args: {
    recipientId: v.id("users"),
    title: v.string(),
    body: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError("User must be authenticated to send notifications");
    }

    const recipient = await ctx.db.get(args.recipientId);
    if (!recipient) {
      throw new ConvexError("Recipient not found");
    }

    // Send the notification
    const notificationId = await pushNotifications.sendPushNotification(ctx, {
      userId: args.recipientId,
      notification: {
        title: args.title,
        body: args.body,
        data: args.data,
        sound: "default",
        priority: "high",
      },
      allowUnregisteredTokens: true, // Don't throw error if user has no token
    });

    return notificationId;
  },
});

/**
 * Get push notification status for the current user
 */
export const getMyPushStatus = query({
  args: {},
  returns: v.object({
    hasToken: v.boolean(),
    paused: v.boolean(),
  }),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      return { hasToken: false, paused: false };
    }

    const status = await pushNotifications.getStatusForUser(ctx, {
      userId: user._id,
    });

    return status;
  },
});

/**
 * Pause push notifications for the current user
 */
export const pauseMyNotifications = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError("User must be authenticated");
    }

    await pushNotifications.pauseNotificationsForUser(ctx, {
      userId: user._id,
    });

    return null;
  },
});

/**
 * Resume push notifications for the current user
 */
export const resumeMyNotifications = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError("User must be authenticated");
    }

    await pushNotifications.unpauseNotificationsForUser(ctx, {
      userId: user._id,
    });

    return null;
  },
});

/**
 * Send a broadcast notification to all users with push tokens
 * Note: This function can be called without authentication for system-wide broadcasts
 */
export const sendBroadcastNotification = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    data: v.optional(v.any()),
    excludeCurrentUser: v.optional(v.boolean()),
    requireAuth: v.optional(v.boolean()), // New optional parameter
  },
  returns: v.object({
    success: v.number(),
    failed: v.number(),
    total: v.number(),
    senderId: v.optional(v.id("users")),
    details: v.array(v.object({
      userId: v.id("users"),
      status: v.union(v.literal("success"), v.literal("failed"), v.literal("no_token")),
      notificationId: v.optional(v.string()),
      error: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    let currentUser = null;
    let senderId = null;

    // Check if authentication is required (default: true for backward compatibility)
    const requireAuth = args.requireAuth !== false;

    if (requireAuth) {
      currentUser = await getCurrentUser(ctx);
      if (!currentUser) {
        throw new ConvexError("User must be authenticated to send broadcast notifications");
      }
      senderId = currentUser._id;
    } else {
      // Optional: still try to get current user for logging purposes
      currentUser = await getCurrentUser(ctx);
      senderId = currentUser?._id;
    }

    // Get all users with push tokens
    const allUsers = await ctx.db.query("users").collect();
    const usersWithTokens = allUsers.filter(user => {
      // Exclude current user if requested and we have a current user
      if (args.excludeCurrentUser && currentUser && user._id === currentUser._id) {
        return false;
      }
      return user.pushToken; // Only include users with push tokens
    });

    let successCount = 0;
    let failedCount = 0;
    const details: Array<{
      userId: Id<"users">;
      status: "success" | "failed" | "no_token";
      notificationId?: string;
      error?: string;
    }> = [];

    // Send notifications to all users with tokens
    for (const user of usersWithTokens) {
      try {
        const notificationId = await pushNotifications.sendPushNotification(ctx, {
          userId: user._id,
          notification: {
            title: args.title,
            body: args.body,
            data: {
              ...args.data,
              type: "broadcast",
              senderId: senderId,
              timestamp: Date.now(),
              systemBroadcast: !requireAuth, // Flag to indicate if this is a system broadcast
            },
            sound: "default",
            priority: "high",
          },
          allowUnregisteredTokens: true,
        });

        if (notificationId) {
          successCount++;
          details.push({
            userId: user._id,
            status: "success",
            notificationId,
          });
        } else {
          details.push({
            userId: user._id,
            status: "no_token",
          });
        }
      } catch (error) {
        failedCount++;
        details.push({
          userId: user._id,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Also add users without tokens to the details
    const usersWithoutTokens = allUsers.filter(user => {
      if (args.excludeCurrentUser && currentUser && user._id === currentUser._id) {
        return false;
      }
      return !user.pushToken;
    });

    for (const user of usersWithoutTokens) {
      details.push({
        userId: user._id,
        status: "no_token",
      });
    }

    return {
      success: successCount,
      failed: failedCount,
      total: usersWithTokens.length,
      senderId: senderId,
      details,
    };
  },
});

/**
 * Send a system-wide broadcast notification to ALL users (no authentication required)
 * This is perfect for maintenance notifications, emergency alerts, or app-wide announcements
 */
export const sendSystemBroadcast = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  returns: v.object({
    success: v.number(),
    failed: v.number(),
    total: v.number(),
    totalUsers: v.number(),
    usersWithTokens: v.number(),
    usersWithoutTokens: v.number(),
    details: v.array(v.object({
      userId: v.id("users"),
      status: v.union(v.literal("success"), v.literal("failed"), v.literal("no_token")),
      notificationId: v.optional(v.string()),
      error: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    // No authentication required - this is a system function
    
    // Get ALL users from the database
    const allUsers = await ctx.db.query("users").collect();
    const usersWithTokens = allUsers.filter(user => user.pushToken);
    const usersWithoutTokens = allUsers.filter(user => !user.pushToken);

    let successCount = 0;
    let failedCount = 0;
    const details: Array<{
      userId: Id<"users">;
      status: "success" | "failed" | "no_token";
      notificationId?: string;
      error?: string;
    }> = [];

    // Send notifications to ALL users with tokens
    for (const user of usersWithTokens) {
      try {
        const notificationId = await pushNotifications.sendPushNotification(ctx, {
          userId: user._id,
          notification: {
            title: args.title,
            body: args.body,
            data: {
              ...args.data,
              type: "system_broadcast",
              timestamp: Date.now(),
              systemMessage: true,
            },
            sound: "default",
            priority: "high",
          },
          allowUnregisteredTokens: true,
        });

        if (notificationId) {
          successCount++;
          details.push({
            userId: user._id,
            status: "success",
            notificationId,
          });
        } else {
          details.push({
            userId: user._id,
            status: "no_token",
          });
        }
      } catch (error) {
        failedCount++;
        details.push({
          userId: user._id,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Add users without tokens to the details for complete reporting
    for (const user of usersWithoutTokens) {
      details.push({
        userId: user._id,
        status: "no_token",
      });
    }

    return {
      success: successCount,
      failed: failedCount,
      total: usersWithTokens.length,
      totalUsers: allUsers.length,
      usersWithTokens: usersWithTokens.length,
      usersWithoutTokens: usersWithoutTokens.length,
      details,
    };
  },
});

/**
 * Send a test notification to the current user
 */
export const sendTestNotification = mutation({
  args: {},
  returns: v.union(v.string(), v.null()),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) {
      throw new ConvexError("User must be authenticated");
    }

    const notificationId = await pushNotifications.sendPushNotification(ctx, {
      userId: user._id,
      notification: {
        title: "Test Notification 🎉",
        body: "This is a test notification from your app!",
        data: { type: "test", timestamp: Date.now() },
        sound: "default",
        priority: "high",
      },
      allowUnregisteredTokens: true,
    });

    return notificationId;
  },
});

/**
 * Get current user with token info
 */
export const getCurrentUserWithToken = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("users"),
      _creationTime: v.number(),
      name: v.optional(v.string()),
      image: v.optional(v.string()),
      email: v.optional(v.string()),
      emailVerificationTime: v.optional(v.number()),
      phone: v.optional(v.string()),
      phoneVerificationTime: v.optional(v.number()),
      isAnonymous: v.optional(v.boolean()),
      pushToken: v.optional(v.string()),
    }),
    v.null()
  ),
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    return user;
  },
});