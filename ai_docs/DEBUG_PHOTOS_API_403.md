# Debugging Photos Library API 403 Error

## What We Know
✅ Token has correct scope: `https://www.googleapis.com/auth/photoslibrary.readonly`  
✅ API is enabled in project  
✅ OAuth client is in same project  
✅ User is test user  
✅ No API restrictions found on OAuth client  
✅ Service account is NOT being used (only for Cloud Storage)  

## Still Getting 403: "Request had insufficient authentication scopes"

## Possible Causes

### 1. API Not Actually Enabled (Double Check)
Even if it says "Enabled", try:
- Go to **APIs & Services** → **Enabled APIs**
- Search for "Photos Library API"
- If found, click on it
- Check the status - should say "Enabled"
- If not there, enable it from Library

### 2. Billing/Quota Issue
- Check if billing is enabled for the project
- Some APIs require billing even for testing
- Go to **Billing** → Check if project has billing account

### 3. Project-Level API Enablement
- The API might need to be enabled at organization level
- Or there might be organization policies blocking it

### 4. OAuth Client Project Mismatch
- Verify OAuth client `464730057123-r7qd614qs6n6atcibblhkukc7b8q1h9f` is in project `gen-lang-client-0995483666`
- The project number `464730057123` should match the project

### 5. Scope Format Issue
Even though Google shows `./auth/photoslibrary.readonly`, the actual scope should be the full URL. But this seems to be working since tokeninfo shows the correct scope.

### 6. Testing Mode Limitations
- Some APIs have limitations in testing mode
- Might need to publish app (but requires verification)

## What to Try

### Option 1: Verify API is Actually Working
Try enabling a different API (like Drive API) and see if that works with the same OAuth flow. This will tell us if it's Photos-specific or a general OAuth issue.

### Option 2: Check Billing
1. Go to **Billing** in Google Cloud Console
2. Check if project `gen-lang-client-0995483666` has billing enabled
3. Photos Library API might require billing

### Option 3: Try Different Project
Create a completely fresh project and set up OAuth client + API from scratch to rule out any project-level issues.

### Option 4: Check API Quotas
1. Go to **APIs & Services** → **Quotas**
2. Search for "Photos Library API"
3. Check if there are any quota limits or errors

## Most Likely Issue

Given everything checks out, this might be:
1. **Billing requirement** - Photos Library API might need billing enabled
2. **Organization policy** - If using Google Workspace, there might be org policies
3. **API enablement delay** - Sometimes takes longer than expected to propagate

## Next Steps

1. Check billing status for the project
2. Verify API is actually enabled (not just says it is)
3. Check for any error messages in **APIs & Services** → **Enabled APIs** → **Photos Library API**

