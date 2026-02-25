#!/usr/bin/env python3
"""
Comprehensive Backend API Tests for School Absence Management System
Tests all CRUD operations, validation, and business logic
"""
import requests
import json
import sys
from datetime import datetime, date, timedelta
import time

# API Base URL
BASE_URL = "https://gestion-presences.preview.emergentagent.com/api"

class TestRunner:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.test_data = {
            'classes': [],
            'students': [],
            'absences': [],
            'notifications': []
        }
        
    def log(self, message, status="INFO"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] {status}: {message}")
    
    def assert_response(self, response, expected_status, test_name):
        """Helper to validate HTTP response status"""
        if response.status_code == expected_status:
            self.passed += 1
            self.log(f"✅ {test_name} - Status: {response.status_code}", "PASS")
            return True
        else:
            self.failed += 1
            self.log(f"❌ {test_name} - Expected: {expected_status}, Got: {response.status_code}", "FAIL")
            self.log(f"   Response: {response.text}", "ERROR")
            return False
    
    def test_api_root(self):
        """Test API root endpoint"""
        self.log("Testing API root endpoint...")
        try:
            response = requests.get(f"{BASE_URL}/")
            if self.assert_response(response, 200, "API Root"):
                data = response.json()
                if "message" in data:
                    self.log(f"   Root message: {data['message']}")
                else:
                    self.log("   Warning: No message in root response")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ API Root - Connection Error: {e}", "FAIL")
    
    def test_classes_crud(self):
        """Test Classes CRUD operations"""
        self.log("=" * 50)
        self.log("TESTING CLASSES API")
        self.log("=" * 50)
        
        # Test CREATE class
        self.log("Testing CREATE class...")
        class_data = {
            "name": "6ème A",
            "level": "6ème", 
            "description": "Classe de sixième section A"
        }
        
        try:
            response = requests.post(f"{BASE_URL}/classes", json=class_data)
            if self.assert_response(response, 200, "Create Class"):
                class_obj = response.json()
                self.test_data['classes'].append(class_obj)
                self.log(f"   Created class ID: {class_obj['id']}")
                self.log(f"   Class name: {class_obj['name']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Create Class - Error: {e}", "FAIL")
        
        # Create second class for testing
        class_data_2 = {
            "name": "5ème B",
            "level": "5ème",
            "description": "Classe de cinquième section B"
        }
        
        try:
            response = requests.post(f"{BASE_URL}/classes", json=class_data_2)
            if response.status_code == 200:
                class_obj_2 = response.json()
                self.test_data['classes'].append(class_obj_2)
        except Exception as e:
            self.log(f"Warning: Could not create second class: {e}")
        
        # Test GET all classes
        self.log("Testing GET all classes...")
        try:
            response = requests.get(f"{BASE_URL}/classes")
            if self.assert_response(response, 200, "Get All Classes"):
                classes = response.json()
                self.log(f"   Found {len(classes)} classes")
                for cls in classes:
                    self.log(f"   - {cls['name']} ({cls['level']}) - {cls['student_count']} students")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get All Classes - Error: {e}", "FAIL")
        
        # Test GET single class
        if self.test_data['classes']:
            class_id = self.test_data['classes'][0]['id']
            self.log(f"Testing GET single class (ID: {class_id})...")
            try:
                response = requests.get(f"{BASE_URL}/classes/{class_id}")
                if self.assert_response(response, 200, "Get Single Class"):
                    cls = response.json()
                    self.log(f"   Class: {cls['name']} - Student count: {cls['student_count']}")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Get Single Class - Error: {e}", "FAIL")
        
        # Test UPDATE class
        if self.test_data['classes']:
            class_id = self.test_data['classes'][0]['id']
            self.log(f"Testing UPDATE class (ID: {class_id})...")
            update_data = {"description": "Classe de sixième section A - Mise à jour"}
            try:
                response = requests.put(f"{BASE_URL}/classes/{class_id}", json=update_data)
                if self.assert_response(response, 200, "Update Class"):
                    cls = response.json()
                    self.log(f"   Updated description: {cls['description']}")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Update Class - Error: {e}", "FAIL")
        
        # Test DELETE class (should fail if students exist, test empty class)
        self.log("Testing DELETE class (should work for empty class)...")
        empty_class_data = {"name": "Test Empty", "level": "Test", "description": "To be deleted"}
        try:
            response = requests.post(f"{BASE_URL}/classes", json=empty_class_data)
            if response.status_code == 200:
                empty_class = response.json()
                delete_response = requests.delete(f"{BASE_URL}/classes/{empty_class['id']}")
                if self.assert_response(delete_response, 200, "Delete Empty Class"):
                    self.log("   Empty class deleted successfully")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Delete Empty Class - Error: {e}", "FAIL")
    
    def test_students_crud(self):
        """Test Students CRUD operations"""
        self.log("=" * 50)
        self.log("TESTING STUDENTS API")
        self.log("=" * 50)
        
        if not self.test_data['classes']:
            self.log("❌ No classes available for student testing", "FAIL")
            return
        
        class_id = self.test_data['classes'][0]['id']
        
        # Test CREATE student
        self.log("Testing CREATE student...")
        student_data = {
            "first_name": "Marie",
            "last_name": "Dupont",
            "class_id": class_id,
            "parent_email": "marie.dupont@parent.com",
            "parent_phone": "0123456789",
            "birth_date": "2011-05-15"
        }
        
        try:
            response = requests.post(f"{BASE_URL}/students", json=student_data)
            if self.assert_response(response, 200, "Create Student"):
                student_obj = response.json()
                self.test_data['students'].append(student_obj)
                self.log(f"   Created student ID: {student_obj['id']}")
                self.log(f"   Student: {student_obj['first_name']} {student_obj['last_name']}")
                self.log(f"   Class: {student_obj['class_name']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Create Student - Error: {e}", "FAIL")
        
        # Create second student
        student_data_2 = {
            "first_name": "Pierre",
            "last_name": "Martin",
            "class_id": class_id,
            "parent_email": "pierre.martin@parent.com",
            "parent_phone": "0987654321"
        }
        
        try:
            response = requests.post(f"{BASE_URL}/students", json=student_data_2)
            if response.status_code == 200:
                student_obj_2 = response.json()
                self.test_data['students'].append(student_obj_2)
        except Exception as e:
            self.log(f"Warning: Could not create second student: {e}")
        
        # Test CREATE student with invalid class_id (should fail)
        self.log("Testing CREATE student with invalid class_id...")
        invalid_student_data = {
            "first_name": "Invalid",
            "last_name": "Student",
            "class_id": "507f1f77bcf86cd799439011"  # Invalid ObjectId
        }
        
        try:
            response = requests.post(f"{BASE_URL}/students", json=invalid_student_data)
            if self.assert_response(response, 404, "Create Student Invalid Class"):
                self.log("   Correctly rejected invalid class_id")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Create Student Invalid Class - Error: {e}", "FAIL")
        
        # Test GET all students
        self.log("Testing GET all students...")
        try:
            response = requests.get(f"{BASE_URL}/students")
            if self.assert_response(response, 200, "Get All Students"):
                students = response.json()
                self.log(f"   Found {len(students)} students")
                for student in students:
                    self.log(f"   - {student['first_name']} {student['last_name']} ({student['class_name']}) - {student['absence_count']} absences")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get All Students - Error: {e}", "FAIL")
        
        # Test GET students filtered by class
        self.log(f"Testing GET students filtered by class_id: {class_id}...")
        try:
            response = requests.get(f"{BASE_URL}/students?class_id={class_id}")
            if self.assert_response(response, 200, "Get Students By Class"):
                students = response.json()
                self.log(f"   Found {len(students)} students in class")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get Students By Class - Error: {e}", "FAIL")
        
        # Test GET single student
        if self.test_data['students']:
            student_id = self.test_data['students'][0]['id']
            self.log(f"Testing GET single student (ID: {student_id})...")
            try:
                response = requests.get(f"{BASE_URL}/students/{student_id}")
                if self.assert_response(response, 200, "Get Single Student"):
                    student = response.json()
                    self.log(f"   Student: {student['first_name']} {student['last_name']}")
                    self.log(f"   Absences: {student['absence_count']}")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Get Single Student - Error: {e}", "FAIL")
        
        # Test UPDATE student
        if self.test_data['students']:
            student_id = self.test_data['students'][0]['id']
            self.log(f"Testing UPDATE student (ID: {student_id})...")
            update_data = {"parent_email": "marie.dupont.updated@parent.com"}
            try:
                response = requests.put(f"{BASE_URL}/students/{student_id}", json=update_data)
                if self.assert_response(response, 200, "Update Student"):
                    student = response.json()
                    self.log(f"   Updated email: {student['parent_email']}")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Update Student - Error: {e}", "FAIL")
    
    def test_absences_crud(self):
        """Test Absences CRUD operations"""
        self.log("=" * 50)
        self.log("TESTING ABSENCES API")
        self.log("=" * 50)
        
        if not self.test_data['students']:
            self.log("❌ No students available for absence testing", "FAIL")
            return
        
        student_id = self.test_data['students'][0]['id']
        today = date.today()
        
        # Test CREATE absence with notification
        self.log("Testing CREATE absence with parent notification...")
        absence_data = {
            "student_id": student_id,
            "date": today.strftime("%Y-%m-%d"),
            "reason": "Maladie",
            "type": "justifiée",
            "notify_parent": True
        }
        
        try:
            response = requests.post(f"{BASE_URL}/absences", json=absence_data)
            if self.assert_response(response, 200, "Create Absence With Notification"):
                absence_obj = response.json()
                self.test_data['absences'].append(absence_obj)
                self.log(f"   Created absence ID: {absence_obj['id']}")
                self.log(f"   Student: {absence_obj['student_name']}")
                self.log(f"   Date: {absence_obj['date']}")
                self.log(f"   Notified: {absence_obj['notified']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Create Absence With Notification - Error: {e}", "FAIL")
        
        # Test CREATE absence without notification
        self.log("Testing CREATE absence without parent notification...")
        absence_data_2 = {
            "student_id": student_id,
            "date": (today - timedelta(days=1)).strftime("%Y-%m-%d"),
            "reason": "Retard",
            "type": "non_justifiée",
            "notify_parent": False
        }
        
        try:
            response = requests.post(f"{BASE_URL}/absences", json=absence_data_2)
            if self.assert_response(response, 200, "Create Absence Without Notification"):
                absence_obj_2 = response.json()
                self.test_data['absences'].append(absence_obj_2)
                self.log(f"   Notified: {absence_obj_2['notified']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Create Absence Without Notification - Error: {e}", "FAIL")
        
        # Test CREATE absence with invalid student_id (should fail)
        self.log("Testing CREATE absence with invalid student_id...")
        invalid_absence_data = {
            "student_id": "507f1f77bcf86cd799439011",  # Invalid ObjectId
            "date": today.strftime("%Y-%m-%d"),
            "reason": "Test",
            "type": "justifiée"
        }
        
        try:
            response = requests.post(f"{BASE_URL}/absences", json=invalid_absence_data)
            if self.assert_response(response, 404, "Create Absence Invalid Student"):
                self.log("   Correctly rejected invalid student_id")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Create Absence Invalid Student - Error: {e}", "FAIL")
        
        # Test GET all absences
        self.log("Testing GET all absences...")
        try:
            response = requests.get(f"{BASE_URL}/absences")
            if self.assert_response(response, 200, "Get All Absences"):
                absences = response.json()
                self.log(f"   Found {len(absences)} absences")
                for absence in absences:
                    self.log(f"   - {absence['student_name']} ({absence['date']}) - {absence['type']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get All Absences - Error: {e}", "FAIL")
        
        # Test GET absences filtered by student
        self.log(f"Testing GET absences filtered by student_id: {student_id}...")
        try:
            response = requests.get(f"{BASE_URL}/absences?student_id={student_id}")
            if self.assert_response(response, 200, "Get Absences By Student"):
                absences = response.json()
                self.log(f"   Found {len(absences)} absences for student")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get Absences By Student - Error: {e}", "FAIL")
        
        # Test GET absences filtered by type
        self.log("Testing GET absences filtered by type 'justifiée'...")
        try:
            response = requests.get(f"{BASE_URL}/absences?type=justifiée")
            if self.assert_response(response, 200, "Get Absences By Type"):
                absences = response.json()
                self.log(f"   Found {len(absences)} justified absences")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get Absences By Type - Error: {e}", "FAIL")
        
        # Test GET single absence
        if self.test_data['absences']:
            absence_id = self.test_data['absences'][0]['id']
            self.log(f"Testing GET single absence (ID: {absence_id})...")
            try:
                response = requests.get(f"{BASE_URL}/absences/{absence_id}")
                if self.assert_response(response, 200, "Get Single Absence"):
                    absence = response.json()
                    self.log(f"   Absence: {absence['student_name']} - {absence['date']}")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Get Single Absence - Error: {e}", "FAIL")
        
        # Test UPDATE absence (change type)
        if self.test_data['absences']:
            absence_id = self.test_data['absences'][0]['id']
            self.log(f"Testing UPDATE absence type (ID: {absence_id})...")
            update_data = {"type": "non_justifiée"}
            try:
                response = requests.put(f"{BASE_URL}/absences/{absence_id}", json=update_data)
                if self.assert_response(response, 200, "Update Absence Type"):
                    absence = response.json()
                    self.log(f"   Updated type: {absence['type']}")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Update Absence Type - Error: {e}", "FAIL")
    
    def test_notifications_api(self):
        """Test Notifications API"""
        self.log("=" * 50)
        self.log("TESTING NOTIFICATIONS API")
        self.log("=" * 50)
        
        # Test GET all notifications
        self.log("Testing GET all notifications...")
        try:
            response = requests.get(f"{BASE_URL}/notifications")
            if self.assert_response(response, 200, "Get All Notifications"):
                notifications = response.json()
                self.log(f"   Found {len(notifications)} notifications")
                if notifications:
                    self.test_data['notifications'] = notifications
                    for notif in notifications[:3]:  # Show first 3
                        self.log(f"   - {notif['student_name']}: {notif['message'][:50]}...")
                        self.log(f"     Read: {notif['read']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get All Notifications - Error: {e}", "FAIL")
        
        # Test GET unread notifications only
        self.log("Testing GET unread notifications only...")
        try:
            response = requests.get(f"{BASE_URL}/notifications?unread_only=true")
            if self.assert_response(response, 200, "Get Unread Notifications"):
                notifications = response.json()
                self.log(f"   Found {len(notifications)} unread notifications")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get Unread Notifications - Error: {e}", "FAIL")
        
        # Test mark notification as read
        if self.test_data['notifications']:
            notification_id = self.test_data['notifications'][0]['id']
            self.log(f"Testing MARK notification as read (ID: {notification_id})...")
            try:
                response = requests.put(f"{BASE_URL}/notifications/{notification_id}/read")
                if self.assert_response(response, 200, "Mark Notification Read"):
                    result = response.json()
                    self.log(f"   Result: {result['message']}")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Mark Notification Read - Error: {e}", "FAIL")
        
        # Test mark all notifications as read
        self.log("Testing MARK ALL notifications as read...")
        try:
            response = requests.put(f"{BASE_URL}/notifications/read-all")
            if self.assert_response(response, 200, "Mark All Notifications Read"):
                result = response.json()
                self.log(f"   Result: {result['message']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Mark All Notifications Read - Error: {e}", "FAIL")
    
    def test_statistics_api(self):
        """Test Statistics API"""
        self.log("=" * 50)
        self.log("TESTING STATISTICS API")
        self.log("=" * 50)
        
        # Test GET statistics
        self.log("Testing GET statistics...")
        try:
            response = requests.get(f"{BASE_URL}/statistics")
            if self.assert_response(response, 200, "Get Statistics"):
                stats = response.json()
                self.log(f"   Total Students: {stats['total_students']}")
                self.log(f"   Total Classes: {stats['total_classes']}")
                self.log(f"   Total Absences: {stats['total_absences']}")
                self.log(f"   Justified Absences: {stats['justified_absences']}")
                self.log(f"   Unjustified Absences: {stats['unjustified_absences']}")
                
                if stats['absences_by_class']:
                    self.log("   Absences by Class:")
                    for item in stats['absences_by_class']:
                        self.log(f"     - {item['class_name']}: {item['count']}")
                
                if stats['absences_by_month']:
                    self.log("   Recent Absences by Month:")
                    for item in stats['absences_by_month'][:3]:
                        self.log(f"     - {item['month']}: {item['count']}")
                
                if stats['top_absent_students']:
                    self.log("   Top Absent Students:")
                    for item in stats['top_absent_students'][:3]:
                        self.log(f"     - {item['student_name']} ({item['class_name']}): {item['count']}")
        except Exception as e:
            self.failed += 1
            self.log(f"❌ Get Statistics - Error: {e}", "FAIL")
    
    def test_edge_cases(self):
        """Test edge cases and error handling"""
        self.log("=" * 50)
        self.log("TESTING EDGE CASES")
        self.log("=" * 50)
        
        # Test DELETE class with students (should fail)
        if self.test_data['classes'] and self.test_data['students']:
            class_id = self.test_data['classes'][0]['id']
            self.log(f"Testing DELETE class with students (should fail) - ID: {class_id}...")
            try:
                response = requests.delete(f"{BASE_URL}/classes/{class_id}")
                if self.assert_response(response, 400, "Delete Class With Students"):
                    self.log("   Correctly prevented deletion of class with students")
            except Exception as e:
                self.failed += 1
                self.log(f"❌ Delete Class With Students - Error: {e}", "FAIL")
        
        # Test 404 errors for non-existent resources
        self.log("Testing 404 errors for non-existent resources...")
        fake_id = "507f1f77bcf86cd799439011"
        
        endpoints_to_test = [
            (f"/classes/{fake_id}", "Get Non-existent Class"),
            (f"/students/{fake_id}", "Get Non-existent Student"),
            (f"/absences/{fake_id}", "Get Non-existent Absence")
        ]
        
        for endpoint, test_name in endpoints_to_test:
            try:
                response = requests.get(f"{BASE_URL}{endpoint}")
                self.assert_response(response, 404, test_name)
            except Exception as e:
                self.failed += 1
                self.log(f"❌ {test_name} - Error: {e}", "FAIL")
    
    def cleanup_test_data(self):
        """Clean up test data created during tests"""
        self.log("=" * 50)
        self.log("CLEANING UP TEST DATA")
        self.log("=" * 50)
        
        # Delete absences first (to avoid foreign key issues)
        for absence in self.test_data['absences']:
            try:
                response = requests.delete(f"{BASE_URL}/absences/{absence['id']}")
                if response.status_code == 200:
                    self.log(f"   Deleted absence: {absence['id']}")
            except Exception as e:
                self.log(f"   Warning: Could not delete absence {absence['id']}: {e}")
        
        # Delete students (this also deletes their absences and notifications)
        for student in self.test_data['students']:
            try:
                response = requests.delete(f"{BASE_URL}/students/{student['id']}")
                if response.status_code == 200:
                    self.log(f"   Deleted student: {student['first_name']} {student['last_name']}")
            except Exception as e:
                self.log(f"   Warning: Could not delete student {student['id']}: {e}")
        
        # Delete classes (should work now that students are gone)
        for cls in self.test_data['classes']:
            try:
                response = requests.delete(f"{BASE_URL}/classes/{cls['id']}")
                if response.status_code == 200:
                    self.log(f"   Deleted class: {cls['name']}")
            except Exception as e:
                self.log(f"   Warning: Could not delete class {cls['id']}: {e}")
    
    def run_all_tests(self):
        """Run all test suites"""
        self.log("🚀 STARTING SCHOOL ABSENCE MANAGEMENT API TESTS")
        self.log(f"Testing API at: {BASE_URL}")
        self.log("=" * 70)
        
        start_time = time.time()
        
        # Run all test suites
        self.test_api_root()
        self.test_classes_crud()
        self.test_students_crud() 
        self.test_absences_crud()
        self.test_notifications_api()
        self.test_statistics_api()
        self.test_edge_cases()
        
        # Clean up
        self.cleanup_test_data()
        
        # Final summary
        end_time = time.time()
        duration = end_time - start_time
        
        self.log("=" * 70)
        self.log("🏁 TEST RESULTS SUMMARY")
        self.log("=" * 70)
        self.log(f"✅ PASSED: {self.passed}")
        self.log(f"❌ FAILED: {self.failed}")
        self.log(f"📊 SUCCESS RATE: {(self.passed / (self.passed + self.failed) * 100):.1f}%")
        self.log(f"⏱️  DURATION: {duration:.2f} seconds")
        
        if self.failed == 0:
            self.log("🎉 ALL TESTS PASSED! Backend API is working correctly.", "SUCCESS")
            return True
        else:
            self.log(f"⚠️  {self.failed} tests failed. Please review the errors above.", "WARNING")
            return False

def main():
    """Main function to run tests"""
    print("School Absence Management API Test Suite")
    print("=" * 50)
    
    tester = TestRunner()
    success = tester.run_all_tests()
    
    # Exit with appropriate code
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()