const basicData = {
  // Categories for blog posts and content organization
  categories: [
    {
      title: "Garden Tips",
      description: "Tips and tricks for maintaining your garden"
    },
    {
      title: "Plant Care",
      description: "Information about caring for specific plants"
    },
    {
      title: "Community",
      description: "Community gardening and events"
    }
  ],

  // Interests for garden activities
  interests: [
    {
      tag: "meetings",
    },
    {
      tag: "watering",
    }
  ],

  // Organizations that manage gardens
  organizations: [
    {
      title: "Community Garden Network",
      url: "https://example.com/cgn",
      description: "Network of community gardens promoting urban agriculture"
    },
    {
      title: "Urban Farming Initiative",
      url: "https://example.com/ufi",
      description: "Supporting urban farming and community gardens"
    }
  ],

  // Gardens managed by organizations
  gardens: [
    {
      title: "Downtown Community Garden",
      slug: "downtown-garden",
      blurb: "A vibrant community garden in the heart of downtown",
      longitude: -122.3321,
      latitude: 47.6062,
      sms_slug: "gravity",
      welcome_text: "Welcome to our downtown garden community!"
    },
    {
      title: "Neighborhood Garden",
      slug: "neighborhood-garden",
      blurb: "A neighborhood garden bringing people together",
      longitude: -122.3340,
      latitude: 47.6085,
      sms_slug: "elder",
      welcome_text: "Welcome to our neighborhood garden!"
    }
  ],

  // Plants that can be grown in the gardens
  plants: [
    {
      title: "Tomato",
      description: "Easy to grow, productive vegetable",
      type: "annual",
      water_detail: "Regular watering, keep soil moist",
      sun_detail: "Full sun, 6-8 hours daily",
      slug: "tomato",
      latin: "Solanum lycopersicum"
    },
    {
      title: "Lavender",
      description: "Fragrant herb with beautiful flowers",
      type: "herb",
      water_detail: "Drought tolerant, minimal watering",
      sun_detail: "Full sun, well-draining soil",
      slug: "lavender",
      latin: "Lavandula"
    },
    // Common garden plants from user's gardens
    {
      title: "Apple",
      description: "Fruit tree providing apples in season",
      type: "perennial",
      water_detail: "Regular deep watering, especially in first years",
      sun_detail: "Full sun, 6-8 hours daily",
      slug: "apple",
      latin: "Malus domestica"
    },
    {
      title: "Lemon",
      description: "Citrus tree producing lemons",
      type: "perennial",
      water_detail: "Regular watering, allow soil to dry slightly between waterings",
      sun_detail: "Full sun, at least 6 hours daily",
      slug: "lemon",
      latin: "Citrus limon"
    },
    {
      title: "Mint",
      description: " Vigorous aromatic herb, great for teas and cooking",
      type: "herb",
      water_detail: "Likes consistently moist soil",
      sun_detail: "Partial shade to full sun",
      slug: "mint",
      latin: "Mentha"
    },
    {
      title: "Yerba Santa",
      description: "Native California plant, medicinal and ornamental",
      type: "shrub",
      water_detail: "Low water needs once established",
      sun_detail: "Full sun to partial shade",
      slug: "yerba-santa",
      latin: "Eriodictyon californicum"
    },
    {
      title: "Buena Nettle",
      description: "Native nettle plant, edible and medicinal",
      type: "perennial",
      water_detail: "Regular moisture",
      sun_detail: "Partial shade to full sun",
      slug: "buena-nettle",
      latin: "Urtica dioica"
    },
    {
      title: "Lemon Balm",
      description: "Lemon-scented herb in the mint family",
      type: "herb",
      water_detail: "Keep soil moderately moist",
      sun_detail: "Full sun to partial shade",
      slug: "lemon-balm",
      latin: "Melissa officinalis"
    },
    {
      title: "Passion Fruit",
      description: "Vining plant producing tropical fruit",
      type: "perennial",
      water_detail: "Regular watering during growing season",
      sun_detail: "Full sun to partial shade",
      slug: "passion-fruit",
      latin: "Passiflora"
    },
    {
      title: "Broccoli",
      description: "Cool-season vegetable, high nutrition",
      type: "annual",
      water_detail: "Consistent moisture, 1-2 inches per week",
      sun_detail: "Full sun, 6+ hours daily",
      slug: "broccoli",
      latin: "Brassica oleracea"
    },
    {
      title: "Cauliflower",
      description: "Cool-season cruciferous vegetable",
      type: "annual",
      water_detail: "Consistent moisture, avoid stress",
      sun_detail: "Full sun, 6+ hours daily",
      slug: "cauliflower",
      latin: "Brassica oleracea"
    },
    {
      title: "Collard",
      description: "Hardy leafy green, very nutritious",
      type: "annual",
      water_detail: "Regular watering",
      sun_detail: "Full sun to partial shade",
      slug: "collard",
      latin: "Brassica oleracea"
    },
    {
      title: "Kale",
      description: "Nutrient-dense leafy green, cold hardy",
      type: "annual",
      water_detail: "Regular watering for tender leaves",
      sun_detail: "Full sun to partial shade",
      slug: "kale",
      latin: "Brassica oleracea"
    }
  ],

  // Recurring tasks
  recurringTasks: [
    {
      title: "Water Garden Beds A",
      overview: "Water all garden beds thoroughly",
      type: "Water",
      complete_once: false,
      scheduler_type: "Weekly Shuffle",
      schedulers: [
        {
          day: "Tuesday",
          backup_volunteers: []  // Will be populated after users are defined
        },
        {
          day: "Friday",
          backup_volunteers: []  // Will be populated after users are defined
        }
      ]
    },
    {
      title: "Water Garden Beds B",
      overview: "Water all garden beds thoroughly",
      type: "Water",
      complete_once: true,
      scheduler_type: "Weekly Shuffle",
      schedulers: [
        {
          day: "Wednesday",
          backup_volunteers: []  // Will be populated after users are defined
        },
        {
          day: "Saturday",
          backup_volunteers: []  // Will be populated after users are defined
        }
      ]
    },
    {
      title: "Walk the Garden",
      overview: "Walk the garden and inspect the beds",
      type: "General",
      complete_once: true,
      scheduler_type: "No Schedule",
      schedulers: [
        {
          day: "Monday"
        }
      ]
    }
  ],

  // Add volunteer days
  volunteerDays: [
    {
      title: "Spring Planting Day",
      blurb: "Join us for our annual spring planting event!",
      content: "We'll be planting tomatoes, herbs, and preparing garden beds for the season.",
      startDatetime: new Date(2025, 3, 15, 10, 0), // April 15, 2025, 10:00 AM
      endText: "2:00 PM",
      disabled: false,
      interest: "Everyone",
      slug: "spring-planting-2025",
      accessibility: "Public",
      smsLink: true,
      planting: [
        {
          plant_name: "Tomato"
        },
        {
          plant_name: "Lavender"
        }
      ]
    },
    {
      title: "Garden Maintenance Day",
      blurb: "Help us maintain our beautiful garden spaces",
      content: "Activities include weeding, mulching, and general garden maintenance.",
      startDatetime: new Date(2025, 3, 22, 9, 0), // April 22, 2025, 9:00 AM
      endText: "1:00 PM",
      disabled: false,
      interest: "Everyone",
      slug: "maintenance-day-2025",
      accessibility: "Public",
      smsLink: true
    },
    // Event last week (7 days ago)
    {
      title: "Garden Cleanup Day",
      blurb: "Help us clean up the garden from the winter season",
      content: "We'll be removing dead plants, clearing paths, and preparing beds for spring planting.",
      startDatetime: (() => {
        const date = new Date();
        date.setDate(date.getDate() - 7);
        date.setHours(10, 0, 0, 0);
        return date;
      })(),
      endText: "3:00 PM",
      disabled: false,
      interest: "Volunteering",
      slug: "cleanup-day-past",
      accessibility: "Public",
      smsLink: true,
      type: "cleanup"
    },
    // Event next week (7 days from now)
    {
      title: "Seed Starting Workshop",
      blurb: "Learn how to start seeds indoors for your garden",
      content: "Join us for a hands-on workshop on seed starting techniques, soil preparation, and caring for young seedlings.",
      startDatetime: (() => {
        const date = new Date();
        date.setDate(date.getDate() + 7);
        date.setHours(2, 0, 0, 0); // 2:00 PM
        return date;
      })(),
      endText: "4:00 PM",
      disabled: false,
      interest: "Events",
      slug: "seed-workshop-next-week",
      accessibility: "Public",
      smsLink: true,
      type: "workshop",
      partiful_link: "https://partiful.com/e/i54N8BBwCO5aTSP73cRP"
    },
    // Event 1 month in the future
    {
      title: "Community Land Work Day",
      blurb: "Join us for a day of community land restoration",
      content: "We'll be working on trail maintenance, erosion control, and native plant restoration. Bring water and work gloves!",
      startDatetime: (() => {
        const date = new Date();
        date.setMonth(date.getMonth() + 1);
        date.setHours(9, 0, 0, 0);
        return date;
      })(),
      endText: "2:00 PM",
      disabled: false,
      interest: "Volunteering",
      slug: "land-work-month-1",
      accessibility: "Public",
      smsLink: true,
      type: "land_work"
    },
    // Event 2 months in the future
    {
      title: "Garden Art Installation",
      blurb: "Help create a community art installation in the garden",
      content: "We'll be creating mosaic pieces and installing them throughout the garden. No experience necessary!",
      startDatetime: (() => {
        const date = new Date();
        date.setMonth(date.getMonth() + 2);
        date.setHours(11, 0, 0, 0);
        return date;
      })(),
      endText: "3:00 PM",
      disabled: false,
      interest: "Events",
      slug: "art-installation-month-2",
      accessibility: "Public",
      smsLink: true,
      type: "art"
    }
  ],

  // Add weather events
  weather: [
    {
      weather_title: "Clear",
      description: "Clear sky",
      temp_min: 15.5,
      temp_max: 22.8,
      date: new Date(2025, 3, 15, 10, 0), // Matches first volunteer day
      dt: Math.floor(new Date(2025, 3, 15, 10, 0).getTime() / 1000),
      openweather_id: 800,
      json: {
        "main": {
          "temp": 19.2,
          "feels_like": 18.8,
          "humidity": 65
        },
        "weather": [{
          "id": 800,
          "main": "Clear",
          "description": "clear sky"
        }]
      }
    },
    {
      weather_title: "Clouds",
      description: "Partly cloudy",
      temp_min: 14.2,
      temp_max: 20.5,
      date: new Date(2025, 3, 22, 9, 0), // Matches second volunteer day
      dt: Math.floor(new Date(2025, 3, 22, 9, 0).getTime() / 1000),
      openweather_id: 801,
      json: {
        "main": {
          "temp": 17.4,
          "feels_like": 17.1,
          "humidity": 72
        },
        "weather": [{
          "id": 801,
          "main": "Clouds",
          "description": "partly cloudy"
        }]
      }
    }
  ]
};

