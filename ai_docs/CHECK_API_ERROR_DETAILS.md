# Check API Error Details

## What We Know
✅ API is enabled (17 requests received)  
✅ All requests failing (100% error rate)  
✅ Project number matches  
✅ Billing enabled  

## Next Steps to See Actual Error

### 1. Check Error Details in Metrics
1. Go to **APIs & Services** → **Enabled APIs** → **Photos Library API**
2. Click on the **Metrics** tab
3. Click on the error percentage or the method name
4. Look for **error details** or **error breakdown**
5. This should show the actual error messages (likely "PERMISSION_DENIED" or "insufficient scopes")

### 2. Check Logs
1. Go to **Logging** → **Logs Explorer**
2. Filter by:
   - Resource: `photoslibrary.googleapis.com`
   - Or search for: `ListAlbums`
3. Look for the actual error messages
4. Check if there are any additional details about why it's failing

### 3. Check API Quotas
1. Go to **APIs & Services** → **Enabled APIs** → **Photos Library API**
2. Click **Quotas** tab
3. Check if there are any quota limits or errors
4. Look for any restrictions

### 4. Try Different API Method
Test if it's specific to ListAlbums or all methods:
```bash
# Try getting a single album (if you have an album ID)
curl -X GET "https://photoslibrary.googleapis.com/v1/albums/ALBUM_ID" \
  -H "Authorization: Bearer YOUR_TOKEN"

# Or try searching for media items
curl -X POST "https://photoslibrary.googleapis.com/v1/mediaItems:search" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pageSize": 10}'
```

## Most Important: Check Error Details

The Metrics page should show you the **exact error code and message**. This will tell us what Google is actually complaining about, which might be different from what we think.

