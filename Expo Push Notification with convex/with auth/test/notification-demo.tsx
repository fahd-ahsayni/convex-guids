import React, { useState } from 'react';
import { View, ScrollView, Alert } from 'react-native';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../convex/_generated/api';
import { usePushNotifications } from '../hooks/usePushNotifications';
import { Button } from './ui/button';  
import { Text } from './ui/text';
import { Card } from './ui/card';
import { Icon } from './ui/icon';
import PushNotificationSetup from './push-notification-setup';
import { Send, Users, Bell, MessageSquare, Radio } from 'lucide-react-native';
import { Id } from '../convex/_generated/dataModel';

const NotificationDemo: React.FC = () => {
  const [selectedUserId, setSelectedUserId] = useState<Id<"users"> | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Convex hooks
  const sendNotificationToUser = useMutation(api.pushNotifications.sendNotificationToUser);
  const sendTestNotification = useMutation(api.pushNotifications.sendTestNotification);
  const sendBroadcastNotification = useMutation(api.pushNotifications.sendBroadcastNotification);
  const sendSystemBroadcast = useMutation(api.pushNotifications.sendSystemBroadcast);
  const allUsers = useQuery(api.users.getAllUsers);
  const currentUser = useQuery(api.pushNotifications.getCurrentUserWithToken);
  const pushStatus = useQuery(api.pushNotifications.getMyPushStatus);
  const current = useQuery(api.users.viewer);

  console.log('Current User:', currentUser);
  // Push notification hook
  const { isRegistered } = usePushNotifications();

  const handleSendToUser = async (recipientId: Id<"users">) => {
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to send notifications');
      return;
    }

    setIsLoading(true);
    try {
      const notificationId = await sendNotificationToUser({
        recipientId,
        title: `Hello from ${current?.email || 'Anonymous'}! 👋`,
        body: 'This is a test notification sent through Convex push notifications.',
        data: {
          type: 'user_message',
          senderId: currentUser._id,
          timestamp: Date.now(),
        },
      });

      if (notificationId) {
        Alert.alert('Success', 'Notification sent successfully!');
      } else {
        Alert.alert('Info', 'User has no push token registered');
      }
    } catch (error) {
      console.error('Failed to send notification:', error);
      Alert.alert('Error', 'Failed to send notification');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendTestNotification = async () => {
    setIsLoading(true);
    try {
      const notificationId = await sendTestNotification();
      if (notificationId) {
        Alert.alert('Success', 'Test notification sent! Check your device.');
      } else {
        Alert.alert('Info', 'No push token registered');
      }
    } catch (error) {
      console.error('Failed to send test notification:', error);
      Alert.alert('Error', 'Failed to send test notification');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendBroadcast = async () => {
    if (!currentUser) {
      Alert.alert('Error', 'You must be logged in to send broadcast notifications');
      return;
    }

    Alert.alert(
      'Send Broadcast Notification',
      'This will send a notification to all users with push notifications enabled. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'default',
          onPress: async () => {
            setIsLoading(true);
            try {
              const result = await sendBroadcastNotification({
                title: '📢 Broadcast Message',
                body: `Hello everyone! This is a broadcast message from ${current?.email || 'the app'}.`,
                data: {
                  type: 'broadcast',
                  senderId: currentUser._id,
                  timestamp: Date.now(),
                },
                excludeCurrentUser: true, // Don't send to yourself
              });

              Alert.alert(
                'Broadcast Complete',
                `Sent to ${result.success} users successfully.\n${result.failed > 0 ? `Failed: ${result.failed}` : ''}\nTotal eligible users: ${result.total}`,
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Failed to send broadcast:', error);
              Alert.alert('Error', 'Failed to send broadcast notification');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleSendSystemBroadcast = async () => {
    Alert.alert(
      'Send System Broadcast',
      'This will send a notification to ALL users in the app (no authentication required). This is perfect for maintenance alerts, emergency notifications, or app-wide announcements. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send to All',
          style: 'default',
          onPress: async () => {
            setIsLoading(true);
            try {
              const result = await sendSystemBroadcast({
                title: '🚨 System Announcement',
                body: 'This is a system-wide notification sent to all app users.',
                data: {
                  type: 'system_broadcast',
                  timestamp: Date.now(),
                  priority: 'high',
                },
              });

              Alert.alert(
                'System Broadcast Complete',
                `✅ Sent to ${result.success} users successfully\n` +
                `📊 Total users: ${result.totalUsers}\n` +
                `🔔 Users with notifications: ${result.usersWithTokens}\n` +
                `🔕 Users without notifications: ${result.usersWithoutTokens}\n` +
                `${result.failed > 0 ? `❌ Failed: ${result.failed}` : ''}`,
                [{ text: 'OK' }]
              );
            } catch (error) {
              console.error('Failed to send system broadcast:', error);
              Alert.alert('Error', 'Failed to send system broadcast notification');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const otherUsers = allUsers?.filter(user => user._id !== currentUser?._id) || [];

  return (
    <ScrollView className="flex-1 bg-gray-50">
      <View className="p-4 space-y-4">
        {/* Header */}
        <Card className="p-4">
          <View className="flex-row items-center mb-2">
            <Icon as={Bell} size={24} className="mr-3 text-blue-600" />
            <Text className="text-xl font-bold">Push Notifications Demo</Text>
          </View>
          <Text className="text-gray-600">
            Test push notifications with Convex and Expo
          </Text>
        </Card>

        {/* Setup Section */}
        <PushNotificationSetup
          onSetupComplete={(token) => {
            Alert.alert('Setup Complete', 'Push notifications are now enabled!');
          }}
          showTestButton={false}
        />

        {/* Status Card */}
        <Card className="p-4">
          <View className="flex-row items-center mb-3">
            <Icon as={MessageSquare} size={20} className="mr-2 text-green-600" />
            <Text className="text-lg font-semibold">Status</Text>
          </View>
          
          <View className="space-y-2">
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Registration Status:</Text>
              <Text className={isRegistered ? 'text-green-600' : 'text-red-600'}>
                {isRegistered ? '✓ Registered' : '✗ Not Registered'}
              </Text>
            </View>
            
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Push Token:</Text>
              <Text className={pushStatus?.hasToken ? 'text-green-600' : 'text-red-600'}>
                {pushStatus?.hasToken ? '✓ Available' : '✗ Missing'}
              </Text>
            </View>
            
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Notifications:</Text>
              <Text className={!pushStatus?.paused ? 'text-green-600' : 'text-orange-600'}>
                {!pushStatus?.paused ? '✓ Enabled' : '⏸ Paused'}
              </Text>
            </View>
          </View>
        </Card>

        {/* Test Notification */}
        {isRegistered && (
          <Card className="p-4">
            <View className="flex-row items-center mb-3">
              <Icon as={Send} size={20} className="mr-2 text-blue-600" />
              <Text className="text-lg font-semibold">Test Notification</Text>
            </View>
            
            <Text className="text-gray-600 mb-3">
              Send a test notification to yourself
            </Text>
            
            <Button
              onPress={handleSendTestNotification}
              disabled={isLoading}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <View className="flex-row items-center justify-center">
                {isLoading && (
                  <Icon as={Send} size={16} className="mr-2 text-white animate-spin" />
                )}
                <Text className="text-white font-medium">
                  Send Test Notification
                </Text>
              </View>
            </Button>
          </Card>
        )}

        {/* System Broadcast - No Authentication Required */}
        <Card className="p-4 border-red-200">
          <View className="flex-row items-center mb-3">
            <Icon as={Radio} size={20} className="mr-2 text-red-600" />
            <Text className="text-lg font-semibold text-red-800">System Broadcast</Text>
          </View>
          
          <Text className="text-gray-600 mb-3">
            Send notifications to ALL users in the app (no authentication required)
          </Text>
          
          <View className="flex-row items-center justify-between p-3 bg-red-50 rounded-lg mb-3">
            <View className="flex-1">
              <Text className="font-medium text-red-800">
                🚨 System-Wide Notification
              </Text>
              <Text className="text-sm text-red-600">
                Total users: {allUsers?.length || 0} | With notifications: {allUsers?.filter(u => u.pushToken).length || 0}
              </Text>
            </View>
          </View>
          
          <Button
            onPress={handleSendSystemBroadcast}
            disabled={isLoading}
            className="bg-red-600 hover:bg-red-700"
          >
            <View className="flex-row items-center justify-center">
              {isLoading && (
                <Icon as={Radio} size={16} className="mr-2 text-white animate-spin" />
              )}
              <Text className="text-white font-medium">
                Send to All Users
              </Text>
            </View>
          </Button>
        </Card>

        {/* Broadcast Notification - Requires Authentication */}
        {isRegistered && (
          <Card className="p-4">
            <View className="flex-row items-center mb-3">
              <Icon as={Radio} size={20} className="mr-2 text-orange-600" />
              <Text className="text-lg font-semibold">User Broadcast</Text>
            </View>
            
            <Text className="text-gray-600 mb-3">
              Send a notification to other authenticated users (requires login)
            </Text>
            
            <View className="flex-row items-center justify-between p-3 bg-orange-50 rounded-lg mb-3">
              <View className="flex-1">
                <Text className="font-medium text-orange-800">
                  📢 Broadcast to Other Users
                </Text>
                <Text className="text-sm text-orange-600">
                  {allUsers?.filter(u => u.pushToken && u._id !== currentUser?._id).length || 0} eligible recipients
                </Text>
              </View>
            </View>
            
            <Button
              onPress={handleSendBroadcast}
              disabled={isLoading || !allUsers?.some(u => u.pushToken && u._id !== currentUser?._id)}
              className="bg-orange-600 hover:bg-orange-700"
            >
              <View className="flex-row items-center justify-center">
                {isLoading && (
                  <Icon as={Radio} size={16} className="mr-2 text-white animate-spin" />
                )}
                <Text className="text-white font-medium">
                  Send User Broadcast
                </Text>
              </View>
            </Button>
          </Card>
        )}

        {/* Send to Other Users */}
        {isRegistered && otherUsers.length > 0 && (
          <Card className="p-4">
            <View className="flex-row items-center mb-3">
              <Icon as={Users} size={20} className="mr-2 text-purple-600" />
              <Text className="text-lg font-semibold">Send to Individual Users</Text>
            </View>
            
            <Text className="text-gray-600 mb-3">
              Send notifications to specific users
            </Text>
            
            <View className="space-y-2">
              {otherUsers.map((user) => (
                <View key={user._id} className="flex-row items-center justify-between p-3 bg-gray-100 rounded-lg">
                  <View>
                    <Text className="font-medium">
                      {user.name || user.email || 'Anonymous User'}
                    </Text>
                    <Text className="text-sm text-gray-500">
                      {user.pushToken ? 'Push enabled' : 'No push token'}
                    </Text>
                  </View>
                  
                  <Button
                    onPress={() => handleSendToUser(user._id)}
                    disabled={isLoading || !user.pushToken}
                    size="sm"
                    variant={user.pushToken ? 'default' : 'outline'}
                    className={user.pushToken ? 'bg-purple-600 hover:bg-purple-700' : ''}
                  >
                    <Text className={user.pushToken ? 'text-white' : 'text-gray-400'}>
                      Send
                    </Text>
                  </Button>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Instructions */}
        <Card className="p-4">
          <Text className="text-lg font-semibold mb-3">How it works</Text>
          <View className="space-y-2">
            <Text className="text-gray-600">• Enable push notifications using the setup card above</Text>
            <Text className="text-gray-600">• Your push token will be registered with Convex</Text>
            <Text className="text-gray-600">• Send test notifications to yourself</Text>
            <Text className="text-gray-600">• Send notifications to other users in the app</Text>
            <Text className="text-gray-600">• Notifications work even when the app is closed</Text>
          </View>
        </Card>

        {/* Debug Info (Development only) */}
        {__DEV__ && currentUser && (
          <Card className="p-4 bg-yellow-50">
            <Text className="text-sm font-mono text-gray-700 mb-2">Debug Info:</Text>
            <Text className="text-xs font-mono text-gray-600">
              User ID: {currentUser._id}
            </Text>
            <Text className="text-xs font-mono text-gray-600">
              Has Token: {currentUser.pushToken ? 'Yes' : 'No'}
            </Text>
            <Text className="text-xs font-mono text-gray-600">
              Total Users: {allUsers?.length || 0}
            </Text>
          </Card>
        )}
      </View>
    </ScrollView>
  );
};

export default NotificationDemo;