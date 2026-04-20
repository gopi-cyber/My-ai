import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert, StatusBar } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_URL = 'http://localhost:3142';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Notification {
  id: string;
  text: string;
  type: string;
  timestamp: number;
}

export default function App() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [activeTab, setActiveTab] = useState<'chat' | 'notifications' | 'settings'>('chat');

  useEffect(() => {
    init();
  }, []);

  const init = async () => {
    try {
      const statusRes = await fetch(`${API_URL}/api/mobile/status`);
      if (statusRes.ok) {
        setConnected(true);
        loadHistory();
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    const saved = await AsyncStorage.getItem('chat_history');
    if (saved) setMessages(JSON.parse(saved));
  };

  const saveHistory = async (msgs: Message[]) => {
    await AsyncStorage.setItem('chat_history', JSON.stringify(msgs.slice(-50)));
  };

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setSending(true);

    const userMsg: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => {
      const next = [...prev, userMsg];
      saveHistory(next);
      return next;
    });
    setInput('');

    try {
      const res = await fetch(`${API_URL}/api/mobile/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.content }),
      });

      const data = await res.json();
      const assistantMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || data.error || 'No response',
        timestamp: Date.now(),
      };

      setMessages(prev => {
        const next = [...prev, assistantMsg];
        saveHistory(next);
        return next;
      });
    } catch (err) {
      Alert.alert('Error', 'Failed to send message');
    } finally {
      setSending(false);
    }
  };

  const renderChat = () => (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#0a0a0f" />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>AETHER</Text>
          <View style={[styles.statusDot, { backgroundColor: connected ? '#0f0' : '#f00' }]} />
        </View>

        <ScrollView style={styles.messageList} contentContainerStyle={styles.messageContent}>
          {messages.map(msg => (
            <View key={msg.id} style={[styles.message, msg.role === 'user' ? styles.userMessage : styles.assistantMessage]}>
              <Text style={styles.messageText}>{msg.content}</Text>
            </View>
          ))}
          {sending && <ActivityIndicator color="#00ff88" />}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TextInput
            style={styles.input}
            value={input}
            onChangeText={setInput}
            placeholder="Message AETHER..."
            placeholderTextColor="#666"
            multiline
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage}>
            <Text style={styles.sendText}>→</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );

  const renderNotifications = () => (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Notifications</Text>
        </View>
        <ScrollView style={styles.notificationList}>
          {notifications.length === 0 ? (
            <Text style={styles.emptyText}>No notifications</Text>
          ) : (
            notifications.map(n => (
              <View key={n.id} style={styles.notification}>
                <Text style={styles.notificationText}>{n.text}</Text>
              </View>
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );

  const renderSettings = () => (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Settings</Text>
        </View>
        <ScrollView style={styles.settingsList}>
          <TouchableOpacity style={styles.settingItem} onPress={() => Alert.alert('Info', 'AETHER Mobile v1.0.0')}>
            <Text style={styles.settingText}>About</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.settingItem} onPress={() => { AsyncStorage.clear(); setMessages([]); }}>
            <Text style={styles.settingText}>Clear History</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, styles.loading]}>
        <ActivityIndicator size="large" color="#00ff88" />
      </View>
    );
  }

  return (
    <View style={styles.tabContainer}>
      {activeTab === 'chat' && renderChat()}
      {activeTab === 'notifications' && renderNotifications()}
      {activeTab === 'settings' && renderSettings()}

      <View style={styles.tabBar}>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('chat')}>
          <Text style={[styles.tabText, activeTab === 'chat' && styles.activeTab]}>💬</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('notifications')}>
          <Text style={[styles.tabText, activeTab === 'notifications' && styles.activeTab]}>🔔</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.tab} onPress={() => setActiveTab('settings')}>
          <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTab]}>⚙️</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0f' },
  safeArea: { flex: 1 },
  loading: { justifyContent: 'center', alignItems: 'center' },
  tabContainer: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#222' },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#fff', flex: 1 },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  messageList: { flex: 1 },
  messageContent: { padding: 16 },
  message: { padding: 12, borderRadius: 12, marginBottom: 8, maxWidth: '80%' },
  userMessage: { alignSelf: 'flex-end', backgroundColor: '#00ff88' },
  assistantMessage: { alignSelf: 'flex-start', backgroundColor: '#222' },
  messageText: { color: '#fff', fontSize: 16 },
  inputContainer: { flexDirection: 'row', padding: 12, borderTopWidth: 1, borderTopColor: '#222' },
  input: { flex: 1, backgroundColor: '#1a1a1f', color: '#fff', padding: 12, borderRadius: 8, marginRight: 8 },
  sendButton: { backgroundColor: '#00ff88', padding: 12, borderRadius: 8, width: 50, alignItems: 'center' },
  sendText: { color: '#000', fontSize: 20, fontWeight: 'bold' },
  notificationList: { flex: 1, padding: 16 },
  notification: { backgroundColor: '#1a1a1f', padding: 12, borderRadius: 8, marginBottom: 8 },
  notificationText: { color: '#fff', fontSize: 14 },
  emptyText: { color: '#666', textAlign: 'center', marginTop: 40 },
  settingsList: { flex: 1, padding: 16 },
  settingItem: { backgroundColor: '#1a1a1f', padding: 16, borderRadius: 8, marginBottom: 8 },
  settingText: { color: '#fff', fontSize: 16 },
  tabBar: { flexDirection: 'row', backgroundColor: '#0a0a0f', borderTopWidth: 1, borderTopColor: '#222' },
  tab: { flex: 1, alignItems: 'center', padding: 16 },
  tabText: { fontSize: 24, opacity: 0.5 },
  activeTab: { opacity: 1 },
});