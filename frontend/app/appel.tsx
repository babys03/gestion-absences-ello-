import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons'
import { useFocusEffect } from 'expo-router';
import { format, addDays, subDays } from 'date-fns';
import { fr } from 'date-fns/locale';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name?: string;
}

interface ClassItem {
  id: string;
  name: string;
  level: string;
}

interface AbsenceRecord {
  student_id: string;
  absence_id?: string;
  is_absent: boolean;
  type: string;
  reason?: string;
}

export default function AppelScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [absences, setAbsences] = useState<Map<string, AbsenceRecord>>(new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fetchData = async () => {
    try {
      const [studentsRes, classesRes] = await Promise.all([
        fetch(`${API_URL}/api/students${selectedClass ? `?class_id=${selectedClass}` : ''}`),
        fetch(`${API_URL}/api/classes`),
      ]);

      if (classesRes.ok) {
        const classesData = await classesRes.json();
        setClasses(classesData);
        // Select first class by default if none selected
        if (!selectedClass && classesData.length > 0) {
          setSelectedClass(classesData[0].id);
        }
      }

      if (studentsRes.ok) {
        const studentsData = await studentsRes.json();
        setStudents(studentsData);
      }

      // Fetch existing absences for the selected date
      await fetchAbsencesForDate();
    } catch (error) {
      console.error('Erreur:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchAbsencesForDate = async () => {
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch(`${API_URL}/api/absences?start_date=${dateStr}&end_date=${dateStr}`);
      
      if (response.ok) {
        const data = await response.json();
        const absenceMap = new Map<string, AbsenceRecord>();
        
        data.forEach((absence: any) => {
          absenceMap.set(absence.student_id, {
            student_id: absence.student_id,
            absence_id: absence.id,
            is_absent: true,
            type: absence.type,
            reason: absence.reason,
          });
        });
        
        setAbsences(absenceMap);
      }
    } catch (error) {
      console.error('Erreur chargement absences:', error);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchData();
    }, [selectedClass])
  );

  // Refetch absences when date changes
  React.useEffect(() => {
    fetchAbsencesForDate();
  }, [selectedDate]);

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const changeDate = (days: number) => {
    setSelectedDate(prev => days > 0 ? addDays(prev, days) : subDays(prev, Math.abs(days)));
  };

  const toggleAbsence = async (student: Student) => {
    const currentRecord = absences.get(student.id);
    const isCurrentlyAbsent = currentRecord?.is_absent || false;

    setSaving(true);
    try {
      if (isCurrentlyAbsent && currentRecord?.absence_id) {
        // Remove absence
        const response = await fetch(`${API_URL}/api/absences/${currentRecord.absence_id}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          const newAbsences = new Map(absences);
          newAbsences.delete(student.id);
          setAbsences(newAbsences);
        }
      } else {
        // Add absence
        const response = await fetch(`${API_URL}/api/absences`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            student_id: student.id,
            date: format(selectedDate, 'yyyy-MM-dd'),
            type: 'non_justifiée',
            notify_parent: true,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const newAbsences = new Map(absences);
          newAbsences.set(student.id, {
            student_id: student.id,
            absence_id: data.id,
            is_absent: true,
            type: 'non_justifiée',
          });
          setAbsences(newAbsences);
        }
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible de modifier l'absence");
    } finally {
      setSaving(false);
    }
  };

  const toggleAbsenceType = async (student: Student) => {
    const currentRecord = absences.get(student.id);
    if (!currentRecord?.absence_id) return;

    const newType = currentRecord.type === 'justifiée' ? 'non_justifiée' : 'justifiée';

    try {
      const response = await fetch(`${API_URL}/api/absences/${currentRecord.absence_id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType }),
      });

      if (response.ok) {
        const newAbsences = new Map(absences);
        newAbsences.set(student.id, {
          ...currentRecord,
          type: newType,
        });
        setAbsences(newAbsences);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de modifier le type');
    }
  };

  const getAbsentCount = () => {
    return Array.from(absences.values()).filter(a => a.is_absent).length;
  };

  const exportAttendance = async (type: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      let url = `${API_URL}/api/export/daily-attendance/${type}?date=${dateStr}`;
      if (selectedClass) {
        url += `&class_id=${selectedClass}`;
      }

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la génération');
      }

      const data = await response.json();
      
      if (Platform.OS === 'web') {
        // Web download
        const byteCharacters = atob(data.content);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: data.content_type });
        const downloadUrl = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(downloadUrl);
        
        Alert.alert('Succès', `Fichier téléchargé: ${data.filename}`);
      } else {
        // Mobile download
        const fileUri = FileSystem.documentDirectory + data.filename;
        await FileSystem.writeAsStringAsync(fileUri, data.content, {
          encoding: FileSystem.EncodingType.Base64,
        });
        
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, {
            mimeType: data.content_type,
            dialogTitle: `Partager ${data.filename}`,
          });
        } else {
          Alert.alert('Succès', `Fichier sauvegardé: ${data.filename}`);
        }
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Erreur', 'Impossible de générer le fichier');
    } finally {
      setExporting(false);
    }
  };

  const filteredStudents = students.filter(s => 
    !selectedClass || s.class_id === selectedClass
  );

  const renderStudentItem = ({ item }: { item: Student }) => {
    const record = absences.get(item.id);
    const isAbsent = record?.is_absent || false;
    const isJustified = record?.type === 'justifiée';

    return (
      <View style={styles.studentRow}>
        <TouchableOpacity
          style={styles.studentInfo}
          onPress={() => toggleAbsence(item)}
          activeOpacity={0.7}
        >
          <View style={[
            styles.checkbox,
            isAbsent && styles.checkboxChecked,
            isAbsent && isJustified && styles.checkboxJustified,
          ]}>
            {isAbsent && (
              <Ionicons 
                name="close" 
                size={20} 
                color="#FFFFFF" 
              />
            )}
          </View>
          <View style={styles.studentDetails}>
            <Text style={[
              styles.studentName,
              isAbsent && styles.studentNameAbsent,
            ]}>
              {item.first_name} {item.last_name}
            </Text>
            <Text style={styles.studentClass}>{item.class_name}</Text>
          </View>
        </TouchableOpacity>

        {isAbsent && (
          <TouchableOpacity
            style={[
              styles.typeButton,
              isJustified ? styles.typeButtonJustified : styles.typeButtonUnjustified,
            ]}
            onPress={() => toggleAbsenceType(item)}
          >
            <Text style={styles.typeButtonText}>
              {isJustified ? 'J' : 'NJ'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
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
    <View style={styles.container}>
      {/* Date Selector */}
      <View style={styles.dateSelector}>
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => changeDate(-1)}
        >
          <Ionicons name="chevron-back" size={28} color="#3B82F6" />
        </TouchableOpacity>
        
        <TouchableOpacity 
          style={styles.dateDisplay}
          onPress={() => setSelectedDate(new Date())}
        >
          <Ionicons name="calendar" size={20} color="#3B82F6" />
          <Text style={styles.dateText}>
            {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={styles.dateArrow}
          onPress={() => changeDate(1)}
        >
          <Ionicons name="chevron-forward" size={28} color="#3B82F6" />
        </TouchableOpacity>
      </View>

      {/* Class Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.classFilter}
        contentContainerStyle={styles.classFilterContent}
      >
        {classes.map(cls => (
          <TouchableOpacity
            key={cls.id}
            style={[
              styles.classChip,
              selectedClass === cls.id && styles.classChipSelected,
            ]}
            onPress={() => setSelectedClass(cls.id)}
          >
            <Text style={[
              styles.classChipText,
              selectedClass === cls.id && styles.classChipTextSelected,
            ]}>
              {cls.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Ionicons name="people" size={18} color="#6B7280" />
          <Text style={styles.statText}>{filteredStudents.length} élèves</Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="close-circle" size={18} color="#EF4444" />
          <Text style={[styles.statText, { color: '#EF4444' }]}>
            {getAbsentCount()} absent{getAbsentCount() > 1 ? 's' : ''}
          </Text>
        </View>
        <View style={styles.statItem}>
          <Ionicons name="checkmark-circle" size={18} color="#10B981" />
          <Text style={[styles.statText, { color: '#10B981' }]}>
            {filteredStudents.length - getAbsentCount()} présent{filteredStudents.length - getAbsentCount() > 1 ? 's' : ''}
          </Text>
        </View>
      </View>

      {/* Export Buttons */}
      <View style={styles.exportBar}>
        <Text style={styles.exportLabel}>Exporter la feuille:</Text>
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportBtnExcel]}
            onPress={() => exportAttendance('excel')}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="document-text" size={16} color="#FFFFFF" />
                <Text style={styles.exportBtnText}>Excel</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.exportBtn, styles.exportBtnPdf]}
            onPress={() => exportAttendance('pdf')}
            disabled={exporting}
          >
            {exporting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="print" size={16} color="#FFFFFF" />
                <Text style={styles.exportBtnText}>PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <Text style={styles.legendTitle}>Légende:</Text>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#EF4444' }]} />
          <Text style={styles.legendText}>NJ = Non justifiée</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendBox, { backgroundColor: '#F59E0B' }]} />
          <Text style={styles.legendText}>J = Justifiée</Text>
        </View>
      </View>

      {/* Students List */}
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.id}
        renderItem={renderStudentItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucun élève dans cette classe</Text>
          </View>
        }
      />

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator color="#FFFFFF" />
        </View>
      )}
    </View>
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
  dateSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  dateArrow: {
    padding: 8,
  },
  dateDisplay: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#EBF5FF',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'capitalize',
  },
  classFilter: {
    backgroundColor: '#FFFFFF',
    maxHeight: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  classFilterContent: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 8,
    flexDirection: 'row',
  },
  classChip: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  classChipSelected: {
    backgroundColor: '#3B82F6',
  },
  classChipText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  classChipTextSelected: {
    color: '#FFFFFF',
  },
  statsBar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  statText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6B7280',
  },
  exportBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  exportLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#6B7280',
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
  },
  exportBtnExcel: {
    backgroundColor: '#10B981',
  },
  exportBtnPdf: {
    backgroundColor: '#EF4444',
  },
  exportBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    paddingVertical: 8,
    paddingHorizontal: 16,
    gap: 16,
  },
  legendTitle: {
    fontSize: 12,
    color: '#6B7280',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 12,
    color: '#6B7280',
  },
  listContainer: {
    padding: 12,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    padding: 12,
    marginBottom: 8,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  studentInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkbox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  checkboxChecked: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  checkboxJustified: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#1F2937',
  },
  studentNameAbsent: {
    color: '#EF4444',
    textDecorationLine: 'line-through',
  },
  studentClass: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    marginLeft: 8,
  },
  typeButtonJustified: {
    backgroundColor: '#FEF3C7',
  },
  typeButtonUnjustified: {
    backgroundColor: '#FEE2E2',
  },
  typeButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#1F2937',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: '#6B7280',
    marginTop: 16,
  },
  savingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
