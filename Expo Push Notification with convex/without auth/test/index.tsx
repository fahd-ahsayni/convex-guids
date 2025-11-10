import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { Stack } from 'expo-router';
import { MoonStarIcon, StarIcon, SunIcon, BellIcon, RadioIcon, CheckCircleIcon } from 'lucide-react-native';
import { useColorScheme } from 'nativewind';
import * as React from 'react';
import { Image, type ImageStyle, View, Alert, ScrollView } from 'react-native';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { useMutation, useQuery } from 'convex/react';
import { api } from '@/convex/_generated/api';

const LOGO = {
  light: require('@/assets/images/react-native-reusables-light.png'),
  dark: require('@/assets/images/react-native-reusables-dark.png'),
};

const SCREEN_OPTIONS = {
  title: 'React Native Reusables',
  headerTransparent: true,
  headerRight: () => <ThemeToggle />,
};

const IMAGE_STYLE: ImageStyle = {
  height: 76,
  width: 76,
};

export default function Screen() {
  const { colorScheme } = useColorScheme();
  
  // Push notification hook
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

  // Convex queries and mutations
  const allDevices = useQuery(api.pushNotifications.getAllDevices);
  const sendBroadcast = useMutation(api.pushNotifications.sendBroadcastNotification);

  const handleRegisterToken = async () => {
    try {
      const token = await registerForPushNotifications();
      if (token) {
        Alert.alert(
          'Success!', 
          'Device registered for push notifications successfully!',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to register device for push notifications');
    }
  };

  const handleSendBroadcast = async () => {
    if (!isRegistered) {
      Alert.alert('Error', 'Please register your device first');
      return;
    }

    Alert.alert(
      'Send Broadcast',
      'Send a broadcast notification to all registered devices?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            try {
              const result = await sendBroadcast({
                title: '📢 Broadcast Message',
                body: 'Hello everyone! This is a broadcast message from the app.',
                data: {
                  type: 'broadcast',
                  timestamp: Date.now(),
                },
                excludeDeviceId: deviceId || undefined, // Don't send to yourself
              });

              Alert.alert(
                'Broadcast Sent!',
                `Successfully sent to ${result.success} devices!\nFailed: ${result.failed}`,
                [{ text: 'OK' }]
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to send broadcast notification');
            }
          },
        },
      ]
    );
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
      <Stack.Screen options={SCREEN_OPTIONS} />
      <ScrollView className="flex-1">
        <View className="flex-1 items-center justify-center gap-6 p-4">
          <Image source={LOGO[colorScheme ?? 'light']} style={IMAGE_STYLE} resizeMode="contain" />
          
          {/* Status Card */}
          <View className="w-full max-w-sm bg-gray-50 dark:bg-gray-800 p-4 rounded-lg">
            <Text className="text-lg font-semibold mb-2">Push Notification Status</Text>
            <Text className={`${getStatusColor()} font-medium mb-1`}>
              {getStatusText()}
            </Text>
            {allDevices && (
              <Text className="text-sm text-gray-600 dark:text-gray-400">
                Total Devices: {allDevices.length}
              </Text>
            )}
            {error && (
              <Text className="text-red-500 text-sm mt-2">{error}</Text>
            )}
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

const THEME_ICONS = {
  light: SunIcon,
  dark: MoonStarIcon,
};

function ThemeToggle() {
  const { colorScheme, toggleColorScheme } = useColorScheme();

  return (
    <Button
      onPressIn={toggleColorScheme}
      size="icon"
      variant="ghost"
      className="ios:size-9 rounded-full web:mx-4">
      <Icon as={THEME_ICONS[colorScheme ?? 'light']} className="size-5" />
    </Button>
  );
}
