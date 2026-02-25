import React, { useState, useCallback } from 'react';
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
import { useFocusEffect, useRouter } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

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
  const router = useRouter();
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
        <View style={styles.loadingIcon}>
          <Ionicons name="school" size={48} color="#3B82F6" />
        </View>
        <ActivityIndicator size="large" color="#3B82F6" style={{ marginTop: 20 }} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  const today = format(new Date(), "EEEE d MMMM yyyy", { locale: fr });

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <Ionicons name="school" size={32} color="#FFFFFF" />
          <View style={styles.headerText}>
            <Text style={styles.appTitle}>Gestion des Absences</Text>
            <Text style={styles.dateText}>{today}</Text>
          </View>
        </View>
      </View>

      {/* Quick Action */}
      <TouchableOpacity 
        style={styles.quickAction}
        onPress={() => router.push('/appel')}
        activeOpacity={0.8}
      >
        <View style={styles.quickActionIcon}>
          <Ionicons name="checkbox" size={28} color="#FFFFFF" />
        </View>
        <View style={styles.quickActionContent}>
          <Text style={styles.quickActionTitle}>Faire l'appel</Text>
          <Text style={styles.quickActionSubtitle}>Marquer les absences du jour</Text>
        </View>
        <Ionicons name="chevron-forward" size={24} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Stats Cards */}
      <View style={styles.statsGrid}>
        <View style={[styles.statCard, { backgroundColor: '#3B82F6' }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="people" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.statNumber}>{stats?.total_students || 0}</Text>
          <Text style={styles.statLabel}>Élèves</Text>
        </View>
        
        <View style={[styles.statCard, { backgroundColor: '#10B981' }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="school" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.statNumber}>{stats?.total_classes || 0}</Text>
          <Text style={styles.statLabel}>Classes</Text>
        </View>
        
        <View style={[styles.statCard, { backgroundColor: '#F59E0B' }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="calendar" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.statNumber}>{stats?.total_absences || 0}</Text>
          <Text style={styles.statLabel}>Absences</Text>
        </View>
        
        <View style={[styles.statCard, { backgroundColor: '#EF4444' }]}>
          <View style={styles.statIconContainer}>
            <Ionicons name="alert-circle" size={24} color="#FFFFFF" />
          </View>
          <Text style={styles.statNumber}>{stats?.unjustified_absences || 0}</Text>
          <Text style={styles.statLabel}>Non justifiées</Text>
        </View>
      </View>

      {/* Absences by Class */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="stats-chart" size={20} color="#3B82F6" />
          <Text style={styles.sectionTitle}>Absences par classe</Text>
        </View>
        {stats?.absences_by_class && stats.absences_by_class.length > 0 ? (
          stats.absences_by_class.slice(0, 5).map((item, index) => (
            <View key={index} style={styles.listItem}>
              <View style={styles.listItemLeft}>
                <View style={[styles.classIcon, { backgroundColor: `hsl(${index * 60}, 70%, 50%)` }]}>
                  <Text style={styles.classIconText}>{item.class_name.charAt(0)}</Text>
                </View>
                <Text style={styles.listItemText}>{item.class_name}</Text>
              </View>
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{item.count}</Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="checkmark-circle" size={40} color="#10B981" />
            <Text style={styles.emptyStateText}>Aucune absence enregistrée</Text>
          </View>
        )}
      </View>

      {/* Top Absent Students */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="warning" size={20} color="#EF4444" />
          <Text style={styles.sectionTitle}>Élèves les plus absents</Text>
        </View>
        {stats?.top_absent_students && stats.top_absent_students.length > 0 ? (
          stats.top_absent_students.slice(0, 5).map((item, index) => (
            <View key={index} style={styles.listItem}>
              <View style={styles.listItemLeft}>
                <View style={[
                  styles.rankBadge,
                  index === 0 && styles.rankBadgeGold,
                  index === 1 && styles.rankBadgeSilver,
                  index === 2 && styles.rankBadgeBronze,
                ]}>
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
          <View style={styles.emptyState}>
            <Ionicons name="happy" size={40} color="#10B981" />
            <Text style={styles.emptyStateText}>Pas d'absences répétées</Text>
          </View>
        )}
      </View>

      {/* Recent Notifications */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Ionicons name="notifications" size={20} color="#F59E0B" />
          <Text style={styles.sectionTitle}>Notifications récentes</Text>
        </View>
        {notifications.length > 0 ? (
          notifications.map((notif) => (
            <View key={notif.id} style={styles.notificationItem}>
              <View style={styles.notificationDot} />
              <View style={styles.notificationContent}>
                <Text style={styles.notificationStudent}>{notif.student_name}</Text>
                <Text style={styles.notificationMessage} numberOfLines={2}>
                  {notif.message}
                </Text>
              </View>
            </View>
          ))
        ) : (
          <View style={styles.emptyState}>
            <Ionicons name="mail-open" size={40} color="#9CA3AF" />
            <Text style={styles.emptyStateText}>Aucune notification</Text>
          </View>
        )}
      </View>

      <View style={{ height: 30 }} />
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
  loadingIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#EBF5FF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 12,
    color: '#6B7280',
    fontSize: 16,
  },
  header: {
    backgroundColor: '#3B82F6',
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerText: {
    marginLeft: 12,
  },
  appTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  dateText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  quickAction: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#10B981',
    marginHorizontal: 16,
    marginTop: -20,
    padding: 16,
    borderRadius: 16,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  quickActionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionContent: {
    flex: 1,
    marginLeft: 12,
  },
  quickActionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  quickActionSubtitle: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 12,
    paddingTop: 20,
    gap: 12,
  },
  statCard: {
    width: '47%',
    padding: 16,
    borderRadius: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  statNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  statLabel: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#1F2937',
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
    flex: 1,
  },
  classIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  classIconText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  listItemText: {
    fontSize: 15,
    color: '#374151',
    fontWeight: '500',
  },
  listItemSubtext: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  badge: {
    backgroundColor: '#EBF5FF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
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
    backgroundColor: '#6B7280',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankBadgeGold: {
    backgroundColor: '#F59E0B',
  },
  rankBadgeSilver: {
    backgroundColor: '#9CA3AF',
  },
  rankBadgeBronze: {
    backgroundColor: '#CD7F32',
  },
  rankText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  emptyStateText: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  notificationDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F59E0B',
    marginTop: 5,
  },
  notificationContent: {
    flex: 1,
  },
  notificationStudent: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  notificationMessage: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
    lineHeight: 18,
  },
});
