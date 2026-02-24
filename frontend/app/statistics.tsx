import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;
const screenWidth = Dimensions.get('window').width;

interface Statistics {
  total_students: number;
  total_classes: number;
  total_absences: number;
  justified_absences: number;
  unjustified_absences: number;
  absences_by_class: { class_name: string; count: number }[];
  absences_by_month: { month: string; count: number }[];
  top_absent_students: { student_name: string; class_name: string; count: number }[];
}

export default function StatisticsScreen() {
  const [stats, setStats] = useState<Statistics | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchStats = async () => {
    try {
      const response = await fetch(`${API_URL}/api/statistics`);
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des statistiques:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchStats();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchStats();
  };

  const getMaxCount = (data: { count: number }[]) => {
    if (!data || data.length === 0) return 1;
    return Math.max(...data.map(item => item.count), 1);
  };

  const formatMonth = (monthStr: string) => {
    const months: { [key: string]: string } = {
      '01': 'Jan', '02': 'Fév', '03': 'Mar', '04': 'Avr',
      '05': 'Mai', '06': 'Jun', '07': 'Jul', '08': 'Aoû',
      '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Déc'
    };
    const [year, month] = monthStr.split('-');
    return `${months[month] || month} ${year?.slice(2) || ''}`;
  };

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Chargement des statistiques...</Text>
      </View>
    );
  }

  const justifiedPercent = stats && stats.total_absences > 0 
    ? Math.round((stats.justified_absences / stats.total_absences) * 100) 
    : 0;
  const unjustifiedPercent = 100 - justifiedPercent;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      {/* Summary Cards */}
      <View style={styles.summaryCards}>
        <View style={[styles.summaryCard, { backgroundColor: '#3B82F6' }]}>
          <Ionicons name="people" size={28} color="#FFFFFF" />
          <Text style={styles.summaryNumber}>{stats?.total_students || 0}</Text>
          <Text style={styles.summaryLabel}>Élèves</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: '#10B981' }]}>
          <Ionicons name="school" size={28} color="#FFFFFF" />
          <Text style={styles.summaryNumber}>{stats?.total_classes || 0}</Text>
          <Text style={styles.summaryLabel}>Classes</Text>
        </View>
        <View style={[styles.summaryCard, { backgroundColor: '#F59E0B' }]}>
          <Ionicons name="calendar" size={28} color="#FFFFFF" />
          <Text style={styles.summaryNumber}>{stats?.total_absences || 0}</Text>
          <Text style={styles.summaryLabel}>Absences</Text>
        </View>
      </View>

      {/* Absence Type Distribution */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Répartition des absences</Text>
        <View style={styles.distributionContainer}>
          <View style={styles.distributionBar}>
            <View 
              style={[
                styles.distributionSegment, 
                { backgroundColor: '#10B981', width: `${justifiedPercent}%` }
              ]} 
            />
            <View 
              style={[
                styles.distributionSegment, 
                { backgroundColor: '#EF4444', width: `${unjustifiedPercent}%` }
              ]} 
            />
          </View>
          <View style={styles.distributionLegend}>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#10B981' }]} />
              <Text style={styles.legendText}>Justifiées</Text>
              <Text style={styles.legendValue}>{stats?.justified_absences || 0} ({justifiedPercent}%)</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
              <Text style={styles.legendText}>Non justifiées</Text>
              <Text style={styles.legendValue}>{stats?.unjustified_absences || 0} ({unjustifiedPercent}%)</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Absences by Class - Bar Chart */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Absences par classe</Text>
        {stats?.absences_by_class && stats.absences_by_class.length > 0 ? (
          <View style={styles.barChart}>
            {stats.absences_by_class.map((item, index) => {
              const maxCount = getMaxCount(stats.absences_by_class);
              const barWidth = (item.count / maxCount) * 100;
              return (
                <View key={index} style={styles.barRow}>
                  <Text style={styles.barLabel} numberOfLines={1}>{item.class_name}</Text>
                  <View style={styles.barContainer}>
                    <View 
                      style={[
                        styles.bar, 
                        { width: `${Math.max(barWidth, 5)}%`, backgroundColor: '#3B82F6' }
                      ]} 
                    />
                    <Text style={styles.barValue}>{item.count}</Text>
                  </View>
                </View>
              );
            })}
          </View>
        ) : (
          <Text style={styles.emptyText}>Aucune donnée</Text>
        )}
      </View>

      {/* Absences by Month - Timeline */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Évolution mensuelle</Text>
        {stats?.absences_by_month && stats.absences_by_month.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.monthlyChart}>
              {stats.absences_by_month.reverse().map((item, index) => {
                const maxCount = getMaxCount(stats.absences_by_month);
                const barHeight = (item.count / maxCount) * 100;
                return (
                  <View key={index} style={styles.monthColumn}>
                    <Text style={styles.monthValue}>{item.count}</Text>
                    <View style={styles.monthBarContainer}>
                      <View 
                        style={[
                          styles.monthBar, 
                          { height: `${Math.max(barHeight, 5)}%` }
                        ]} 
                      />
                    </View>
                    <Text style={styles.monthLabel}>{formatMonth(item.month)}</Text>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        ) : (
          <Text style={styles.emptyText}>Aucune donnée</Text>
        )}
      </View>

      {/* Top Absent Students */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Top élèves absents</Text>
        {stats?.top_absent_students && stats.top_absent_students.length > 0 ? (
          <View>
            {stats.top_absent_students.map((item, index) => (
              <View key={index} style={styles.topStudentRow}>
                <View style={[
                  styles.rankBadge,
                  index === 0 && styles.rankBadgeGold,
                  index === 1 && styles.rankBadgeSilver,
                  index === 2 && styles.rankBadgeBronze,
                ]}>
                  <Text style={styles.rankText}>{index + 1}</Text>
                </View>
                <View style={styles.topStudentInfo}>
                  <Text style={styles.topStudentName}>{item.student_name}</Text>
                  <Text style={styles.topStudentClass}>{item.class_name}</Text>
                </View>
                <View style={styles.absenceCountBadge}>
                  <Ionicons name="calendar" size={14} color="#EF4444" />
                  <Text style={styles.absenceCountText}>{item.count}</Text>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.emptyText}>Aucune donnée</Text>
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
  loadingText: {
    marginTop: 10,
    color: '#6B7280',
    fontSize: 16,
  },
  summaryCards: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  summaryCard: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  summaryNumber: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginTop: 8,
  },
  summaryLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.9,
    marginTop: 4,
  },
  section: {
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 16,
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
    marginBottom: 16,
  },
  distributionContainer: {
    gap: 16,
  },
  distributionBar: {
    flexDirection: 'row',
    height: 24,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  distributionSegment: {
    height: '100%',
  },
  distributionLegend: {
    gap: 8,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    flex: 1,
    fontSize: 14,
    color: '#374151',
  },
  legendValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  barChart: {
    gap: 12,
  },
  barRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  barLabel: {
    width: 80,
    fontSize: 13,
    color: '#374151',
  },
  barContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bar: {
    height: 24,
    borderRadius: 4,
    minWidth: 20,
  },
  barValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  monthlyChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 180,
    paddingTop: 20,
    gap: 16,
  },
  monthColumn: {
    alignItems: 'center',
    width: 50,
  },
  monthValue: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  monthBarContainer: {
    width: 32,
    height: 100,
    backgroundColor: '#F3F4F6',
    borderRadius: 4,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  monthBar: {
    width: '100%',
    backgroundColor: '#3B82F6',
    borderRadius: 4,
  },
  monthLabel: {
    fontSize: 11,
    color: '#6B7280',
    marginTop: 8,
  },
  topStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  rankBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#6B7280',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
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
  topStudentInfo: {
    flex: 1,
  },
  topStudentName: {
    fontSize: 15,
    fontWeight: '500',
    color: '#1F2937',
  },
  topStudentClass: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  absenceCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  absenceCountText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#EF4444',
  },
  emptyText: {
    fontSize: 14,
    color: '#9CA3AF',
    textAlign: 'center',
    paddingVertical: 20,
  },
});
