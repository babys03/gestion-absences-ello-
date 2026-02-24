from fastapi import FastAPI, APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
import uuid
from datetime import datetime, date
from bson import ObjectId
import io
import base64

# PDF and Excel exports
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
import xlsxwriter

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# Helper function to convert ObjectId to string
def serialize_doc(doc):
    if doc is None:
        return None
    doc["id"] = str(doc.pop("_id"))
    return doc

# ==================== MODELS ====================

# Class Models
class ClassCreate(BaseModel):
    name: str
    level: str  # e.g., "6ème", "5ème", "4ème", "3ème"
    description: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    level: Optional[str] = None
    description: Optional[str] = None

class ClassResponse(BaseModel):
    id: str
    name: str
    level: str
    description: Optional[str] = None
    student_count: int = 0
    created_at: datetime

# Student Models
class StudentCreate(BaseModel):
    first_name: str
    last_name: str
    class_id: str
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_date: Optional[str] = None

class StudentUpdate(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    class_id: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_date: Optional[str] = None

class StudentResponse(BaseModel):
    id: str
    first_name: str
    last_name: str
    class_id: str
    class_name: Optional[str] = None
    parent_email: Optional[str] = None
    parent_phone: Optional[str] = None
    birth_date: Optional[str] = None
    absence_count: int = 0
    created_at: datetime

# Absence Models
class AbsenceCreate(BaseModel):
    student_id: str
    date: str  # Format: YYYY-MM-DD
    period: str = "journee"  # "matin", "apresmidi", "journee"
    reason: Optional[str] = None
    type: str = "non_justifiée"  # "justifiée" or "non_justifiée"
    notify_parent: bool = True

class AbsenceUpdate(BaseModel):
    reason: Optional[str] = None
    type: Optional[str] = None
    period: Optional[str] = None

class AbsenceResponse(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    class_name: Optional[str] = None
    date: str
    period: str = "journee"
    reason: Optional[str] = None
    type: str
    notified: bool = False
    created_at: datetime

# Notification Models
class NotificationResponse(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    absence_id: str
    message: str
    read: bool = False
    created_at: datetime

# Statistics Models
class StatisticsResponse(BaseModel):
    total_students: int
    total_classes: int
    total_absences: int
    justified_absences: int
    unjustified_absences: int
    absences_by_class: List[dict]
    absences_by_month: List[dict]
    top_absent_students: List[dict]

# ==================== CLASS ENDPOINTS ====================

@api_router.get("/")
async def root():
    return {"message": "API Gestion des Absences Scolaires"}

@api_router.post("/classes", response_model=ClassResponse)
async def create_class(class_data: ClassCreate):
    class_dict = class_data.dict()
    class_dict["created_at"] = datetime.utcnow()
    class_dict["student_count"] = 0
    
    result = await db.classes.insert_one(class_dict)
    class_dict["id"] = str(result.inserted_id)
    if "_id" in class_dict:
        del class_dict["_id"]
    return ClassResponse(**class_dict)

@api_router.get("/classes", response_model=List[ClassResponse])
async def get_classes():
    classes = await db.classes.find().to_list(100)
    result = []
    for cls in classes:
        # Count students in this class
        student_count = await db.students.count_documents({"class_id": str(cls["_id"])})
        cls["student_count"] = student_count
        result.append(ClassResponse(**serialize_doc(cls)))
    return result

@api_router.get("/classes/{class_id}", response_model=ClassResponse)
async def get_class(class_id: str):
    cls = await db.classes.find_one({"_id": ObjectId(class_id)})
    if not cls:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    student_count = await db.students.count_documents({"class_id": class_id})
    cls["student_count"] = student_count
    return ClassResponse(**serialize_doc(cls))

@api_router.put("/classes/{class_id}", response_model=ClassResponse)
async def update_class(class_id: str, class_data: ClassUpdate):
    update_dict = {k: v for k, v in class_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    result = await db.classes.update_one(
        {"_id": ObjectId(class_id)},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    
    return await get_class(class_id)

@api_router.delete("/classes/{class_id}")
async def delete_class(class_id: str):
    # Check if class has students
    student_count = await db.students.count_documents({"class_id": class_id})
    if student_count > 0:
        raise HTTPException(status_code=400, detail="Impossible de supprimer une classe avec des élèves")
    
    result = await db.classes.delete_one({"_id": ObjectId(class_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    return {"message": "Classe supprimée avec succès"}

# ==================== STUDENT ENDPOINTS ====================

@api_router.post("/students", response_model=StudentResponse)
async def create_student(student_data: StudentCreate):
    # Verify class exists
    cls = await db.classes.find_one({"_id": ObjectId(student_data.class_id)})
    if not cls:
        raise HTTPException(status_code=404, detail="Classe non trouvée")
    
    student_dict = student_data.dict()
    student_dict["created_at"] = datetime.utcnow()
    student_dict["absence_count"] = 0
    
    result = await db.students.insert_one(student_dict)
    student_dict["id"] = str(result.inserted_id)
    student_dict["class_name"] = cls["name"]
    return StudentResponse(**student_dict)

@api_router.get("/students", response_model=List[StudentResponse])
async def get_students(class_id: Optional[str] = None):
    query = {}
    if class_id:
        query["class_id"] = class_id
    
    students = await db.students.find(query).to_list(500)
    result = []
    for student in students:
        # Get class name
        cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
        class_name = cls["name"] if cls else "Inconnu"
        
        # Count absences
        absence_count = await db.absences.count_documents({"student_id": str(student["_id"])})
        
        student_data = serialize_doc(student)
        student_data["class_name"] = class_name
        student_data["absence_count"] = absence_count
        result.append(StudentResponse(**student_data))
    return result

@api_router.get("/students/{student_id}", response_model=StudentResponse)
async def get_student(student_id: str):
    student = await db.students.find_one({"_id": ObjectId(student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Élève non trouvé")
    
    cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
    class_name = cls["name"] if cls else "Inconnu"
    absence_count = await db.absences.count_documents({"student_id": student_id})
    
    student_data = serialize_doc(student)
    student_data["class_name"] = class_name
    student_data["absence_count"] = absence_count
    return StudentResponse(**student_data)

@api_router.put("/students/{student_id}", response_model=StudentResponse)
async def update_student(student_id: str, student_data: StudentUpdate):
    update_dict = {k: v for k, v in student_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    # If updating class_id, verify class exists
    if "class_id" in update_dict:
        cls = await db.classes.find_one({"_id": ObjectId(update_dict["class_id"])})
        if not cls:
            raise HTTPException(status_code=404, detail="Classe non trouvée")
    
    result = await db.students.update_one(
        {"_id": ObjectId(student_id)},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Élève non trouvé")
    
    return await get_student(student_id)

@api_router.delete("/students/{student_id}")
async def delete_student(student_id: str):
    # Delete all absences for this student
    await db.absences.delete_many({"student_id": student_id})
    # Delete all notifications for this student
    await db.notifications.delete_many({"student_id": student_id})
    
    result = await db.students.delete_one({"_id": ObjectId(student_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Élève non trouvé")
    return {"message": "Élève supprimé avec succès"}

# ==================== ABSENCE ENDPOINTS ====================

@api_router.post("/absences", response_model=AbsenceResponse)
async def create_absence(absence_data: AbsenceCreate):
    # Verify student exists
    student = await db.students.find_one({"_id": ObjectId(absence_data.student_id)})
    if not student:
        raise HTTPException(status_code=404, detail="Élève non trouvé")
    
    # Get class info
    cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
    class_name = cls["name"] if cls else "Inconnu"
    
    absence_dict = absence_data.dict()
    del absence_dict["notify_parent"]
    absence_dict["created_at"] = datetime.utcnow()
    absence_dict["notified"] = False
    
    result = await db.absences.insert_one(absence_dict)
    absence_id = str(result.inserted_id)
    
    # Create notification if requested
    if absence_data.notify_parent:
        student_name = f"{student['first_name']} {student['last_name']}"
        period_text = {"matin": "Matin", "apresmidi": "Après-midi", "journee": "Journée complète"}.get(absence_data.period, "Journée")
        notification = {
            "student_id": absence_data.student_id,
            "absence_id": absence_id,
            "message": f"Absence enregistrée pour {student_name} le {absence_data.date} ({period_text}). Motif: {absence_data.reason or 'Non spécifié'}. Type: {absence_data.type}",
            "read": False,
            "created_at": datetime.utcnow()
        }
        await db.notifications.insert_one(notification)
        await db.absences.update_one(
            {"_id": ObjectId(absence_id)},
            {"$set": {"notified": True}}
        )
    
    absence_dict["id"] = absence_id
    absence_dict["student_name"] = f"{student['first_name']} {student['last_name']}"
    absence_dict["class_name"] = class_name
    absence_dict["notified"] = absence_data.notify_parent
    return AbsenceResponse(**absence_dict)

@api_router.get("/absences", response_model=List[AbsenceResponse])
async def get_absences(
    student_id: Optional[str] = None,
    class_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None
):
    query = {}
    if student_id:
        query["student_id"] = student_id
    if type:
        query["type"] = type
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    absences = await db.absences.find(query).sort("date", -1).to_list(1000)
    result = []
    
    for absence in absences:
        student = await db.students.find_one({"_id": ObjectId(absence["student_id"])})
        if student:
            # Filter by class if specified
            if class_id and student["class_id"] != class_id:
                continue
            
            cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
            class_name = cls["name"] if cls else "Inconnu"
            
            absence_data = serialize_doc(absence)
            absence_data["student_name"] = f"{student['first_name']} {student['last_name']}"
            absence_data["class_name"] = class_name
            result.append(AbsenceResponse(**absence_data))
    
    return result

@api_router.get("/absences/{absence_id}", response_model=AbsenceResponse)
async def get_absence(absence_id: str):
    absence = await db.absences.find_one({"_id": ObjectId(absence_id)})
    if not absence:
        raise HTTPException(status_code=404, detail="Absence non trouvée")
    
    student = await db.students.find_one({"_id": ObjectId(absence["student_id"])})
    if student:
        cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
        class_name = cls["name"] if cls else "Inconnu"
        
        absence_data = serialize_doc(absence)
        absence_data["student_name"] = f"{student['first_name']} {student['last_name']}"
        absence_data["class_name"] = class_name
        return AbsenceResponse(**absence_data)
    
    raise HTTPException(status_code=404, detail="Élève associé non trouvé")

@api_router.put("/absences/{absence_id}", response_model=AbsenceResponse)
async def update_absence(absence_id: str, absence_data: AbsenceUpdate):
    update_dict = {k: v for k, v in absence_data.dict().items() if v is not None}
    if not update_dict:
        raise HTTPException(status_code=400, detail="Aucune donnée à mettre à jour")
    
    result = await db.absences.update_one(
        {"_id": ObjectId(absence_id)},
        {"$set": update_dict}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Absence non trouvée")
    
    return await get_absence(absence_id)

@api_router.delete("/absences/{absence_id}")
async def delete_absence(absence_id: str):
    # Delete associated notifications
    await db.notifications.delete_many({"absence_id": absence_id})
    
    result = await db.absences.delete_one({"_id": ObjectId(absence_id)})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Absence non trouvée")
    return {"message": "Absence supprimée avec succès"}

# ==================== NOTIFICATION ENDPOINTS ====================

@api_router.get("/notifications", response_model=List[NotificationResponse])
async def get_notifications(unread_only: bool = False):
    query = {}
    if unread_only:
        query["read"] = False
    
    notifications = await db.notifications.find(query).sort("created_at", -1).to_list(500)
    result = []
    
    for notif in notifications:
        student = await db.students.find_one({"_id": ObjectId(notif["student_id"])})
        student_name = f"{student['first_name']} {student['last_name']}" if student else "Inconnu"
        
        notif_data = serialize_doc(notif)
        notif_data["student_name"] = student_name
        result.append(NotificationResponse(**notif_data))
    
    return result

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(notification_id: str):
    result = await db.notifications.update_one(
        {"_id": ObjectId(notification_id)},
        {"$set": {"read": True}}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Notification non trouvée")
    return {"message": "Notification marquée comme lue"}

@api_router.put("/notifications/read-all")
async def mark_all_notifications_read():
    await db.notifications.update_many(
        {"read": False},
        {"$set": {"read": True}}
    )
    return {"message": "Toutes les notifications marquées comme lues"}

# ==================== STATISTICS ENDPOINTS ====================

@api_router.get("/statistics", response_model=StatisticsResponse)
async def get_statistics():
    total_students = await db.students.count_documents({})
    total_classes = await db.classes.count_documents({})
    total_absences = await db.absences.count_documents({})
    justified_absences = await db.absences.count_documents({"type": "justifiée"})
    unjustified_absences = await db.absences.count_documents({"type": "non_justifiée"})
    
    # Absences by class
    classes = await db.classes.find().to_list(100)
    absences_by_class = []
    for cls in classes:
        class_id = str(cls["_id"])
        students = await db.students.find({"class_id": class_id}).to_list(500)
        student_ids = [str(s["_id"]) for s in students]
        absence_count = await db.absences.count_documents({"student_id": {"$in": student_ids}})
        absences_by_class.append({
            "class_name": cls["name"],
            "count": absence_count
        })
    
    # Absences by month (last 12 months)
    absences_by_month = []
    all_absences = await db.absences.find().to_list(5000)
    month_counts = {}
    for absence in all_absences:
        date_str = absence.get("date", "")
        if date_str:
            month_key = date_str[:7]  # YYYY-MM
            month_counts[month_key] = month_counts.get(month_key, 0) + 1
    
    for month, count in sorted(month_counts.items(), reverse=True)[:12]:
        absences_by_month.append({"month": month, "count": count})
    
    # Top absent students
    pipeline = [
        {"$group": {"_id": "$student_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 10}
    ]
    top_absences = await db.absences.aggregate(pipeline).to_list(10)
    top_absent_students = []
    for item in top_absences:
        student = await db.students.find_one({"_id": ObjectId(item["_id"])})
        if student:
            cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
            class_name = cls["name"] if cls else "Inconnu"
            top_absent_students.append({
                "student_name": f"{student['first_name']} {student['last_name']}",
                "class_name": class_name,
                "count": item["count"]
            })
    
    return StatisticsResponse(
        total_students=total_students,
        total_classes=total_classes,
        total_absences=total_absences,
        justified_absences=justified_absences,
        unjustified_absences=unjustified_absences,
        absences_by_class=absences_by_class,
        absences_by_month=absences_by_month,
        top_absent_students=top_absent_students
    )

# ==================== EXPORT ENDPOINTS ====================

@api_router.get("/export/absences/excel")
async def export_absences_excel(
    class_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None
):
    """Export absences to Excel format"""
    # Get absences data
    query = {}
    if type:
        query["type"] = type
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    absences = await db.absences.find(query).sort("date", -1).to_list(5000)
    
    # Create Excel file in memory
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # Styles
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#3B82F6',
        'font_color': 'white',
        'border': 1,
        'align': 'center',
        'valign': 'vcenter'
    })
    cell_format = workbook.add_format({
        'border': 1,
        'align': 'left',
        'valign': 'vcenter'
    })
    justified_format = workbook.add_format({
        'border': 1,
        'bg_color': '#D1FAE5',
        'align': 'center'
    })
    unjustified_format = workbook.add_format({
        'border': 1,
        'bg_color': '#FEE2E2',
        'align': 'center'
    })
    
    # Sheet 1: Liste des absences
    ws_absences = workbook.add_worksheet('Absences')
    headers = ['Date', 'Élève', 'Classe', 'Type', 'Motif', 'Notifié']
    for col, header in enumerate(headers):
        ws_absences.write(0, col, header, header_format)
    
    ws_absences.set_column(0, 0, 12)  # Date
    ws_absences.set_column(1, 1, 25)  # Élève
    ws_absences.set_column(2, 2, 15)  # Classe
    ws_absences.set_column(3, 3, 15)  # Type
    ws_absences.set_column(4, 4, 35)  # Motif
    ws_absences.set_column(5, 5, 10)  # Notifié
    
    row = 1
    for absence in absences:
        student = await db.students.find_one({"_id": ObjectId(absence["student_id"])})
        if student:
            if class_id and student["class_id"] != class_id:
                continue
            cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
            class_name = cls["name"] if cls else "Inconnu"
            student_name = f"{student['first_name']} {student['last_name']}"
            
            ws_absences.write(row, 0, absence.get("date", ""), cell_format)
            ws_absences.write(row, 1, student_name, cell_format)
            ws_absences.write(row, 2, class_name, cell_format)
            
            type_format = justified_format if absence.get("type") == "justifiée" else unjustified_format
            ws_absences.write(row, 3, "Justifiée" if absence.get("type") == "justifiée" else "Non justifiée", type_format)
            
            ws_absences.write(row, 4, absence.get("reason", ""), cell_format)
            ws_absences.write(row, 5, "Oui" if absence.get("notified") else "Non", cell_format)
            row += 1
    
    # Sheet 2: Statistiques par classe
    ws_stats = workbook.add_worksheet('Statistiques')
    classes = await db.classes.find().to_list(100)
    
    ws_stats.write(0, 0, 'Classe', header_format)
    ws_stats.write(0, 1, 'Nombre d\'élèves', header_format)
    ws_stats.write(0, 2, 'Total absences', header_format)
    ws_stats.write(0, 3, 'Justifiées', header_format)
    ws_stats.write(0, 4, 'Non justifiées', header_format)
    
    ws_stats.set_column(0, 0, 15)
    ws_stats.set_column(1, 4, 18)
    
    row = 1
    for cls in classes:
        class_id_str = str(cls["_id"])
        students = await db.students.find({"class_id": class_id_str}).to_list(500)
        student_ids = [str(s["_id"]) for s in students]
        
        total_abs = await db.absences.count_documents({"student_id": {"$in": student_ids}})
        justified = await db.absences.count_documents({"student_id": {"$in": student_ids}, "type": "justifiée"})
        unjustified = await db.absences.count_documents({"student_id": {"$in": student_ids}, "type": "non_justifiée"})
        
        ws_stats.write(row, 0, cls["name"], cell_format)
        ws_stats.write(row, 1, len(students), cell_format)
        ws_stats.write(row, 2, total_abs, cell_format)
        ws_stats.write(row, 3, justified, justified_format)
        ws_stats.write(row, 4, unjustified, unjustified_format)
        row += 1
    
    # Sheet 3: Top élèves absents
    ws_top = workbook.add_worksheet('Top Absents')
    ws_top.write(0, 0, 'Rang', header_format)
    ws_top.write(0, 1, 'Élève', header_format)
    ws_top.write(0, 2, 'Classe', header_format)
    ws_top.write(0, 3, 'Nombre d\'absences', header_format)
    
    ws_top.set_column(0, 0, 8)
    ws_top.set_column(1, 1, 25)
    ws_top.set_column(2, 2, 15)
    ws_top.set_column(3, 3, 20)
    
    pipeline = [
        {"$group": {"_id": "$student_id", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 20}
    ]
    top_absences = await db.absences.aggregate(pipeline).to_list(20)
    
    row = 1
    for idx, item in enumerate(top_absences):
        student = await db.students.find_one({"_id": ObjectId(item["_id"])})
        if student:
            cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
            class_name = cls["name"] if cls else "Inconnu"
            
            ws_top.write(row, 0, idx + 1, cell_format)
            ws_top.write(row, 1, f"{student['first_name']} {student['last_name']}", cell_format)
            ws_top.write(row, 2, class_name, cell_format)
            ws_top.write(row, 3, item["count"], unjustified_format if item["count"] > 5 else cell_format)
            row += 1
    
    workbook.close()
    output.seek(0)
    
    # Return as base64 for mobile download
    excel_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
    
    return {
        "filename": f"absences_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        "content": excel_base64,
        "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }


@api_router.get("/export/absences/pdf")
async def export_absences_pdf(
    class_id: Optional[str] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    type: Optional[str] = None
):
    """Export absences to PDF format"""
    # Get absences data
    query = {}
    if type:
        query["type"] = type
    if start_date:
        query["date"] = {"$gte": start_date}
    if end_date:
        if "date" in query:
            query["date"]["$lte"] = end_date
        else:
            query["date"] = {"$lte": end_date}
    
    absences = await db.absences.find(query).sort("date", -1).to_list(5000)
    
    # Create PDF in memory
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=20*mm,
        leftMargin=20*mm,
        topMargin=20*mm,
        bottomMargin=20*mm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=20,
        textColor=colors.HexColor('#3B82F6'),
        alignment=1  # Center
    )
    elements.append(Paragraph("Rapport des Absences Scolaires", title_style))
    elements.append(Paragraph(f"Généré le {datetime.now().strftime('%d/%m/%Y à %H:%M')}", styles['Normal']))
    elements.append(Spacer(1, 20))
    
    # Statistics summary
    total_absences = await db.absences.count_documents(query if query else {})
    justified = await db.absences.count_documents({**query, "type": "justifiée"} if query else {"type": "justifiée"})
    unjustified = await db.absences.count_documents({**query, "type": "non_justifiée"} if query else {"type": "non_justifiée"})
    
    summary_data = [
        ["Statistiques Globales", ""],
        ["Total des absences", str(total_absences)],
        ["Absences justifiées", str(justified)],
        ["Absences non justifiées", str(unjustified)],
    ]
    
    summary_table = Table(summary_data, colWidths=[120*mm, 40*mm])
    summary_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#F3F4F6')),
        ('GRID', (0, 0), (-1, -1), 1, colors.HexColor('#E5E7EB')),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    elements.append(summary_table)
    elements.append(Spacer(1, 20))
    
    # Absences table
    elements.append(Paragraph("Liste des Absences", styles['Heading2']))
    elements.append(Spacer(1, 10))
    
    table_data = [['Date', 'Élève', 'Classe', 'Type', 'Motif']]
    
    for absence in absences[:100]:  # Limit to 100 for PDF
        student = await db.students.find_one({"_id": ObjectId(absence["student_id"])})
        if student:
            if class_id and student["class_id"] != class_id:
                continue
            cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
            class_name = cls["name"] if cls else "Inconnu"
            student_name = f"{student['first_name']} {student['last_name']}"
            
            table_data.append([
                absence.get("date", ""),
                student_name,
                class_name,
                "Justifiée" if absence.get("type") == "justifiée" else "Non justifiée",
                (absence.get("reason", "") or "")[:30]  # Truncate reason
            ])
    
    if len(table_data) > 1:
        absences_table = Table(table_data, colWidths=[25*mm, 45*mm, 30*mm, 30*mm, 40*mm])
        absences_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('BACKGROUND', (0, 1), (-1, -1), colors.white),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E5E7EB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('LEFTPADDING', (0, 0), (-1, -1), 5),
            ('RIGHTPADDING', (0, 0), (-1, -1), 5),
            ('TOPPADDING', (0, 0), (-1, -1), 6),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F9FAFB')]),
        ]))
        elements.append(absences_table)
    else:
        elements.append(Paragraph("Aucune absence trouvée.", styles['Normal']))
    
    # Build PDF
    doc.build(elements)
    buffer.seek(0)
    
    # Return as base64 for mobile download
    pdf_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return {
        "filename": f"absences_{datetime.now().strftime('%Y%m%d_%H%M%S')}.pdf",
        "content": pdf_base64,
        "content_type": "application/pdf"
    }


@api_router.get("/export/daily-attendance/excel")
async def export_daily_attendance_excel(date: str, class_id: Optional[str] = None):
    """Export daily attendance sheet to Excel format"""
    # Get all students
    query = {}
    if class_id:
        query["class_id"] = class_id
    
    students = await db.students.find(query).to_list(500)
    
    # Get absences for this date
    absences = await db.absences.find({"date": date}).to_list(1000)
    absence_map = {a["student_id"]: a for a in absences}
    
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # Styles
    title_format = workbook.add_format({
        'bold': True,
        'font_size': 16,
        'align': 'center',
        'valign': 'vcenter',
        'bg_color': '#3B82F6',
        'font_color': 'white'
    })
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#E5E7EB',
        'border': 1,
        'align': 'center',
        'valign': 'vcenter'
    })
    cell_format = workbook.add_format({
        'border': 1,
        'align': 'left',
        'valign': 'vcenter'
    })
    present_format = workbook.add_format({
        'border': 1,
        'bg_color': '#D1FAE5',
        'align': 'center',
        'font_color': '#059669',
        'bold': True
    })
    absent_format = workbook.add_format({
        'border': 1,
        'bg_color': '#FEE2E2',
        'align': 'center',
        'font_color': '#DC2626',
        'bold': True
    })
    justified_format = workbook.add_format({
        'border': 1,
        'bg_color': '#FEF3C7',
        'align': 'center',
        'font_color': '#D97706',
        'bold': True
    })
    
    # Group students by class
    classes = await db.classes.find().to_list(100)
    class_map = {str(c["_id"]): c["name"] for c in classes}
    
    students_by_class = {}
    for student in students:
        class_name = class_map.get(student["class_id"], "Inconnu")
        if class_name not in students_by_class:
            students_by_class[class_name] = []
        students_by_class[class_name].append(student)
    
    # Create a sheet for each class (or one sheet if class_id specified)
    for class_name, class_students in students_by_class.items():
        ws = workbook.add_worksheet(class_name[:31])  # Sheet name max 31 chars
        
        # Title
        ws.merge_range('A1:E1', f'Feuille d\'appel - {class_name} - {date}', title_format)
        ws.set_row(0, 30)
        
        # Headers
        headers = ['N°', 'Nom', 'Prénom', 'Statut', 'Motif']
        for col, header in enumerate(headers):
            ws.write(2, col, header, header_format)
        
        ws.set_column(0, 0, 5)   # N°
        ws.set_column(1, 1, 20)  # Nom
        ws.set_column(2, 2, 20)  # Prénom
        ws.set_column(3, 3, 15)  # Statut
        ws.set_column(4, 4, 30)  # Motif
        
        # Sort students by last name
        class_students.sort(key=lambda s: s["last_name"])
        
        row = 3
        absent_count = 0
        for idx, student in enumerate(class_students):
            student_id = str(student["_id"])
            absence = absence_map.get(student_id)
            
            ws.write(row, 0, idx + 1, cell_format)
            ws.write(row, 1, student["last_name"], cell_format)
            ws.write(row, 2, student["first_name"], cell_format)
            
            if absence:
                absent_count += 1
                if absence.get("type") == "justifiée":
                    ws.write(row, 3, "Absent (J)", justified_format)
                else:
                    ws.write(row, 3, "Absent", absent_format)
                ws.write(row, 4, absence.get("reason", ""), cell_format)
            else:
                ws.write(row, 3, "Présent", present_format)
                ws.write(row, 4, "", cell_format)
            
            row += 1
        
        # Summary
        row += 1
        ws.write(row, 0, "Résumé:", header_format)
        ws.merge_range(row, 1, row, 4, f"Présents: {len(class_students) - absent_count} | Absents: {absent_count} | Total: {len(class_students)}", cell_format)
    
    workbook.close()
    output.seek(0)
    
    excel_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
    
    return {
        "filename": f"appel_{date}.xlsx",
        "content": excel_base64,
        "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }


@api_router.get("/export/daily-attendance/pdf")
async def export_daily_attendance_pdf(date: str, class_id: Optional[str] = None):
    """Export daily attendance sheet to PDF format"""
    # Get all students
    query = {}
    if class_id:
        query["class_id"] = class_id
    
    students = await db.students.find(query).to_list(500)
    
    # Get absences for this date
    absences = await db.absences.find({"date": date}).to_list(1000)
    absence_map = {a["student_id"]: a for a in absences}
    
    # Get classes
    classes = await db.classes.find().to_list(100)
    class_map = {str(c["_id"]): c["name"] for c in classes}
    
    # Group students by class
    students_by_class = {}
    for student in students:
        class_name = class_map.get(student["class_id"], "Inconnu")
        if class_name not in students_by_class:
            students_by_class[class_name] = []
        students_by_class[class_name].append(student)
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15*mm,
        leftMargin=15*mm,
        topMargin=15*mm,
        bottomMargin=15*mm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=16,
        spaceAfter=10,
        textColor=colors.HexColor('#1F2937'),
        alignment=1
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=15,
        textColor=colors.HexColor('#6B7280'),
        alignment=1
    )
    
    for class_name, class_students in students_by_class.items():
        # Class title
        elements.append(Paragraph(f"Feuille d'Appel - {class_name}", title_style))
        elements.append(Paragraph(f"Date: {date}", subtitle_style))
        
        # Sort students
        class_students.sort(key=lambda s: s["last_name"])
        
        # Build table data
        table_data = [['N°', 'Nom', 'Prénom', 'Statut', 'Signature']]
        
        absent_count = 0
        for idx, student in enumerate(class_students):
            student_id = str(student["_id"])
            absence = absence_map.get(student_id)
            
            if absence:
                absent_count += 1
                if absence.get("type") == "justifiée":
                    status = "Absent (J)"
                else:
                    status = "Absent"
            else:
                status = "Présent"
            
            table_data.append([
                str(idx + 1),
                student["last_name"],
                student["first_name"],
                status,
                ""  # Signature column for manual signing
            ])
        
        # Create table
        table = Table(table_data, colWidths=[12*mm, 45*mm, 45*mm, 30*mm, 35*mm])
        
        # Table style
        style_commands = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#3B82F6')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWHEIGHTS', (0, 1), (-1, -1), 20),
        ]
        
        # Color rows based on status
        for i, row in enumerate(table_data[1:], start=1):
            if "Absent (J)" in row[3]:
                style_commands.append(('BACKGROUND', (3, i), (3, i), colors.HexColor('#FEF3C7')))
            elif "Absent" in row[3]:
                style_commands.append(('BACKGROUND', (3, i), (3, i), colors.HexColor('#FEE2E2')))
            else:
                style_commands.append(('BACKGROUND', (3, i), (3, i), colors.HexColor('#D1FAE5')))
        
        table.setStyle(TableStyle(style_commands))
        elements.append(table)
        
        # Summary
        elements.append(Spacer(1, 10))
        summary_text = f"Présents: {len(class_students) - absent_count} | Absents: {absent_count} | Total: {len(class_students)}"
        elements.append(Paragraph(summary_text, styles['Normal']))
        
        # Signature area
        elements.append(Spacer(1, 20))
        sig_data = [
            ['Signature de l\'enseignant:', '', 'Date:', date],
        ]
        sig_table = Table(sig_data, colWidths=[50*mm, 50*mm, 25*mm, 40*mm])
        sig_table.setStyle(TableStyle([
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 20),
        ]))
        elements.append(sig_table)
        
        # Page break between classes
        if list(students_by_class.keys()).index(class_name) < len(students_by_class) - 1:
            from reportlab.platypus import PageBreak
            elements.append(PageBreak())
    
    doc.build(elements)
    buffer.seek(0)
    
    pdf_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')
    
    return {
        "filename": f"appel_{date}.pdf",
        "content": pdf_base64,
        "content_type": "application/pdf"
    }


@api_router.get("/export/all-absents/excel")
async def export_all_absents_excel(date: str):
    """Export all absent students from all classes for a given date to Excel"""
    # Get all absences for this date
    absences = await db.absences.find({"date": date}).to_list(1000)
    
    if not absences:
        # Return empty file with message
        output = io.BytesIO()
        workbook = xlsxwriter.Workbook(output, {'in_memory': True})
        ws = workbook.add_worksheet('Absents')
        ws.write(0, 0, f"Aucun absent le {date}")
        workbook.close()
        output.seek(0)
        return {
            "filename": f"tous_absents_{date}.xlsx",
            "content": base64.b64encode(output.getvalue()).decode('utf-8'),
            "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
    
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    # Styles
    title_format = workbook.add_format({
        'bold': True,
        'font_size': 14,
        'align': 'center',
        'valign': 'vcenter',
        'bg_color': '#EF4444',
        'font_color': 'white'
    })
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#374151',
        'font_color': 'white',
        'border': 1,
        'align': 'center',
        'valign': 'vcenter'
    })
    cell_format = workbook.add_format({
        'border': 1,
        'align': 'left',
        'valign': 'vcenter'
    })
    justified_format = workbook.add_format({
        'border': 1,
        'bg_color': '#FEF3C7',
        'align': 'center',
        'font_color': '#D97706',
        'bold': True
    })
    unjustified_format = workbook.add_format({
        'border': 1,
        'bg_color': '#FEE2E2',
        'align': 'center',
        'font_color': '#DC2626',
        'bold': True
    })
    
    ws = workbook.add_worksheet('Tous les Absents')
    
    # Title
    ws.merge_range('A1:F1', f'RÉCAPITULATIF DES ABSENTS - {date}', title_format)
    ws.set_row(0, 25)
    
    # Headers
    headers = ['N°', 'Nom', 'Prénom', 'Classe', 'Type', 'Motif']
    for col, header in enumerate(headers):
        ws.write(2, col, header, header_format)
    
    ws.set_column(0, 0, 5)   # N°
    ws.set_column(1, 1, 20)  # Nom
    ws.set_column(2, 2, 20)  # Prénom
    ws.set_column(3, 3, 15)  # Classe
    ws.set_column(4, 4, 15)  # Type
    ws.set_column(5, 5, 35)  # Motif
    
    # Get class info
    classes = await db.classes.find().to_list(100)
    class_map = {str(c["_id"]): c["name"] for c in classes}
    
    # Build data sorted by class then name
    absent_data = []
    for absence in absences:
        student = await db.students.find_one({"_id": ObjectId(absence["student_id"])})
        if student:
            class_name = class_map.get(student["class_id"], "Inconnu")
            absent_data.append({
                "last_name": student["last_name"],
                "first_name": student["first_name"],
                "class_name": class_name,
                "type": absence.get("type", "non_justifiée"),
                "reason": absence.get("reason", ""),
            })
    
    # Sort by class name then last name
    absent_data.sort(key=lambda x: (x["class_name"], x["last_name"]))
    
    row = 3
    for idx, data in enumerate(absent_data):
        ws.write(row, 0, idx + 1, cell_format)
        ws.write(row, 1, data["last_name"], cell_format)
        ws.write(row, 2, data["first_name"], cell_format)
        ws.write(row, 3, data["class_name"], cell_format)
        
        type_fmt = justified_format if data["type"] == "justifiée" else unjustified_format
        ws.write(row, 4, "Justifiée" if data["type"] == "justifiée" else "Non justifiée", type_fmt)
        ws.write(row, 5, data["reason"] or "", cell_format)
        row += 1
    
    # Summary by class
    row += 2
    ws.write(row, 0, "RÉSUMÉ PAR CLASSE", header_format)
    ws.merge_range(row, 1, row, 5, "", header_format)
    row += 1
    
    class_counts = {}
    for data in absent_data:
        class_name = data["class_name"]
        if class_name not in class_counts:
            class_counts[class_name] = {"justified": 0, "unjustified": 0}
        if data["type"] == "justifiée":
            class_counts[class_name]["justified"] += 1
        else:
            class_counts[class_name]["unjustified"] += 1
    
    ws.write(row, 0, "Classe", header_format)
    ws.write(row, 1, "Justifiées", header_format)
    ws.write(row, 2, "Non justifiées", header_format)
    ws.write(row, 3, "Total", header_format)
    row += 1
    
    total_j = 0
    total_nj = 0
    for class_name, counts in sorted(class_counts.items()):
        ws.write(row, 0, class_name, cell_format)
        ws.write(row, 1, counts["justified"], justified_format)
        ws.write(row, 2, counts["unjustified"], unjustified_format)
        ws.write(row, 3, counts["justified"] + counts["unjustified"], cell_format)
        total_j += counts["justified"]
        total_nj += counts["unjustified"]
        row += 1
    
    # Total row
    ws.write(row, 0, "TOTAL", header_format)
    ws.write(row, 1, total_j, justified_format)
    ws.write(row, 2, total_nj, unjustified_format)
    ws.write(row, 3, total_j + total_nj, header_format)
    
    workbook.close()
    output.seek(0)
    
    return {
        "filename": f"tous_absents_{date}.xlsx",
        "content": base64.b64encode(output.getvalue()).decode('utf-8'),
        "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }


@api_router.get("/export/all-absents/pdf")
async def export_all_absents_pdf(date: str):
    """Export all absent students from all classes for a given date to PDF"""
    # Get all absences for this date
    absences = await db.absences.find({"date": date}).to_list(1000)
    
    # Get class info
    classes = await db.classes.find().to_list(100)
    class_map = {str(c["_id"]): c["name"] for c in classes}
    
    # Build data
    absent_data = []
    for absence in absences:
        student = await db.students.find_one({"_id": ObjectId(absence["student_id"])})
        if student:
            class_name = class_map.get(student["class_id"], "Inconnu")
            absent_data.append({
                "last_name": student["last_name"],
                "first_name": student["first_name"],
                "class_name": class_name,
                "type": absence.get("type", "non_justifiée"),
                "reason": absence.get("reason", ""),
            })
    
    # Sort by class name then last name
    absent_data.sort(key=lambda x: (x["class_name"], x["last_name"]))
    
    # Create PDF
    buffer = io.BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=15*mm,
        leftMargin=15*mm,
        topMargin=15*mm,
        bottomMargin=15*mm
    )
    
    elements = []
    styles = getSampleStyleSheet()
    
    # Title style
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=18,
        spaceAfter=5,
        textColor=colors.HexColor('#DC2626'),
        alignment=1
    )
    
    subtitle_style = ParagraphStyle(
        'Subtitle',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=15,
        textColor=colors.HexColor('#6B7280'),
        alignment=1
    )
    
    # Title
    elements.append(Paragraph("RÉCAPITULATIF DES ABSENTS", title_style))
    elements.append(Paragraph(f"Date: {date}", subtitle_style))
    elements.append(Paragraph(f"Total: {len(absent_data)} absent(s)", subtitle_style))
    
    if absent_data:
        # Table data
        table_data = [['N°', 'Nom', 'Prénom', 'Classe', 'Type', 'Motif']]
        
        for idx, data in enumerate(absent_data):
            type_text = "J" if data["type"] == "justifiée" else "NJ"
            table_data.append([
                str(idx + 1),
                data["last_name"],
                data["first_name"],
                data["class_name"],
                type_text,
                (data["reason"] or "")[:25]
            ])
        
        # Create table
        table = Table(table_data, colWidths=[10*mm, 40*mm, 40*mm, 25*mm, 15*mm, 40*mm])
        
        style_commands = [
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#DC2626')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('ALIGN', (1, 1), (2, -1), 'LEFT'),
            ('ALIGN', (5, 1), (5, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 10),
            ('TOPPADDING', (0, 0), (-1, 0), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#FEF2F2')]),
        ]
        
        # Color type column
        for i, row in enumerate(table_data[1:], start=1):
            if row[4] == "J":
                style_commands.append(('BACKGROUND', (4, i), (4, i), colors.HexColor('#FEF3C7')))
            else:
                style_commands.append(('BACKGROUND', (4, i), (4, i), colors.HexColor('#FEE2E2')))
        
        table.setStyle(TableStyle(style_commands))
        elements.append(table)
        
        # Summary by class
        elements.append(Spacer(1, 20))
        elements.append(Paragraph("Résumé par classe", styles['Heading2']))
        
        class_counts = {}
        for data in absent_data:
            class_name = data["class_name"]
            if class_name not in class_counts:
                class_counts[class_name] = {"justified": 0, "unjustified": 0}
            if data["type"] == "justifiée":
                class_counts[class_name]["justified"] += 1
            else:
                class_counts[class_name]["unjustified"] += 1
        
        summary_data = [['Classe', 'Justifiées', 'Non justifiées', 'Total']]
        total_j = 0
        total_nj = 0
        for class_name, counts in sorted(class_counts.items()):
            summary_data.append([
                class_name,
                str(counts["justified"]),
                str(counts["unjustified"]),
                str(counts["justified"] + counts["unjustified"])
            ])
            total_j += counts["justified"]
            total_nj += counts["unjustified"]
        
        summary_data.append(['TOTAL', str(total_j), str(total_nj), str(total_j + total_nj)])
        
        summary_table = Table(summary_data, colWidths=[40*mm, 35*mm, 40*mm, 30*mm])
        summary_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#374151')),
            ('BACKGROUND', (0, -1), (-1, -1), colors.HexColor('#374151')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('TEXTCOLOR', (0, -1), (-1, -1), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 10),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#D1D5DB')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('TOPPADDING', (0, 0), (-1, -1), 8),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
        ]))
        elements.append(summary_table)
    else:
        elements.append(Paragraph("Aucun absent ce jour.", styles['Normal']))
    
    # Signature
    elements.append(Spacer(1, 30))
    sig_data = [['Signature du responsable:', '', 'Date:', date]]
    sig_table = Table(sig_data, colWidths=[50*mm, 50*mm, 25*mm, 40*mm])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTSIZE', (0, 0), (-1, -1), 10),
    ]))
    elements.append(sig_table)
    
    doc.build(elements)
    buffer.seek(0)
    
    return {
        "filename": f"tous_absents_{date}.pdf",
        "content": base64.b64encode(buffer.getvalue()).decode('utf-8'),
        "content_type": "application/pdf"
    }


@api_router.get("/export/students/excel")
async def export_students_excel(class_id: Optional[str] = None):
    """Export students list to Excel format"""
    query = {}
    if class_id:
        query["class_id"] = class_id
    
    students = await db.students.find(query).to_list(1000)
    
    output = io.BytesIO()
    workbook = xlsxwriter.Workbook(output, {'in_memory': True})
    
    header_format = workbook.add_format({
        'bold': True,
        'bg_color': '#3B82F6',
        'font_color': 'white',
        'border': 1,
        'align': 'center',
        'valign': 'vcenter'
    })
    cell_format = workbook.add_format({
        'border': 1,
        'align': 'left',
        'valign': 'vcenter'
    })
    
    ws = workbook.add_worksheet('Élèves')
    headers = ['Prénom', 'Nom', 'Classe', 'Email Parent', 'Téléphone Parent', 'Date Naissance', 'Nb Absences']
    
    for col, header in enumerate(headers):
        ws.write(0, col, header, header_format)
    
    ws.set_column(0, 1, 20)
    ws.set_column(2, 2, 15)
    ws.set_column(3, 3, 30)
    ws.set_column(4, 4, 18)
    ws.set_column(5, 5, 15)
    ws.set_column(6, 6, 12)
    
    row = 1
    for student in students:
        cls = await db.classes.find_one({"_id": ObjectId(student["class_id"])})
        class_name = cls["name"] if cls else "Inconnu"
        absence_count = await db.absences.count_documents({"student_id": str(student["_id"])})
        
        ws.write(row, 0, student.get("first_name", ""), cell_format)
        ws.write(row, 1, student.get("last_name", ""), cell_format)
        ws.write(row, 2, class_name, cell_format)
        ws.write(row, 3, student.get("parent_email", "") or "", cell_format)
        ws.write(row, 4, student.get("parent_phone", "") or "", cell_format)
        ws.write(row, 5, student.get("birth_date", "") or "", cell_format)
        ws.write(row, 6, absence_count, cell_format)
        row += 1
    
    workbook.close()
    output.seek(0)
    
    excel_base64 = base64.b64encode(output.getvalue()).decode('utf-8')
    
    return {
        "filename": f"eleves_{datetime.now().strftime('%Y%m%d_%H%M%S')}.xlsx",
        "content": excel_base64,
        "content_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    }

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
