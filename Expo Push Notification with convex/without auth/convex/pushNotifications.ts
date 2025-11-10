import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Initialize the push notifications component with device-based approach
const pushNotifications = new PushNotifications<Id<"devices">>(
  components.pushNotifications,
  {
    logLevel: "INFO",
  }
);

/**
 * Register a device token
 */
export const registerDevice = mutation({
  args: {
    pushToken: v.string(),
    deviceId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
  },
  returns: v.id("devices"),
  handler: async (ctx, args) => {
    // Check if device already exists
    const existingDevice = await ctx.db
      .query("devices")
      .withIndex("pushToken", (q) => q.eq("pushToken", args.pushToken))
      .first();

    if (existingDevice) {
      // Update existing device
      await ctx.db.patch(existingDevice._id, {
        lastSeen: Date.now(),
        isActive: true,
        platform: args.platform,
        appVersion: args.appVersion,
        deviceId: args.deviceId,
      });
      return existingDevice._id;
    }

    // Create new device record
    const deviceId = await ctx.db.insert("devices", {
      pushToken: args.pushToken,
      deviceId: args.deviceId,
      platform: args.platform,
      appVersion: args.appVersion,
      lastSeen: Date.now(),
      isActive: true,
    });

    // Register token with push notification system
    await pushNotifications.recordToken(ctx, {
      userId: deviceId,
      pushToken: args.pushToken,
    });

    return deviceId;
  },
});

/**
 * Get all registered devices
 */
export const getAllDevices = query({
  args: {},
  returns: v.array(v.object({
    _id: v.id("devices"),
    _creationTime: v.number(),
    pushToken: v.string(),
    deviceId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    lastSeen: v.number(),
    isActive: v.optional(v.boolean()),
  })),
  handler: async (ctx) => {
    return await ctx.db.query("devices").collect();
  },
});

/**
 * Remove a device token
 */
export const removeDeviceToken = mutation({
  args: {
    deviceId: v.id("devices"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device) {
      throw new ConvexError("Device not found");
    }

    // Remove token from push notification system
    await pushNotifications.removeToken(ctx, {
      userId: args.deviceId,
    });

    // Mark device as inactive or delete it
    await ctx.db.patch(args.deviceId, {
      isActive: false,
    });

    return null;
  },
});

/**
 * Send a push notification to a specific device
 */
export const sendNotificationToDevice = mutation({
  args: {
    deviceId: v.id("devices"),
    title: v.string(),
    body: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device) {
      throw new ConvexError("Device not found");
    }

    if (!device.isActive) {
      throw new ConvexError("Device is not active");
    }

    // Send the notification
    const notificationId = await pushNotifications.sendPushNotification(ctx, {
      userId: args.deviceId,
      notification: {
        title: args.title,
        body: args.body,
        data: args.data,
        sound: "default",
        priority: "high",
      },
      allowUnregisteredTokens: true,
    });

    // Update device last seen
    await ctx.db.patch(args.deviceId, {
      lastSeen: Date.now(),
    });

    return notificationId;
  },
});

/**
 * Send notification by push token directly
 */
export const sendNotificationByToken = mutation({
  args: {
    pushToken: v.string(),
    title: v.string(),
    body: v.optional(v.string()),
    data: v.optional(v.any()),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const device = await ctx.db
      .query("devices")
      .withIndex("pushToken", (q) => q.eq("pushToken", args.pushToken))
      .first();

    if (!device) {
      throw new ConvexError("Device with this token not found");
    }

    // Send the notification directly
    const notificationId = await pushNotifications.sendPushNotification(ctx, {
      userId: device._id,
      notification: {
        title: args.title,
        body: args.body,
        data: args.data,
        sound: "default",
        priority: "high",
      },
      allowUnregisteredTokens: true,
    });

    // Update device last seen
    await ctx.db.patch(device._id, {
      lastSeen: Date.now(),
    });

    return notificationId;
  },
});

/**
 * Get push notification status for a device
 */
export const getDevicePushStatus = query({
  args: {
    deviceId: v.id("devices"),
  },
  returns: v.object({
    hasToken: v.boolean(),
    paused: v.boolean(),
    isActive: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device) {
      return { hasToken: false, paused: false, isActive: false };
    }

    const status = await pushNotifications.getStatusForUser(ctx, {
      userId: args.deviceId,
    });

    return {
      hasToken: status.hasToken,
      paused: status.paused,
      isActive: device.isActive ?? true,
    };
  },
});

/**
 * Send a broadcast notification to all active devices
 */
export const sendBroadcastNotification = mutation({
  args: {
    title: v.string(),
    body: v.optional(v.string()),
    data: v.optional(v.any()),
    excludeDeviceId: v.optional(v.id("devices")),
  },
  returns: v.object({
    success: v.number(),
    failed: v.number(),
    total: v.number(),
    details: v.array(v.object({
      deviceId: v.id("devices"),
      status: v.union(v.literal("success"), v.literal("failed"), v.literal("inactive")),
      notificationId: v.optional(v.string()),
      error: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    // Get all active devices
    const allDevices = await ctx.db.query("devices").collect();
    const activeDevices = allDevices.filter(device => {
      // Exclude specified device if requested
      if (args.excludeDeviceId && device._id === args.excludeDeviceId) {
        return false;
      }
      return device.isActive !== false; // Include devices where isActive is undefined or true
    });

    let successCount = 0;
    let failedCount = 0;
    const details: Array<{
      deviceId: Id<"devices">;
      status: "success" | "failed" | "inactive";
      notificationId?: string;
      error?: string;
    }> = [];

    // Send notifications to all active devices
    for (const device of activeDevices) {
      try {
        const notificationId = await pushNotifications.sendPushNotification(ctx, {
          userId: device._id,
          notification: {
            title: args.title,
            body: args.body,
            data: {
              ...args.data,
              type: "broadcast",
              timestamp: Date.now(),
            },
            sound: "default",
            priority: "high",
          },
          allowUnregisteredTokens: true,
        });

        if (notificationId) {
          successCount++;
          details.push({
            deviceId: device._id,
            status: "success",
            notificationId,
          });
        } else {
          details.push({
            deviceId: device._id,
            status: "failed",
            error: "No notification ID returned",
          });
        }
      } catch (error) {
        failedCount++;
        details.push({
          deviceId: device._id,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Add inactive devices to the details
    const inactiveDevices = allDevices.filter(device => {
      if (args.excludeDeviceId && device._id === args.excludeDeviceId) {
        return false;
      }
      return device.isActive === false;
    });

    for (const device of inactiveDevices) {
      details.push({
        deviceId: device._id,
        status: "inactive",
      });
    }

    return {
      success: successCount,
      failed: failedCount,
      total: activeDevices.length,
      details,
    };
  },
});

/**
 * Send a test notification to a device
 */
export const sendTestNotification = mutation({
  args: {
    deviceId: v.id("devices"),
  },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device) {
      throw new ConvexError("Device not found");
    }

    const notificationId = await pushNotifications.sendPushNotification(ctx, {
      userId: args.deviceId,
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