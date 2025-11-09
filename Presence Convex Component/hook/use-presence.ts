import { api } from "@/convex/_generated/api";
import { GLOBAL_PRESENCE_ROOM } from "@/lib/presence-constants";
import { useAuthActions } from "@convex-dev/auth/react";
import { usePresence as usePresenceBase } from "@convex-dev/presence/react-native";
import { useMutation } from "convex/react";

/**
 * Hook to manage presence for the current user
 * Uses the global room token to track all users in the app
 * 
 * @param userName - Display name of the current user
 * @returns Array of users currently present, or undefined if not yet loaded
 * 
 * @example
 * ```tsx
 * const presenceUsers = useGlobalPresence("John Doe");
 * 
 * return (
 *   <View>
 *     <Text>Active Users: {presenceUsers?.length ?? 0}</Text>
 *   </View>
 * );
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
 * Hook to manage presence for a specific room
 * Use this when you need room-specific presence (e.g., for a specific chat or document)
 * 
 * @param roomId - Unique identifier for the room
 * @param userName - Display name of the current user
 * @returns Array of users currently present in the room, or undefined if not yet loaded
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
 * Hook that provides sign out functionality with presence cleanup
 * This ensures users are immediately marked as offline when they sign out
 */
export function useSignOutWithPresence() {
    const { signOut } = useAuthActions();
    const disconnectPresence = useMutation(api.presence.disconnectCurrentUser);

    const signOutWithPresence = async () => {
        try {
            // First disconnect from presence
            await disconnectPresence();
        } catch (error) {
            console.error('Failed to disconnect presence:', error);
        }

        // Then sign out (this will happen even if presence disconnect fails)
        await signOut();
    };

    return { signOut: signOutWithPresence };
}
