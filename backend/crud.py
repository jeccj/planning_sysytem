from sqlalchemy.orm import Session
from . import models, schemas, auth
from datetime import datetime

# --- User CRUD ---
def get_user(db: Session, user_id: int):
    return db.query(models.User).filter(models.User.id == user_id).first()

def get_user_by_username(db: Session, username: str):
    return db.query(models.User).filter(models.User.username == username).first()

def create_user(db: Session, user: schemas.UserCreate):
    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(username=user.username, hashed_password=hashed_password, role=user.role, contact_info=user.contact_info)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return db_user

def update_user_password(db: Session, user_id: int, new_password_hash: str):
    user = get_user(db, user_id)
    user.hashed_password = new_password_hash
    user.is_first_login = False
    db.commit()
    return user

def update_user(db: Session, user_id: int, user_data: schemas.UserCreate):
    user = get_user(db, user_id)
    if user:
        user.username = user_data.username
        user.role = user_data.role
        if user_data.password:
            user.hashed_password = auth.get_password_hash(user_data.password)
        db.commit()
        db.refresh(user)
    return user

# --- Venue CRUD ---
def get_venues(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Venue).offset(skip).limit(limit).all()

def create_venue(db: Session, venue: schemas.VenueCreate, admin_id: int):
    db_venue = models.Venue(**venue.model_dump(), admin_id=admin_id)
    db.add(db_venue)
    db.commit()
    db.refresh(db_venue)
    return db_venue

def delete_venue(db: Session, venue_id: int):
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if venue:
        db.delete(venue)
        db.commit()
    return venue

def update_venue(db: Session, venue_id: int, venue_data: schemas.VenueCreate):
    venue = db.query(models.Venue).filter(models.Venue.id == venue_id).first()
    if venue:
        for key, value in venue_data.model_dump().items():
            setattr(venue, key, value)
        db.commit()
        db.refresh(venue)
    return venue

# --- Reservation CRUD ---
def get_reservations(db: Session, skip: int = 0, limit: int = 100):
    return db.query(models.Reservation).offset(skip).limit(limit).all()

def create_reservation(db: Session, reservation: schemas.ReservationCreate, user_id: int):
    # Initial creation without AI score (score added via background task)
    db_reservation = models.Reservation(
        **reservation.model_dump(),
        user_id=user_id
    )
    db.add(db_reservation)
    db.commit()
    db.refresh(db_reservation)
    return db_reservation

def update_reservation_ai_score(db: Session, reservation_id: int, ai_data: dict):
    reservation = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    if reservation:
        reservation.ai_risk_score = ai_data.get("score")
        reservation.ai_audit_comment = ai_data.get("reason")
        db.commit()

def update_reservation_status(db: Session, reservation_id: int, update_data: schemas.ReservationUpdate):
    reservation = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    reservation.status = update_data.status
    reservation.rejection_reason = update_data.rejection_reason
    db.commit()
    db.refresh(reservation)
    return reservation

def delete_reservation(db: Session, reservation_id: int):
    reservation = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    if reservation:
        db.delete(reservation)
        db.commit()
    return reservation

def search_venues(db: Session, capacity: int, start: datetime, end: datetime, facilities: list = None, keywords: list = None, venue_type: str = None):
    available_venues = []
    
    # 1. Base Filter by Capacity and Type
    query = db.query(models.Venue).filter(models.Venue.capacity >= capacity)
    if venue_type:
        query = query.filter(models.Venue.type == venue_type)
    
    candidates = query.all()
    
    scored_candidates = []

    print(f"[Search Debug] Params: Cap={capacity}, Start={start}, End={end}, Fac={facilities}, KW={keywords}")
    for venue in candidates:
        # Base score for matching capacity
        score = 10 
        searchable_text = f"{venue.name} {venue.type} {venue.location} {' '.join(venue.facilities or [])}".lower()
        
        # 1. Facility Match (High weight)
        if facilities:
            for req_f in facilities:
                if req_f.lower() in searchable_text:
                    score += 20 
        
        # 2. Keyword Match (Medium weight)
        if keywords:
            for kw in keywords:
                if kw.lower() in searchable_text:
                    score += 15
        
        # 3. Type Match (Implicit from query often)
        # If user mentioned "教室" and venue type is correct, boost it
        if any(term in searchable_text for term in ["教室", "实验室", "礼堂", "hall", "lab"]):
             score += 5

        # 4. Availability Filter
        overlap = db.query(models.Reservation).filter(
            models.Reservation.venue_id == venue.id,
            models.Reservation.status == models.ReservationStatus.approved,
            models.Reservation.start_time < end,
            models.Reservation.end_time > start
        ).first()
        
        if not overlap:
            scored_candidates.append((score, venue))
        else:
            print(f"[Search Debug] Venue {venue.name} blocked by overlap reservation")
            
    # Sort by score descending
    scored_candidates.sort(key=lambda x: x[0], reverse=True)
    print(f"[Search Debug] Candidates found: {len(scored_candidates)}")
    
    return [c[1] for c in scored_candidates]

# --- Announcement CRUD ---
def get_announcements(db: Session, skip: int = 0, limit: int = 100):
    return (
        db.query(models.Announcement)
        .order_by(models.Announcement.publish_time.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def get_announcements_for_role(db: Session, role: models.UserRole, skip: int = 0, limit: int = 100):
    if role == models.UserRole.sys_admin:
        return get_announcements(db, skip=skip, limit=limit)

    return (
        db.query(models.Announcement)
        .filter(
            (models.Announcement.target_role == models.AnnouncementTargetRole.all)
            | (models.Announcement.target_role == role)
        )
        .order_by(models.Announcement.publish_time.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )

def create_announcement(db: Session, announcement: schemas.AnnouncementCreate):
    db_announcement = models.Announcement(**announcement.model_dump())
    db.add(db_announcement)
    db.commit()
    db.refresh(db_announcement)
    return db_announcement

def update_announcement(db: Session, announcement_id: int, announcement_data: schemas.AnnouncementUpdate):
    announcement = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if announcement:
        update_fields = announcement_data.model_dump(exclude_unset=True)
        for key, value in update_fields.items():
            setattr(announcement, key, value)
        db.commit()
        db.refresh(announcement)
    return announcement

def delete_announcement(db: Session, announcement_id: int):
    announcement = db.query(models.Announcement).filter(models.Announcement.id == announcement_id).first()
    if announcement:
        db.delete(announcement)
        db.commit()
    return announcement
