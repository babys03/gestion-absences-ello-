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
    reason: Optional[str] = None
    type: str = "non_justifiée"  # "justifiée" or "non_justifiée"
    notify_parent: bool = True

class AbsenceUpdate(BaseModel):
    reason: Optional[str] = None
    type: Optional[str] = None

class AbsenceResponse(BaseModel):
    id: str
    student_id: str
    student_name: Optional[str] = None
    class_name: Optional[str] = None
    date: str
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
        notification = {
            "student_id": absence_data.student_id,
            "absence_id": absence_id,
            "message": f"Absence enregistrée pour {student_name} le {absence_data.date}. Motif: {absence_data.reason or 'Non spécifié'}. Type: {absence_data.type}",
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
