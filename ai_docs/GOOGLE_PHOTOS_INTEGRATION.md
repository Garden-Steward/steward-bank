# Google Photos Integration - Important Notes

## Overview

This integration allows Garden Steward to fetch photos from Google Photos albums and import them into Strapi's media library.

## Important Limitations & Requirements

### Authentication Requirement

**The Google Photos Library API requires OAuth authentication from a user who has access to the album.**

This means:
- ✅ **Works**: A garden steward/admin authenticates with Google Photos, and they have access to a shared album (they were added to it or own it)
- ❌ **Doesn't Work**: Simply having a shared album link without authenticating as someone with access

### How It Works

1. **One-time Setup**: A garden steward/admin authenticates with Google Photos via OAuth
   - They grant the app permission to read their Google Photos
   - The app receives an access token (and optionally a refresh token)
   - **Important**: Store these tokens securely (see Security section below)

2. **Using Shared Albums**:
   - The steward/admin provides a Google Photos album link
   - The app extracts the album ID from the URL
   - Using the authenticated user's access token, the app fetches photos from albums they have access to

3. **Importing Photos**:
   - Photos are downloaded from Google Photos
   - They are uploaded to Strapi's media library (which uses Google Cloud Storage in your setup)
   - The imported photos can then be used in Projects and Volunteer Days

## Setup Instructions

### 1. Enable Google Photos Library API

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (or create a new one)
3. Enable the **Photos Library API**
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:1337/api/google-photos/oauth-callback` (for dev)
   - Add production redirect URI when deploying

### 2. Environment Variables

Add to your `.env` file:

```bash
# Google Photos API Credentials
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
GOOGLE_REDIRECT_URI=http://localhost:1337/api/google-photos/oauth-callback
```

### 3. Token Storage (Production)

**Current Implementation**: Tokens are returned in the OAuth callback response. This is fine for testing but **NOT secure for production**.

**Production Recommendations**:
- Store tokens encrypted in a database table
- Associate tokens with the authenticated user
- Implement token refresh logic (access tokens expire)
- Use environment variables or secure key management for encryption keys

Example token storage structure:
```javascript
// Pseudo-code for token storage
{
  userId: 123,
  accessToken: 'encrypted_token',
  refreshToken: 'encrypted_refresh_token',
  expiresAt: '2024-12-31T23:59:59Z'
}
```

## API Endpoints

### 1. Get Authorization URL
```
GET /api/google-photos/auth-url
```
Returns: `{ authUrl: "https://accounts.google.com/..." }`

### 2. OAuth Callback
```
GET /api/google-photos/oauth-callback?code=...
```
Returns: `{ tokens: { access_token, refresh_token, ... } }`

### 3. List Album Photos
```
POST /api/google-photos/album/:albumId/photos
Body: { accessToken: "..." }
```
Returns: `{ photos: [...] }`

### 4. Import Photos
```
POST /api/google-photos/import
Body: { 
  photos: [{ id, baseUrl, filename, mimeType }],
  accessToken: "..."
}
```
Returns: `{ uploadedFiles: [...], success: 5, failed: 0 }`

## Usage Workflow

1. **Initial Authentication** (one-time per user):
   - Call `/api/google-photos/auth-url`
   - Redirect user to the returned URL
   - User grants permission
   - Google redirects to callback with code
   - Exchange code for tokens
   - Store tokens securely

2. **Adding Photos to a Project/Volunteer Day**:
   - Enter Google Photos album URL in the `photo_album_url` field
   - Album ID is automatically extracted (via lifecycle hook)
   - Use the import endpoint to fetch and import selected photos
   - Assign imported photos to `featured_gallery` field

## Alternative Approaches

If the Google Photos Library API limitations don't meet your needs, consider:

1. **Direct Upload**: Allow users to upload photos directly to Strapi
2. **Cloudinary Integration**: Use Cloudinary's media library plugin for Strapi
3. **Manual Import**: Download photos manually and upload via Strapi admin

## Security Considerations

1. **Token Storage**: Never store tokens in plain text
2. **HTTPS**: Always use HTTPS in production
3. **Rate Limiting**: Implement rate limiting on Google Photos endpoints
4. **Permissions**: Restrict Google Photos endpoints to authenticated admin users
5. **Token Refresh**: Implement automatic token refresh before expiration

## Testing

1. Test OAuth flow in development
2. Verify album access with authenticated user
3. Test photo import functionality
4. Verify photos are correctly stored in Strapi media library
5. Test with different album URL formats

## Troubleshooting

**"Failed to fetch album photos"**:
- Verify the authenticated user has access to the album
- Check that the album ID was extracted correctly
- Ensure the access token is valid and not expired

**"Failed to import photo"**:
- Check network connectivity
- Verify file size limits
- Check Strapi upload plugin configuration

