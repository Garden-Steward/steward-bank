# Google Credentials Explained

## Two Different Types of Credentials

You need **TWO different sets of Google credentials** for Garden Steward:

### 1. Service Account (Already Have) ✅
**Purpose**: Server-to-server authentication for Google Cloud Storage

**What it's used for**:
- Uploading files/images to Google Cloud Storage bucket
- Strapi's media library storage
- No user interaction required

**Your existing credential**:
```bash
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account",...}
```

**Where it's used**: `config/plugins.js` for the upload provider

**Keep this!** You still need it for file uploads.

---

### 2. OAuth 2.0 Client (New - Need to Create) 🆕
**Purpose**: User authentication to access Google Photos Library API

**What it's used for**:
- Authenticating garden stewards/admins with Google Photos
- Accessing their Google Photos albums
- Importing photos from Google Photos to Strapi

**New credentials needed**:
```bash
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
GOOGLE_REDIRECT_URI=http://localhost:1337/api/google-photos/oauth-callback
```

**Where it's used**: Google Photos integration service

**Why you need this**: Google Photos Library API requires OAuth 2.0 user authentication, not service account authentication.

---

## Why Two Different Credentials?

| Feature | Service Account | OAuth 2.0 Client |
|---------|----------------|------------------|
| **Purpose** | Server-to-server | User authentication |
| **Used For** | Cloud Storage | Google Photos API |
| **User Interaction** | None | Yes (OAuth flow) |
| **Access Scope** | Your GCP resources | User's Google Photos |
| **Authentication** | JSON key file | Client ID + Secret |

**Service Accounts** can't access user's Google Photos because:
- Google Photos is tied to user accounts, not service accounts
- The Photos Library API requires user consent (OAuth)
- Service accounts don't have Google Photos libraries

---

## Where to Get OAuth 2.0 Client Credentials

### Step 1: Go to Google Cloud Console
1. Visit: https://console.cloud.google.com/
2. Select your project: `wedding-315405` (same project as your service account)

### Step 2: Enable Photos Library API
1. Go to **APIs & Services** → **Library**
2. Search for "Photos Library API"
3. Click **Enable**

### Step 3: Create OAuth 2.0 Client
1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. If prompted, configure OAuth consent screen first (see below)
4. Select **Web application**
5. Fill in:
   - **Name**: `Garden Steward Photos` (or any name)
   - **Authorized redirect URIs**: 
     - `http://localhost:1337/api/google-photos/oauth-callback` (dev)
     - `https://your-production-domain.com/api/google-photos/oauth-callback` (prod)
6. Click **Create**
7. **IMPORTANT**: Copy the **Client ID** and **Client Secret** immediately!

### Step 4: Configure OAuth Consent Screen (if not done)
If you see a prompt to configure the consent screen:

1. Choose **External** (unless you have Google Workspace)
2. Fill in:
   - **App name**: `Garden Steward`
   - **User support email**: Your email
   - **Developer contact**: Your email
3. Click **Save and Continue**
4. **Scopes**: Add `https://www.googleapis.com/auth/photoslibrary.readonly`
5. **Test users**: Add your email and any garden steward emails
6. Click **Save and Continue** → **Back to Dashboard**

---

## Your Complete .env File

After creating the OAuth client, your `.env` should have:

```bash
# Existing - Google Cloud Storage (Service Account)
GOOGLE_CLOUD_CREDENTIALS={"type":"service_account","project_id":"wedding-315405",...}

# New - Google Photos API (OAuth 2.0 Client)
GOOGLE_CLIENT_ID=123456789-abcdefghijklmnop.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-abcdefghijklmnopqrstuvwxyz
GOOGLE_REDIRECT_URI=http://localhost:1337/api/google-photos/oauth-callback
```

---

## Quick Reference: Where Each Credential is Used

### Service Account (`GOOGLE_CLOUD_CREDENTIALS`)
- **File**: `config/plugins.js`
- **Plugin**: `@strapi-community/strapi-provider-upload-google-cloud-storage`
- **Purpose**: Store uploaded media files

### OAuth 2.0 Client (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`)
- **File**: `src/api/google-photos/services/google-photos.js`
- **Service**: Google Photos integration
- **Purpose**: Authenticate users to access their Google Photos

---

## Summary

✅ **Keep your existing service account** - it's still needed for Cloud Storage
🆕 **Create new OAuth 2.0 client** - needed for Google Photos API
📝 **Both are in the same Google Cloud project** (`wedding-315405`)
🔐 **Both go in your `.env` file** - they serve different purposes

The service account and OAuth client are completely separate credentials that do different things. You need both!

