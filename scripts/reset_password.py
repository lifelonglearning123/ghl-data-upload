"""Reset a client's password (there's no self-service "forgot password" yet).

Usage (with the production DATABASE_URL, e.g. after `vercel env pull .env.local`):
    DATABASE_URL=... python scripts/reset_password.py client@example.com NewPassword123
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "api"))
from _db import get_db  # noqa: E402
from _security import hash_password  # noqa: E402

if len(sys.argv) != 3 or len(sys.argv[2]) < 8:
    sys.exit("Usage: python scripts/reset_password.py <email> <new password (8+ chars)>")

email, password = sys.argv[1].strip().lower(), sys.argv[2]
with get_db() as db:
    if not db.one("SELECT id FROM users WHERE email = %s", (email,)):
        sys.exit(f"No account found for {email}")
    db.execute("UPDATE users SET password_hash = %s WHERE email = %s", (hash_password(password), email))
print(f"Password updated for {email}")
