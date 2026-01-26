/**
 * Seed file for creating recurring event templates
 * Creates 3 templates with different recurrence patterns
 * Uses existing media files by ID (hero_image ID: 237 from API response)
 * Processes templates to generate events for today
 */

const { format, addDays } = require('date-fns');

/**
 * Get available hero images from media library
 * Returns an array of media IDs to use for varying hero images
 */
async function getAvailableHeroImages(strapi) {
  try {
    // List of known hero image IDs from the media library
    // These are IDs that exist in the system
    const knownHeroImageIds = [237, 24, 249, 250, 252, 253, 251, 247, 245];
    
    const availableImages = [];
    
    // Check which ones exist in the database
    for (const imageId of knownHeroImageIds) {
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
      console.warn('No known hero images found, searching for any existing media...');
      const allMedia = await strapi.entityService.findMany('plugin::upload.file', {
        filters: {
          mime: { $contains: 'image' }
        },
        limit: 10
      });
      availableImages.push(...allMedia.map(m => m.id));
    }
    
    if (availableImages.length > 0) {
      console.log(`Found ${availableImages.length} available hero images: ${availableImages.join(', ')}`);
      return availableImages;
    } else {
      console.warn('No hero images found, templates will be created without hero_image');
      return [];
    }
  } catch (error) {
    console.warn(`Error getting hero images: ${error.message}`);
    console.warn('Will continue without hero_image');
    return [];
  }
}

/**
 * Seed recurring event templates
 */
async function seedRecurringEventTemplates(strapi) {
  try {
    console.log('Starting recurring event template seeding...');

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

    console.log(`Found ${gardens.length} gardens to seed templates for`);

    // Get available hero images to vary them across templates
    const availableHeroImages = await getAvailableHeroImages(strapi);
    
    // Process each garden
    const allTemplates = [];
    for (const garden of gardens) {
      console.log(`\nSeeding templates for garden: ${garden.title} (ID: ${garden.id})`);
      const gardenTemplates = await seedTemplatesForGarden(strapi, garden, availableHeroImages);
      allTemplates.push(...gardenTemplates);
    }

    // Process all templates to generate events (only once, after all templates are created)
    console.log('\nProcessing all templates to generate events...');
    const summary = await strapi.service('api::recurring-event-template.recurring-event-template').processAllTemplates();
    
    console.log(`\nProcessing Summary:`);
    console.log(`- Total templates processed: ${summary.totalTemplates}`);
    console.log(`- Total instances created: ${summary.totalCreated}`);
    
    if (summary.results && summary.results.length > 0) {
      console.log('\nTemplate Results:');
      summary.results.forEach((result, index) => {
        console.log(`\nTemplate ${index + 1}: ${result.templateTitle}`);
        console.log(`  Created: ${result.created.length} instances`);
        if (result.created.length > 0) {
          result.created.forEach(instance => {
            console.log(`    - ${instance.title} (ID: ${instance.id}) on ${instance.date}`);
          });
        }
        if (result.skipped.length > 0) {
          console.log(`  Skipped: ${result.skipped.length} instances`);
          result.skipped.forEach(skip => console.log(`    - ${skip}`));
        }
        if (result.errors.length > 0) {
          console.log(`  Errors: ${result.errors.length}`);
          result.errors.forEach(error => console.log(`    - ${error}`));
        }
      });
    }

    // Check if any events were generated for today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStart = format(today, "yyyy-MM-dd'T'00:00:00.000'Z'");
    const todayEnd = format(today, "yyyy-MM-dd'T'23:59:59.999'Z'");
    
    const todayEvents = await strapi.entityService.findMany('api::volunteer-day.volunteer-day', {
      filters: {
        is_recurring_instance: true,
        startDatetime: {
          $gte: todayStart,
          $lte: todayEnd
        }
      },
      populate: ['recurring_template']
    });

    if (todayEvents.length > 0) {
      console.log(`\n✓ Generated ${todayEvents.length} event(s) for today:`);
      todayEvents.forEach(event => {
        console.log(`  - ${event.title} (ID: ${event.id}) from template "${event.recurring_template?.title_template || 'unknown'}"`);
      });
    } else {
      console.log('\n⚠ No events were generated for today. This might be because:');
      console.log('  - The recurrence pattern doesn\'t match today\'s date');
      console.log('  - Events already exist for today');
      console.log('  - The first_occurrence_date is in the future');
    }

    console.log(`\nSuccessfully created ${allTemplates.length} total templates across ${gardens.length} gardens`);
    return allTemplates;
  } catch (error) {
    console.error('Error seeding recurring event templates:', error);
    throw error;
  }
}

