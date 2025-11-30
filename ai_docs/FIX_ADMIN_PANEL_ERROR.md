# Fix Admin Panel Navigation Error

## The Error

```
Cannot read properties of null (reading 'type')
```

This error occurs when navigating from Projects to Events (Volunteer Days) in the Strapi admin panel.

## Cause

This is typically caused by:
1. **Stale admin panel cache** - The admin panel has cached the old schema
2. **Schema changes not reflected** - Recent changes (date → date_start, new relations) haven't been picked up
3. **Relation configuration** - The manyToMany relation might need proper configuration

## Solutions (Try in Order)

### Solution 1: Rebuild Admin Panel (Most Common Fix)

```bash
# Stop Strapi (Ctrl+C)
# Clear the build cache
rm -rf .cache build

# Restart Strapi
npm run develop
```

This will rebuild the admin panel with the latest schema changes.

### Solution 2: Clear Browser Cache

1. Open browser DevTools (F12)
2. Right-click the refresh button
3. Select "Empty Cache and Hard Reload"
4. Or use Ctrl+Shift+R (Cmd+Shift+R on Mac)

### Solution 3: Check Relation Configuration

The `related_events` relation might need an `inversedBy` field. However, for manyToMany relations, this is optional. The current configuration should work.

### Solution 4: Verify Schema is Valid

Make sure all schema files are valid JSON and there are no syntax errors.

## Quick Fix Command

```bash
# Stop Strapi, then run:
rm -rf .cache build && npm run develop
```

This will:
1. Clear the admin panel build cache
2. Clear the Strapi cache
3. Rebuild everything with the latest schemas
4. Start Strapi fresh

## If Error Persists

1. Check browser console for more detailed errors
2. Verify the relation is working: Try creating a project and linking it to a volunteer day
3. Check if the error happens with specific projects or all projects
4. Verify the volunteer-day schema is valid

