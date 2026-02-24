import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Statistics {
  total_students: number;
  total_classes: number;
  total_absences: number;
  justified_absences: number;
  unjustified_absences: number;
  absences_by_class: { class_name: string; count: number }[];
  top_absent_students: { student_name: string; class_name: string; count: number }[];
}

interface Notification {
  id: string;
  student_name: string;
  message: string;
  read: boolean;
  created_at: string;
}

export default function Dashboard() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      const [statsRes, notifRes] = await Promise.all([
        fetch(`${API_URL}/api/statistics`),
        fetch(`${API_URL}/api/notifications?unread_only=true`),
      ]);
      
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
      
      if (notifRes.ok) {
        const notifData = await notifRes.json();
        setNotifications(notifData.slice(0, 5));
      }
    } catch (error) {
      console.error('Erreur lors du chargement:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#3B82F6' }]}>
          <Ionicons name="people" size={32} color="#FFFFFF" />
          <Text style={styles.statNumber}>{stats?.total_students || 0}</Text>
          <Text style={styles.statLabel}>Élèves</Text>
        </View>
        
        <View style={[styles.statCard, { backgroundColor: '#10B981' }]}>
          <Ionicons name="school" size={32} color="#FFFFFF" />
          <Text style={styles.statNumber}>{stats?.total_classes || 0}</Text>
          <Text style={styles.statLabel}>Classes</Text>
        </View>
        
        <View style={[styles.statCard, { backgroundColor: '#F59E0B' }]}>
          <Ionicons name="calendar" size={32} color="#FFFFFF" />
          <Text style={styles.statNumber}>{stats?.total_absences || 0}</Text>
          <Text style={styles.statLabel}>Absences</Text>
        </View>
        
        <View style={[styles.statCard, { backgroundColor: '#EF4444' }]}>
          <Ionicons name="alert-circle" size={32} color="#FFFFFF" />
          <Text style={styles.statNumber}>{stats?.unjustified_absences || 0}</Text>
          <Text style={styles.statLabel}>Non justifiées</Text>
        </View>
      </View>

      {/* Absences by Class */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Absences par classe</Text>
        {stats?.absences_by_class && stats.absences_by_class.length > 0 ? (
          stats.absences_by_class.map((item, index) => (
            <View key={index} style={styles.listItem}>
              <View style={styles.listItemLeft}>
                <Ionicons name="school-outline" size={20} color="#6B7280" />
                <Text style={styles.listItemText}>{item.class_name}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.count}</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Aucune donnée disponible</Text>
        )}
      </View>

      {/* Top Absent Students */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Élèves les plus absents</Text>
        {stats?.top_absent_students && stats.top_absent_students.length > 0 ? (
          stats.top_absent_students.slice(0, 5).map((item, index) => (
            <View key={index} style={styles.listItem}>
              <View style={styles.listItemLeft}>
                <View style={styles.rankBadge}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View>
                  <Text style={styles.listItemText}>{item.student_name}</Text>
                  <Text style={styles.listItemSubtext}>{item.class_name}</Text>
                </View>
              </View>
              <View style={[styles.badge, { backgroundColor: '#FEE2E2' }]}>
                <Text style={[styles.badgeText, { color: '#EF4444' }]}>{item.count} abs.</Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Aucune donnée disponible</Text>
        )}
      </View>

      {/* Recent Notifications */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications récentes</Text>
        {notifications.length > 0 ? (
          notifications.map((notif) => (
            <View key={notif.id} style={styles.notificationItem}>
              <Ionicons name="notifications" size={20} color="#F59E0B" />
              <View style={styles.notificationContent}>
                <Text style={styles.notificationStudent}>{notif.student_name}</Text>
                <Text style={styles.notificationMessage} numberOfLines={2}>
                  {notif.message}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <Text style={styles.emptyText}>Aucune notification non lue</Text>
        )}
      </View>

      <View style={{ height: 20 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F4F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F3F4F6',
  },
  loadingText: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    gap: 12,
  },
  statCard: {
    width: '47%',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statNumber: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 12,
    marginTop: 12,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  listItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  listItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  listItemText: {
    fontSize: 16,
    color: '#374151',
  },
  listItemSubtext: {
    fontSize: 13,
    color: '#9CA3AF',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#EBF5FF',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 16,
  },
  badgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notificationContent: {
    flex: 1,
  },
  notificationStudent: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1F2937',
  },
  notificationMessage: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
});
