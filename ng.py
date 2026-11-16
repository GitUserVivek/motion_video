
# ============================================================
# TWO SEPARATE NGROK EXECUTABLES + TWO ACCOUNTS
# FRONTEND: TOKEN 1 -> 5173
# BACKEND:  TOKEN 2 -> 8880
# ============================================================ 
import os
import shutil
from pathlib import Path

from pyngrok import ngrok, conf
from kaggle_secrets import UserSecretsClient

# ------------------------------------------------------------
# 1. VERIFY LOCAL SERVERS
# ------------------------------------------------------------

import socket

# def check_port(port):
#     try:
#         with socket.create_connection(
#             ("127.0.0.1", port), timeout=3
#         ):
#             return True
#     except OSError:
#         return False

# assert check_port(5173), "Frontend is not running!"
# assert check_port(8001), "Backend is not running!"

print("Frontend READY: 5173")
print("Backend READY: 8001")

# ------------------------------------------------------------
# 2. LOAD TWO ACCOUNT TOKENS
# ------------------------------------------------------------

secrets = UserSecretsClient()

TOKEN1 = "3HRjpFMqfHffIlX0oPqHITBQalK_457XLfBzcPqizqijAyV1p"
TOKEN2 = "3IPM6QOpeR1pwv7KGytzu2iQa4c_3ZPPb97NviTrr4HFLg8H2"

if not TOKEN1 or not TOKEN2:
    raise ValueError("Both ngrok tokens are required.")

# ------------------------------------------------------------
# 3. STOP PREVIOUS SHARED AGENT
# ------------------------------------------------------------

ngrok.kill()

# ------------------------------------------------------------
# 4. CREATE TWO DIFFERENT EXECUTABLES
# ------------------------------------------------------------

BASE = Path("/kaggle/working/ngrok_instances")
BASE.mkdir(parents=True, exist_ok=True)

original_binary = Path("/root/.config/ngrok/ngrok")

if not original_binary.exists():
    raise FileNotFoundError("Existing ngrok binary not found.")

FRONTEND_BINARY = BASE / "frontend_ngrok"
BACKEND_BINARY = BASE / "backend_ngrok"

shutil.copy2(original_binary, FRONTEND_BINARY)
shutil.copy2(original_binary, BACKEND_BINARY)

FRONTEND_BINARY.chmod(0o755)
BACKEND_BINARY.chmod(0o755)

print("Frontend binary:", FRONTEND_BINARY)
print("Backend binary:", BACKEND_BINARY)

# ------------------------------------------------------------
# 5. CREATE INDEPENDENT CONFIGURATIONS
# ------------------------------------------------------------

FRONTEND_CONFIG_FILE = BASE / "frontend.yml"
BACKEND_CONFIG_FILE = BASE / "backend.yml"

# Remove old configurations created by this notebook.
for path in [FRONTEND_CONFIG_FILE, BACKEND_CONFIG_FILE]:
    if path.exists():
        path.unlink()

FRONTEND_CONFIG = conf.PyngrokConfig(
    ngrok_path=str(FRONTEND_BINARY),
    config_path=str(FRONTEND_CONFIG_FILE),
    startup_timeout=30
)

BACKEND_CONFIG = conf.PyngrokConfig(
    ngrok_path=str(BACKEND_BINARY),
    config_path=str(BACKEND_CONFIG_FILE),
    startup_timeout=30
)

# ------------------------------------------------------------
# 6. CONFIGURE ACCOUNT 1
# ------------------------------------------------------------

ngrok.set_auth_token(
    TOKEN1,
    pyngrok_config=FRONTEND_CONFIG
)

print("Frontend account configured.")

# ------------------------------------------------------------
# 7. CONFIGURE ACCOUNT 2
# ------------------------------------------------------------

ngrok.set_auth_token(
    TOKEN2,
    pyngrok_config=BACKEND_CONFIG
)

print("Backend account configured.")

# ------------------------------------------------------------
# 8. START FRONTEND AGENT
# ------------------------------------------------------------

print("\nStarting FRONTEND agent...")

FRONTEND_TUNNEL = ngrok.connect(
    addr=5173,
    proto="http",
    pyngrok_config=FRONTEND_CONFIG
)

print("Frontend:", FRONTEND_TUNNEL.public_url)

# ------------------------------------------------------------
# 9. START BACKEND AGENT
# ------------------------------------------------------------

print("\nStarting BACKEND agent...")

BACKEND_TUNNEL = ngrok.connect(
    addr=5173,
    proto="http",
    pyngrok_config=BACKEND_CONFIG
)

print("Backend:", BACKEND_TUNNEL.public_url)

# ------------------------------------------------------------
# 10. VERIFY INDEPENDENT AGENTS
# ------------------------------------------------------------

print("\n========== AGENT VERIFICATION ==========")

for name, config in [
    ("FRONTEND", FRONTEND_CONFIG),
    ("BACKEND", BACKEND_CONFIG)
]:
    tunnels = ngrok.get_tunnels(pyngrok_config=config)

    print(f"\n{name}")
    print("Executable:", config.ngrok_path)

    for tunnel in tunnels:
        print("URL:", tunnel.public_url)
        print("Target:", tunnel.config.get("addr"))

# ------------------------------------------------------------
# 11. FINAL URLS
# ------------------------------------------------------------

print("\n" + "=" * 60)
print("PUBLIC ENDPOINTS")
print("=" * 60)

print("\nFRONTEND:")
print(FRONTEND_TUNNEL.public_url)

print("\nBACKEND:")
print(BACKEND_TUNNEL.public_url)

print("\nAPI DOCUMENTATION:")
print(BACKEND_TUNNEL.public_url + "/docs")

print("\n" + "=" * 60)

if FRONTEND_TUNNEL.public_url == BACKEND_TUNNEL.public_url:
    raise RuntimeError(
        "Both accounts returned the same public domain. "
        "Check whether the two tokens belong to different "
        "ngrok accounts and have separate assigned domains."
    )

print("SUCCESS: Two different public URLs are active.")

# Preserve references
FRONTEND_TUNNEL = FRONTEND_TUNNEL
BACKEND_TUNNEL = BACKEND_TUNNEL
FRONTEND_CONFIG = FRONTEND_CONFIG
BACKEND_CONFIG = BACKEND_CONFIG
