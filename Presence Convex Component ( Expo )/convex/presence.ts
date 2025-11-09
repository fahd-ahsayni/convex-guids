import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { getAuthUserId } from "@convex-dev/auth/server";

export const presence = new Presence(components.presence);

/**
 * Heartbeat mutation to keep user presence alive
 * Called periodically by the client to maintain active status
 * The userId parameter from the hook is actually the display name
 */
export const heartbeat = mutation({
  args: { 
    roomId: v.string(), 
    userId: v.string(), 
    sessionId: v.string(), 
    interval: v.number() 
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    // Verify that the user is authenticated
    const authenticatedUserId = await getAuthUserId(ctx);
    if (!authenticatedUserId) {
      // Silently fail if not authenticated (user signed out)
      // Return dummy tokens to avoid errors in the hook
      return {
        roomToken: "",
        sessionToken: ""
      };
    }
    
    // Use the authenticated user's ID for presence tracking
    const result = await presence.heartbeat(ctx, roomId, authenticatedUserId, sessionId, interval);
    
    // Update user data with display name (the userId param is actually the display name)
    if (userId) {
      await presence.updateRoomUser(ctx, roomId, authenticatedUserId, userId);
    }
    
    return result;
  },
});

/**
 * Query to list all users present in a room
 * This query is optimized to share cache across all subscriptions
 */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    // Avoid adding per-user reads so all subscriptions can share same cache
    return await presence.list(ctx, roomToken);
  },
});

/**
 * Mutation to disconnect a user from presence
 * Called when user leaves or closes the tab
 */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // Can't check auth here because it's called over HTTP from sendBeacon
    return await presence.disconnect(ctx, sessionToken);
  },
});

/**
 * Mutation to disconnect the current authenticated user from all rooms
 * Called when user signs out to immediately mark them as offline
 */
export const disconnectCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authenticatedUserId = await getAuthUserId(ctx);
    if (!authenticatedUserId) {
      // User is already not authenticated, nothing to disconnect
      return null;
    }
    
    // Get all rooms the user is in
    const userRooms = await presence.listUser(ctx, authenticatedUserId, true);
    
    // Remove user from all rooms they're in
    for (const room of userRooms) {
      await presence.removeRoomUser(ctx, room.roomId, authenticatedUserId);
    }
    
    return null;
  },
});

/**
 * Query to get presence for a specific user across all rooms
 */
export const listUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await presence.listUser(ctx, userId);
  },
});

/**
 * Query to get presence for a specific room
 */
export const listRoom = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    return await presence.listRoom(ctx, roomId);
  },
});