// Add users after basicData initialization
basicData.users = [
  {
    username: "janedoe",
    email: "janedoe@garden.com",
    password: "test123",
    confirmed: true,
    blocked: false,
    firstName: "Jane",
    lastName: "Doe",
    phoneNumber: "+13038833330",
    status: "PROFESSIONAL",
    bio: "Garden steward and community organizer",
    color: "green"
  },
  {
    username: "cpres",
    email: "cameron@oufp.org",
    password: "test123",
    confirmed: true,
    blocked: false,
    firstName: "Cameron",
    lastName: "Preston",
    phoneNumber: "+13038833331",
    status: "VOLUNTEER",
    bio: "Passionate about urban gardening",
    color: "blue"
  },
  {
    username: "sasha",
    email: "sasha@garden.com",
    password: "test123",
    confirmed: true,
    blocked: false,
    firstName: "Sasha",
    lastName: "Dusky",
    phoneNumber: "+13038833332",
    status: "PROFESSIONAL",
    bio: "Garden steward and community organizer",
    color: "yellow"
  },
  {
    username: "johndoe",
    email: "johndoe@garden.com",
    password: "test123",
    confirmed: true,
    blocked: false,
    firstName: "John",
    color: "indigo",
    lastName: "Doe",
    phoneNumber: "+13038833333",
    status: "VOLUNTEER",
    bio: "Garden steward and community organizer",
  }
];

