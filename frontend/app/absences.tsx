import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Modal,
  TextInput,
  Alert,
  RefreshControl,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Switch,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Absence {
  id: string;
  student_id: string;
  student_name: string;
  class_name: string;
  date: string;
  reason?: string;
  type: string;
  notified: boolean;
}

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
}

export default function AbsencesScreen() {
  const [absences, setAbsences] = useState<Absence[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('');
  
  // Form state
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [selectedClassForFilter, setSelectedClassForFilter] = useState<string>('');
  const [absenceDate, setAbsenceDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');
  const [absenceType, setAbsenceType] = useState('non_justifiée');
  const [notifyParent, setNotifyParent] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');

  const fetchData = async () => {
    try {
      let absenceUrl = `${API_URL}/api/absences`;
      const params = [];
      if (selectedTypeFilter) params.push(`type=${selectedTypeFilter}`);
      if (params.length > 0) absenceUrl += `?${params.join('&')}`;

      const [absencesRes, studentsRes, classesRes] = await Promise.all([
        fetch(absenceUrl),
        fetch(`${API_URL}/api/students`),
        fetch(`${API_URL}/api/classes`),
      ]);
      
      if (absencesRes.ok) {
        const data = await absencesRes.json();
        setAbsences(data);
      }
      
      if (studentsRes.ok) {
        const data = await studentsRes.json();
        setStudents(data);
      }
      
      if (classesRes.ok) {
        const data = await classesRes.json();
        setClasses(data);
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
    }, [selectedTypeFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openModal = () => {
    setSelectedStudent(null);
    setSelectedClassForFilter('');
    setAbsenceDate(format(new Date(), 'yyyy-MM-dd'));
    setReason('');
    setAbsenceType('non_justifiée');
    setNotifyParent(true);
    setStudentSearch('');
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
  };

  const handleSubmit = async () => {
    if (!selectedStudent) {
      Alert.alert('Erreur', 'Veuillez sélectionner un élève');
      return;
    }
    if (!absenceDate) {
      Alert.alert('Erreur', 'Veuillez entrer une date');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch(`${API_URL}/api/absences`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: selectedStudent.id,
          date: absenceDate,
          reason: reason || null,
          type: absenceType,
          notify_parent: notifyParent,
        }),
      });

      if (response.ok) {
        closeModal();
        fetchData();
        Alert.alert('Succès', 'Absence enregistrée');
      } else {
        const error = await response.json();
        Alert.alert('Erreur', error.detail || 'Une erreur est survenue');
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible d'enregistrer l'absence");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (absence: Absence) => {
    Alert.alert(
      'Confirmer la suppression',
      `Supprimer l'absence de ${absence.student_name} du ${formatDate(absence.date)} ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/absences/${absence.id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchData();
              }
            } catch (error) {
              Alert.alert('Erreur', "Impossible de supprimer l'absence");
            }
          },
        },
      ]
    );
  };

  const updateAbsenceType = async (absence: Absence, newType: string) => {
    try {
      const response = await fetch(`${API_URL}/api/absences/${absence.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType }),
      });
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de modifier le type');
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return format(new Date(dateStr), 'dd MMM yyyy', { locale: fr });
    } catch {
      return dateStr;
    }
  };

  const filteredStudents = students.filter(s => {
    const matchesSearch = studentSearch === '' || 
      `${s.first_name} ${s.last_name}`.toLowerCase().includes(studentSearch.toLowerCase());
    const matchesClass = selectedClassForFilter === '' || s.class_id === selectedClassForFilter;
    return matchesSearch && matchesClass;
  });

  const renderAbsenceItem = ({ item }: { item: Absence }) => (
    <View style={styles.absenceCard}>
      <View style={styles.absenceHeader}>
        <View style={styles.studentInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {item.student_name.split(' ').map(n => n[0]).join('')}
            </Text>
          </View>
          <View>
            <Text style={styles.studentName}>{item.student_name}</Text>
            <Text style={styles.className}>{item.class_name}</Text>
          </View>
        </View>
        <View style={styles.dateContainer}>
          <Ionicons name="calendar-outline" size={14} color="#6B7280" />
          <Text style={styles.dateText}>{formatDate(item.date)}</Text>
        </View>
      </View>
      
      {item.reason && (
        <View style={styles.reasonContainer}>
          <Text style={styles.reasonLabel}>Motif:</Text>
          <Text style={styles.reasonText}>{item.reason}</Text>
        </View>
      )}
      
      <View style={styles.absenceFooter}>
        <View style={styles.typeContainer}>
          <TouchableOpacity
            style={[
              styles.typeButton,
              item.type === 'justifiée' && styles.typeButtonJustified,
            ]}
            onPress={() => item.type !== 'justifiée' && updateAbsenceType(item, 'justifiée')}
          >
            <Text style={[
              styles.typeButtonText,
              item.type === 'justifiée' && styles.typeButtonTextActive,
            ]}>
              Justifiée
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.typeButton,
              item.type === 'non_justifiée' && styles.typeButtonUnjustified,
            ]}
            onPress={() => item.type !== 'non_justifiée' && updateAbsenceType(item, 'non_justifiée')}
          >
            <Text style={[
              styles.typeButtonText,
              item.type === 'non_justifiée' && styles.typeButtonTextActive,
            ]}>
              Non justifiée
            </Text>
          </TouchableOpacity>
        </View>
        
        <View style={styles.absenceActions}>
          {item.notified && (
            <View style={styles.notifiedBadge}>
              <Ionicons name="checkmark-circle" size={14} color="#10B981" />
              <Text style={styles.notifiedText}>Notifié</Text>
            </View>
          )}
          <TouchableOpacity
            style={styles.deleteButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash-outline" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Chargement des absences...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Type Filter */}
      <View style={styles.filterRow}>
        <TouchableOpacity
          style={[
            styles.filterChip,
            !selectedTypeFilter && styles.filterChipSelected,
          ]}
          onPress={() => setSelectedTypeFilter('')}
        >
          <Text style={[
            styles.filterChipText,
            !selectedTypeFilter && styles.filterChipTextSelected,
          ]}>
            Toutes
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedTypeFilter === 'justifiée' && styles.filterChipSelected,
          ]}
          onPress={() => setSelectedTypeFilter('justifiée')}
        >
          <Text style={[
            styles.filterChipText,
            selectedTypeFilter === 'justifiée' && styles.filterChipTextSelected,
          ]}>
            Justifiées
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.filterChip,
            selectedTypeFilter === 'non_justifiée' && styles.filterChipSelected,
          ]}
          onPress={() => setSelectedTypeFilter('non_justifiée')}
        >
          <Text style={[
            styles.filterChipText,
            selectedTypeFilter === 'non_justifiée' && styles.filterChipTextSelected,
          ]}>
            Non justifiées
          </Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={absences}
        keyExtractor={(item) => item.id}
        renderItem={renderAbsenceItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="calendar-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucune absence</Text>
            <Text style={styles.emptySubtext}>Enregistrez une nouvelle absence</Text>
          </View>
        }
      />

      {/* Add Button */}
      <TouchableOpacity
        style={[styles.fab, students.length === 0 && styles.fabDisabled]}
        onPress={openModal}
        disabled={students.length === 0}
      >
        <Ionicons name="add" size={28} color="#FFFFFF" />
      </TouchableOpacity>

      {/* Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={closeModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.modalOverlay}
        >
          <ScrollView style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Nouvelle absence</Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            {/* Student Selection */}
            <View style={styles.formGroup}>
              <Text style={styles.label}>Élève *</Text>
              
              {/* Class filter for students */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.classFilterScroll}>
                <TouchableOpacity
                  style={[
                    styles.miniFilterChip,
                    selectedClassForFilter === '' && styles.miniFilterChipSelected,
                  ]}
                  onPress={() => setSelectedClassForFilter('')}
                >
                  <Text style={[
                    styles.miniFilterChipText,
                    selectedClassForFilter === '' && styles.miniFilterChipTextSelected,
                  ]}>
                    Toutes classes
                  </Text>
                </TouchableOpacity>
                {classes.map(cls => (
                  <TouchableOpacity
                    key={cls.id}
                    style={[
                      styles.miniFilterChip,
                      selectedClassForFilter === cls.id && styles.miniFilterChipSelected,
                    ]}
                    onPress={() => setSelectedClassForFilter(cls.id)}
                  >
                    <Text style={[
                      styles.miniFilterChipText,
                      selectedClassForFilter === cls.id && styles.miniFilterChipTextSelected,
                    ]}>
                      {cls.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              
              <TextInput
                style={styles.searchInput}
                value={studentSearch}
                onChangeText={setStudentSearch}
                placeholder="Rechercher un élève..."
                placeholderTextColor="#9CA3AF"
              />
              
              <View style={styles.studentList}>
                {filteredStudents.slice(0, 10).map(student => (
                  <TouchableOpacity
                    key={student.id}
                    style={[
                      styles.studentOption,
                      selectedStudent?.id === student.id && styles.studentOptionSelected,
                    ]}
                    onPress={() => setSelectedStudent(student)}
                  >
                    <View style={styles.studentOptionAvatar}>
                      <Text style={styles.studentOptionAvatarText}>
                        {student.first_name[0]}{student.last_name[0]}
                      </Text>
                    </View>
                    <View>
                      <Text style={[
                        styles.studentOptionName,
                        selectedStudent?.id === student.id && styles.studentOptionNameSelected,
                      ]}>
                        {student.first_name} {student.last_name}
                      </Text>
                      <Text style={styles.studentOptionClass}>{student.class_name}</Text>
                    </View>
                    {selectedStudent?.id === student.id && (
                      <Ionicons name="checkmark-circle" size={20} color="#3B82F6" style={styles.checkIcon} />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Date *</Text>
              <TextInput
                style={styles.input}
                value={absenceDate}
                onChangeText={setAbsenceDate}
                placeholder="AAAA-MM-JJ"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Motif</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={reason}
                onChangeText={setReason}
                placeholder="Motif de l'absence"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Type d'absence</Text>
              <View style={styles.typeSelector}>
                <TouchableOpacity
                  style={[
                    styles.typeSelectorOption,
                    absenceType === 'justifiée' && styles.typeSelectorOptionJustified,
                  ]}
                  onPress={() => setAbsenceType('justifiée')}
                >
                  <Ionicons 
                    name={absenceType === 'justifiée' ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={absenceType === 'justifiée' ? '#10B981' : '#6B7280'}
                  />
                  <Text style={[
                    styles.typeSelectorText,
                    absenceType === 'justifiée' && styles.typeSelectorTextJustified,
                  ]}>
                    Justifiée
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.typeSelectorOption,
                    absenceType === 'non_justifiée' && styles.typeSelectorOptionUnjustified,
                  ]}
                  onPress={() => setAbsenceType('non_justifiée')}
                >
                  <Ionicons 
                    name={absenceType === 'non_justifiée' ? 'checkmark-circle' : 'ellipse-outline'}
                    size={20}
                    color={absenceType === 'non_justifiée' ? '#EF4444' : '#6B7280'}
                  />
                  <Text style={[
                    styles.typeSelectorText,
                    absenceType === 'non_justifiée' && styles.typeSelectorTextUnjustified,
                  ]}>
                    Non justifiée
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.formGroup}>
              <View style={styles.switchRow}>
                <View>
                  <Text style={styles.label}>Notifier les parents</Text>
                  <Text style={styles.switchDescription}>
                    Envoyer une notification aux parents
                  </Text>
                </View>
                <Switch
                  value={notifyParent}
                  onValueChange={setNotifyParent}
                  trackColor={{ false: '#E5E7EB', true: '#93C5FD' }}
                  thumbColor={notifyParent ? '#3B82F6' : '#9CA3AF'}
                />
              </View>
            </View>

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>Enregistrer l'absence</Text>
              )}
            </TouchableOpacity>
            
            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
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
  filterRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    padding: 12,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
  },
  filterChipSelected: {
    backgroundColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  absenceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  absenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  className: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 2,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  dateText: {
    fontSize: 13,
    color: '#6B7280',
  },
  reasonContainer: {
    marginTop: 12,
    padding: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
  },
  reasonLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 14,
    color: '#374151',
  },
  absenceFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  typeContainer: {
    flexDirection: 'row',
    gap: 8,
  },
  typeButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
  },
  typeButtonJustified: {
    backgroundColor: '#D1FAE5',
  },
  typeButtonUnjustified: {
    backgroundColor: '#FEE2E2',
  },
  typeButtonText: {
    fontSize: 12,
    color: '#6B7280',
  },
  typeButtonTextActive: {
    fontWeight: '600',
    color: '#1F2937',
  },
  absenceActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  notifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  notifiedText: {
    fontSize: 12,
    color: '#10B981',
  },
  deleteButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
  },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  fabDisabled: {
    backgroundColor: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#1F2937',
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
  },
  textArea: {
    height: 80,
    textAlignVertical: 'top',
  },
  classFilterScroll: {
    marginBottom: 12,
  },
  miniFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
  },
  miniFilterChipSelected: {
    backgroundColor: '#3B82F6',
  },
  miniFilterChipText: {
    fontSize: 13,
    color: '#6B7280',
  },
  miniFilterChipTextSelected: {
    color: '#FFFFFF',
  },
  searchInput: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    padding: 12,
    fontSize: 15,
    color: '#1F2937',
    backgroundColor: '#F9FAFB',
    marginBottom: 12,
  },
  studentList: {
    maxHeight: 200,
  },
  studentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F9FAFB',
    marginBottom: 8,
  },
  studentOptionSelected: {
    backgroundColor: '#EBF5FF',
    borderWidth: 1,
    borderColor: '#3B82F6',
  },
  studentOptionAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  studentOptionAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  studentOptionName: {
    fontSize: 15,
    color: '#1F2937',
  },
  studentOptionNameSelected: {
    fontWeight: '600',
  },
  studentOptionClass: {
    fontSize: 12,
    color: '#6B7280',
  },
  checkIcon: {
    marginLeft: 'auto',
  },
  typeSelector: {
    flexDirection: 'row',
    gap: 12,
  },
  typeSelectorOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  typeSelectorOptionJustified: {
    backgroundColor: '#D1FAE5',
    borderColor: '#10B981',
  },
  typeSelectorOptionUnjustified: {
    backgroundColor: '#FEE2E2',
    borderColor: '#EF4444',
  },
  typeSelectorText: {
    fontSize: 14,
    color: '#6B7280',
  },
  typeSelectorTextJustified: {
    color: '#059669',
    fontWeight: '500',
  },
  typeSelectorTextUnjustified: {
    color: '#DC2626',
    fontWeight: '500',
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchDescription: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 2,
  },
  submitButton: {
    backgroundColor: '#3B82F6',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
  },
  submitButtonDisabled: {
    opacity: 0.7,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
