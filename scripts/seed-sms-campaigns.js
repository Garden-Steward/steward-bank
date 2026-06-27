// Seed data modeled on the real gravity-garden SMS campaign history.
// Bodies and types mirror production; users are mapped to seed user emails.

const campaignsByGarden = {
  'downtown-garden': [
    // Week 3 — most recent recurring-task assignment
    {
      type: "recurring-task",
      body: "You've been selected to 'Water the Garden' this week! \nTuesday: Jane D\nSaturday: Cameron P\nThursday: Sasha D. \nYou'll receive a reminder morning of where you can transfer if necessary.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(14, 0, 0, 0); return d; })(),
      sent_emails: ["janedoe@garden.com", "cameron@oufp.org", "sasha@garden.com"],
      confirmed_emails: []
    },
    // Week 2 — recurring-task assignment
    {
      type: "recurring-task",
      body: "You've been selected to 'Water the Garden' this week! \nTuesday: John D\nSaturday: Cameron P\nThursday: Jane D. \nYou'll receive a reminder morning of where you can transfer if necessary.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 14); d.setHours(14, 0, 0, 0); return d; })(),
      sent_emails: ["johndoe@garden.com", "cameron@oufp.org", "janedoe@garden.com"],
      confirmed_emails: []
    },
    // Week 1 — recurring-task assignment (oldest)
    {
      type: "recurring-task",
      body: "You've been selected to 'Water the Garden' this week! \nTuesday: Sasha D\nSaturday: John D\nThursday: Jane D. \nYou'll receive a reminder morning of where you can transfer if necessary.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 21); d.setHours(14, 0, 0, 0); return d; })(),
      sent_emails: ["sasha@garden.com", "johndoe@garden.com", "janedoe@garden.com"],
      confirmed_emails: []
    },
    // Volunteer-day reminder blast
    {
      type: "volunteer-day",
      body: "Tomorrow!! Downtown Community Garden has an event! All welcome at \"Spring Cleanup Day\". Join us for our monthly garden work day! We'll be planting, doing general upkeep, and working on some big projects. Come by from 9:30am to around noon.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 8); d.setHours(15, 6, 0, 0); return d; })(),
      sent_emails: ["janedoe@garden.com", "cameron@oufp.org", "sasha@garden.com", "johndoe@garden.com"],
      confirmed_emails: ["janedoe@garden.com", "sasha@garden.com"]
    },
    // Basic announcement blast
    {
      type: "basic",
      body: "Hey Downtown Community Garden! A quick reminder that the water shutoff valve near bed 3 is being replaced this Friday morning. Please avoid watering between 8–10am. Thanks for your patience!",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 30); d.setHours(10, 0, 0, 0); return d; })(),
      sent_emails: ["janedoe@garden.com", "cameron@oufp.org", "sasha@garden.com", "johndoe@garden.com"],
      confirmed_emails: []
    },
    // Recent poll — best day for a work party (still open, no winner yet)
    {
      type: "poll",
      body: "Help us pick the best day for the next work party!\nA) Saturday morning\nB) Sunday morning\nC) Saturday afternoon\nD) Sunday afternoon\nReply A, B, C, or D.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 45); d.setHours(9, 0, 0, 0); return d; })(),
      closes_at: (() => { const d = new Date(); d.setDate(d.getDate() - 38); d.setHours(23, 59, 0, 0); return d; })(),
      poll_options: { a: "Saturday morning", b: "Sunday morning", c: "Saturday afternoon", d: "Sunday afternoon" },
      winner: "a",
      sent_emails: ["janedoe@garden.com", "cameron@oufp.org", "sasha@garden.com", "johndoe@garden.com"],
      confirmed_emails: [],
      option_a_emails: ["cameron@oufp.org", "janedoe@garden.com"],
      option_b_emails: ["sasha@garden.com"],
      option_c_emails: [],
      option_d_emails: ["johndoe@garden.com"]
    },
    // Old closed poll with 5+ responses and users doubled across slots
    // cameron voted A then switched to C (appears in both)
    // janedoe voted A and also cast a B (doubled)
    // sasha voted B, johndoe voted B and D (doubled)
    // Total response entries: 7 across 4 unique voters
    {
      type: "poll",
      body: "What should be our next big garden project?\nA) Expand the fruit tree row\nB) Build a shade structure\nC) Install a second composting station\nD) Create a seed library\nReply A, B, C, or D.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 90); d.setHours(10, 0, 0, 0); return d; })(),
      closes_at: (() => { const d = new Date(); d.setDate(d.getDate() - 83); d.setHours(23, 59, 0, 0); return d; })(),
      poll_options: {
        a: "Expand the fruit tree row",
        b: "Build a shade structure",
        c: "Install a second composting station",
        d: "Create a seed library"
      },
      winner: "b",
      sent_emails: ["janedoe@garden.com", "cameron@oufp.org", "sasha@garden.com", "johndoe@garden.com"],
      confirmed_emails: [],
      // cameron voted A first, then switched to C → appears in both A and C
      option_a_emails: ["cameron@oufp.org", "janedoe@garden.com"],
      // janedoe doubled into B; sasha voted B; johndoe voted B
      option_b_emails: ["janedoe@garden.com", "sasha@garden.com", "johndoe@garden.com"],
      // cameron's final vote
      option_c_emails: ["cameron@oufp.org"],
      // johndoe also cast a D response
      option_d_emails: ["johndoe@garden.com"]
    }
  ],

  'neighborhood-garden': [
    // Week 3 — most recent recurring-task assignment
    {
      type: "recurring-task",
      body: "You've been selected to 'Water the Garden' this week! \nMonday: Sasha D\nThursday: John D. \nYou'll receive a reminder morning of where you can transfer if necessary.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 7); d.setHours(14, 0, 0, 0); return d; })(),
      sent_emails: ["sasha@garden.com", "johndoe@garden.com"],
      confirmed_emails: []
    },
    // Week 2 — recurring-task assignment
    {
      type: "recurring-task",
      body: "You've been selected to 'Water the Garden' this week! \nMonday: Jane D\nThursday: Sasha D. \nYou'll receive a reminder morning of where you can transfer if necessary.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 14); d.setHours(14, 0, 0, 0); return d; })(),
      sent_emails: ["janedoe@garden.com", "sasha@garden.com"],
      confirmed_emails: []
    },
    // Volunteer-day reminder blast
    {
      type: "volunteer-day",
      body: "Tomorrow!! Neighborhood Garden has an event! All welcome at \"Monthly Work Day\". Join us for our monthly garden work day! Come by from 10am to noon.",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 22); d.setHours(15, 0, 0, 0); return d; })(),
      sent_emails: ["sasha@garden.com", "johndoe@garden.com", "janedoe@garden.com"],
      confirmed_emails: ["sasha@garden.com", "johndoe@garden.com"]
    },
    // Basic announcement
    {
      type: "basic",
      body: "Hey Neighborhood Garden! Reminder: the tool shed combination has changed. Please see Sasha or John for the new code. Thanks!",
      createdAt: (() => { const d = new Date(); d.setDate(d.getDate() - 35); d.setHours(11, 0, 0, 0); return d; })(),
      sent_emails: ["sasha@garden.com", "johndoe@garden.com", "janedoe@garden.com", "cameron@oufp.org"],
      confirmed_emails: []
    }
  ]
};

