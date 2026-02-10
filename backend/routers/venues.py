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
    updated_venue = crud.update_venue(db, venue_id=venue_id, venue_data=venue)
    if not updated_venue:
        raise HTTPException(status_code=404, detail="Venue not found")
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
