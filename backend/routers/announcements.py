from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import database, schemas, models, auth, crud

router = APIRouter(prefix="/announcements", tags=["announcements"])

@router.get("/", response_model=List[schemas.AnnouncementResponse])
def read_announcements(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user),
):
    return crud.get_announcements_for_role(db, role=current_user.role, skip=skip, limit=limit)

@router.get("/latest", response_model=schemas.AnnouncementResponse)
def read_latest_announcement(
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user),
):
    items = crud.get_announcements_for_role(db, role=current_user.role, skip=0, limit=1)
    if not items:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return items[0]

@router.post("/", response_model=schemas.AnnouncementResponse)
def create_announcement(
    announcement: schemas.AnnouncementCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user),
):
    if current_user.role != models.UserRole.sys_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return crud.create_announcement(db, announcement)

@router.put("/{announcement_id}", response_model=schemas.AnnouncementResponse)
def update_announcement(
    announcement_id: int,
    announcement: schemas.AnnouncementUpdate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user),
):
    if current_user.role != models.UserRole.sys_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    updated = crud.update_announcement(db, announcement_id, announcement)
    if not updated:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return updated

@router.delete("/{announcement_id}", response_model=schemas.AnnouncementResponse)
def delete_announcement(
    announcement_id: int,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user),
):
    if current_user.role != models.UserRole.sys_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    deleted = crud.delete_announcement(db, announcement_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return deleted
