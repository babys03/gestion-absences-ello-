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
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ClassItem {
  id: string;
  name: string;
  level: string;
  description?: string;
  student_count: number;
}

const LEVELS = ['6ème', '5ème', '4ème', '3ème', '2nde', '1ère', 'Terminale'];

export default function ClassesScreen() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassItem | null>(null);
  
  // Form state
  const [name, setName] = useState('');
  const [level, setLevel] = useState('6ème');
  const [description, setDescription] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchClasses = async () => {
    try {
      const response = await fetch(`${API_URL}/api/classes`);
      if (response.ok) {
        const data = await response.json();
        setClasses(data);
      }
    } catch (error) {
      console.error('Erreur lors du chargement des classes:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchClasses();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    fetchClasses();
  };

  const openModal = (classItem?: ClassItem) => {
    if (classItem) {
      setEditingClass(classItem);
      setName(classItem.name);
      setLevel(classItem.level);
      setDescription(classItem.description || '');
    } else {
      setEditingClass(null);
      setName('');
      setLevel('6ème');
      setDescription('');
    }
    setModalVisible(true);
  };

  const closeModal = () => {
    setModalVisible(false);
    setEditingClass(null);
    setName('');
    setLevel('6ème');
    setDescription('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      Alert.alert('Erreur', 'Veuillez entrer un nom de classe');
      return;
    }

    setSubmitting(true);
    try {
      const url = editingClass
        ? `${API_URL}/api/classes/${editingClass.id}`
        : `${API_URL}/api/classes`;
      
      const response = await fetch(url, {
        method: editingClass ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, level, description: description || null }),
      });

      if (response.ok) {
        closeModal();
        fetchClasses();
      } else {
        const error = await response.json();
        Alert.alert('Erreur', error.detail || 'Une erreur est survenue');
      }
    } catch (error) {
      Alert.alert('Erreur', 'Impossible de sauvegarder la classe');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (classItem: ClassItem) => {
    if (classItem.student_count > 0) {
      Alert.alert('Erreur', 'Impossible de supprimer une classe avec des élèves');
      return;
    }

    Alert.alert(
      'Confirmer la suppression',
      `Voulez-vous vraiment supprimer la classe "${classItem.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              const response = await fetch(`${API_URL}/api/classes/${classItem.id}`, {
                method: 'DELETE',
              });
              if (response.ok) {
                fetchClasses();
              } else {
                const error = await response.json();
                Alert.alert('Erreur', error.detail || 'Une erreur est survenue');
              }
            } catch (error) {
              Alert.alert('Erreur', 'Impossible de supprimer la classe');
            }
          },
        },
      ]
    );
  };

  const renderClassItem = ({ item }: { item: ClassItem }) => (
    <View style={styles.classCard}>
      <View style={styles.classInfo}>
        <View style={styles.classIcon}>
          <Ionicons name="school" size={24} color="#3B82F6" />
        </View>
        <View style={styles.classDetails}>
          <Text style={styles.className}>{item.name}</Text>
          <Text style={styles.classLevel}>{item.level}</Text>
          {item.description ? (
            <Text style={styles.classDescription}>{item.description}</Text>
          ) : null}
        </View>
      </View>
      <View style={styles.classActions}>
        <View style={styles.studentCount}>
          <Ionicons name="people" size={16} color="#6B7280" />
          <Text style={styles.studentCountText}>{item.student_count}</Text>
        </View>
        <View style={styles.actionButtons}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openModal(item)}
          >
            <Ionicons name="pencil" size={20} color="#3B82F6" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleDelete(item)}
          >
            <Ionicons name="trash" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3B82F6" />
        <Text style={styles.loadingText}>Chargement des classes...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={classes}
        keyExtractor={(item) => item.id}
        renderItem={renderClassItem}
        contentContainerStyle={styles.listContainer}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Ionicons name="school-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>Aucune classe</Text>
            <Text style={styles.emptySubtext}>Créez votre première classe</Text>
          </View>
        }
      />

      {/* Add Button */}
      <TouchableOpacity style={styles.fab} onPress={() => openModal()}>
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
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingClass ? 'Modifier la classe' : 'Nouvelle classe'}
              </Text>
              <TouchableOpacity onPress={closeModal}>
                <Ionicons name="close" size={24} color="#6B7280" />
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Nom de la classe *</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Ex: 6ème A"
                placeholderTextColor="#9CA3AF"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Niveau *</Text>
              <View style={styles.levelPicker}>
                {LEVELS.map((lvl) => (
                  <TouchableOpacity
                    key={lvl}
                    style={[
                      styles.levelOption,
                      level === lvl && styles.levelOptionSelected,
                    ]}
                    onPress={() => setLevel(lvl)}
                  >
                    <Text
                      style={[
                        styles.levelOptionText,
                        level === lvl && styles.levelOptionTextSelected,
                      ]}
                    >
                      {lvl}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Description (optionnel)</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={description}
                onChangeText={setDescription}
                placeholder="Description de la classe"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
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
                  {editingClass ? 'Modifier' : 'Créer'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
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
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  classCard: {
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
  classInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  classIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EBF5FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  classDetails: {
    flex: 1,
  },
  className: {
    fontSize: 18,
    fontWeight: '600',
    color: '#1F2937',
  },
  classLevel: {
    fontSize: 14,
    color: '#3B82F6',
    marginTop: 2,
  },
  classDescription: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },
  classActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  studentCount: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  studentCountText: {
    fontSize: 14,
    color: '#6B7280',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
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
  levelPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  levelOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  levelOptionSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  levelOptionText: {
    fontSize: 14,
    color: '#6B7280',
  },
  levelOptionTextSelected: {
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
