#!/usr/bin/env python3
"""
Migration: Add 'fungi' to the Plant type enum on the production Strapi instance.
Updated for Strapi v5 (documentId-based API, no 'attributes' wrapper).

Uses the Content-Type Builder admin API (requires admin credentials).

Usage:
  ADMIN_EMAIL=your@email.com ADMIN_PASSWORD=yourpassword python scripts/add-fungi-type.py
"""

import os, json, sys, urllib.request, urllib.parse, time

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

# Step 6: Update existing mushrooms to type=fungi (Strapi v5 — documentId, not numeric id)
print("Waiting for Strapi restart...")
time.sleep(5)

print("\nUpdating existing mushrooms to type=fungi...")
# Find mushrooms by title search (Strapi v5 uses documentId, not numeric id)
mushroom_searches = [
    ("Reishi", "Reishi"),
    ("Lion's Mane", "Lion's Mane"),
    ("Chaga", "Chaga"),
]

for search_term, display_name in mushroom_searches:
    try:
        # Search for the plant by title
        req = urllib.request.Request(
            f"{API_URL}/api/plants?filters[title][$containsi]={urllib.parse.quote(search_term)}&fields[0]=title&fields[1]=type&fields[2]=documentId",
            headers={"Authorization": f"Bearer {token}"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            search_result = json.loads(resp.read())
        
        plants_found = search_result.get("data", [])
        if not plants_found:
            print(f"  {display_name} — NOT FOUND in database")
            continue
        
        for plant in plants_found:
            doc_id = plant.get("documentId")
            current_type = plant.get("type")
            plant_title = plant.get("title", display_name)
            
            if current_type == "fungi":
                print(f"  {plant_title} (docId={doc_id}) — already type=fungi ✓")
            else:
                # Update using documentId (Strapi v5)
                payload = json.dumps({"data": {"type": "fungi"}}).encode()
                req = urllib.request.Request(
                    f"{API_URL}/api/plants/{doc_id}",
                    data=payload,
                    headers={
                        "Authorization": f"Bearer {token}",
                        "Content-Type": "application/json"
                    },
                    method="PUT"
                )
                with urllib.request.urlopen(req, timeout=15) as resp:
                    r = json.loads(resp.read())
                    new_type = r["data"]["type"]
                    print(f"  {plant_title} (docId={doc_id}) → {new_type} ✓")
    except Exception as e:
        print(f"  {display_name} — FAILED: {e}")

print("\nDone!")