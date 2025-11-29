# Check Logs Different Ways

## Try These Log Filters

### 1. Filter by Service Name
In **Logging** → **Logs Explorer**:
- Resource type: `api`
- Service name: `photoslibrary.googleapis.com`

### 2. Filter by Error
- Severity: `ERROR`
- Text: `403` or `PERMISSION_DENIED`

### 3. Filter by Time
- Set time range to last 1 hour
- Look for any entries related to Photos API

### 4. Check All Logs
- Remove all filters
- Search for: `photoslibrary` or `464730057123` (your project number)

## Alternative: Check API Response Headers

The API response might have additional error details in headers. Try:

```bash
curl -v -X GET "https://photoslibrary.googleapis.com/v1/albums?pageSize=5" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" 2>&1 | grep -i "error\|www-authenticate\|x-goog"
```

## Check OAuth Consent Screen Status

1. Go to **APIs & Services** → **OAuth consent screen**
2. Check the **Publishing status**
3. If it says "Testing", verify:
   - Your email is in test users
   - The scope is properly saved
4. Try clicking **"Publish app"** (even if it requires verification later)

## One More Thing to Check

In the **OAuth consent screen** → **Data Access** tab:
- Make sure the scope `./auth/photoslibrary.readonly` is actually **saved**
- Try removing it and re-adding it
- Click **Save** at the bottom of the page

## Nuclear Option: Fresh Start

If nothing else works:
1. Create a completely new Google Cloud project
2. Enable Photos Library API
3. Create new OAuth client
4. Configure OAuth consent screen from scratch
5. Test with fresh setup

This will rule out any hidden project-level issues.

