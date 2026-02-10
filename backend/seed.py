from backend.database import SessionLocal, engine, Base
from backend import models, auth
from backend.models import UserRole, VenueStatus

def seed_data():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    
    # Check if data exists
    if db.query(models.User).first():
        print("Data already exists.")
        return

    print("Seeding data...")

    # Sys Admin
    sys_admin = models.User(
        username="admin", 
        hashed_password=auth.get_password_hash("123456"),
        role=UserRole.sys_admin,
        is_first_login=False
    )
    db.add(sys_admin)

    # Venue Admin
    venue_admin = models.User(
        username="venue_manager", 
        hashed_password=auth.get_password_hash("123456"),
        role=UserRole.venue_admin,
        is_first_login=True
    )
    db.add(venue_admin)
    db.commit() # Commit users to get IDs

    # Student
    student = models.User(
        username="student1", 
        hashed_password=auth.get_password_hash("123456"),
        role=UserRole.student_teacher,
        is_first_login=True
    )
    db.add(student)

    # Venues
    hall = models.Venue(
        name="Grand Hall",
        type="Hall",
        capacity=200,
        location="Building A",
        facilities=["音响设备", "投影仪", "舞台"],
        admin_id=venue_admin.id
    )
    classroom = models.Venue(
        name="Room 101",
        type="Classroom",
        capacity=50,
        location="Building B",
        facilities=["白板", "投影仪"],
        admin_id=venue_admin.id
    )
    db.add(hall)
    db.add(classroom)
    
    db.add(hall)
    db.add(classroom)
    db.commit()

    # Reservation (Sample)
    from datetime import datetime, timedelta
    from backend.models import Reservation, ReservationStatus
    
    # Get student ID (refresh)
    student_user = db.query(models.User).filter_by(username="student1").first()
    venue_hall = db.query(models.Venue).first()

    if student_user and venue_hall:
        reservation = Reservation(
            user_id=student_user.id,
            venue_id=venue_hall.id,
            start_time=datetime.utcnow() + timedelta(days=1),
            end_time=datetime.utcnow() + timedelta(days=1, hours=2),
            activity_name="人工智能讨论会",
            organizer_unit="AI 协会",
            contact_name="张三",
            contact_phone="13800138000",
            attendees_count=50,
            proposal_content="讨论 AI 发展趋势，无安全风险。",
            status=ReservationStatus.pending,
            ai_risk_score=10,
            ai_audit_comment="低风险学术活动"
        )
        db.add(reservation)
        db.commit()
    
    db.close()
    print("Seeding complete.")

if __name__ == "__main__":
    seed_data()
