from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .routers import auth_routes, users, venues, reservations, nlp, announcements

# Create tables
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Campus Venue Reservation System")

# CORS
origins = [
    "http://localhost:5173", # Vue default
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(users.router)
app.include_router(venues.router)
app.include_router(reservations.router)
app.include_router(nlp.router)
app.include_router(announcements.router)

@app.get("/")
def root():
    return {"message": "Campus Venue Reservation System API"}
