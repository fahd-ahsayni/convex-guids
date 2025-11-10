# 🔔 Complete Agent Guide: Push Notifications with Convex & Expo

**A Step-by-Step Implementation Guide for AI Agents**

This guide provides complete instructions for implementing push notifications in an Expo React Native app using Convex backend with device-based token management (no user authentication required).

---

## 📋 Prerequisites Checklist

Before starting, verify the following are installed and configured:

- ✅ Node.js v18 or higher
- ✅ Bun or npm package manager
- ✅ Expo CLI: `npm install -g expo-cli`
- ✅ EAS CLI: `npm install -g @expo/eas-cli`
- ✅ Expo account (https://expo.dev)
- ✅ Convex account (https://convex.dev)
- ✅ Physical device (iOS/Android) - **Simulators don't support push notifications**
- ✅ Existing Expo project with Convex initialized

---

## 🚀 Implementation Steps

### STEP 1: Install Required Dependencies

Execute these commands in the project root:

```bash
# Install Convex push notifications component
bun add @convex-dev/expo-push-notifications

# Install Expo notification dependencies
bunx expo install expo-notifications expo-device expo-constants
```

**Verification:**
```bash
bun list | grep -E "expo-notifications|@convex-dev/expo-push-notifications"
```

**Expected Output:**
- `@convex-dev/expo-push-notifications@0.2.x`
- `expo-notifications@0.x.x`
- `expo-device@6.x.x`
- `expo-constants@16.x.x`

---

### STEP 2: Create Convex Configuration

#### 2.1 Create `convex/convex.config.ts`

```typescript
import { defineApp } from "convex/server";
import pushNotifications from "@convex-dev/expo-push-notifications/convex.config";

const app = defineApp();
app.use(pushNotifications);

export default app;
```

**Purpose:** Registers the push notifications component with Convex.

---

#### 2.2 Create `convex/schema.ts`

```typescript
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  devices: defineTable({
    pushToken: v.string(),
    deviceId: v.optional(v.string()),
    platform: v.optional(v.string()),
    appVersion: v.optional(v.string()),
    lastSeen: v.number(),
    isActive: v.optional(v.boolean()),
  })
    .index("pushToken", ["pushToken"])
    .index("deviceId", ["deviceId"]),
});
```

**Schema Explanation:**
- `pushToken`: Expo push token string (required, indexed)
- `deviceId`: Device unique identifier (optional)
- `platform`: "ios" or "android" (optional)
- `appVersion`: App version string (optional)
- `lastSeen`: Unix timestamp of last activity (required)
- `isActive`: Boolean flag for active devices (optional, default true)

---

#### 2.3 Create `convex/pushNotifications.ts`

```typescript
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { PushNotifications } from "@convex-dev/expo-push-notifications";
import { components } from "./_generated/api";
import { Id } from "./_generated/dataModel";

// Initialize push notifications component
const pushNotifications = new PushNotifications<Id<"devices">>(
  components.pushNotifications,
  { logLevel: "INFO" }
);

/**
 * FUNCTION: registerDevice
 * PURPOSE: Register or update a device token
 * USAGE: Called when user taps "Register Device Token"
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

    // Create new device
    const deviceId = await ctx.db.insert("devices", {
      pushToken: args.pushToken,
      deviceId: args.deviceId,
      platform: args.platform,
      appVersion: args.appVersion,
      lastSeen: Date.now(),
      isActive: true,
    });

    // Register with push notification system
    await pushNotifications.recordToken(ctx, {
      userId: deviceId,
      pushToken: args.pushToken,
    });

    return deviceId;
  },
});

/**
 * FUNCTION: getAllDevices
 * PURPOSE: Retrieve all registered devices
 * USAGE: Display device count in UI
 */
export const getAllDevices = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query("devices").collect();
  },
});

/**
 * FUNCTION: sendNotificationToDevice
 * PURPOSE: Send notification to specific device
 * USAGE: Send targeted notifications
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
    if (!device || !device.isActive) {
      throw new ConvexError("Device not found or inactive");
    }

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

    await ctx.db.patch(args.deviceId, { lastSeen: Date.now() });
    return notificationId;
  },
});

/**
 * FUNCTION: sendBroadcastNotification
 * PURPOSE: Send notification to all active devices
 * USAGE: Broadcast messages to all users
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
    const allDevices = await ctx.db.query("devices").collect();
    const activeDevices = allDevices.filter(device => {
      if (args.excludeDeviceId && device._id === args.excludeDeviceId) return false;
      return device.isActive !== false;
    });

    let successCount = 0;
    let failedCount = 0;
    const details: Array<any> = [];

    for (const device of activeDevices) {
      try {
        const notificationId = await pushNotifications.sendPushNotification(ctx, {
          userId: device._id,
          notification: {
            title: args.title,
            body: args.body,
            data: { ...args.data, type: "broadcast", timestamp: Date.now() },
            sound: "default",
            priority: "high",
          },
          allowUnregisteredTokens: true,
        });

        if (notificationId) {
          successCount++;
          details.push({ deviceId: device._id, status: "success", notificationId });
        } else {
          details.push({ deviceId: device._id, status: "failed", error: "No ID returned" });
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

    return { success: successCount, failed: failedCount, total: activeDevices.length, details };
  },
});

/**
 * FUNCTION: sendTestNotification
 * PURPOSE: Send test notification to device
 * USAGE: Testing push notification setup
 */
export const sendTestNotification = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    const device = await ctx.db.get(args.deviceId);
    if (!device) throw new ConvexError("Device not found");

    return await pushNotifications.sendPushNotification(ctx, {
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
  },
});

/**
 * FUNCTION: removeDeviceToken
 * PURPOSE: Deactivate device token
 * USAGE: When user uninstalls or opts out
 */
export const removeDeviceToken = mutation({
  args: { deviceId: v.id("devices") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await pushNotifications.removeToken(ctx, { userId: args.deviceId });
    await ctx.db.patch(args.deviceId, { isActive: false });
    return null;
  },
});
```

---

#### 2.4 Generate Convex API

```bash
bunx convex dev --once
```

**Expected Output:**
```
✔ Convex functions ready! (3.05s)
```

**If errors occur:**
- Check syntax in all Convex files
- Verify Convex is authenticated: `bunx convex dev` (follow login)
- Check `.env.local` has `EXPO_PUBLIC_CONVEX_URL`

---

### STEP 3: Configure App for Push Notifications

#### 3.1 Update `app.json`

Add the following to your existing `app.json`:

```json
{
  "expo": {
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.yourapp",
      "infoPlist": {
        "UIBackgroundModes": ["background-fetch", "remote-notification"]
      }
    },
    "android": {
      "package": "com.yourcompany.yourapp",
      "adaptiveIcon": {
        "foregroundImage": "./assets/images/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "permissions": [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "WAKE_LOCK"
      ]
    },
    "plugins": [
      "expo-router",
      [
        "expo-notifications",
        {
          "icon": "./assets/images/notification-icon.png",
          "color": "#ffffff",
          "defaultChannel": "default"
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "your-project-id-will-be-here"
      }
    }
  }
}
```

**Important:** Replace `com.yourcompany.yourapp` with your app's bundle identifier.

---

#### 3.2 Configure EAS Project

```bash
eas build:configure
```

**Follow prompts:**
1. Select platform (All/iOS/Android)
2. EAS will generate a project ID
3. Project ID automatically added to `app.json`

**Verify:** Check `app.json` has `extra.eas.projectId` populated.

---

### STEP 4: Create React Native Hook

Create `hooks/usePushNotifications.ts`:

```typescript
import { useEffect, useState, useRef } from 'react';
import { Platform, Alert } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';
import { Id } from '@/convex/_generated/dataModel';

export interface PushNotificationState {
  expoPushToken: string | null;
  deviceId: Id<"devices"> | null;
  isLoading: boolean;
  error: string | null;
  permission: Notifications.PermissionStatus | null;
  canAskAgain: boolean;
}

export interface UsePushNotificationsReturn extends PushNotificationState {
  registerForPushNotifications: () => Promise<string | null>;
  requestPermissions: () => Promise<boolean>;
  sendTestNotification: () => Promise<void>;
  isRegistered: boolean;
}

// Configure foreground notification behavior
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export function usePushNotifications(): UsePushNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<Id<"devices"> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  const registerDevice = useMutation(api.pushNotifications.registerDevice);
  const sendTestNotificationMutation = useMutation(api.pushNotifications.sendTestNotification);
  const allDevices = useQuery(api.pushNotifications.getAllDevices);

  const isRegistered = Boolean(deviceId && expoPushToken);

  // Check initial permissions
  useEffect(() => {
    const checkPermissions = async () => {
      const { status, canAskAgain: canAsk } = await Notifications.getPermissionsAsync();
      setPermission(status);
      setCanAskAgain(canAsk);
    };
    checkPermissions();
  }, []);

  // Set up notification listeners
  useEffect(() => {
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('🔔 Notification tapped:', response);
      const data = response.notification.request.content.data;
      
      if (data?.type === 'test') {
        Alert.alert('Test Notification', 'You tapped on a test notification!');
      } else if (data?.type === 'broadcast') {
        Alert.alert('Broadcast Message', 'You received a broadcast notification!');
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, []);

  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status, canAskAgain: canAsk } = await Notifications.requestPermissionsAsync();
      setPermission(status);
      setCanAskAgain(canAsk);
      
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Push notifications need to be enabled in settings.');
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Permission error:', error);
      setError('Failed to request permissions');
      return false;
    }
  };

  const registerForPushNotifications = async (): Promise<string | null> => {
    try {
      setIsLoading(true);
      setError(null);

      // Verify physical device
      if (!Device.isDevice) {
        throw new Error('Must use physical device for push notifications');
      }

      // Set up Android channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // Request permissions
      if (permission !== 'granted') {
        const hasPermission = await requestPermissions();
        if (!hasPermission) return null;
      }

      // Get push token (auto-detect project ID)
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? 
                        Constants?.easConfig?.projectId ??
                        Constants?.manifest?.extra?.eas?.projectId;
      
      let pushTokenData;
      if (projectId) {
        pushTokenData = await Notifications.getExpoPushTokenAsync({ projectId });
      } else {
        pushTokenData = await Notifications.getExpoPushTokenAsync();
      }
      
      const pushToken = pushTokenData.data;
      setExpoPushToken(pushToken);

      // Register with Convex
      const newDeviceId = await registerDevice({
        pushToken,
        deviceId: Device.osInternalBuildId || undefined,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version,
      });
      
      setDeviceId(newDeviceId);
      console.log('✅ Push token registered:', pushToken);
      return pushToken;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Registration failed';
      console.error('Registration error:', errorMessage);
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  };

  const sendTestNotification = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      if (!isRegistered || !deviceId) {
        throw new Error('Not registered for push notifications');
      }

      await sendTestNotificationMutation({ deviceId });
      Alert.alert('Test Sent!', 'You should receive it shortly.');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send test';
      console.error('Test error:', errorMessage);
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-restore device ID
  useEffect(() => {
    if (allDevices && expoPushToken) {
      const currentDevice = allDevices.find(d => d.pushToken === expoPushToken);
      if (currentDevice && !deviceId) {
        setDeviceId(currentDevice._id);
      }
    }
  }, [allDevices, expoPushToken, deviceId]);

  return {
    expoPushToken,
    deviceId,
    isLoading,
    error,
    permission,
    canAskAgain,
    registerForPushNotifications,
    requestPermissions,
    sendTestNotification,
    isRegistered,
  };
}
```

---

### STEP 5: Set Up Convex Provider

Update `app/_layout.tsx`:

```typescript
import '@/global.css';
import { NAV_THEME } from '@/lib/theme';
import { ThemeProvider } from '@react-navigation/native';
import { PortalHost } from '@rn-primitives/portal';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'nativewind';
import { ConvexProvider, ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(process.env.EXPO_PUBLIC_CONVEX_URL!);

export { ErrorBoundary } from 'expo-router';

export default function RootLayout() {
  const { colorScheme } = useColorScheme();

  return (
    <ConvexProvider client={convex}>
      <ThemeProvider value={NAV_THEME[colorScheme ?? 'light']}>
        <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
        <Stack />
        <PortalHost />
      </ThemeProvider>
    </ConvexProvider>
  );
}
```

**Verify:** `.env.local` contains `EXPO_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud`

---

### STEP 6: Create User Interface

Update `app/index.tsx` with push notification controls:

```typescript
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Stack } from 'expo-router';
import { BellIcon, StarIcon, RadioIcon, CheckCircleIcon } from 'lucide-react-native';
import * as React from 'react';
import { View, Alert, ScrollView } from 'react-native';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

export default function Screen() {
  const {
    expoPushToken,
    deviceId,
    isLoading,
    error,
    permission,
    registerForPushNotifications,
    sendTestNotification,
    isRegistered,
  } = usePushNotifications();

  const allDevices = useQuery(api.pushNotifications.getAllDevices);
  const sendBroadcast = useMutation(api.pushNotifications.sendBroadcastNotification);

  const handleRegisterToken = async () => {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        Alert.alert('Success!', 'Device registered for push notifications!');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to register device');
    }
  };

  const handleSendBroadcast = async () => {
    if (!isRegistered) {
      Alert.alert('Error', 'Please register your device first');
      return;
    }

    Alert.alert('Send Broadcast', 'Send notification to all devices?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Send',
        onPress: async () => {
          try {
            const result = await sendBroadcast({
              title: '📢 Broadcast Message',
              body: 'Hello everyone! This is a broadcast message.',
              data: { type: 'broadcast', timestamp: Date.now() },
              excludeDeviceId: deviceId || undefined,
            });

            Alert.alert(
              'Broadcast Sent!',
              `Successfully sent to ${result.success} devices!\nFailed: ${result.failed}`
            );
          } catch (error) {
            Alert.alert('Error', 'Failed to send broadcast');
          }
        },
      },
    ]);
  };

  const getStatusColor = () => {
    if (isRegistered) return 'text-green-600';
    if (permission === 'denied') return 'text-red-600';
    return 'text-yellow-600';
  };

  const getStatusText = () => {
    if (isRegistered) return 'Device Registered ✓';
    if (permission === 'denied') return 'Permission Denied';
    if (permission === null) return 'Not Checked';
    return 'Not Registered';
  };

  return (
    <>
      <Stack.Screen options={{ title: 'Push Notifications' }} />
      <ScrollView className="flex-1">
        <View className="flex-1 items-center justify-center gap-6 p-4">
          
          {/* Status Card */}
          <View className="w-full max-w-sm bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <Text className="text-lg font-semibold mb-2">Status</Text>
            <Text className={`${getStatusColor()} font-medium mb-1`}>
              {getStatusText()}
            </Text>
            {allDevices && (
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                Total Devices: {allDevices.length}
              </Text>
            )}
            {error && <Text className="text-red-500 text-sm mt-2">{error}</Text>}
          </View>

          {/* Action Buttons */}
          <View className="gap-3 p-4 w-full max-w-sm">
            <Button 
              onPress={handleRegisterToken}
              disabled={isLoading}
              className={isRegistered ? 'bg-green-600' : ''}
            >
              <Icon as={isRegistered ? CheckCircleIcon : BellIcon} className="mr-2" />
              <Text>{isRegistered ? 'Device Registered' : 'Register Device Token'}</Text>
            </Button>
            
            <Button 
              variant="outline" 
              onPress={sendTestNotification}
              disabled={!isRegistered || isLoading}
            >
              <Icon as={StarIcon} className="mr-2" />
              <Text>Test Push Notification</Text>
            </Button>
            
            <Button 
              variant="outline" 
              onPress={handleSendBroadcast}
              disabled={!isRegistered || isLoading}
            >
              <Icon as={RadioIcon} className="mr-2" />
              <Text>Test Broadcast Notification</Text>
            </Button>
          </View>

          {/* Debug Info */}
          {isRegistered && (
            <View className="w-full max-w-sm bg-blue-50 dark:bg-blue-900 p-4 rounded-lg">
              <Text className="text-sm font-semibold mb-2">Debug Info:</Text>
              <Text className="text-xs font-mono text-gray-600 dark:text-gray-400">
                Device ID: {deviceId?.slice(0, 8)}...
              </Text>
              <Text className="text-xs font-mono text-gray-600 dark:text-gray-400">
                Token: {expoPushToken?.slice(0, 20)}...
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </>
  );
}
```

---

### STEP 7: Testing the Implementation

#### 7.1 Start Development Environment

**Terminal 1 - Convex:**
```bash
bunx convex dev
```

**Terminal 2 - Expo:**
```bash
bun dev
```

**Wait for:**
```
Convex: ✔ Functions ready!
Expo: Metro bundler started
```

---

#### 7.2 Install on Physical Device

**⚠️ CRITICAL: Physical device required. Simulators don't support push notifications.**

**iOS:**
1. Install Expo Go from App Store
2. Scan QR code from terminal

**Android:**
1. Install Expo Go from Play Store
2. Scan QR code from terminal

---

#### 7.3 Testing Workflow

**Test 1: Register Device**
1. Tap "Register Device Token" button
2. Grant permission when prompted
3. Verify "Device Registered ✓" appears
4. Check Convex dashboard: Data → devices table should have entry

**Test 2: Test Notification**
1. Tap "Test Push Notification"
2. Put app in background (don't close completely)
3. Wait 2-3 seconds
4. Should receive: "Test Notification 🎉"

**Test 3: Broadcast**
1. Install on second device OR have another user
2. Both devices register tokens
3. From one device, tap "Test Broadcast Notification"
4. Both devices should receive notification

---

### STEP 8: Troubleshooting Common Issues

#### Issue: "Must use physical device"
- **Cause:** Running on simulator
- **Fix:** Use real iOS/Android device

#### Issue: "Project ID not found"
- **Cause:** EAS not configured
- **Fix:** Run `eas build:configure` and verify `app.json`

#### Issue: "Permission denied"
- **Cause:** User denied permissions
- **Fix:** Settings → App → Notifications → Enable

#### Issue: No notification received
- **Cause:** Multiple possible
- **Fix:**
  1. Verify device registered in Convex dashboard
  2. Check app in background (not completely closed)
  3. Verify network connection
  4. Check Convex logs: `bunx convex logs`

---

### STEP 9: Production Deployment

#### 9.1 Deploy Convex
```bash
bunx convex deploy
```

#### 9.2 Update Environment
Update production Convex URL in your build configuration.

#### 9.3 Build Production App
```bash
# Android
eas build --platform android --profile production

# iOS  
eas build --platform ios --profile production
```

---

## 🎯 Final Checklist

Before marking complete, verify:

- ✅ All dependencies installed
- ✅ Convex schema deployed
- ✅ EAS project configured
- ✅ Device registration works
- ✅ Test notification received
- ✅ Broadcast notification works
- ✅ Foreground notifications display
- ✅ Background notifications work
- ✅ Convex dashboard shows devices
- ✅ No errors in Convex logs

---

## 📚 Quick Reference

```bash
# Development
bunx convex dev              # Start Convex
bun dev                      # Start Expo

# Build
eas build:configure          # Setup EAS
eas build --platform android # Build

# Deploy
bunx convex deploy          # Deploy backend

# Debug
bunx convex logs            # View logs
bunx expo start -c          # Clear cache
```

---

## 🆘 Support

If issues persist:
1. Check Convex dashboard logs
2. Verify all environment variables
3. Clear cache: `bunx expo start -c`
4. Re-run: `bunx convex dev --once`

---

**Implementation Complete!** 🎉

The push notification system is now fully functional with:
- Device-based token management
- No authentication required
- Test and broadcast capabilities
- Production-ready error handling
- Cross-platform support (iOS/Android)