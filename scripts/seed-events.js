/**
 * Seed file for creating monthly volunteer day events
 * Creates 17 events, one for each month, on the 3rd Sunday of each month
 */

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

    // Get the "Downtown Community Garden" specifically
    const gardens = await strapi.entityService.findMany('api::garden.garden', {
      filters: {
        title: 'Downtown Community Garden'
      },
      limit: 1
    });

    if (gardens.length === 0) {
      console.error('Downtown Community Garden not found. Please seed gardens first.');
      throw new Error('Downtown Community Garden not found');
    }

    const garden = gardens[0];
    console.log(`Using garden: ${garden.title} (ID: ${garden.id})`);

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
      const slug = `${monthName.toLowerCase()}-3rd-sunday-${year}`.replace(/\s+/g, '-');

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
      const slug = `${monthName.toLowerCase()}-3rd-sunday-${year}`.replace(/\s+/g, '-');

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

    console.log(`Successfully created ${events.length} events (15 past, 2 future)`);
    return events;
  } catch (error) {
    console.error('Error seeding events:', error);
    throw error;
  }
}

module.exports = seedEvents;
