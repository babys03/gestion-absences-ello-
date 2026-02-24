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
  absence_id_matin?: string;
  absence_id_apresmidi?: string;
  matin: boolean;
  apresmidi: boolean;
  type_matin: string;
  type_apresmidi: string;
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
        if (!selectedClass && classesData.length > 0) {
          setSelectedClass(classesData[0].id);
        }
      }

      if (studentsRes.ok) {
        const studentsData = await studentsRes.json();
        setStudents(studentsData);
      }

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
          const existing = absenceMap.get(absence.student_id) || {
            student_id: absence.student_id,
            matin: false,
            apresmidi: false,
            type_matin: 'non_justifiée',
            type_apresmidi: 'non_justifiée',
          };
          
          const period = absence.period || 'journee';
          
          if (period === 'matin' || period === 'journee') {
            existing.matin = true;
            existing.absence_id_matin = absence.id;
            existing.type_matin = absence.type;
          }
          if (period === 'apresmidi' || period === 'journee') {
            existing.apresmidi = true;
            existing.absence_id_apresmidi = absence.id;
            existing.type_apresmidi = absence.type;
          }
          
          absenceMap.set(absence.student_id, existing);
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

  const toggleAbsence = async (student: Student, period: 'matin' | 'apresmidi') => {
    const currentRecord = absences.get(student.id) || {
      student_id: student.id,
      matin: false,
      apresmidi: false,
      type_matin: 'non_justifiée',
      type_apresmidi: 'non_justifiée',
    };
    
    const isCurrentlyAbsent = period === 'matin' ? currentRecord.matin : currentRecord.apresmidi;
    const absenceId = period === 'matin' ? currentRecord.absence_id_matin : currentRecord.absence_id_apresmidi;

    setSaving(true);
    try {
      if (isCurrentlyAbsent && absenceId) {
        // Remove absence
        const response = await fetch(`${API_URL}/api/absences/${absenceId}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          const newAbsences = new Map(absences);
          const updated = { ...currentRecord };
          if (period === 'matin') {
            updated.matin = false;
            updated.absence_id_matin = undefined;
          } else {
            updated.apresmidi = false;
            updated.absence_id_apresmidi = undefined;
          }
          
          if (!updated.matin && !updated.apresmidi) {
            newAbsences.delete(student.id);
          } else {
            newAbsences.set(student.id, updated);
          }
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
            period: period,
            type: 'non_justifiée',
            notify_parent: true,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          const newAbsences = new Map(absences);
          const updated = { ...currentRecord };
          if (period === 'matin') {
            updated.matin = true;
            updated.absence_id_matin = data.id;
            updated.type_matin = 'non_justifiée';
          } else {
            updated.apresmidi = true;
            updated.absence_id_apresmidi = data.id;
            updated.type_apresmidi = 'non_justifiée';
          }
          newAbsences.set(student.id, updated);
          setAbsences(newAbsences);
        }
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible de modifier l'absence");
    } finally {
      setSaving(false);
    }
  };

  const toggleAbsenceType = async (student: Student, period: 'matin' | 'apresmidi') => {
    const currentRecord = absences.get(student.id);
    if (!currentRecord) return;
    
    const absenceId = period === 'matin' ? currentRecord.absence_id_matin : currentRecord.absence_id_apresmidi;
    if (!absenceId) return;
    
    const currentType = period === 'matin' ? currentRecord.type_matin : currentRecord.type_apresmidi;
    const newType = currentType === 'justifiée' ? 'non_justifiée' : 'justifiée';

    try {
      const response = await fetch(`${API_URL}/api/absences/${absenceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType }),
      });

      if (response.ok) {
        const newAbsences = new Map(absences);
        const updated = { ...currentRecord };
        if (period === 'matin') {
          updated.type_matin = newType;
        } else {
          updated.type_apresmidi = newType;
        }
        newAbsences.set(student.id, updated);
        setAbsences(newAbsences);
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de modifier le type');
    }
  };

  const getAbsentCount = (period: 'matin' | 'apresmidi' | 'total') => {
    let count = 0;
    absences.forEach((record) => {
      if (period === 'matin' && record.matin) count++;
      else if (period === 'apresmidi' && record.apresmidi) count++;
      else if (period === 'total' && (record.matin || record.apresmidi)) count++;
    });
    return count;
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
      if (!response.ok) throw new Error('Erreur');

      const data = await response.json();
      
      if (Platform.OS === 'web') {
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
        const fileUri = FileSystem.documentDirectory + data.filename;
        await FileSystem.writeAsStringAsync(fileUri, data.content, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: data.content_type });
        }
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de générer le fichier');
    } finally {
      setExporting(false);
    }
  };

  const exportAllAbsents = async (type: 'pdf' | 'excel') => {
    setExporting(true);
    try {
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const url = `${API_URL}/api/export/all-absents/${type}?date=${dateStr}`;

      const response = await fetch(url);
      if (!response.ok) throw new Error('Erreur');

      const data = await response.json();
      
      if (Platform.OS === 'web') {
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
        const fileUri = FileSystem.documentDirectory + data.filename;
        await FileSystem.writeAsStringAsync(fileUri, data.content, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: data.content_type });
        }
      }
    } catch (error) {
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
    const matinAbsent = record?.matin || false;
    const apresmidiAbsent = record?.apresmidi || false;
    const matinJustified = record?.type_matin === 'justifiée';
    const apresmidiJustified = record?.type_apresmidi === 'justifiée';

    return (
      <View style={styles.studentRow}>
        <View style={styles.studentInfo}>
          <Text style={[
            styles.studentName,
            (matinAbsent && apresmidiAbsent) && styles.studentNameAbsent,
          ]}>
            {item.first_name} {item.last_name}
          </Text>
        </View>

        {/* Matin */}
        <View style={styles.periodColumn}>
          <TouchableOpacity
            style={[
              styles.periodCheckbox,
              matinAbsent && styles.periodCheckboxAbsent,
              matinAbsent && matinJustified && styles.periodCheckboxJustified,
            ]}
            onPress={() => toggleAbsence(item, 'matin')}
          >
            {matinAbsent && <Ionicons name="close" size={16} color="#FFFFFF" />}
          </TouchableOpacity>
          {matinAbsent && (
            <TouchableOpacity
              style={[
                styles.typeTag,
                matinJustified ? styles.typeTagJ : styles.typeTagNJ,
              ]}
              onPress={() => toggleAbsenceType(item, 'matin')}
            >
              <Text style={styles.typeTagText}>{matinJustified ? 'J' : 'NJ'}</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Après-midi */}
        <View style={styles.periodColumn}>
          <TouchableOpacity
            style={[
              styles.periodCheckbox,
              apresmidiAbsent && styles.periodCheckboxAbsent,
              apresmidiAbsent && apresmidiJustified && styles.periodCheckboxJustified,
            ]}
            onPress={() => toggleAbsence(item, 'apresmidi')}
          >
            {apresmidiAbsent && <Ionicons name="close" size={16} color="#FFFFFF" />}
          </TouchableOpacity>
          {apresmidiAbsent && (
            <TouchableOpacity
              style={[
                styles.typeTag,
                apresmidiJustified ? styles.typeTagJ : styles.typeTagNJ,
              ]}
              onPress={() => toggleAbsenceType(item, 'apresmidi')}
            >
              <Text style={styles.typeTagText}>{apresmidiJustified ? 'J' : 'NJ'}</Text>
            </TouchableOpacity>
          )}
        </View>
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
        <TouchableOpacity style={styles.dateArrow} onPress={() => changeDate(-1)}>
          <Ionicons name="chevron-back" size={28} color="#3B82F6" />
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.dateDisplay} onPress={() => setSelectedDate(new Date())}>
          <Ionicons name="calendar" size={20} color="#3B82F6" />
          <Text style={styles.dateText}>
            {format(selectedDate, 'EEEE d MMMM yyyy', { locale: fr })}
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.dateArrow} onPress={() => changeDate(1)}>
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
            style={[styles.classChip, selectedClass === cls.id && styles.classChipSelected]}
            onPress={() => setSelectedClass(cls.id)}
          >
            <Text style={[styles.classChipText, selectedClass === cls.id && styles.classChipTextSelected]}>
              {cls.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Stats Bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Matin:</Text>
          <Text style={[styles.statValue, { color: '#EF4444' }]}>{getAbsentCount('matin')}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Après-midi:</Text>
          <Text style={[styles.statValue, { color: '#EF4444' }]}>{getAbsentCount('apresmidi')}</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statLabel}>Présents:</Text>
          <Text style={[styles.statValue, { color: '#10B981' }]}>
            {filteredStudents.length - getAbsentCount('total')}
          </Text>
        </View>
      </View>

      {/* Export Buttons */}
      <View style={styles.exportSection}>
        <View style={styles.exportRow}>
          <Text style={styles.exportLabel}>Classe:</Text>
          <TouchableOpacity style={[styles.exportBtn, styles.exportBtnExcel]} onPress={() => exportAttendance('excel')} disabled={exporting}>
            <Ionicons name="document-text" size={14} color="#FFF" />
            <Text style={styles.exportBtnText}>Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, styles.exportBtnPdf]} onPress={() => exportAttendance('pdf')} disabled={exporting}>
            <Ionicons name="print" size={14} color="#FFF" />
            <Text style={styles.exportBtnText}>PDF</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.exportRow}>
          <Text style={[styles.exportLabel, { color: '#DC2626' }]}>Tous absents:</Text>
          <TouchableOpacity style={[styles.exportBtn, styles.exportBtnAllExcel]} onPress={() => exportAllAbsents('excel')} disabled={exporting}>
            <Ionicons name="list" size={14} color="#FFF" />
            <Text style={styles.exportBtnText}>Excel</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.exportBtn, styles.exportBtnAllPdf]} onPress={() => exportAllAbsents('pdf')} disabled={exporting}>
            <Ionicons name="document" size={14} color="#FFF" />
            <Text style={styles.exportBtnText}>PDF</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Table Header */}
      <View style={styles.tableHeader}>
        <Text style={styles.tableHeaderName}>Élève</Text>
        <Text style={styles.tableHeaderPeriod}>Matin</Text>
        <Text style={styles.tableHeaderPeriod}>Après-midi</Text>
      </View>

      {/* Students List */}
      <FlatList
        data={filteredStudents}
        keyExtractor={(item) => item.id}
        renderItem={renderStudentItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucun élève</Text>
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
    paddingVertical: 10,
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
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  dateText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
    textTransform: 'capitalize',
  },
  classFilter: {
    backgroundColor: '#FFFFFF',
    maxHeight: 50,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  classFilterContent: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
  },
  classChip: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  classChipSelected: {
    backgroundColor: '#3B82F6',
  },
  classChipText: {
    fontSize: 13,
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
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statLabel: {
    fontSize: 13,
    color: '#6B7280',
  },
  statValue: {
    fontSize: 15,
    fontWeight: 'bold',
  },
  exportSection: {
    backgroundColor: '#F9FAFB',
    padding: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  exportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  exportLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#374151',
    width: 85,
  },
  exportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  exportBtnExcel: {
    backgroundColor: '#10B981',
  },
  exportBtnPdf: {
    backgroundColor: '#EF4444',
  },
  exportBtnAllExcel: {
    backgroundColor: '#7C3AED',
  },
  exportBtnAllPdf: {
    backgroundColor: '#DC2626',
  },
  exportBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#374151',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  tableHeaderName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tableHeaderPeriod: {
    width: 70,
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  listContainer: {
    paddingBottom: 20,
  },
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#1F2937',
  },
  studentNameAbsent: {
    color: '#EF4444',
    textDecorationLine: 'line-through',
  },
  periodColumn: {
    width: 70,
    alignItems: 'center',
    gap: 4,
  },
  periodCheckbox: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  periodCheckboxAbsent: {
    backgroundColor: '#EF4444',
    borderColor: '#EF4444',
  },
  periodCheckboxJustified: {
    backgroundColor: '#F59E0B',
    borderColor: '#F59E0B',
  },
  typeTag: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  typeTagJ: {
    backgroundColor: '#FEF3C7',
  },
  typeTagNJ: {
    backgroundColor: '#FEE2E2',
  },
  typeTagText: {
    fontSize: 10,
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
