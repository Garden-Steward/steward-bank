# Enable Photos Library API

## The Problem

You're getting "Request had insufficient authentication scopes" even though your token has the `photoslibrary.readonly` scope. This usually means **the Photos Library API is not enabled** in your Google Cloud project.

## Solution: Enable the Photos Library API

### Step 1: Go to Google Cloud Console

1. Visit: https://console.cloud.google.com/
2. Select your project: `wedding-315405` (or your project name)

### Step 2: Enable Photos Library API

1. Go to **APIs & Services** → **Library**
2. In the search box, type: **"Photos Library API"**
3. Click on **"Photos Library API"** from the results
4. Click the **"Enable"** button
5. Wait for it to enable (may take 10-30 seconds)

### Step 3: Verify It's Enabled

1. Go to **APIs & Services** → **Enabled APIs**
2. Look for **"Photos Library API"** in the list
3. It should show as "Enabled"

### Step 4: Re-authenticate (Optional but Recommended)

After enabling the API, you may want to get a fresh token:

1. Get a new auth URL: `curl http://localhost:1337/api/google-photos/auth-url`
2. Open the URL and complete OAuth flow
3. Get new tokens

### Step 5: Test Again

```bash
curl -X POST http://localhost:1337/api/google-photos/albums \
  -H "Content-Type: application/json" \
  -d '{"accessToken": "YOUR_NEW_TOKEN"}'
```

## Why This Happens

Even if your OAuth token has the correct scope, Google's APIs won't work unless:
1. ✅ The API is enabled in your project
2. ✅ Your OAuth client is in the same project
3. ✅ The token has the required scope

All three must be true!

## Quick Check

You can verify if the API is enabled by checking:
- **APIs & Services** → **Enabled APIs** → Look for "Photos Library API"

If it's not there, that's your problem! Enable it and try again.

