import React from 'react';
import { View, Alert, Linking } from 'react-native';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Button } from './ui/button';
import { Text } from './ui/text';
import { Card } from './ui/card';
import { Icon } from './ui/icon';
import { CheckCircle2, XCircle, Loader2, Bell } from 'lucide-react-native';

interface PushNotificationSetupProps {
  onSetupComplete?: (token: string) => void;
  showTestButton?: boolean;
}

const PushNotificationSetup: React.FC<PushNotificationSetupProps> = ({
  onSetupComplete,
  showTestButton = true,
}) => {
  const {
    expoPushToken,
    isLoading,
    error,
    permission,
    canAskAgain,
    registerForPushNotifications,
    requestPermissions,
    sendTestNotification,
    isRegistered,
  } = usePushNotifications();

  const handleRegister = async () => {
    const token = await registerForPushNotifications();
    if (token && onSetupComplete) {
      onSetupComplete(token);
    }
  };

  const handleTestNotification = async () => {
    try {
      await sendTestNotification();
      Alert.alert('Success', 'Test notification sent! You should receive it shortly.');
    } catch (err) {
      Alert.alert('Error', 'Failed to send test notification');
    }
  };

  const handleOpenSettings = () => {
    Alert.alert(
      'Permission Required',
      'Push notifications are disabled. Please enable them in your device settings.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ]
    );
  };

  const getStatusColor = () => {
    if (isRegistered) return 'text-green-600';
    if (error) return 'text-red-600';
    if (permission === 'denied') return 'text-red-600';  
    return 'text-yellow-600';
  };

  const getStatusIcon = () => {
    if (isRegistered) return CheckCircle2;
    if (error || permission === 'denied') return XCircle;
    if (isLoading) return Loader2;
    return Bell;
  };

  const getStatusText = () => {
    if (isRegistered) return 'Push notifications are enabled';
    if (permission === 'denied') return 'Push notifications are disabled';
    if (permission === 'granted' && !expoPushToken) return 'Setting up notifications...';
    if (error) return error;
    return 'Push notifications not set up';
  };

  return (
    <Card className="p-4 m-4">
      <View className="flex-row items-center mb-4">
        <Icon 
          as={getStatusIcon()} 
          size={24} 
          className={`mr-3 ${getStatusColor()}`}
        />
        <View className="flex-1">
          <Text className="text-lg font-semibold">Push Notifications</Text>
          <Text className={`text-sm ${getStatusColor()}`}>
            {getStatusText()}
          </Text>
        </View>
      </View>

      {error && (
        <View className="bg-red-50 p-3 rounded-lg mb-4">
          <Text className="text-red-800 text-sm">{error}</Text>
        </View>
      )}

      <View className="space-y-3">
        {!isRegistered && (
          <>
            {permission === 'denied' && !canAskAgain ? (
              <Button
                onPress={handleOpenSettings}
                className="bg-orange-600 hover:bg-orange-700"
              >
                <Text className="text-white font-medium">Open Settings</Text>
              </Button>
            ) : (
              <Button
                onPress={handleRegister}
                disabled={isLoading}
                className="bg-blue-600 hover:bg-blue-700"
              >
                <View className="flex-row items-center justify-center">
                  {isLoading && (
                    <Icon as={Loader2} size={16} className="mr-2 text-white animate-spin" />
                  )}
                  <Text className="text-white font-medium">
                    Enable Push Notifications
                  </Text>
                </View>
              </Button>
            )}
          </>
        )}

        {isRegistered && showTestButton && (
          <Button
            onPress={handleTestNotification}
            disabled={isLoading}
            variant="outline"
            className="border-blue-200 hover:bg-blue-50"
          >
            <View className="flex-row items-center justify-center">
              {isLoading && (
                <Icon as={Loader2} size={16} className="mr-2 text-blue-600 animate-spin" />
              )}
              <Text className="text-blue-600 font-medium">
                Send Test Notification
              </Text>
            </View>
          </Button>
        )}
      </View>

      {expoPushToken && __DEV__ && (
        <View className="mt-4 p-3 bg-gray-50 rounded-lg">
          <Text className="text-xs font-mono text-gray-600">
            Token: {expoPushToken.substring(0, 20)}...
          </Text>
        </View>
      )}
    </Card>
  );
};

export default PushNotificationSetup;