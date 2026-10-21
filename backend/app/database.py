import os

from dotenv import load_dotenv
from sqlalchemy import create_engine
from sqlalchemy.exc import DBAPIError
from sqlalchemy.orm import declarative_base, sessionmaker

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("DATABASE_URL is not set in .env")

# SQLAlchemy 2.1+ uses the newer "psycopg" driver by default for postgresql:// URLs.
# We installed psycopg2, so tell SQLAlchemy to use that one.
if DATABASE_URL.startswith("postgresql://"):
    DATABASE_URL = DATABASE_URL.replace("postgresql://", "postgresql+psycopg2://", 1)

# pool_pre_ping checks a connection is still alive before using it
engine = create_engine(DATABASE_URL, pool_pre_ping=True)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def db_error_message(error: DBAPIError) -> str:
    """Turns a PostgreSQL error (e.g. from a trigger or CHECK constraint) into a short readable message."""
    original = getattr(error, "orig", None)
    text = str(original if original is not None else error)
    return text.strip().split("\n")[0]