// Update backup volunteers in recurring tasks after users are defined
basicData.recurringTasks[0].schedulers[0].backup_volunteers = [
  basicData.users[1],
  basicData.users[2]
];
basicData.recurringTasks[0].schedulers[1].backup_volunteers = [
  basicData.users[0],
  basicData.users[2]
];
basicData.recurringTasks[1].schedulers[0].backup_volunteers = [
  basicData.users[3],
  basicData.users[1]
];
basicData.recurringTasks[1].schedulers[1].backup_volunteers = [
  basicData.users[0],
  basicData.users[3]
];

async function setupPermissions(strapi) {
  console.log('Setting up permissions...');
  
  // Find authenticated role
  const authenticatedRole = await strapi.query('plugin::users-permissions.role').findOne({
    where: { type: 'authenticated' }
  });

  // Define permissions for authenticated users
  const permissions = {
    'api::scheduler.scheduler': ['create', 'update', 'delete', 'find', 'findOne'],
    'api::garden.garden': ['find', 'findOne', 'update', 'fullSlug'],
    'api::recurring-task.recurring-task': ['create', 'find', 'findOne', 'update'],
    'api::recurring-event-template.recurring-event-template': ['create', 'find', 'findOne', 'update', 'delete', 'process', 'preview', 'processAll'],
    'api::volunteer-day.volunteer-day': ['create', 'find', 'findOne', 'update', 'getByUser', 'getByGarden', 'getPublic', 'getGardenMedia', 'rsvpEvent', 'testSms', 'groupSms'],
    'api::weather.weather': ['find', 'findOne'],
    'api::instruction.instruction': ['create', 'find', 'findOne', 'approveTask', 'update'],
    'api::sms-campaign.sms-campaign': ['find', 'findOne', 'getByGarden', 'groupSms', 'testSms'],
    'api::interest.interest': ['find', 'findOne'],
    'api::blog.blog': ['find', 'findOne', 'fullSlug'],
    'api::plant.plant': ['find', 'findOne', 'update'],
    'api::organization.organization': ['find', 'findOne'],
    'api::category.category': ['find', 'findOne', 'create', 'update', 'delete'],
    'api::message.message': ['fetchSms', 'fetchTaskMessages', 'requestEmail'],
    'api::user-garden-interest.user-garden-interest': ['create', 'update', 'clearGardenTemp', 'find', 'findOne', 'delete'],
    'plugin::users-permissions.user': ['find', 'findOne', 'update', 'me'],
    'api::garden-task.garden-task': ['create', 'update', 'find', 'findOne'],
    'plugin::upload.content-api': ['create', 'find', 'findOne', 'upload']
  };

  // Delete existing permissions for authenticated role
  const existingPermissions = await strapi.query('plugin::users-permissions.permission').findMany({
    where: {
      role: authenticatedRole.id
    }
  });

  for (const permission of existingPermissions) {
    await strapi.query('plugin::users-permissions.permission').delete({
      where: { id: permission.id }
    });
  }

  // Create new permissions
  for (const [contentType, actions] of Object.entries(permissions)) {
    for (const action of actions) {
      await strapi.query('plugin::users-permissions.permission').create({
        data: {
          action: `${contentType}.${action}`,
          role: authenticatedRole.id,
          enabled: true
        }
      });
    }
  }
}

