from datetime import datetime
from sqlalchemy import create_engine, Column, Integer, String, Boolean, DateTime
from sqlalchemy.orm import sessionmaker, declarative_base
import bcrypt

Base = declarative_base()

class User(Base):
    __tablename__ = 'users'
    id = Column(Integer, primary_key=True)
    username = Column(String, unique=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    role = Column(String, nullable=False)  # student_teacher, venue_admin, sys_admin
    is_first_login = Column(Boolean, default=True)
    contact_info = Column(String, nullable=True)

# Update this path if needed. 
# Current backend-ts env says: DATABASE_PATH=../campus.db
# So relative to root it is campus.db
DATABASE_URL = "sqlite:///campus.db"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

def list_users():
    db = SessionLocal()
    users = db.query(User).all()
    print("\n--- Users in DB ---")
    for u in users:
        print(f"ID: {u.id}, Username: {u.username}, Role: {u.role}")
        if u.username == 'admin':
            # Reset admin password to something known if it exists
            # We will use 'admin123'
            salt = bcrypt.gensalt()
            hashed = bcrypt.hashpw('admin123'.encode('utf-8'), salt).decode('utf-8')
            u.hashed_password = hashed
            db.commit()
            print(f"--> RESET PASSWORD for 'admin' to 'admin123'")
    
    if not any(u.username == 'admin' for u in users):
        print("--> Admin user NOT found. Creating one...")
        salt = bcrypt.gensalt()
        hashed = bcrypt.hashpw('admin123'.encode('utf-8'), salt).decode('utf-8')
        admin = User(
            username='admin',
            hashed_password=hashed,
            role='sys_admin',
            is_first_login=False
        )
        db.add(admin)
        db.commit()
        print("--> Created user 'admin' with password 'admin123'")

    db.close()

if __name__ == "__main__":
    list_users()
