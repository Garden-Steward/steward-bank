# Advanced Troubleshooting - Billing Enabled

Since billing is enabled, let's check other possibilities:

## 1. Check API Quotas and Errors

1. Go to **APIs & Services** → **Enabled APIs**
2. Click on **Photos Library API**
3. Check **Metrics** tab - look for any errors
4. Check **Quotas** tab - see if there are any quota issues
5. Look for any warning messages

## 2. Verify API is Actually Active

1. Go to **APIs & Services** → **Enabled APIs**
2. Find **Photos Library API**
3. Click on it
4. Verify it says **"Enabled"** (not "Enabling" or any other status)
5. Check the **Service name**: should be `photoslibrary.googleapis.com`

## 3. Check OAuth Client Project Number

Your OAuth client ID starts with `464730057123`. Verify:
1. Go to **IAM & Admin** → **Settings**
2. Check the **Project number** - should match `464730057123`
3. If it doesn't match, the OAuth client might be in a different project

## 4. Try Creating Fresh OAuth Client

Sometimes OAuth clients get into a bad state:
1. **APIs & Services** → **Credentials**
2. **+ Create Credentials** → **OAuth client ID**
3. Name: `Garden Steward Photos 2` (or similar)
4. Type: **Web application**
5. Redirect URI: `http://localhost:1337/api/google-photos/oauth-callback`
6. Click **Create**
7. Update `.env` with new Client ID and Secret
8. Restart Strapi
9. Get fresh token with new client
10. Test

## 5. Check for API-Specific Restrictions

1. Go to **APIs & Services** → **Enabled APIs** → **Photos Library API**
2. Look for any **Restrictions** or **Settings** sections
3. Check if there are any organization-level restrictions

## 6. Try Different API Endpoint

Test if the API responds at all:
```bash
# Try getting shared albums instead
curl -X POST "https://photoslibrary.googleapis.com/v1/sharedAlbums" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json"
```

## 7. Check Google Cloud Console Logs

1. Go to **Logging** → **Logs Explorer**
2. Filter by: `photoslibrary.googleapis.com`
3. Look for any error messages

## 8. Verify Scope in OAuth Consent Screen

Double-check the scope is actually saved:
1. Go to **APIs & Services** → **OAuth consent screen**
2. Click **Data Access** tab (or **Scopes**)
3. Verify `./auth/photoslibrary.readonly` is listed
4. If it shows the relative format, that's fine - Google displays it that way
5. But verify it's actually there and saved

## Most Likely Remaining Issues

1. **API not fully enabled** - Try disabling and re-enabling
2. **OAuth client in wrong project** - Verify project number matches
3. **Scope not properly saved** - Re-add and save the scope
4. **Quota/limit reached** - Check quotas tab
5. **Organization policy** - If using Workspace, check org policies

## Next Step

I'd recommend trying to create a **completely fresh OAuth client** in the same project and testing with that. Sometimes OAuth clients can get into a bad state that's hard to diagnose.