async function seedSmsCampaigns(strapi) {
  try {
    console.log('Starting SMS campaigns seeding...');

    await strapi.db.query('api::sms-campaign.sms-campaign').deleteMany({ where: {} });

    const allUsers = await strapi.db.query('plugin::users-permissions.user').findMany();
    const userByEmail = Object.fromEntries(allUsers.map(u => [u.email, u]));

    const resolveUsers = (emails = []) =>
      emails.map(e => userByEmail[e]).filter(Boolean).map(u => u.id);

    let total = 0;
    for (const [gardenSlug, campaigns] of Object.entries(campaignsByGarden)) {
      const garden = await strapi.db.query('api::garden.garden').findOne({
        where: { slug: gardenSlug }
      });

      if (!garden) {
        console.warn(`Garden "${gardenSlug}" not found — skipping its campaigns`);
        continue;
      }

      for (const campaign of campaigns) {
        const {
          sent_emails,
          confirmed_emails,
          option_a_emails,
          option_b_emails,
          option_c_emails,
          option_d_emails,
          createdAt,
          closes_at,
          ...rest
        } = campaign;

        const created = await strapi.entityService.create('api::sms-campaign.sms-campaign', {
          data: {
            ...rest,
            garden: garden.id,
            sent: resolveUsers(sent_emails),
            confirmed: resolveUsers(confirmed_emails),
            option_a: resolveUsers(option_a_emails),
            option_b: resolveUsers(option_b_emails),
            option_c: resolveUsers(option_c_emails),
            option_d: resolveUsers(option_d_emails),
            closes_at: closes_at ?? null,
            publishedAt: new Date()
          }
        });

        // Backdate createdAt to simulate campaign history
        await strapi.db.query('api::sms-campaign.sms-campaign').update({
          where: { id: created.id },
          data: { createdAt }
        });

        total++;
      }
    }

    console.log(`SMS campaigns seeding completed — ${total} campaigns created`);
  } catch (error) {
    console.error('Error seeding SMS campaigns:', error);
    throw error;
  }
}

module.exports = seedSmsCampaigns;
