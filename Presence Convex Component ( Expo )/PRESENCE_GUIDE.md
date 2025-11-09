# Complete Presence System Guide

A comprehensive guide to implementing and using real-time presence tracking in your React Native + Convex application.

---

## 🤖 Quick Start for AI Agents

Follow these exact steps to implement presence in any React Native + Convex project:

### Step 1: Install Package
```bash
bun add @convex-dev/presence
```

### Step 2: Create Backend Files

**Create: `convex/convex.config.ts`**
```typescript
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";

const app = defineApp();
app.use(presence);

export default app;
```

**Create: `convex/presence.ts`** (Copy full code from Backend Setup section)

**Update: `convex/users.ts`** (Add `viewer` query if not exists)

### Step 3: Create Frontend Files

**Create: `lib/presence-constants.ts`**
```typescript
export const GLOBAL_PRESENCE_ROOM = "app-global-room";
export const PRESENCE_HEARTBEAT_INTERVAL = 30000;
```

**Create: `hooks/use-presence.ts`** (Copy full code from Frontend Implementation section)

### Step 4: Use in Components

**In any screen to show online users:**
```typescript
import { useGlobalPresence } from "@/hooks/use-presence";
const currentUser = useQuery(api.users.viewer);
const presenceUsers = useGlobalPresence(currentUser?.name || currentUser?.email || "");
const isOnline = presenceUsers?.some(p => p.userId === user._id) ?? false;
```

**In profile/sign out screen:**
```typescript
import { useSignOutWithPresence } from "@/hooks/use-presence";
const { signOut } = useSignOutWithPresence();
```

