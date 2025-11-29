# Final OAuth Client Configuration Check

## The Problem

Token has correct scope, but API still returns 403. This means the OAuth client configuration is blocking the API.

## Critical Check: OAuth Client Settings

### Step 1: Open OAuth Client
1. Go to **APIs & Services** → **Credentials**
2. Click on **"Garden Steward Photos"** OAuth client
3. This opens the client details page

### Step 2: Check ALL Settings

Look for these sections (they might be in different places):

#### A. "Application restrictions" (if present)
- Should be set to **"None"** for development
- Or allow your domain/IP

#### B. "API restrictions" or "Restrict key" 
- **MUST** be set to **"Don't restrict key"** 
- OR if "Restrict key" is selected, **"Photos Library API"** must be in the allowed list
- This is the most common cause of 403 errors!

#### C. "Authorized redirect URIs"
- Should include: `http://localhost:1337/api/google-photos/oauth-callback`

#### D. "Authorized JavaScript origins"
- Should include: `http://localhost:1337` (optional but good to have)

### Step 3: Verify Photos Library API is Enabled

1. Go to **APIs & Services** → **Enabled APIs**
2. Search for "Photos Library API"
3. **Confirm it's actually listed and says "Enabled"**
4. If not there:
   - Go to **Library**
   - Search "Photos Library API"
   - Click **Enable**
   - Wait 2-3 minutes

## If You Can't Find "API Restrictions"

The setting might be:
- Called "Key restrictions" 
- Under "Advanced settings"
- In a different tab/section
- Only visible if you click "Edit" on the OAuth client

## Alternative: Check via gcloud CLI

If you have gcloud installed:
```bash
gcloud auth application-default login
gcloud services list --enabled --project=gen-lang-client-0995483666 | grep photos
```

## Most Likely Fix

**Change "API restrictions" to "Don't restrict key"** on the OAuth client. This is the #1 cause of this exact error.

## After Making Changes

1. **Save** the OAuth client settings
2. **Wait 2-3 minutes** for changes to propagate
3. Get a **completely fresh token** (new OAuth flow)
4. Test again

