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

// Configure notification behavior when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

function handleRegistrationError(errorMessage: string) {
  console.error('Push notification registration error:', errorMessage);
  throw new Error(errorMessage);
}

export function usePushNotifications(): UsePushNotificationsReturn {
  const [expoPushToken, setExpoPushToken] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<Id<"devices"> | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Convex mutations and queries
  const registerDevice = useMutation(api.pushNotifications.registerDevice);
  const sendTestNotificationMutation = useMutation(api.pushNotifications.sendTestNotification);
  const allDevices = useQuery(api.pushNotifications.getAllDevices);

  const isRegistered = Boolean(deviceId && expoPushToken);

  // Check initial permission status
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
    // Listener for notifications received while app is in foreground
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification received in foreground:', notification);
    });

    // Listener for when user taps on a notification
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
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
    };
  }, []);

  const requestPermissions = async (): Promise<boolean> => {
    try {
      const { status, canAskAgain: canAsk } = await Notifications.requestPermissionsAsync();
      setPermission(status);
      setCanAskAgain(canAsk);
      
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Push notifications need to be enabled in settings to receive notifications.',
          [{ text: 'OK' }]
        );
        return false;
      }
      
      return true;
    } catch (error) {
      console.error('Permission request error:', error);
      setError('Failed to request permissions');
      return false;
    }
  };

  const registerForPushNotifications = async (): Promise<string | null> => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if running on physical device
      if (!Device.isDevice) {
        handleRegistrationError('Must use physical device for push notifications');
        return null;
      }

      // Set up Android notification channel
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // Check/request permissions
      let finalStatus = permission;
      
      if (finalStatus !== 'granted') {
        const hasPermission = await requestPermissions();
        if (!hasPermission) {
          return null;
        }
        // Get the updated permission status
        const { status } = await Notifications.getPermissionsAsync();
        finalStatus = status;
      }

      // Get the Expo push token
      const projectId = Constants?.expoConfig?.extra?.eas?.projectId ?? 
                        Constants?.easConfig?.projectId;
      
      if (!projectId) {
        handleRegistrationError('Project ID not found in configuration');
        return null;
      }

      const pushTokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      
      const pushToken = pushTokenData.data;
      setExpoPushToken(pushToken);

      // Register device with Convex
      const newDeviceId = await registerDevice({
        pushToken,
        deviceId: Device.osInternalBuildId || undefined,
        platform: Platform.OS,
        appVersion: Constants.expoConfig?.version,
      });
      
      setDeviceId(newDeviceId);

      console.log('✅ Push token registered successfully:', pushToken);
      return pushToken;

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to register for push notifications';
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
      console.log('✅ Test notification sent successfully');
      
      Alert.alert(
        'Test Sent!', 
        'Test notification has been sent. You should receive it shortly.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send test notification';
      console.error('Test notification error:', errorMessage);
      setError(errorMessage);
      Alert.alert('Error', errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-set token and device ID if already registered
  useEffect(() => {
    if (allDevices && expoPushToken) {
      const currentDevice = allDevices.find(device => device.pushToken === expoPushToken);
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