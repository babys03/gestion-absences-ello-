import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

const API_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

interface ClassItem {
  id: string;
  name: string;
}

export default function ExportsScreen() {
  const [classes, setClasses] = useState<ClassItem[]>([]);
  const [selectedClass, setSelectedClass] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [loadingType, setLoadingType] = useState<string>('');

  useFocusEffect(
    useCallback(() => {
      fetchClasses();
    }, [])
  );

  const fetchClasses = async () => {
    try {
      const response = await fetch(`${API_URL}/api/classes`);
      if (response.ok) {
        const data = await response.json();
        setClasses(data);
      }
    } catch (error) {
      console.error('Erreur:', error);
    }
  };

  const downloadFile = async (type: 'excel' | 'pdf', endpoint: string, defaultFilename: string) => {
    setLoading(true);
    setLoadingType(type);

    try {
      let url = `${API_URL}${endpoint}`;
      const params = [];
      if (selectedClass) params.push(`class_id=${selectedClass}`);
      if (selectedType) params.push(`type=${selectedType}`);
      if (params.length > 0) url += `?${params.join('&')}`;

      const response = await fetch(url);
      
      if (!response.ok) {
        throw new Error('Erreur lors de la génération du fichier');
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
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = data.filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.URL.revokeObjectURL(url);
        
        Alert.alert('Succès', `Fichier ${data.filename} téléchargé`);
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
      console.error('Erreur:', error);
      Alert.alert('Erreur', 'Impossible de générer le fichier');
    } finally {
      setLoading(false);
      setLoadingType('');
    }
  };

  const exportAbsencesExcel = () => downloadFile('excel', '/api/export/absences/excel', 'absences.xlsx');
  const exportAbsencesPdf = () => downloadFile('pdf', '/api/export/absences/pdf', 'absences.pdf');
  const exportStudentsExcel = () => downloadFile('excel', '/api/export/students/excel', 'eleves.xlsx');

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Ionicons name="download-outline" size={48} color="#3B82F6" />
        <Text style={styles.headerTitle}>Exports</Text>
        <Text style={styles.headerSubtitle}>
          Téléchargez vos rapports en PDF ou Excel
        </Text>
      </View>

      {/* Filters */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Filtres (optionnel)</Text>
        
        <Text style={styles.label}>Classe</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
          <TouchableOpacity
            style={[styles.filterChip, !selectedClass && styles.filterChipSelected]}
            onPress={() => setSelectedClass('')}
          >
            <Text style={[styles.filterChipText, !selectedClass && styles.filterChipTextSelected]}>
              Toutes
            </Text>
          </TouchableOpacity>
          {classes.map(cls => (
            <TouchableOpacity
              key={cls.id}
              style={[styles.filterChip, selectedClass === cls.id && styles.filterChipSelected]}
              onPress={() => setSelectedClass(cls.id)}
            >
              <Text style={[styles.filterChipText, selectedClass === cls.id && styles.filterChipTextSelected]}>
                {cls.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <Text style={[styles.label, { marginTop: 16 }]}>Type d'absence</Text>
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, !selectedType && styles.filterChipSelected]}
            onPress={() => setSelectedType('')}
          >
            <Text style={[styles.filterChipText, !selectedType && styles.filterChipTextSelected]}>
              Toutes
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, selectedType === 'justifiée' && styles.filterChipSelected]}
            onPress={() => setSelectedType('justifiée')}
          >
            <Text style={[styles.filterChipText, selectedType === 'justifiée' && styles.filterChipTextSelected]}>
              Justifiées
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, selectedType === 'non_justifiée' && styles.filterChipSelected]}
            onPress={() => setSelectedType('non_justifiée')}
          >
            <Text style={[styles.filterChipText, selectedType === 'non_justifiée' && styles.filterChipTextSelected]}>
              Non justifiées
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Export Absences */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Rapport des absences</Text>
        <Text style={styles.sectionDescription}>
          Export complet avec statistiques, liste des absences et classement
        </Text>
        
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={[styles.exportButton, styles.excelButton]}
            onPress={exportAbsencesExcel}
            disabled={loading}
          >
            {loading && loadingType === 'excel' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="document-text" size={24} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Excel</Text>
              </>
            )}
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.exportButton, styles.pdfButton]}
            onPress={exportAbsencesPdf}
            disabled={loading}
          >
            {loading && loadingType === 'pdf' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="document" size={24} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>PDF</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Export Students */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Liste des élèves</Text>
        <Text style={styles.sectionDescription}>
          Coordonnées des élèves et nombre d'absences
        </Text>
        
        <View style={styles.exportButtons}>
          <TouchableOpacity
            style={[styles.exportButton, styles.excelButton, { flex: 1 }]}
            onPress={exportStudentsExcel}
            disabled={loading}
          >
            {loading && loadingType === 'excel' ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="people" size={24} color="#FFFFFF" />
                <Text style={styles.exportButtonText}>Exporter en Excel</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Info */}
      <View style={styles.infoBox}>
        <Ionicons name="information-circle-outline" size={20} color="#6B7280" />
        <Text style={styles.infoText}>
          Les fichiers Excel contiennent plusieurs feuilles avec des statistiques détaillées.
          Les fichiers PDF sont optimisés pour l'impression.
        </Text>
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
  header: {
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1F2937',
    marginTop: 12,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    textAlign: 'center',
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
    marginBottom: 4,
  },
  sectionDescription: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginBottom: 8,
  },
  filterScroll: {
    marginBottom: 8,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  filterChip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  filterChipSelected: {
    backgroundColor: '#3B82F6',
    borderColor: '#3B82F6',
  },
  filterChipText: {
    fontSize: 14,
    color: '#6B7280',
  },
  filterChipTextSelected: {
    color: '#FFFFFF',
    fontWeight: '500',
  },
  exportButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  exportButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  excelButton: {
    backgroundColor: '#10B981',
  },
  pdfButton: {
    backgroundColor: '#EF4444',
  },
  exportButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F9FAFB',
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    lineHeight: 18,
  },
});
