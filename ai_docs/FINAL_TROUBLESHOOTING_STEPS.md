# Final Troubleshooting Steps

## Confirmed: Not a Local Environment Issue
✅ Direct API call to Google also fails with 403  
✅ Environment variables only used for OAuth client creation  
✅ API calls use access token directly  

## Remaining Possible Issues

### 1. Billing (Most Likely)
Photos Library API **requires billing to be enabled**:
1. Go to **Billing** in Google Cloud Console
2. Check if project `gen-lang-client-0995483666` has billing account
3. If not, link a billing account
4. Even with $0 budget, billing account must be linked

### 2. Re-enable the API
Sometimes the API needs to be disabled and re-enabled:
1. Go to **APIs & Services** → **Enabled APIs**
2. Find **Photos Library API**
3. Click **Disable API**
4. Wait 30 seconds
5. Go to **Library** → Search "Photos Library API"
6. Click **Enable** again
7. Wait 2-3 minutes
8. Get fresh token and test

### 3. Check API Status
1. Go to **APIs & Services** → **Enabled APIs**
2. Click on **Photos Library API**
3. Check for any error messages or warnings
4. Look at **Metrics** tab for any issues

### 4. Try Different OAuth Client
Create a brand new OAuth client to rule out client-specific issues:
1. **APIs & Services** → **Credentials**
2. **+ Create Credentials** → **OAuth client ID**
3. Create new client with same settings
4. Update `.env` with new Client ID and Secret
5. Get new token with new client
6. Test

### 5. Check Organization Policies
If using Google Workspace:
- Check if organization has policies blocking Photos Library API
- Contact your Google Workspace admin

## Most Likely Solution

**Enable billing** - This is the #1 cause when everything else checks out but you still get 403.

## Quick Test After Enabling Billing

```bash
# Get fresh token
curl http://localhost:1337/api/google-photos/auth-url

# Complete OAuth, then test
curl -X POST http://localhost:1337/api/google-photos/albums \
  -H "Content-Type: application/json" \
  -d '{"accessToken": "YOUR_NEW_TOKEN"}'
```

