# Run from the repo root:  python -m backend.app.test_database
from sqlalchemy import text

from backend.app.database import engine

try:
    with engine.connect() as connection:
        name = connection.execute(text("SELECT current_database()")).scalar()
        users = connection.execute(text("SELECT COUNT(*) FROM users")).scalar()
        print("Database connection successful!")
        print("Connected to:", name)
        print("Users in database:", users)
except Exception as error:
    print("Database connection failed!")
    print(error)
