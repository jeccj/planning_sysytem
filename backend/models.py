from sqlalchemy import Column, Integer, String, Boolean, Enum, ForeignKey, DateTime, Text, JSON
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from .database import Base

class UserRole(str, enum.Enum):
    student_teacher = "student_teacher"
    venue_admin = "venue_admin"
    sys_admin = "sys_admin"

class VenueStatus(str, enum.Enum):
    available = "available"
    maintenance = "maintenance"

class ReservationStatus(str, enum.Enum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    canceled = "canceled"
    used = "used"  # 已使用

class AnnouncementTargetRole(str, enum.Enum):
    all = "all"
    student_teacher = "student_teacher"
    venue_admin = "venue_admin"

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    role = Column(Enum(UserRole), default=UserRole.student_teacher)
    is_first_login = Column(Boolean, default=True)
    contact_info = Column(String, nullable=True)

    venues_managed = relationship("Venue", back_populates="admin")
    reservations = relationship("Reservation", back_populates="user")

class Venue(Base):
    __tablename__ = "venues"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True)
    type = Column(String) # Hall/Classroom
    capacity = Column(Integer)
    location = Column(String)
    facilities = Column(JSON) # e.g. ["Projector", "Audio"]
    status = Column(Enum(VenueStatus), default=VenueStatus.available)
    image_url = Column(String, nullable=True)
    open_hours = Column(String, nullable=True)  # 开放时间，如 "08:00-22:00"
    description = Column(Text, nullable=True)   # 场地详细描述
    admin_id = Column(Integer, ForeignKey("users.id"))

    admin = relationship("User", back_populates="venues_managed")
    reservations = relationship("Reservation", back_populates="venue")

class Reservation(Base):
    __tablename__ = "reservations"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    venue_id = Column(Integer, ForeignKey("venues.id"))
    start_time = Column(DateTime)
    end_time = Column(DateTime)
    activity_name = Column(String)
    organizer = Column(String) # Deprecated, use organizer_unit and contact_name
    organizer_unit = Column(String, nullable=True) # 社团/班级
    contact_name = Column(String, nullable=True)   # 负责人
    contact_phone = Column(String, nullable=True)  # 联系电话
    attendees_count = Column(Integer)
    proposal_content = Column(Text)
    status = Column(Enum(ReservationStatus), default=ReservationStatus.pending)
    rejection_reason = Column(String, nullable=True)
    ai_risk_score = Column(Integer, nullable=True) # 0-100
    ai_audit_comment = Column(Text, nullable=True)

    user = relationship("User", back_populates="reservations")
    venue = relationship("Venue", back_populates="reservations")

class Announcement(Base):
    __tablename__ = "announcements"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    content = Column(Text)
    publish_time = Column(DateTime, default=datetime.utcnow)
    target_role = Column(Enum(AnnouncementTargetRole), default=AnnouncementTargetRole.all)

class Notification(Base):
    """个人通知消息"""
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    content = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    notification_type = Column(String, default="system")  # system, venue_change, reservation

    user = relationship("User", backref="notifications")