That's it! Presence is now working.

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Installation](#installation)
4. [Backend Setup](#backend-setup)
5. [Frontend Implementation](#frontend-implementation)
6. [Usage Examples](#usage-examples)
7. [API Reference](#api-reference)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## Overview

This presence system provides real-time tracking of which users are currently active in your application. It uses the official `@convex-dev/presence` component with custom authentication and cleanup logic.

### Key Features

✅ **Real-time Updates** - See who's online instantly  
✅ **Authenticated** - Only logged-in users can maintain presence  
✅ **Auto Cleanup** - Users removed immediately on sign out  
✅ **Global Room** - Track all users across the entire app  
✅ **Graceful Degradation** - Works even when users aren't authenticated  
✅ **React Native Compatible** - Full support for mobile apps  

### How It Works

1. When a user signs in, they automatically join the global presence room
2. Every 30 seconds, a heartbeat is sent to maintain their online status
3. If no heartbeat for 75 seconds (2.5x interval), user marked offline
4. When user signs out, they're immediately removed from presence
5. All other users see real-time updates of online/offline status

---

## Architecture

### Global Room Approach

This implementation uses a **single global room** to track all users:

```
┌─────────────────────────────────────────┐
│        Global Presence Room             │
│        "app-global-room"                │
│                                         │
│  ┌─────┐  ┌─────┐  ┌─────┐  ┌─────┐     │
│  │User1│  │User2│  │User3│  │User4│     │
│  └─────┘  └─────┘  └─────┘  └─────┘     │
│  Online   Online   Offline  Online      │
└─────────────────────────────────────────┘
```

**Advantages:**
- Simple implementation
- Easy to display "who's online now"
- Single query for all active users
- Ideal for small to medium apps

**Alternative:** You can use room-specific presence for features like chat rooms or collaborative documents.

---

## Installation

### 1. Install the Presence Component

```bash
bun add @convex-dev/presence
# or
npm install @convex-dev/presence
```

### 2. Required Dependencies

Ensure you have these installed:

```bash
# Already installed in your project
convex
@convex-dev/auth
react-native
expo-crypto
```

---

## 📝 Implementation Checklist

Use this checklist to ensure everything is properly set up:

### Backend Setup
- [ ] Package installed: `@convex-dev/presence`
- [ ] File created: `convex/convex.config.ts` with presence component registered
- [ ] File created: `convex/presence.ts` with all functions:
  - [ ] `heartbeat` mutation (handles auth, returns empty tokens if not authenticated)
  - [ ] `list` query (public, no auth)
  - [ ] `disconnect` mutation (no auth, for HTTP beacon)
  - [ ] `disconnectCurrentUser` mutation (requires auth)
  - [ ] `listUser` query
  - [ ] `listRoom` query
- [ ] File updated: `convex/users.ts` with `viewer` query

### Frontend Setup
- [ ] File created: `lib/presence-constants.ts` with:
  - [ ] `GLOBAL_PRESENCE_ROOM` constant
  - [ ] `PRESENCE_HEARTBEAT_INTERVAL` constant
- [ ] File created: `hooks/use-presence.ts` with:
  - [ ] `useGlobalPresence` hook
  - [ ] `useRoomPresence` hook
  - [ ] `useSignOutWithPresence` hook

### Usage Implementation
- [ ] Import `useGlobalPresence` in component
- [ ] Get current user with `useQuery(api.users.viewer)`
- [ ] Call `useGlobalPresence(userName)` with user's display name
- [ ] Check online status: `presenceUsers?.some(p => p.userId === user._id)`
- [ ] Replace `useAuthActions()` with `useSignOutWithPresence()` in sign out

### Testing
- [ ] User shows as online when signed in
- [ ] User shows as offline when signed out
- [ ] Multiple users show correctly
- [ ] Presence updates in real-time
- [ ] No console errors

---

## 🎯 Complete Implementation Guide

### Backend Setup

### File Structure

```
convex/
├── convex.config.ts      # Component configuration
├── presence.ts           # Presence mutations/queries
└── users.ts              # User queries
```

### 1. Configure the Presence Component

**File: `convex/convex.config.ts`**

```typescript
import { defineApp } from "convex/server";
import presence from "@convex-dev/presence/convex.config";

const app = defineApp();
app.use(presence);

export default app;
```

This registers the presence component with your Convex app.

### 2. Create Presence Functions

**File: `convex/presence.ts`**

```typescript
import { mutation, query } from "./_generated/server";
import { components } from "./_generated/api";
import { v } from "convex/values";
import { Presence } from "@convex-dev/presence";
import { getAuthUserId } from "@convex-dev/auth/server";

export const presence = new Presence(components.presence);

/**
 * Heartbeat mutation - keeps user presence alive
 * Called automatically every 30 seconds by the React hook
 */
export const heartbeat = mutation({
  args: { 
    roomId: v.string(), 
    userId: v.string(),        // Display name from hook
    sessionId: v.string(), 
    interval: v.number() 
  },
  handler: async (ctx, { roomId, userId, sessionId, interval }) => {
    // Get authenticated user ID
    const authenticatedUserId = await getAuthUserId(ctx);
    
    if (!authenticatedUserId) {
      // User not authenticated - return empty tokens
      // This allows the hook to continue without errors
      return { roomToken: "", sessionToken: "" };
    }
    
    // Track presence using authenticated user's ID
    const result = await presence.heartbeat(
      ctx, 
      roomId, 
      authenticatedUserId, 
      sessionId, 
      interval
    );
    
    // Store display name as user data
    if (userId) {
      await presence.updateRoomUser(ctx, roomId, authenticatedUserId, userId);
    }
    
    return result;
  },
});

/**
 * List all users in a room
 * Optimized for cache sharing across all clients
 */
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    return await presence.list(ctx, roomToken);
  },
});

/**
 * Disconnect a user session
 * Called when user closes tab/app
 */
export const disconnect = mutation({
  args: { sessionToken: v.string() },
  handler: async (ctx, { sessionToken }) => {
    // No auth check - called via HTTP beacon
    return await presence.disconnect(ctx, sessionToken);
  },
});

/**
 * Disconnect current user from all rooms
 * Called explicitly when user signs out
 */
export const disconnectCurrentUser = mutation({
  args: {},
  handler: async (ctx) => {
    const authenticatedUserId = await getAuthUserId(ctx);
    
    if (!authenticatedUserId) {
      return null; // Already disconnected
    }
    
    // Get all rooms user is in
    const userRooms = await presence.listUser(ctx, authenticatedUserId, true);
    
    // Remove from all rooms
    for (const room of userRooms) {
      await presence.removeRoomUser(ctx, room.roomId, authenticatedUserId);
    }
    
    return null;
  },
});

/**
 * List all rooms a user is present in
 */
export const listUser = query({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => {
    return await presence.listUser(ctx, userId);
  },
});

/**
 * List all users in a specific room
 */
export const listRoom = query({
  args: { roomId: v.string() },
  handler: async (ctx, { roomId }) => {
    return await presence.listRoom(ctx, roomId);
  },
});
```

### 3. Add User Viewer Query

**File: `convex/users.ts`**

```typescript
import { query } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const getAllUsers = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("users").collect();
  },
});

export const viewer = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return null;
    }
    return await ctx.db.get(userId);
  },
});
```

---

## Frontend Implementation

### File Structure

```
lib/
└── presence-constants.ts  # Configuration constants

hooks/
└── use-presence.ts        # React hooks (includes sign out)

app/
└── (tabs)/
    ├── index.tsx          # Usage example
    └── profile.tsx        # Sign out implementation
```

### 1. Configuration Constants

**File: `lib/presence-constants.ts`**

```typescript
/**
 * Global room ID for app-wide presence tracking
 * All authenticated users are tracked in this room
 */
export const GLOBAL_PRESENCE_ROOM = "app-global-room";

/**
 * Heartbeat interval in milliseconds
 * User marked offline after 2.5x this interval (75 seconds)
 */
export const PRESENCE_HEARTBEAT_INTERVAL = 30000; // 30 seconds
```

### 2. Presence Hooks

**File: `hooks/use-presence.ts`**

```typescript
import { api } from "@/convex/_generated/api";
import { GLOBAL_PRESENCE_ROOM } from "@/lib/presence-constants";
import { useAuthActions } from "@convex-dev/auth/react";
import { usePresence as usePresenceBase } from "@convex-dev/presence/react-native";
import { useMutation } from "convex/react";

/**
 * Hook to track presence in the global app room
 * 
 * @param userName - Display name for the current user
 * @returns Array of all users present in the app
 * 
 * @example
 * ```tsx
 * const presenceUsers = useGlobalPresence("John Doe");
 * const onlineCount = presenceUsers?.length ?? 0;
 * ```
 */
export function useGlobalPresence(userName: string) {
  return usePresenceBase(
    api.presence,
    GLOBAL_PRESENCE_ROOM,
    userName
  );
}

/**
 * Hook to track presence in a specific room
 * Use for chat rooms, documents, or other contexts
 * 
 * @param roomId - Unique identifier for the room
 * @param userName - Display name for the current user
 * @returns Array of users present in the room
 * 
 * @example
 * ```tsx
 * const presenceUsers = useRoomPresence("chat-123", "John Doe");
 * ```
 */
export function useRoomPresence(
  roomId: string,
  userName: string
) {
  return usePresenceBase(
    api.presence,
    roomId,
    userName
  );
}

/**
 * Hook that provides sign out with automatic presence cleanup
 * Ensures users are immediately marked offline when signing out
 * 
 * @example
 * ```tsx
 * const { signOut } = useSignOutWithPresence();
 * await signOut();
 * ```
 */
export function useSignOutWithPresence() {
  const { signOut } = useAuthActions();
  const disconnectPresence = useMutation(api.presence.disconnectCurrentUser);

  const signOutWithPresence = async () => {
    try {
      // Disconnect from presence first
      await disconnectPresence();
    } catch (error) {
      console.error('Failed to disconnect presence:', error);
      // Continue with sign out even if this fails
    }
    
    // Then sign out
    await signOut();
  };

  return { signOut: signOutWithPresence };
}
```

**Important:** All three functions are in the same file for simplicity.

---

## Usage Examples

### Example 1: Display Users with Online Status

**File: `app/(tabs)/index.tsx`**

```typescript
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useGlobalPresence } from "@/hooks/use-presence";
import { View, Text } from "react-native";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

export default function HomeScreen() {
  // Get all registered users
  const allUsers = useQuery(api.users.getAllUsers);
  
  // Get current authenticated user
  const currentUser = useQuery(api.users.viewer);
  
  // Track presence for current user
  const shouldTrackPresence = currentUser !== null && currentUser !== undefined;
  const userName = currentUser?.name || currentUser?.email || "Anonymous User";
  
  const presenceUsers = useGlobalPresence(
    shouldTrackPresence ? userName : ""
  );

  return (
    <View>
      {allUsers?.map(user => {
        // Check if user is online
        const isOnline = presenceUsers?.some(p => p.userId === user._id) ?? false;
        
        return (
          <View key={user._id} className="flex-row items-center gap-3 p-3">
            <Avatar>
              <AvatarFallback>
                <Text>{user.email?.charAt(0).toUpperCase() ?? "?"}</Text>
              </AvatarFallback>
            </Avatar>
            
            <View className="flex-1">
              <Text>{user.name || user.email}</Text>
              <Text className={isOnline ? "text-green-500" : "text-gray-500"}>
                {isOnline ? "Online" : "Offline"}
              </Text>
            </View>
            
            {/* Online indicator dot */}
            {isOnline && (
              <View className="h-3 w-3 rounded-full bg-green-500" />
            )}
          </View>
        );
      })}
    </View>
  );
}
```

### Example 2: Online User Count

```tsx
import { useGlobalPresence } from "@/hooks/use-presence";

function OnlineCount() {
  const currentUser = useQuery(api.users.viewer);
  const presenceUsers = useGlobalPresence(
    currentUser?.name || currentUser?.email || ""
  );
  
  const count = presenceUsers?.length ?? 0;
  
  return (
    <View className="flex-row items-center gap-2">
      <View className="h-2 w-2 rounded-full bg-green-500" />
      <Text>{count} online</Text>
    </View>
  );
}
```

### Example 3: Room-Specific Presence (Chat Room)

```tsx
import { useRoomPresence } from "@/hooks/use-presence";

function ChatRoom({ chatId }: { chatId: string }) {
  const currentUser = useQuery(api.users.viewer);
  const presenceUsers = useRoomPresence(
    `chat-${chatId}`,
    currentUser?.name || "Anonymous"
  );
  
  return (
    <View>
      <Text>Users in this chat: {presenceUsers?.length}</Text>
      {presenceUsers?.map((user, index) => (
        <Text key={index}>{user.data || user.userId}</Text>
      ))}
    </View>
  );
}
```

### Example 4: Sign Out with Presence Cleanup

**File: `app/(tabs)/profile.tsx`**

```tsx
import { useSignOutWithPresence } from "@/hooks/use-presence";
import { Button } from "@/components/ui/button";
import { Text } from "@/components/ui/text";
import { useState } from "react";
import { ActivityIndicator, Alert } from "react-native";

export default function ProfileScreen() {
  const { signOut } = useSignOutWithPresence();
  const [loading, setLoading] = useState(false);

  const handleSignOut = async () => {
    setLoading(true);
    try {
      await signOut();
    } catch (error) {
      Alert.alert('Error', 'Failed to sign out');
      console.error('Sign out error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button onPress={handleSignOut} variant="destructive">
      {loading ? (
        <ActivityIndicator size="small" color="#fff" />
      ) : (
        <Text>Sign Out</Text>
      )}
    </Button>
  );
}
```

---

## API Reference

### Backend Functions

#### `presence.heartbeat`
**Type:** Mutation  
**Auth:** Required  
**Description:** Maintains user's online presence  

```typescript
await ctx.runMutation(api.presence.heartbeat, {
  roomId: "app-global-room",
  userId: "John Doe",        // Display name
  sessionId: "unique-id",
  interval: 30000
});
```

#### `presence.list`
**Type:** Query  
**Auth:** Public  
**Description:** List all users in a room  

```typescript
const users = await ctx.runQuery(api.presence.list, {
  roomToken: "room-token-from-heartbeat"
});
```

#### `presence.disconnectCurrentUser`
**Type:** Mutation  
**Auth:** Required  
**Description:** Remove current user from all presence rooms  

```typescript
await ctx.runMutation(api.presence.disconnectCurrentUser, {});
```

#### `presence.disconnect`
**Type:** Mutation  
**Auth:** None (HTTP beacon)  
**Description:** Disconnect specific session  

```typescript
await ctx.runMutation(api.presence.disconnect, {
  sessionToken: "session-token"
});
```

#### `users.viewer`
**Type:** Query  
**Auth:** Required  
**Description:** Get current authenticated user  

```typescript
const currentUser = await ctx.runQuery(api.users.viewer, {});
```

### Frontend Hooks

#### `useGlobalPresence(userName: string)`
**Returns:** `PresenceState[] | undefined`  
**Description:** Track presence in global app room  

```typescript
const presenceUsers = useGlobalPresence("John Doe");
```

#### `useRoomPresence(roomId: string, userName: string)`
**Returns:** `PresenceState[] | undefined`  
**Description:** Track presence in specific room  

```typescript
const presenceUsers = useRoomPresence("chat-123", "John Doe");
```

#### `useSignOutWithPresence()`
**Returns:** `{ signOut: () => Promise<void> }`  
**Description:** Sign out with presence cleanup  

```typescript
const { signOut } = useSignOutWithPresence();
await signOut();
```

### Data Types

#### `PresenceState`
```typescript
{
  userId: string;          // User's Convex ID
  online: boolean;         // Currently online?
  lastDisconnected: number; // Timestamp
  data?: unknown;          // Display name
  name?: string;           // User name
  image?: string;          // Profile image
}
```

---

## Best Practices

### 1. Always Check Authentication

```tsx
const currentUser = useQuery(api.users.viewer);
const presenceUsers = useGlobalPresence(
  currentUser ? (currentUser.name || currentUser.email || "") : ""
);
```

### 2. Handle Loading States

```tsx
if (presenceUsers === undefined) {
  return <ActivityIndicator />;
}

const onlineCount = presenceUsers.length;
```

### 3. Use Meaningful Display Names

```tsx
// ✅ Good - Use actual names
const userName = user.name || user.email || "Anonymous";

// ❌ Bad - Don't use IDs
const userName = user._id;
```

### 4. Clean Up on Sign Out

```tsx
// ✅ Always use useSignOutWithPresence
const { signOut } = useSignOutWithPresence();

// ❌ Don't use regular signOut (presence won't clean up)
const { signOut } = useAuthActions();
```

### 5. Global vs Room Presence

```tsx
// Use global for app-wide status
const appUsers = useGlobalPresence(userName);

// Use rooms for specific contexts
const chatUsers = useRoomPresence(`chat-${chatId}`, userName);
```

### 6. Optimize Re-renders

```tsx
// Check presence once, use throughout component
const isOnline = useMemo(
  () => presenceUsers?.some(p => p.userId === user._id) ?? false,
  [presenceUsers, user._id]
);
```

---

## Troubleshooting

### Issue: Users Stay Online After Sign Out

**Cause:** Not using `useSignOutWithPresence`  
**Solution:** Replace `useAuthActions()` with `useSignOutWithPresence()`

```tsx
// ❌ Problem
const { signOut } = useAuthActions();

// ✅ Solution
const { signOut } = useSignOutWithPresence();
```

### Issue: "User ID Mismatch" Error

**Cause:** This was fixed - heartbeat now silently handles unauthenticated users  
**Solution:** Ensure you're on the latest code where heartbeat returns empty tokens for unauthenticated users

### Issue: Users Shown Multiple Times

**Cause:** User has multiple sessions (tabs/devices)  
**Expected Behavior:** This is normal - users can be online from multiple places

**Solution:** Group by userId if you want unique users:

```tsx
const uniqueUsers = useMemo(() => {
  const userMap = new Map();
  presenceUsers?.forEach(p => {
    if (!userMap.has(p.userId)) {
      userMap.set(p.userId, p);
    }
  });
  return Array.from(userMap.values());
}, [presenceUsers]);
```

### Issue: Presence Not Updating

**Checklist:**
1. ✅ User is authenticated?
2. ✅ Passing non-empty userName to hook?
3. ✅ Network connection active?
4. ✅ No console errors?

**Debug:**
```tsx
console.log('Current user:', currentUser);
console.log('Presence users:', presenceUsers);
```

### Issue: Offline Users Still Showing

**Cause:** Presence timeout hasn't occurred yet (75 seconds)  
**Solution:** This is expected - wait for timeout or implement force disconnect

---

## Configuration

### Change Heartbeat Interval

**File: `lib/presence-constants.ts`**

```typescript
// Default: 30 seconds
export const PRESENCE_HEARTBEAT_INTERVAL = 30000;

// More aggressive (15 seconds = 37.5s timeout)
export const PRESENCE_HEARTBEAT_INTERVAL = 15000;

// More relaxed (60 seconds = 150s timeout)
export const PRESENCE_HEARTBEAT_INTERVAL = 60000;
```

**Note:** Timeout is always 2.5× the heartbeat interval

### Change Global Room ID

**File: `lib/presence-constants.ts`**

```typescript
// Default
export const GLOBAL_PRESENCE_ROOM = "app-global-room";

// Custom
export const GLOBAL_PRESENCE_ROOM = "my-app-presence";
```

---

## Advanced Use Cases

### Show Who's Viewing a Document

```tsx
function DocumentEditor({ docId }: { docId: string }) {
  const currentUser = useQuery(api.users.viewer);
  const viewers = useRoomPresence(
    `doc-${docId}`,
    currentUser?.name || "Anonymous"
  );
  
  return (
    <View>
      <Text>Viewers: {viewers?.length}</Text>
      {viewers?.map((viewer, i) => (
        <Avatar key={i}>
          <AvatarFallback>
            <Text>{(viewer.data as string)?.[0] || "?"}</Text>
          </AvatarFallback>
        </Avatar>
      ))}
    </View>
  );
}
```

### Typing Indicators

Combine presence with custom mutations for typing status:

```tsx
// Show typing indicator when user is present
const isTyping = presenceUsers?.some(
  p => p.userId === typingUserId
) ?? false;
```

### Last Seen Timestamp

```tsx
const lastSeen = user.online 
  ? "Online now"
  : `Last seen ${formatDistanceToNow(user.lastDisconnected)}`;
```

---

## Security Considerations

### ✅ What's Secure

- Heartbeats require authentication
- User IDs are verified server-side
- Can't spoof another user's presence
- Display names stored safely

### ⚠️ What's Public

- List of online users is public (no auth check)
- This enables cache sharing for performance
- All clients see the same presence data

### 🔒 Making It Private

If you need private presence, add auth checks to `list` query:

```typescript
export const list = query({
  args: { roomToken: v.string() },
  handler: async (ctx, { roomToken }) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Unauthorized");
    }
    return await presence.list(ctx, roomToken);
  },
});
```

**Trade-off:** This reduces cache efficiency

---

## Performance Considerations

### Query Caching

The `list` query is designed to share cache across all clients:
- All users see the same data
- Only one query execution needed
- Efficient for large numbers of subscribers

### Heartbeat Frequency

Default 30-second interval balances:
- **Responsiveness:** Users see status changes quickly
- **Efficiency:** Not too many database writes
- **Battery:** Mobile-friendly

Adjust `PRESENCE_HEARTBEAT_INTERVAL` based on your needs.

---

## Summary

This presence system provides:

✅ Real-time online/offline status  
✅ Authenticated and secure  
✅ Automatic cleanup on sign out  
✅ Mobile-friendly and battery efficient  
✅ Scalable for apps with many users  
✅ Simple to implement and use  

Key files:
- `convex/convex.config.ts` - Component registration
- `convex/presence.ts` - Backend logic
- `hooks/use-presence.ts` - Frontend hooks (includes sign out)
- `lib/presence-constants.ts` - Configuration

For questions or issues, refer to the [Convex Presence Documentation](https://github.com/get-convex/presence).

---

**Built with ❤️ using Convex and React Native**
