# Check OAuth Client Restrictions

## The Problem

Token has the correct scope, but API still returns 403. This is often caused by **API restrictions** on the OAuth client.

## How to Check

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select project: **Gemini** (gen-lang-client-0995483666)
3. Go to **APIs & Services** → **Credentials**
4. Click on **"Garden Steward Photos"** OAuth client
5. Look for **"API restrictions"** section

## What to Look For

### If "API restrictions" is set to "Restrict key":
- **Problem**: The OAuth client is restricted to only certain APIs
- **Solution**: Either:
  - **Option 1 (Recommended)**: Change to "Don't restrict key"
  - **Option 2**: Add "Photos Library API" to the allowed APIs list

### If "API restrictions" is set to "Don't restrict key":
- This is correct - no restrictions
- The issue might be elsewhere

## Steps to Fix

1. Click **"Garden Steward Photos"** OAuth client
2. Scroll to **"API restrictions"** section
3. If it says "Restrict key":
   - Click **"Restrict key"** dropdown
   - Either select **"Don't restrict key"** (easiest)
   - OR click **"Restrict key"** and add **"Photos Library API"** to the list
4. Click **"Save"** at the bottom
5. **Wait 1-2 minutes** for changes to propagate
6. Get a **NEW token** (OAuth flow again)
7. Test again

## Why This Happens

Even if:
- ✅ API is enabled
- ✅ Scope is in consent screen
- ✅ Token has the scope

If the OAuth client has API restrictions that don't include Photos Library API, the API calls will fail with 403.

## Quick Test After Fix

```bash
# Get fresh token after fixing restrictions
curl http://localhost:1337/api/google-photos/auth-url

# Complete OAuth, then test
curl -X POST http://localhost:1337/api/google-photos/albums \
  -H "Content-Type: application/json" \
  -d '{"accessToken": "YOUR_NEW_TOKEN"}'
```

