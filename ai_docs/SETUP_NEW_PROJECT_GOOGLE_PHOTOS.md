# Setting Up Google Photos on a New Project

## Important Distinction

- **Service Account**: Only needed for Google Cloud Storage (file uploads) - you can keep using the wedding project's service account
- **OAuth 2.0 Client**: Required for Google Photos API - needs to be created in the NEW project

## Step-by-Step Setup

### Step 1: Create or Select New Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown at the top
3. Click **"New Project"**
4. Enter project name (e.g., "Garden Steward")
5. Click **"Create"**
6. Select the new project from the dropdown

### Step 2: Enable Photos Library API

1. In the new project, go to **APIs & Services** → **Library**
2. Search for **"Photos Library API"**
3. Click **"Photos Library API"**
4. Click **"Enable"**
5. Wait for it to enable

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Choose **External** (unless you have Google Workspace)
3. Fill in:
   - **App name**: `Garden Steward`
   - **User support email**: Your email
   - **Developer contact**: Your email
4. Click **Save and Continue**
5. **Scopes**: Click **Add or Remove Scopes**
   - Search for and select: `https://www.googleapis.com/auth/photoslibrary.readonly`
   - Click **Update** → **Save and Continue**
6. **Test users**: Add your email and garden steward emails
7. Click **Save and Continue** → **Back to Dashboard**

### Step 4: Create OAuth 2.0 Client

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Fill in:
   - **Name**: `Garden Steward Photos`
   - **Authorized redirect URIs**:
     - Development: `http://localhost:1337/api/google-photos/oauth-callback`
     - Production: `https://your-production-domain.com/api/google-photos/oauth-callback`
5. Click **Create**
6. **IMPORTANT**: Copy the **Client ID** and **Client Secret** immediately!

### Step 5: Update Your .env File

Add the new credentials to your `.env`:

```bash
# Existing - Google Cloud Storage (can stay with wedding project)
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account","project_id":"wedding-315405",...}

# New - Google Photos API (from NEW project)
GOOGLE_CLIENT_ID=your_new_client_id_here.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_new_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:1337/api/google-photos/oauth-callback
```

### Step 6: Restart Strapi and Test

1. Restart Strapi: `npm run develop`
2. Get new auth URL: `curl http://localhost:1337/api/google-photos/auth-url`
3. Complete OAuth flow with the new credentials
4. Test listing albums

## Summary

✅ **Service Account**: Can stay in wedding project (only for Cloud Storage)  
🆕 **OAuth Client**: Must be in NEW project (for Google Photos)  
🔑 **Two Different Credentials**: They serve different purposes

## Why This Works

- **Service Account** is for server-to-server auth (Cloud Storage)
- **OAuth Client** is for user authentication (Google Photos)
- They can be in different projects because they're completely separate

## Quick Checklist

- [ ] New Google Cloud project created
- [ ] Photos Library API enabled in new project
- [ ] OAuth consent screen configured with photoslibrary.readonly scope
- [ ] OAuth 2.0 Client created in new project
- [ ] Client ID and Secret copied
- [ ] .env file updated with new credentials
- [ ] Strapi restarted
- [ ] OAuth flow completed with new credentials
- [ ] Albums endpoint tested successfully

