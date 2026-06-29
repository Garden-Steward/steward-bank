#!/usr/bin/env python3
"""
Migration: Add 'fungi' to the Plant type enum on the production Strapi instance.

Uses the Content-Type Builder admin API (requires admin credentials).

Usage:
  ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=yourpassword python scripts/add-fungi-type.py
"""

import os, json, sys, urllib.request, urllib.parse

API_URL = os.environ.get("API_URL", "https://steward-bank.fly.dev")
ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL")
ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD")

if not ADMIN_EMAIL or not ADMIN_PASSWORD:
    print("ERROR: ADMIN_EMAIL and ADMIN_PASSWORD environment variables required")
    sys.exit(1)

def api(method, path, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(f"{API_URL}{path}", data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        print(f"  HTTP {e.code}: {body[:300]}")
        return None

# Step 1: Login to get admin JWT
print("Logging in...")
login = api("POST", "/admin/login", {
    "email": ADMIN_EMAIL,
    "password": ADMIN_PASSWORD,
    "strategy": "local"
})
if not login or not login.get("data"):
    print("ERROR: Login failed")
    sys.exit(1)
token = login["data"]["token"]
print("  Logged in ✓")

# Step 2: Find the Plant content type UID
print("Fetching content types...")
ct = api("GET", "/admin/content-type-builder/content-types", token=token)
if not ct:
    print("ERROR: Could not fetch content types")
    sys.exit(1)

plant_uid = None
for ct_item in ct.get("data", []):
    if ct_item.get("schema", {}).get("singularName") == "plant":
        plant_uid = ct_item.get("uid")
        break

if not plant_uid:
    print("ERROR: Plant content type not found")
    sys.exit(1)
print(f"  Plant UID: {plant_uid}")

# Step 3: Get current schema
schema = api("GET", f"/admin/content-type-builder/content-types/{plant_uid}", token=token)
if not schema:
    print("ERROR: Could not fetch plant schema")
    sys.exit(1)

current_enum = schema["data"]["schema"]["attributes"]["type"]["enum"]
print(f"  Current type enum: {current_enum}")

# Step 4: Check if fungi is already there
if "fungi" in current_enum:
    print("  'fungi' already in enum — nothing to do")
else:
    # Add fungi to the enum
    new_enum = current_enum + ["fungi"]
    schema["data"]["schema"]["attributes"]["type"]["enum"] = new_enum

    # Step 5: PUT the updated schema
    print(f"  Updating enum to: {new_enum}")
    result = api("PUT", f"/admin/content-type-builder/content-types/{plant_uid}",
                 data=schema["data"], token=token)
    if result:
        print("  ✓ Enum updated! Strapi is restarting...")
    else:
        print("  ✗ Failed to update enum")
        sys.exit(1)

# Step 6: Update existing mushrooms
time.sleep(3)  # Wait for restart
print("\nUpdating existing mushrooms to type=fungi...")
mushrooms = [
    (640, "Reishi"),
    (801, "Lion's Mane"),
    (802, "Chaga"),
]
for pid, name in mushrooms:
    payload = json.dumps({"data": {"type": "fungi"}}).encode()
    req = urllib.request.Request(
        f"{API_URL}/api/plants/{pid}",
        data=payload,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json"
        },
        method="PUT"
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            r = json.loads(resp.read())
            new_type = r["data"]["attributes"]["type"]
            print(f"  {name} (ID={pid}) → {new_type} ✓")
    except Exception as e:
        print(f"  {name} (ID={pid}) → FAILED: {e}")

print("\nDone!")
