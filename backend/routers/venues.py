from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import database, schemas, models, auth, crud
from ..llm_service import llm_service

router = APIRouter(prefix="/venues", tags=["venues"])

@router.get("/", response_model=List[schemas.VenueResponse])
def read_venues(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db)):
    return crud.get_venues(db, skip=skip, limit=limit)

@router.post("/", response_model=schemas.VenueResponse)
def create_venue(
    venue: schemas.VenueCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if current_user.role not in [models.UserRole.sys_admin, models.UserRole.venue_admin]:
        raise HTTPException(status_code=403, detail="Not authorized")
    return crud.create_venue(db, venue, current_user.id)

@router.delete("/{venue_id}", response_model=schemas.VenueResponse)
def delete_venue(
    venue_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if current_user.role not in [models.UserRole.sys_admin, models.UserRole.venue_admin]:
        raise HTTPException(status_code=403, detail="Not authorized")
    venue = crud.delete_venue(db, venue_id=venue_id)
    if not venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    return venue

@router.put("/{venue_id}", response_model=schemas.VenueResponse)
def update_venue(
    venue_id: int,
    venue: schemas.VenueCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if current_user.role not in [models.UserRole.sys_admin, models.UserRole.venue_admin]:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # 获取原场地信息
    old_venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if not old_venue:
        raise HTTPException(status_code=404, detail="Venue not found")
    
    old_status = old_venue.status
    
    updated_venue = crud.update_venue(db, venue_id=venue_id, venue_data=venue)
    
    # 如果状态从可用变为维护中，通知已预约的用户
    if old_status == models.VenueStatus.available and venue.status == models.VenueStatus.maintenance:
        # 获取该场地所有待审核或已通过的预约
        affected_reservations = db.query(models.Reservation).filter(
            models.Reservation.venue_id == venue_id,
            models.Reservation.status.in_([models.ReservationStatus.pending, models.ReservationStatus.approved])
        ).all()
        
        # 为每个受影响的用户发送通知
        for res in affected_reservations:
            notification = models.Notification(
                user_id=res.user_id,
                title="场地维护通知",
                content=f"您预约的场地「{updated_venue.name}」已被标记为维护状态，您的预约「{res.activity_name}」可能受到影响，请关注后续通知或重新预约其他场地。",
                notification_type="venue_change"
            )
            db.add(notification)
        db.commit()
    
    return updated_venue

@router.get("/search", response_model=List[schemas.VenueResponse])
def smart_search_venues(q: str, db: Session = Depends(database.get_db)):
    # AI Parsing
    intent = llm_service.parse_intent(q)
    # Default fallback if AI fails or returns partial
    # In a real app we'd validate the intent dict structure
    
    # Mocking extraction for demo if fields missing
    from datetime import datetime, timedelta
    start = datetime.now() + timedelta(days=1, hours=14) # Mock tomorrow 2pm
    end = start + timedelta(hours=2)
    capacity = intent.get("capacity", 1) # Default to 1 to be inclusive
    facilities = intent.get("facilities", [])
    keywords = intent.get("keywords", [])
    v_type = intent.get("type")
    
    print(f"AI Search Intent: {intent}") # Debug
    
    return crud.search_venues(db, capacity=capacity, start=start, end=end, facilities=facilities, keywords=keywords, venue_type=v_type)