async function cleanup(strapi) {
  console.log('Cleaning up existing data...');
  
  // Delete in reverse order of dependencies
  await strapi.db.query('api::scheduler.scheduler').deleteMany({
    where: {}
  });
  await strapi.db.query('api::recurring-task.recurring-task').deleteMany({
    where: {}
  });
  await strapi.db.query('api::garden.garden').deleteMany({
    where: {}
  });
  await strapi.db.query('api::organization.organization').deleteMany({
    where: {}
  });
  await strapi.db.query('api::plant.plant').deleteMany({
    where: {}
  });
  await strapi.db.query('api::interest.interest').deleteMany({
    where: {}
  });
  await strapi.db.query('api::category.category').deleteMany({
    where: {}
  });
  await strapi.db.query('plugin::users-permissions.user').deleteMany({
    where: {
      username: {
        $in: basicData.users.map(u => u.username)
      }
    }
  });
  await strapi.db.query('api::weather.weather').deleteMany({
    where: {}
  });
  await strapi.db.query('api::volunteer-day.volunteer-day').deleteMany({
    where: {}
  });
  await strapi.db.query('api::recurring-event-template.recurring-event-template').deleteMany({
    where: {}
  });
}

async function seedBasicData(strapi) {
  try {
    // Clean up existing data first
    await cleanup(strapi);
    
    // Set up permissions first
    await setupPermissions(strapi);
    
    console.log('Starting basic data seeding...');

    // Seed users first
    console.log('Seeding users...');
    const users = [];
    for (const userData of basicData.users) {
      const { password, ...data } = userData;
      const created = await strapi.entityService.create('plugin::users-permissions.user', {
        data: {
          ...data,
          provider: 'local',
          password,
          role: (await strapi.query('plugin::users-permissions.role').findOne({ where: { type: 'authenticated' } })).id
        }
      });
      users.push(created);
    }

    // Seed interests
    console.log('Seeding interests...');
    const interests = [];
    for (const interest of basicData.interests) {
      const created = await strapi.entityService.create('api::interest.interest', {
        data: {
          ...interest,
          publishedAt: new Date()
        }
      });
      interests.push(created);
    }

    // Seed categories
    console.log('Seeding categories...');
    for (const category of basicData.categories) {
      await strapi.entityService.create('api::category.category', {
        data: {
          ...category,
          publishedAt: new Date()
        }
      });
    }

    // Seed organizations
    console.log('Seeding organizations...');
    const organizations = [];
    for (const org of basicData.organizations) {
      const created = await strapi.entityService.create('api::organization.organization', {
        data: {
          ...org,
          publishedAt: new Date()
        }
      });
      organizations.push(created);
    }

    // Seed gardens with organization relationships
    console.log('Seeding gardens...');
    const gardens = [];
    // Ensure cameron@oufp.org is included as a manager (should be in users array)
    const cameronUser = users.find(user => user.email === 'cameron@oufp.org');
    if (!cameronUser) {
      console.warn('Warning: cameron@oufp.org not found in users array!');
    }
    
    for (let i = 0; i < basicData.gardens.length; i++) {
      const created = await strapi.entityService.create('api::garden.garden', {
        data: {
          ...basicData.gardens[i],
          organization: organizations[i % organizations.length].id,
          managers: users.map(user => user.id), // All users as managers, including cameron@oufp.org
          volunteers: users.map(user => user.id), // Add all users as volunteers
          publishedAt: new Date()
        }
      });
      gardens.push(created);
    }

    // Update users to include both gardens
    console.log('Updating users with garden relationships...');
    for (const user of users) {
      await strapi.entityService.update('plugin::users-permissions.user', user.id, {
        data: {
          gardens: gardens.map(garden => garden.id)
        }
      });
    }

    // Update interests to include both gardens
    console.log('Updating interests with garden relationships...');
    for (const interest of interests) {
      await strapi.entityService.update('api::interest.interest', interest.id, {
        data: {
          gardens: gardens.map(garden => garden.id)
        }
      });
    }

    // Seed plants and link to gardens
    console.log('Seeding plants...');
    const plants = [];
    for (const plant of basicData.plants) {
      const created = await strapi.entityService.create('api::plant.plant', {
        data: {
          ...plant,
          publishedAt: new Date()
        }
      });
      plants.push(created);
    }

    // Link plants to all gardens
    console.log('Linking plants to gardens...');
    for (const plant of plants) {
      await strapi.entityService.update('api::plant.plant', plant.id, {
        data: {
          gardens: {
            connect: gardens.map(garden => garden.id)
          }
        }
      });
    }

    // Seed recurring tasks and schedulers
    console.log('Seeding recurring tasks and schedulers...');
    for (const task of basicData.recurringTasks) {
      const { schedulers, ...taskData } = task;
      
      // Create recurring task
      const createdTask = await strapi.entityService.create('api::recurring-task.recurring-task', {
        data: {
          ...taskData,
          garden: gardens[0].id,
          publishedAt: new Date()
        }
      });

      // Create schedulers for the task if they exist
      if (schedulers && Array.isArray(schedulers)) {
        for (const scheduler of schedulers) {
          const { backup_volunteers, ...schedulerData } = scheduler;
          const createdScheduler = await strapi.entityService.create('api::scheduler.scheduler', {
            data: {
              ...schedulerData,
              recurring_task: createdTask.id,
              garden: gardens[0].id,
              volunteer: users[1].id, // Assign Sasha as the volunteer
              publishedAt: new Date()
            }
          });

          // If there are backup volunteers specified, create the relationships
          if (backup_volunteers && Array.isArray(backup_volunteers)) {
            for (const backupUser of backup_volunteers) {
              const userIndex = basicData.users.findIndex(u => u.username === backupUser.username);
              if (userIndex !== -1) {
                await strapi.entityService.update('api::scheduler.scheduler', createdScheduler.id, {
                  data: {
                    backup_volunteers: {
                      connect: [users[userIndex].id]
                    }
                  }
                });
              }
            }
          }
        }
      }
    }

    // Get available media images for hero images and featured galleries
    console.log('Getting available media images...');
    const knownMediaIds = [237, 24, 249, 250, 252, 253, 251, 247, 245];
    const availableMedia = [];
    for (const imageId of knownMediaIds) {
      try {
        const mediaFile = await strapi.entityService.findOne('plugin::upload.file', imageId);
        if (mediaFile) {
          availableMedia.push(imageId);
        }
      } catch (err) {
        // Skip if not found
      }
    }
    console.log(`Found ${availableMedia.length} available media images`);

    // Seed volunteer days
    console.log('Seeding volunteer days...');
    const volunteerDays = [];
    for (let i = 0; i < basicData.volunteerDays.length; i++) {
      const dayData = basicData.volunteerDays[i];
      
      // Vary hero images across volunteer days
      const heroImageIndex = i % availableMedia.length;
      const heroImage = availableMedia.length > 0 ? availableMedia[heroImageIndex] : null;
      
      // Add featured gallery to some volunteer days (every other one, starting with first)
      let featuredGallery = null;
      if (i % 2 === 0 && availableMedia.length >= 3) {
        const galleryStartIndex = (i + 1) % availableMedia.length;
        const galleryImages = [
          availableMedia[galleryStartIndex % availableMedia.length],
          availableMedia[(galleryStartIndex + 1) % availableMedia.length],
          availableMedia[(galleryStartIndex + 2) % availableMedia.length]
        ];
        featuredGallery = galleryImages;
      }
      
      const created = await strapi.entityService.create('api::volunteer-day.volunteer-day', {
        data: {
          ...dayData,
          garden: gardens[0].id, // Assign to first garden
          confirmed: users.map(user => user.id), // Both users confirmed
          hero_image: heroImage,
          featured_gallery: featuredGallery,
          publishedAt: new Date()
        }
      });
      volunteerDays.push(created);
    }

    // Seed weather data
    console.log('Seeding weather data...');
    for (const weatherData of basicData.weather) {
      await strapi.entityService.create('api::weather.weather', {
        data: {
          ...weatherData,
          publishedAt: new Date()
        }
      });
    }

    console.log('Basic data seeding completed successfully');
  } catch (error) {
    console.error('Error seeding basic data:', error);
    throw error;
  }
}

module.exports = seedBasicData; 