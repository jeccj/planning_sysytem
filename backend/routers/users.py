from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .. import database, schemas, models, auth, crud

router = APIRouter(prefix="/users", tags=["users"])

@router.post("/", response_model=schemas.UserResponse)
def create_user(
    user: schemas.UserCreate, 
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if current_user.role != models.UserRole.sys_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return crud.create_user(db, user)

@router.get("/", response_model=List[schemas.UserResponse])
def read_users(skip: int = 0, limit: int = 100, db: Session = Depends(database.get_db), current_user: models.User = Depends(auth.get_current_active_user)):
    if current_user.role != models.UserRole.sys_admin:
         raise HTTPException(status_code=403, detail="Not authorized")
    return db.query(models.User).offset(skip).limit(limit).all()

@router.get("/me", response_model=schemas.UserResponse)
def read_users_me(current_user: models.User = Depends(auth.get_current_active_user)):
    return current_user

@router.put("/{user_id}", response_model=schemas.UserResponse)
def update_user(
    user_id: int,
    user_update: schemas.UserCreate,
    db: Session = Depends(database.get_db),
    current_user: models.User = Depends(auth.get_current_active_user)
):
    if current_user.role != models.UserRole.sys_admin:
        raise HTTPException(status_code=403, detail="Not authorized")
    return crud.update_user(db, user_id, user_update)
