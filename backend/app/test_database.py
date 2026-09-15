from sqlalchemy import text

from database import engine


try:
    with engine.connect() as connection:
        result = connection.execute(text("SELECT current_database()"))
        database_name = result.scalar()

        print("Database connection successful!")
        print("Connected to:", database_name)

except Exception as error:
    print("Database connection failed!")
    print(error)