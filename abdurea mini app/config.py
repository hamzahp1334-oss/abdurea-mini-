# -*- coding: utf-8 -*-
"""
Configuration module for ABDUREA STORE Telegram Mini App on Vercel.
Optimized for Vercel Serverless Functions with ephemeral /tmp storage handling.
"""
import os
import shutil
from pathlib import Path
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent

# Load .env if present
env_file = BASE_DIR / ".env"
if env_file.exists():
    load_dotenv(env_file)
else:
    load_dotenv()

# Detect Vercel / AWS Lambda environment
IS_VERCEL = bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))

# Telegram Bot Credentials
MAIN_BOT_TOKEN = os.getenv("MAIN_BOT_TOKEN", os.getenv("TELEGRAM_BOT_TOKEN", "8848082794:AAEzNGEQYHD9dpTqe9kbUFBJhJ9n5OK4NIA")).strip()
TELEGRAM_BOT_TOKEN = MAIN_BOT_TOKEN
ADMIN_BOT_TOKEN = os.getenv("ADMIN_BOT_TOKEN", "8920397884:AAHOFpkA-IhcBcCVE5MibMAdj8a6WMfm8gA").strip()

# Admin Authorization IDs
ADMIN_TELEGRAM_ID = int(os.getenv("ADMIN_TELEGRAM_ID", "6666443909"))
_env_admin_ids = os.getenv("ADMIN_TELEGRAM_IDS", "6666443909,2145055956")
ADMIN_TELEGRAM_IDS = [int(x.strip()) for x in _env_admin_ids.split(",") if x.strip().isdigit()]
for aid in (6666443909, 2145055956):
    if aid not in ADMIN_TELEGRAM_IDS:
        ADMIN_TELEGRAM_IDS.append(aid)

ADMIN_TELEGRAM_USERNAME = os.getenv("ADMIN_TELEGRAM_USERNAME", "@trust994").strip()

# Base44 Live REST Integration
BASE44_APP_ID = os.getenv("BASE44_APP_ID", "6aa86368309f7b3191d675d2").strip()
BASE44_API_BASE_URL = os.getenv("BASE44_API_BASE_URL", "https://abdureastore.base44.app").strip().rstrip("/")
BASE44_API_ROOT = os.getenv("BASE44_API_ROOT", "https://base44.app/api/apps/6aa86368309f7b3191d675d2/entities").strip()

# Flask & Session Security
SECRET_KEY = os.getenv("SECRET_KEY", "abdurea-store-secret-production-key-2026-v2")

# Database Path Configuration
if IS_VERCEL:
    _tmp_dir = Path("/tmp")
    DB_PATH = _tmp_dir / "store.db"
    seed_db = BASE_DIR / "store.db"
    if not DB_PATH.exists() and seed_db.exists():
        try:
            shutil.copy2(seed_db, DB_PATH)
        except Exception:
            pass
    UPLOADS_DIR = _tmp_dir / "uploads"
else:
    DB_PATH = (BASE_DIR / "store.db").resolve()
    UPLOADS_DIR = (BASE_DIR / "uploads").resolve()

RECEIPTS_DIR = UPLOADS_DIR / "receipts"
try:
    RECEIPTS_DIR.mkdir(parents=True, exist_ok=True)
except Exception:
    pass

# Domestic Payment Accounts
DEFAULT_TELEBIRR_ACCOUNT = os.getenv("TELEBIRR_ACCOUNT", "0992558519")
DEFAULT_TELEBIRR_NAME = os.getenv("TELEBIRR_NAME", "𝙁𝘼𝙍𝙃𝘼𝙉")
DEFAULT_CBE_BIRR_ACCOUNT = os.getenv("CBE_BIRR_ACCOUNT", "1000572238575")
DEFAULT_CBE_BIRR_NAME = os.getenv("CBE_BIRR_NAME", "𝙁𝘼𝙍𝙃𝘼𝙉")

# Store Branding & Info
STORE_NAME = "ABDUREA STORE"
STORE_WEBSITE = "https://abdureastore.base44.app/"
DEFAULT_SUPPORT_USERNAME = os.getenv("SUPPORT_USERNAME", "@trust994")
OFFICIAL_CHANNEL_USERNAME = os.getenv("OFFICIAL_CHANNEL_USERNAME", "@abdurea1")
OFFICIAL_CHANNEL_URL = os.getenv("OFFICIAL_CHANNEL_URL", "https://t.me/abdurea1")
ADMIN_DEFAULT_USER = "admin"
ADMIN_DEFAULT_PASS = "admin123"
ADMIN_DEFAULT_EMAIL = "admin@abdureastore.com"
