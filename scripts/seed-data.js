const basicData = {
  // Users
  users: [
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
      email: "cameron@garden.com",
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
    }
  ],

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
    }
  ],

  // Recurring tasks
  recurringTasks: [
    {
      title: "Water Garden Beds",
      overview: "Water all garden beds thoroughly",
      type: "Water",
      complete_once: false,
      scheduler_type: "Weekly Shuffle",
      schedulers: [
        {
          day: "Tuesday"
        },
        {
          day: "Friday"
        }
      ]
    },
    {
      title: "Walk the Garden",
      overview: "Walk the garden and inspect the beds",
      type: "General",
      complete_once: true,
      scheduler_type: "Daily Primary",
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
    'api::volunteer-day.volunteer-day': ['create', 'find', 'findOne', 'update', 'getByUser', 'getByGarden', 'getPublic', 'rsvpEvent', 'testSms', 'groupSms'],
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
    'api::garden-task.garden-task': ['create', 'update', 'find', 'findOne']
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
    for (let i = 0; i < basicData.gardens.length; i++) {
      const created = await strapi.entityService.create('api::garden.garden', {
        data: {
          ...basicData.gardens[i],
          organization: organizations[i % organizations.length].id,
          managers: users.map(user => user.id), // Add both users as managers
          volunteers: users.map(user => user.id), // Add both users as volunteers
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

    // Seed plants
    console.log('Seeding plants...');
    for (const plant of basicData.plants) {
      await strapi.entityService.create('api::plant.plant', {
        data: {
          ...plant,
          publishedAt: new Date()
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
          await strapi.entityService.create('api::scheduler.scheduler', {
            data: {
              ...scheduler,
              recurring_task: createdTask.id,
              garden: gardens[0].id,
              volunteer: users[1].id, // Assign Sasha as the volunteer
              publishedAt: new Date()
            }
          });
        }
      }
    }

    // Seed volunteer days
    console.log('Seeding volunteer days...');
    const volunteerDays = [];
    for (const dayData of basicData.volunteerDays) {
      const created = await strapi.entityService.create('api::volunteer-day.volunteer-day', {
        data: {
          ...dayData,
          garden: gardens[0].id, // Assign to first garden
          confirmed: users.map(user => user.id), // Both users confirmed
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