async function seedTemplatesForGarden(strapi, garden, availableHeroImages) {
  try {

    // Get today's date
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Reset time to start of day
    const todayDate = format(today, 'yyyy-MM-dd');
    
    // Calculate dates for different recurrence patterns
    // For today's event, we'll set first_occurrence_date to today or earlier
    const firstOccurrenceDate = format(addDays(today, -1), 'yyyy-MM-dd'); // Yesterday to ensure today is included
    
    // Get today's day of month and weekday
    const dayOfMonth = today.getDate();
    const weekdayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const weekday = weekdayNames[today.getDay()];
    
    // Calculate which occurrence of the weekday this is (1st, 2nd, 3rd, 4th, or last)
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const firstWeekday = firstOfMonth.getDay();
    const daysUntilFirstOccurrence = (today.getDay() - firstWeekday + 7) % 7;
    const occurrenceNumber = Math.floor((dayOfMonth - 1 - daysUntilFirstOccurrence) / 7) + 1;
    
    // Determine nth occurrence (handle edge case for last)
    let nthOccurrence;
    if (occurrenceNumber === 1) {
      nthOccurrence = 'first';
    } else if (occurrenceNumber === 2) {
      nthOccurrence = 'second';
    } else if (occurrenceNumber === 3) {
      nthOccurrence = 'third';
    } else if (occurrenceNumber === 4) {
      nthOccurrence = 'fourth';
    } else {
      // Check if this is actually the last occurrence of this weekday
      const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const daysUntilEnd = lastDayOfMonth.getDate() - dayOfMonth;
      const remainingOccurrences = Math.floor(daysUntilEnd / 7);
      nthOccurrence = remainingOccurrences === 0 ? 'last' : 'fourth';
    }
    
    console.log(`Today is ${weekday}, ${nthOccurrence} occurrence, day ${dayOfMonth} of the month`);

    // Assign different hero images to each template (cycle through available images)
    const heroImage1 = availableHeroImages.length > 0 ? availableHeroImages[0 % availableHeroImages.length] : null;
    const heroImage2 = availableHeroImages.length > 1 ? availableHeroImages[1 % availableHeroImages.length] : (availableHeroImages.length > 0 ? availableHeroImages[0] : null);
    const heroImage3 = availableHeroImages.length > 2 ? availableHeroImages[2 % availableHeroImages.length] : (availableHeroImages.length > 0 ? availableHeroImages[0] : null);

    // Template 1: Day of Month (matches today's day of month to generate event for today)
    const template1 = {
      title_template: 'Monthly Garden Work Day',
      naming_convention: 'title_month',
      recurrence_type: 'day_of_month',
      day_of_month: dayOfMonth, // Use today's day of month so it generates today
      start_time: '10:00:00.000',
      end_text: '2:00 PM',
      blurb: 'Join us for our monthly garden work day! We\'ll be doing general maintenance, planting, and community building.',
      content: '**Come help us maintain and improve our community garden. Activities include:**\n\n- Weeding and mulching\n- Planting new crops\n- General garden maintenance\n- Community building\n\nAll skill levels welcome! Tools and materials provided.',
      garden: garden.id,
      interest: 'Everyone',
      accessibility: 'Public',
      type: 'general',
      hero_image: heroImage1,
      is_active: true,
      first_occurrence_date: firstOccurrenceDate, // Set to yesterday so today is included
      max_future_instances: 3,
      publishedAt: new Date()
    };

    // Template 2: Nth Weekday (matches today's weekday and occurrence to generate event for today)
    const template2 = {
      title_template: 'Monthly Cleanup Day',
      naming_convention: 'title_nth_weekday',
      recurrence_type: 'nth_weekday',
      nth_occurrence: nthOccurrence, // Use calculated occurrence for today
      weekday: weekday, // Use today's weekday
      start_time: '09:30:00.000',
      end_text: 'around noon',
      blurb: `Join us for our monthly cleanup day on the ${nthOccurrence} ${weekday}!`,
      content: '**Help us keep the garden beautiful and well-maintained. We\'ll focus on:**\n\n- Cleaning up garden beds\n- Removing debris\n- Organizing tools and supplies\n- Preparing for the week ahead',
      garden: garden.id,
      interest: 'Everyone',
      accessibility: 'Public',
      type: 'cleanup',
      hero_image: heroImage2,
      is_active: true,
      first_occurrence_date: firstOccurrenceDate, // Set to yesterday so today is included
      max_future_instances: 3,
      publishedAt: new Date()
    };

    // Template 3: Another Nth Weekday pattern (e.g., Last Saturday Workshop)
    const template3 = {
      title_template: 'Monthly Workshop',
      naming_convention: 'title_month',
      recurrence_type: 'nth_weekday',
      nth_occurrence: 'last',
      weekday: 'Saturday',
      start_time: '14:00:00.000',
      end_text: '4:00 PM',
      blurb: 'Join us for our monthly educational workshop!',
      content: '**Learn new gardening skills and techniques.** This month\'s workshop topics vary and are announced closer to the date.\n\n**Previous workshops have covered:**\n\n1. Seed starting\n2. Composting\n3. Pest management\n4. Seasonal planting',
      garden: garden.id,
      interest: 'Events',
      accessibility: 'Public',
      type: 'workshop',
      hero_image: heroImage3,
      is_active: true,
      first_occurrence_date: firstOccurrenceDate,
      max_future_instances: 3,
      publishedAt: new Date()
    };

    const templates = [template1, template2, template3];
    const createdTemplates = [];

    // Create templates
    for (const templateData of templates) {
      // Check if template already exists (by title_template and garden)
      const existing = await strapi.entityService.findMany(
        'api::recurring-event-template.recurring-event-template',
        {
          filters: {
            title_template: templateData.title_template,
            garden: garden.id
          },
          limit: 1
        }
      );

      if (existing.length > 0) {
        console.log(`Template "${templateData.title_template}" already exists, skipping...`);
        createdTemplates.push(existing[0]);
        continue;
      }

      const created = await strapi.entityService.create(
        'api::recurring-event-template.recurring-event-template',
        {
          data: templateData,
          populate: ['garden', 'hero_image']
        }
      );

      createdTemplates.push(created);
      console.log(`Created template: ${created.title_template} (ID: ${created.id})`);
    }

    console.log(`Successfully created ${createdTemplates.length} recurring event templates for ${garden.title}`);
    return createdTemplates;
  } catch (error) {
    console.error('Error seeding recurring event templates:', error);
    throw error;
  }
}

module.exports = seedRecurringEventTemplates;
