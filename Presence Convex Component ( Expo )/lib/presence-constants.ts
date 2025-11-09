/**
 * Global constants for presence management
 */

/**
 * Global room ID for app-wide presence tracking
 * All users in the app will be tracked in this single room
 * This allows you to see all active users across the entire application
 */
export const GLOBAL_PRESENCE_ROOM = "app-global-room";

/**
 * Heartbeat interval in milliseconds
 * How often the client should send heartbeat messages to maintain presence
 */
export const PRESENCE_HEARTBEAT_INTERVAL = 30000; // 30 seconds
