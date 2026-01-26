/**
 * Seed file for creating monthly volunteer day events
 * Creates 17 events, one for each month, on the 3rd Sunday of each month
 * Uses varied hero images and featured galleries from the media library
 */

/**
 * Get available media images from media library
 */
async function getAvailableMedia(strapi) {
  try {
    // Known media IDs from the API response (hero images and featured gallery images)
    const knownMediaIds = [237, 24, 249, 250, 252, 253, 251, 247, 245];
    
    const availableImages = [];
    
    // Check which ones exist in the database
    for (const imageId of knownMediaIds) {
      try {
        const mediaFile = await strapi.entityService.findOne('plugin::upload.file', imageId);
        if (mediaFile) {
          availableImages.push(imageId);
        }
      } catch (err) {
        // Skip if not found
      }
    }
    
    // Fallback: find any existing media files if our known IDs don't exist
    if (availableImages.length === 0) {
      console.warn('No known media images found, searching for any existing media...');
      const allMedia = await strapi.entityService.findMany('plugin::upload.file', {
        filters: {
          mime: { $contains: 'image' }
        },
        limit: 10
      });
      availableImages.push(...allMedia.map(m => m.id));
    }
    
    if (availableImages.length > 0) {
      console.log(`Found ${availableImages.length} available media images`);
      return availableImages;
    } else {
      console.warn('No media images found');
      return [];
    }
  } catch (error) {
    console.warn(`Error getting media images: ${error.message}`);
    return [];
  }
}

/**
 * Get the 3rd Sunday of a given month and year
 * @param {number} year - The year
 * @param {number} month - The month (0-11, where 0 is January)
 * @returns {Date} - The date of the 3rd Sunday
 */
function getThirdSunday(year, month) {
  // Start with the 1st of the month
  const firstDay = new Date(year, month, 1);
  const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 1 = Monday, etc.
  
  // Calculate how many days to add to get to the first Sunday
  // If dayOfWeek is 0 (Sunday), we want 0 days (already on Sunday)
  // If dayOfWeek is 1 (Monday), we want 6 days to get to Sunday
  // If dayOfWeek is 2 (Tuesday), we want 5 days to get to Sunday
  // etc.
  const daysToFirstSunday = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  
  // The 3rd Sunday is 14 days after the first Sunday
  const thirdSunday = new Date(year, month, 1 + daysToFirstSunday + 14);
  
  return thirdSunday;
}

/**
 * Get the month name from a month index
 * @param {number} month - The month (0-11)
 * @returns {string} - The month name
 */
function getMonthName(month) {
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return monthNames[month];
}

async function seedEvents(strapi) {
  try {
    console.log('Starting event seeding...');

    // Get all seeded gardens
    const gardens = await strapi.entityService.findMany('api::garden.garden', {
      filters: {
        title: {
          $in: ['Downtown Community Garden', 'Neighborhood Garden']
        }
      }
    });

    if (gardens.length === 0) {
      console.error('No gardens found. Please seed gardens first.');
      throw new Error('No gardens found');
    }

    console.log(`Found ${gardens.length} gardens to seed events for`);

    // Get available media images for hero images and featured galleries
    const availableMedia = await getAvailableMedia(strapi);
    
    // Process each garden
    const allEvents = [];
    for (const garden of gardens) {
      console.log(`\nSeeding events for garden: ${garden.title} (ID: ${garden.id})`);
      const gardenEvents = await seedEventsForGarden(strapi, garden, availableMedia);
      allEvents.push(...gardenEvents);
    }

    console.log(`\nSuccessfully created ${allEvents.length} total events across ${gardens.length} gardens`);
    return allEvents;
  } catch (error) {
    console.error('Error seeding events:', error);
    throw error;
  }
}

