from typing import List
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from .. import database, schemas, models, auth, crud
from ..llm_service import llm_service

router = APIRouter(prefix="/reservations", tags=["reservations"])

from ..database import SessionLocal

def audit_task(reservation_id: int, text: str):
    db = SessionLocal()
    try:
        ai_result = llm_service.audit_proposal(text)
        crud.update_reservation_ai_score(db, reservation_id, ai_result)
    finally:
        db.close()

@router.post("/", response_model=schemas.ReservationResponse)
def create_reservation(
    reservation: schemas.ReservationCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    # Create reservation first (fast)
    db_reservation = crud.create_reservation(db, reservation, current_user.id)
    
    # Run AI in background
    # Pass ONLY IDs and strings, do not pass the DB session
    background_tasks.add_task(audit_task, db_reservation.id, reservation.proposal_content)
    
    return db_reservation

@router.get("/", response_model=List[schemas.ReservationResponse])
def read_reservations(
    skip: int = 0, 
    limit: int = 100, 
    status: str = None,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    # If student, only see own
    if current_user.role == models.UserRole.student_teacher:
        return db.query(models.Reservation).filter(models.Reservation.user_id == current_user.id).all()
        
    # Admin sees all (optionally filtered by status)
    query = db.query(models.Reservation)
    if status:
        query = query.filter(models.Reservation.status == status)
    return query.offset(skip).limit(limit).all()

@router.put("/{reservation_id}", response_model=schemas.ReservationResponse)
def update_reservation(
    reservation_id: int,
    update_data: schemas.ReservationUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if current_user.role not in [models.UserRole.venue_admin, models.UserRole.sys_admin]:
         raise HTTPException(status_code=403, detail="Not authorized")
         
    return crud.update_reservation_status(db, reservation_id, update_data)
@router.delete("/{reservation_id}", response_model=schemas.ReservationResponse)
def delete_reservation(
    reservation_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if current_user.role not in [models.UserRole.venue_admin, models.UserRole.sys_admin]:
         raise HTTPException(status_code=403, detail="Not authorized")
         
    db_reservation = crud.delete_reservation(db, reservation_id)
    if not db_reservation:
        raise HTTPException(status_code=404, detail="Reservation not found")
    return db_reservation
