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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface Student {
  id: string;
  first_name: string;
  last_name: string;
  class_id: string;
  class_name?: string;
  parent_email?: string;
  parent_phone?: string;
  birth_date?: string;
  absence_count: number;
}

interface ClassItem {
  id: string;
  name: string;
  level: string;
}

export default function StudentsScreen() {
  const [students, setStudents] = useState<Student[]>([]);
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);
  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('');
  
  // Form state
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [classId, setClassId] = useState('');
  const [parentEmail, setParentEmail] = useState('');
  const [parentPhone, setParentPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchData = async () => {
    try {
      const [studentsRes, classesRes] = await Promise.all([
        fetch(`${API_URL}/api/students${selectedClassFilter ? `?class_id=${selectedClassFilter}` : ''}`),
        fetch(`${API_URL}/api/classes`),
      ]);
      
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
    }, [selectedClassFilter])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchData();
  };

  const openModal = (student?: Student) => {
    if (student) {
      setEditingStudent(student);
      setFirstName(student.first_name);
      setLastName(student.last_name);
      setClassId(student.class_id);
      setParentEmail(student.parent_email || '');
      setParentPhone(student.parent_phone || '');
      setBirthDate(student.birth_date || '');
    } else {
      setEditingStudent(null);
      setFirstName('');
      setLastName('');
      setClassId(classes.length > 0 ? classes[0].id : '');
      setParentEmail('');
      setParentPhone('');
      setBirthDate('');
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingStudent(null);
  };

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer le prénom et le nom');
      return;
    }
    if (!classId) {
      Alert.alert('Erreur', 'Veuillez sélectionner une classe');
      return;
    }

    setSubmitting(true);
    try {
      const url = editingStudent
        ? `${API_URL}/api/students/${editingStudent.id}`
        : `${API_URL}/api/students`;
      
      const response = await fetch(url, {
        method: editingStudent ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: firstName,
          last_name: lastName,
          class_id: classId,
          parent_email: parentEmail || null,
          parent_phone: parentPhone || null,
          birth_date: birthDate || null,
        }),
      });

      if (response.ok) {
        closeModal();
        fetchData();
      } else {
        const error = await response.json();
        Alert.alert('Erreur', error.detail || 'Une erreur est survenue');
      }
    } catch (error) {
      Alert.alert('Erreur', "Impossible de sauvegarder l'élève");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (student: Student) => {
    Alert.alert(
      'Confirmer la suppression',
      `Voulez-vous vraiment supprimer l'élève "${student.first_name} ${student.last_name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/students/${student.id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchData();
              } else {
                const error = await response.json();
                Alert.alert('Erreur', error.detail || 'Une erreur est survenue');
              }
            } catch (error) {
              Alert.alert('Erreur', "Impossible de supprimer l'élève");
            }
          },
        },
      ]
    );
  };

  const renderStudentItem = ({ item }: { item: Student }) => (
    <View style={styles.studentCard}>
      <View style={styles.studentInfo}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {item.first_name[0]}{item.last_name[0]}
          </Text>
        </View>
        <View style={styles.studentDetails}>
          <Text style={styles.studentName}>
            {item.first_name} {item.last_name}
          </Text>
          <Text style={styles.studentClass}>{item.class_name}</Text>
          {item.parent_email ? (
            <View style={styles.contactRow}>
              <Ionicons name="mail-outline" size={14} color="#6B7280" />
              <Text style={styles.contactText}>{item.parent_email}</Text>
            </View>
          ) : null}
        </View>
      </View>
      <View style={styles.studentActions}>
        <View style={[
          styles.absenceBadge,
          item.absence_count > 5 && styles.absenceBadgeHigh
        ]}>
          <Ionicons name="calendar" size={14} color={item.absence_count > 5 ? '#EF4444' : '#6B7280'} />
          <Text style={[
            styles.absenceText,
            item.absence_count > 5 && styles.absenceTextHigh
          ]}>
            {item.absence_count} abs.
          </Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openModal(item)}
          >
            <Ionicons name="pencil" size={18} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash" size={18} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Chargement des élèves...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Class Filter */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterContainer}
        contentContainerStyle={styles.filterContent}
      >
        <TouchableOpacity
          style={[
            styles.filterChip,
            !selectedClassFilter && styles.filterChipSelected,
          ]}
          onPress={() => setSelectedClassFilter('')}
        >
          <Text style={[
            styles.filterChipText,
            !selectedClassFilter && styles.filterChipTextSelected,
          ]}>
            Tous
          </Text>
        </TouchableOpacity>
        {classes.map((cls) => (
          <TouchableOpacity
            key={cls.id}
            style={[
              styles.filterChip,
              selectedClassFilter === cls.id && styles.filterChipSelected,
            ]}
            onPress={() => setSelectedClassFilter(cls.id)}
          >
            <Text style={[
              styles.filterChipText,
              selectedClassFilter === cls.id && styles.filterChipTextSelected,
            ]}>
              {cls.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <FlatList
        data={students}
        keyExtractor={(item) => item.id}
        renderItem={renderStudentItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="people-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucun élève</Text>
            <Text style={styles.emptySubtext}>
              {classes.length === 0
                ? "Créez d'abord une classe"
                : 'Ajoutez votre premier élève'}
            </Text>
          </View>
        }
      />

      {/* Add Button */}
      <TouchableOpacity
        style={[styles.fab, classes.length === 0 && styles.fabDisabled]}
        onPress={() => openModal()}
        disabled={classes.length === 0}
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
              <Text style={styles.modalTitle}>
                {editingStudent ? "Modifier l'élève" : 'Nouvel élève'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Prénom *</Text>
              <TextInput
                style={styles.input}
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Prénom"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Nom *</Text>
              <TextInput
                style={styles.input}
                value={lastName}
                onChangeText={setLastName}
                placeholder="Nom"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Classe *</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View style={styles.classSelector}>
                  {classes.map((cls) => (
                    <TouchableOpacity
                      key={cls.id}
                      style={[
                        styles.classOption,
                        classId === cls.id && styles.classOptionSelected,
                      ]}
                      onPress={() => setClassId(cls.id)}
                    >
                      <Text style={[
                        styles.classOptionText,
                        classId === cls.id && styles.classOptionTextSelected,
                      ]}>
                        {cls.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Email du parent</Text>
              <TextInput
                style={styles.input}
                value={parentEmail}
                onChangeText={setParentEmail}
                placeholder="parent@email.com"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Téléphone du parent</Text>
              <TextInput
                style={styles.input}
                value={parentPhone}
                onChangeText={setParentPhone}
                placeholder="06 12 34 56 78"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Date de naissance</Text>
              <TextInput
                style={styles.input}
                value={birthDate}
                onChangeText={setBirthDate}
                placeholder="JJ/MM/AAAA"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <TouchableOpacity
              style={[styles.submitButton, submitting && styles.submitButtonDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.submitButtonText}>
                  {editingStudent ? 'Modifier' : 'Créer'}
                </Text>
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
  filterContainer: {
    backgroundColor: '#FFFFFF',
    maxHeight: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  filterContent: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexDirection: 'row',
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
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
  studentCard: {
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
  studentInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#3B82F6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  studentDetails: {
    flex: 1,
  },
  studentName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  studentClass: {
    fontSize: 14,
    color: '#3B82F6',
    marginTop: 2,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  contactText: {
    fontSize: 12,
    color: '#6B7280',
  },
  studentActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  absenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F3F4F6',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
  },
  absenceBadgeHigh: {
    backgroundColor: '#FEE2E2',
  },
  absenceText: {
    fontSize: 13,
    color: '#6B7280',
  },
  absenceTextHigh: {
    color: '#EF4444',
    fontWeight: '500',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
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
  classSelector: {
    flexDirection: 'row',
    gap: 8,
  },
  classOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  classOptionSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  classOptionText: {
    fontSize: 14,
    color: '#6B7280',
  },
  classOptionTextSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
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