async function seedEventsForGarden(strapi, garden, availableMedia) {
  try {

    // Get current date
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();

    // Start 15 months ago for past events
    const pastStartMonth = currentMonth - 15;
    const pastStartYear = currentYear + Math.floor(pastStartMonth / 12);
    const pastStartMonthIndex = ((pastStartMonth % 12) + 12) % 12;

    // Start from next month for future events
    const futureStartMonth = currentMonth + 1;
    const futureStartYear = currentYear + Math.floor(futureStartMonth / 12);
    const futureStartMonthIndex = futureStartMonth % 12;

    // Create 17 events: 15 in the past, 2 in the future
    const events = [];
    
    // Create 15 past events
    for (let i = 0; i < 15; i++) {
      const monthOffset = pastStartMonthIndex + i;
      const monthIndex = monthOffset % 12;
      const year = pastStartYear + Math.floor(monthOffset / 12);
      
      // Get the 3rd Sunday of this month
      const thirdSunday = getThirdSunday(year, monthIndex);
      
      // Set time to 9:30 AM
      thirdSunday.setHours(9, 30, 0, 0);
      
      const monthName = getMonthName(monthIndex);
      const title = `${monthName} 3rd Sunday`;
      const slug = `${garden.slug || garden.id}-${monthName.toLowerCase()}-3rd-sunday-${year}`.replace(/\s+/g, '-');

      // Vary hero images and featured galleries across events
      const heroImageIndex = i % availableMedia.length;
      const heroImage = availableMedia.length > 0 ? availableMedia[heroImageIndex] : null;
      
      // Add featured gallery to some events (every 3rd event)
      let featuredGallery = null;
      if (i % 3 === 0 && availableMedia.length >= 3) {
        // Use a different set of images for featured gallery
        const galleryStartIndex = (i + 1) % availableMedia.length;
        const galleryImages = [
          availableMedia[galleryStartIndex % availableMedia.length],
          availableMedia[(galleryStartIndex + 1) % availableMedia.length],
          availableMedia[(galleryStartIndex + 2) % availableMedia.length]
        ];
        featuredGallery = galleryImages;
      }

      const eventData = {
        title,
        blurb: `Join us for our monthly volunteer day on the 3rd Sunday of ${monthName}!`,
        content: `Come help us maintain and improve our community garden. All skill levels welcome!`,
        startDatetime: thirdSunday,
        endText: 'around noon',
        disabled: false,
        interest: 'Everyone',
        slug,
        accessibility: 'Public',
        smsLink: true,
        garden: garden.id,
        hero_image: heroImage,
        featured_gallery: featuredGallery,
        publishedAt: new Date()
      };

      // Check if event already exists
      const existing = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
        filters: { slug },
        limit: 1
      });

      if (existing.length > 0) {
        console.log(`Event "${title}" already exists, skipping...`);
        continue;
      }

      const created = await strapi.entityService.create('api::volunteer-day.volunteer-day', {
        data: eventData
      });

      events.push(created);
      console.log(`Created event: ${title} on ${thirdSunday.toLocaleDateString()}`);
    }

    // Create 2 future events
    for (let i = 0; i < 2; i++) {
      const monthOffset = futureStartMonthIndex + i;
      const monthIndex = monthOffset % 12;
      const year = futureStartYear + Math.floor(monthOffset / 12);
      
      // Get the 3rd Sunday of this month
      const thirdSunday = getThirdSunday(year, monthIndex);
      
      // Set time to 9:30 AM
      thirdSunday.setHours(9, 30, 0, 0);
      
      const monthName = getMonthName(monthIndex);
      const title = `${monthName} 3rd Sunday`;
      const slug = `${garden.slug || garden.id}-${monthName.toLowerCase()}-3rd-sunday-${year}`.replace(/\s+/g, '-');

      // Vary hero images and featured galleries across events
      const eventIndex = 15 + i; // Offset by 15 for future events
      const heroImageIndex = eventIndex % availableMedia.length;
      const heroImage = availableMedia.length > 0 ? availableMedia[heroImageIndex] : null;
      
      // Add featured gallery to some events (every 3rd event)
      let featuredGallery = null;
      if (eventIndex % 3 === 0 && availableMedia.length >= 3) {
        // Use a different set of images for featured gallery
        const galleryStartIndex = (eventIndex + 1) % availableMedia.length;
        const galleryImages = [
          availableMedia[galleryStartIndex % availableMedia.length],
          availableMedia[(galleryStartIndex + 1) % availableMedia.length],
          availableMedia[(galleryStartIndex + 2) % availableMedia.length]
        ];
        featuredGallery = galleryImages;
      }

      const eventData = {
        title,
        blurb: `Join us for our monthly volunteer day on the 3rd Sunday of ${monthName}!`,
        content: `Come help us maintain and improve our community garden. All skill levels welcome!`,
        startDatetime: thirdSunday,
        endText: 'around noon',
        disabled: false,
        interest: 'Everyone',
        slug,
        accessibility: 'Public',
        smsLink: true,
        garden: garden.id,
        hero_image: heroImage,
        featured_gallery: featuredGallery,
        publishedAt: new Date()
      };

      // Check if event already exists
      const existing = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
        filters: { slug },
        limit: 1
      });

      if (existing.length > 0) {
        console.log(`Event "${title}" already exists, skipping...`);
        continue;
      }

      const created = await strapi.entityService.create('api::volunteer-day.volunteer-day', {
        data: eventData
      });

      events.push(created);
      console.log(`Created event: ${title} on ${thirdSunday.toLocaleDateString()}`);
    }

    console.log(`Successfully created ${events.length} events (15 past, 2 future) for ${garden.title}`);
    return events;
  } catch (error) {
    console.error(`Error seeding events for garden ${garden.title}:`, error);
    throw error;
  }
}

module.exports = seedEvents;






