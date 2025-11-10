import { useEffect, useState, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';

export interface PushNotificationState {
  expoPushToken: string | null;
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

// Configure how notifications are handled when the app is in the foreground
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
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permission, setPermission] = useState<Notifications.PermissionStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  // Convex mutations and queries
  const recordPushToken = useMutation(api.pushNotifications.recordPushToken);
  const sendTestNotification = useMutation(api.pushNotifications.sendTestNotification);
  const currentUser = useQuery(api.pushNotifications.getCurrentUserWithToken);

  const isRegistered = Boolean(currentUser?.pushToken && expoPushToken);

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
      console.log('Notification received in foreground:', notification);
    });

    // Listener for when user taps on a notification
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification tapped:', response);
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
      setIsLoading(true);
      setError(null);

      const { status, canAskAgain: canAsk } = await Notifications.requestPermissionsAsync();
      
      setPermission(status);
      setCanAskAgain(canAsk);

      if (status === 'granted') {
        return true;
      } else {
        setError('Permission not granted for push notifications');
        return false;
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to request permissions';
      setError(errorMessage);
      return false;
    } finally {
      setIsLoading(false);
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
        handleRegistrationError('Project ID not found');
        return null;
      }

      const pushTokenData = await Notifications.getExpoPushTokenAsync({
        projectId,
      });
      
      const pushToken = pushTokenData.data;
      setExpoPushToken(pushToken);

      // Record the token in Convex
      await recordPushToken({ token: pushToken });

      console.log('Push token registered successfully:', pushToken);
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

  const handleSendTestNotification = async (): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      if (!isRegistered) {
        throw new Error('Not registered for push notifications');
      }

      await sendTestNotification();
      console.log('Test notification sent successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to send test notification';
      console.error('Test notification error:', errorMessage);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  // Auto-set token if user already has one
  useEffect(() => {
    if (currentUser?.pushToken && !expoPushToken) {
      setExpoPushToken(currentUser.pushToken);
    }
  }, [currentUser?.pushToken, expoPushToken]);

  return {
    expoPushToken,
    isLoading,
    error,
    permission,
    canAskAgain,
    registerForPushNotifications,
    requestPermissions,
    sendTestNotification: handleSendTestNotification,
    isRegistered,
  };
}