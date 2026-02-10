from pydantic import BaseModel
from typing import Optional, List, Any
from datetime import datetime
from .models import UserRole, VenueStatus, ReservationStatus, AnnouncementTargetRole

# --- User Schemas ---
class UserBase(BaseModel):
    username: str
    contact_info: Optional[str] = None

class UserCreate(UserBase):
    password: str
    role: UserRole = UserRole.student_teacher

class UserUpdatePWD(BaseModel):
    old_password: str
    new_password: str

class UserResponse(UserBase):
    id: int
    role: UserRole
    is_first_login: bool

    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None
    role: Optional[UserRole] = None

# --- Venue Schemas ---
class VenueBase(BaseModel):
    name: str
    type: str
    capacity: int
    location: str
    facilities: List[str]
    status: VenueStatus = VenueStatus.available
    image_url: Optional[str] = None
    open_hours: Optional[str] = None  # 开放时间
    description: Optional[str] = None  # 场地描述

class VenueCreate(VenueBase):
    pass

class VenueResponse(VenueBase):
    id: int
    admin_id: Optional[int]

    class Config:
        from_attributes = True

# --- Reservation Schemas ---
class ReservationBase(BaseModel):
    venue_id: int
    start_time: datetime
    end_time: datetime
    activity_name: str
    organizer: Optional[str] = None
    organizer_unit: str  # New required
    contact_name: str    # New required
    contact_phone: str   # New required
    attendees_count: int
    proposal_content: str

class ReservationCreate(ReservationBase):
    pass

class ReservationUpdate(BaseModel):
    status: ReservationStatus
    rejection_reason: Optional[str] = None

class ReservationResponse(ReservationBase):
    id: int
    user_id: int
    status: ReservationStatus
    rejection_reason: Optional[str] = None
    ai_risk_score: Optional[int] = None
    ai_audit_comment: Optional[str] = None

    class Config:
        from_attributes = True

# --- Announcement Schemas ---
class AnnouncementBase(BaseModel):
    title: str
    content: str
    target_role: AnnouncementTargetRole = AnnouncementTargetRole.all

class AnnouncementCreate(AnnouncementBase):
    pass

class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    content: Optional[str] = None
    target_role: Optional[AnnouncementTargetRole] = None

class AnnouncementResponse(AnnouncementBase):
    id: int
    publish_time: datetime

    class Config:
        from_attributes = True

# --- Notification Schemas ---
class NotificationBase(BaseModel):
    title: str
    content: str
    notification_type: str = "system"

class NotificationCreate(NotificationBase):
    user_id: int

class NotificationResponse(NotificationBase):
    id: int
    user_id: int
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True
