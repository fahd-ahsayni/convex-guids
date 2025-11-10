import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { Alert } from 'react-native';
import { useRouter } from 'expo-router';

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

export default function NotificationListener() {
  const router = useRouter();
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    // Listen for notifications received while app is foregrounded
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('🔔 Notification received:', notification);
      
      // You can customize this behavior based on notification data
      const { data } = notification.request.content;
      
      if (data?.type === 'test') {
        // Handle test notifications differently if needed
        console.log('Test notification received');
      }
    });

    // Listen for notification responses (when user taps on notification)
    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('🔔 Notification response:', response);
      
      const { data } = response.notification.request.content;
      
      // Handle different notification types
      if (data?.type === 'user_message') {
        // Navigate to a specific screen or show details
        Alert.alert(
          'Message Notification',
          `You received a message from user ${data.senderId}`,
          [
            { text: 'OK', style: 'default' },
            { text: 'View', onPress: () => {
              // Navigate to messages or user profile
              router.push('/notifications');
            }},
          ]
        );
      } else if (data?.type === 'test') {
        Alert.alert(
          'Test Notification',
          'This was a test notification!',
          [{ text: 'OK', style: 'default' }]
        );
      } else {
        // Default handling for other notifications
        const title = response.notification.request.content.title;
        const body = response.notification.request.content.body;
        
        if (title || body) {
          Alert.alert(
            title || 'Notification',
            body || 'You have a new notification',
            [
              { text: 'OK', style: 'default' },
              { text: 'View', onPress: () => router.push('/notifications') },
            ]
          );
        }
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
  }, [router]);

  // This component doesn't render anything visible
  return null;
}