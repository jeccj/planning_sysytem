from backend.database import SessionLocal
from backend import models, auth

db = SessionLocal()
user = db.query(models.User).filter_by(username="student1").first()

if not user:
    print("User 'student1' not found!")
else:
    print(f"User found: {user.username}, Role: {user.role}")
    print(f"Hashed Password in DB: {user.hashed_password}")
    is_valid = auth.verify_password("123456", user.hashed_password)
    print(f"Password '123456' verification result: {is_valid}")

db.close()
