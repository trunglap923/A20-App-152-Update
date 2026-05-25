import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("❌ DATABASE_URL not found in .env")
    exit(1)

# Fix for some SQLAlchemy versions needing 'postgresql://' instead of 'postgres://'
if DATABASE_URL.startswith("postgres://"):
    DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

try:
    engine = create_engine(DATABASE_URL)
    with engine.connect() as conn:
        print("🔍 Checking if 'sources' column exists...")
        # Check if column exists
        check_query = text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name='chat_messages' AND column_name='sources';
        """)
        result = conn.execute(check_query).fetchone()
        
        if not result:
            print("🚀 Adding 'sources' column to 'chat_messages' table...")
            # PostgreSQL requires JSONB or JSON
            alter_query = text("ALTER TABLE chat_messages ADD COLUMN sources JSONB;")
            conn.execute(alter_query)
            # SQLAlchemy 2.0+ requires explicit commit for connection.execute
            try:
                conn.commit()
            except AttributeError:
                pass # Older versions might not have .commit() on connection
            print("✅ Successfully added 'sources' column!")
        else:
            print("ℹ️ Column 'sources' already exists.")
            
except Exception as e:
    print(f"❌ Error updating database: {e}")
