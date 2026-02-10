from backend.database import SessionLocal
from backend import models, auth

def reset_password(username, new_password):
    db = SessionLocal()
    user = db.query(models.User).filter_by(username=username).first()
    
    if not user:
        print(f"User {username} not found.")
        return

    print(f"Resetting password for {username}...")
    new_hash = auth.get_password_hash(new_password)
    user.hashed_password = new_hash
    db.commit()
    db.refresh(user)
    
    # Verify immediately
    is_valid = auth.verify_password(new_password, user.hashed_password)
    print(f"Password reset complete. Verification for '{new_password}': {is_valid}")
    db.close()

if __name__ == "__main__":
    reset_password("student1", "123456")
    reset_password("admin", "123456")
