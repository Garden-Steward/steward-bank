# Quick Start: Manual Photo Uploads

## ✅ Ready to Use Now

The manual upload workflow is **already built and ready**. No additional setup needed!

## How It Works

### In Strapi Admin Panel

1. **Navigate to Projects** (or Volunteer Days)
2. **Create or Edit** an entry
3. **Find "Featured Gallery"** field
4. **Click the upload area** or drag & drop photos
5. **Select multiple photos** (3-8 recommended)
6. **Save**

That's it! Photos are automatically:
- ✅ Uploaded to Google Cloud Storage
- ✅ Optimized by Strapi
- ✅ Available via API
- ✅ Displayed in your frontend

## Optional: Store Album URLs

Even with manual uploads, you can:

1. **Paste Google Photos album URL** in `photo_album_url` field
2. **Album ID auto-extracts** and saves to `photo_album_id`
3. **Future-ready** - Once API is verified, you can import from these albums

## Example Workflow

```
1. Event happens (e.g., Earth Day Block Party)
2. Photos taken and uploaded to Google Photos
3. Google Photos album shared → get share link
4. In Strapi:
   - Create new Project
   - Upload 5-6 best photos to featured_gallery
   - Paste album URL in photo_album_url (for future use)
   - Save
5. Project appears on website with photos
```

## What's Already Built

✅ **Project content type** - with featured_gallery field  
✅ **Volunteer Day updates** - with featured_gallery field  
✅ **Album ID extraction** - automatically extracts from URLs  
✅ **Lifecycle hooks** - auto-populate album IDs  
✅ **Google Photos integration** - ready once API is verified  

## Next Steps

1. **Start using manual uploads** - It works right now!
2. **Continue with Google Photos verification** - For future automation
3. **Build your frontend** - The API endpoints are ready
4. **Switch to API import later** - When verification completes

## API Endpoints Available

Even with manual uploads, these endpoints work:

- `GET /api/projects` - List all projects
- `GET /api/projects/:id` - Get single project
- `GET /api/projects/garden/:slug` - Get projects by garden
- `GET /api/volunteer-days` - List volunteer days
- All standard Strapi CRUD operations

The `featured_gallery` field will contain your manually uploaded photos, accessible via the API just like any other Strapi media field.

