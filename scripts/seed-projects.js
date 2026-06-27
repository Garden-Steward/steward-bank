const projectsData = [
  {
    title: "Rainwater Harvesting System",
    slug: "rainwater-harvesting",
    date_start: "2024-09-01",
    date_end: "2024-11-15",
    short_description: "Installed a 500-gallon rainwater collection system to reduce municipal water dependency for garden irrigation.",
    description: "## Overview\n\nThe downtown garden's water bills were climbing every summer. This project designed and installed two 250-gallon collection barrels fed from the tool shed roof, with gravity-fed drip lines to the main vegetable beds.\n\n## What We Built\n\n- Guttered the tool shed roof and installed downspout diverters\n- Set two 250-gallon food-grade barrels on cinder-block platforms\n- Ran ¾\" PVC headers to the main raised beds\n- Added a first-flush diverter to keep debris out of the tanks\n\n## Results\n\nFirst season we offset roughly 30% of summer irrigation from the tap. The overflow valve routes excess into a small swale that waters the fruit tree row.",
    volunteer_count: 8,
    hours_contributed: 62,
    category: "Infrastructure",
    featured: true,
    withPhotos: true,  // hero + gallery
    impact_metrics: [
      { label: "Water saved (gal/season)", value: "~4,200", icon: "💧" },
      { label: "Volunteers", value: "8", icon: "🙌" },
      { label: "Build days", value: "3", icon: "📅" }
    ]
  },
  {
    title: "Pollinator Garden Expansion",
    slug: "pollinator-garden",
    date_start: "2025-03-15",
    date_end: null,
    short_description: "Transforming the unused south slope into a native pollinator habitat with milkweed, poppies, and flowering perennials.",
    description: "## Why Pollinators?\n\nThe vegetable yields in beds 4–6 were noticeably lower than earlier seasons. After a quick survey we counted very few bee visits compared to the north beds near the existing flowering herbs. The south slope — about 400 sq ft of compacted clay — was sitting unused.\n\n## Plan\n\n1. Sheet mulch the slope to smother Bermuda grass\n2. Amend with compost and biochar\n3. Plant a mix of native annuals and perennials: California poppy, blue-eyed grass, milkweed, yarrow, buckwheat, and phacelia\n4. Install a small bee hotel on the fence post\n\n## Status\n\nSheet mulching complete. First planting day added ~200 plugs and a pound of direct-seeded annuals. Second planting day scheduled for next month to finish the perennial layer.",
    volunteer_count: 14,
    hours_contributed: 38,
    category: "Planting",
    featured: true,
    withPhotos: true,  // hero + gallery
    impact_metrics: [
      { label: "Area planted (sq ft)", value: "400", icon: "🌻" },
      { label: "Native species", value: "12", icon: "🌿" },
      { label: "Volunteer hours", value: "38+", icon: "⏱️" }
    ]
  },
  {
    title: "Garden Entry Mural",
    slug: "entry-mural",
    date_start: "2025-06-01",
    date_end: "2025-07-20",
    short_description: "A community-designed mural on the main entry wall celebrating the neighborhood's food growing history.",
    description: "## The Wall\n\nThe cinder-block wall at the main entrance had been tagged repeatedly. Rather than keep painting it grey, we partnered with a local muralist and opened the design to garden members.\n\n## Process\n\n- Two community design sessions to gather imagery and themes\n- Muralist created a composite sketch blending member contributions\n- Four weekend painting days open to all skill levels\n- Final sealing and lighting installation\n\n## Themes\n\nThe mural depicts hands in soil, the local watershed, seasonal produce, and portraits of long-time garden stewards. Text in the border reads: *\"Tended by many hands.\"*",
    volunteer_count: 22,
    hours_contributed: 110,
    category: "Art",
    featured: false,
    withPhotos: true,  // hero + gallery
    impact_metrics: [
      { label: "Wall area (sq ft)", value: "180", icon: "🎨" },
      { label: "Community artists", value: "22", icon: "👥" },
      { label: "Paint days", value: "4", icon: "🖌️" }
    ]
  },
  {
    title: "Composting Infrastructure Upgrade",
    slug: "compost-upgrade",
    date_start: "2024-04-10",
    date_end: "2024-05-30",
    short_description: "Replaced the collapsing single-bin pile with a three-bay pallet system and a hot-compost thermometer monitoring protocol.",
    description: "## Problem\n\nThe old pile was a tangle of wire fencing that kept falling over. Turning it required dismantling it entirely. Members were quietly dropping yard waste off-site rather than fight with it.\n\n## Solution\n\nThree-bay pallet system: active pile, turning bay, and finished compost ready for use. Pallets were donated by a local hardware store. We added a dedicated greens/browns sign, a thermometer post, and a simple log sheet so we can tell when the pile is actually cooking.\n\n## Outcome\n\nCompost output doubled in the first season. The finished bay now supplies roughly two cubic yards per month during the growing season, reducing the need for purchased amendments.",
    volunteer_count: 6,
    hours_contributed: 28,
    category: "Infrastructure",
    featured: false,
    withPhotos: false,
    impact_metrics: [
      { label: "Compost bays", value: "3", icon: "♻️" },
      { label: "Cubic yards/month", value: "~2", icon: "🌱" },
      { label: "Build days", value: "2", icon: "📅" }
    ]
  }
];

/**
 * Probe a list of known production IDs first, then fall back to any files
 * that were created by seed-media.js (lowest IDs in the DB).
 */
async function resolveAvailableMedia(strapi) {
  const knownProductionIds = [237, 24, 249, 250, 252, 253, 251, 247, 245];
  const found = [];

  for (const id of knownProductionIds) {
    try {
      const file = await strapi.entityService.findOne('plugin::upload.file', id);
      if (file) found.push(id);
    } catch (_) { /* not present */ }
  }

  if (found.length >= 3) return found;

  // Fall back: grab the first 9 uploaded files by ID
  const files = await strapi.db.query('plugin::upload.file').findMany({
    orderBy: { id: 'asc' },
    limit: 9
  });
  return files.map(f => f.id);
}

async function seedProjects(strapi) {
  try {
    console.log('Starting projects seeding...');

    await strapi.db.query('api::project.project').deleteMany({ where: {} });

    const garden = await strapi.db.query('api::garden.garden').findOne({
      where: { slug: 'downtown-garden' }
    });

    if (!garden) {
      console.warn('Downtown Community Garden not found — skipping projects seed');
      return;
    }

    const media = await resolveAvailableMedia(strapi);
    console.log(`Projects seed: found ${media.length} media file(s) for photos`);

    let photoIndex = 0;

    for (const project of projectsData) {
      const { withPhotos, ...projectData } = project;

      let hero_image = null;
      let featured_gallery = null;

      if (withPhotos && media.length > 0) {
        hero_image = media[photoIndex % media.length];
        photoIndex++;

        if (media.length >= 2) {
          featured_gallery = [
            media[photoIndex % media.length],
            media[(photoIndex + 1) % media.length],
          ];
          if (media.length >= 3) {
            featured_gallery.push(media[(photoIndex + 2) % media.length]);
          }
          photoIndex++;
        }
      }

      await strapi.entityService.create('api::project.project', {
        data: {
          ...projectData,
          garden: garden.id,
          hero_image,
          featured_gallery,
          publishedAt: new Date()
        }
      });
    }

    const withPhotosCount = projectsData.filter(p => p.withPhotos).length;
    console.log(`Projects seeding completed — ${projectsData.length} projects created (${withPhotosCount} with photos)`);
  } catch (error) {
    console.error('Error seeding projects:', error);
    throw error;
  }
}

module.exports = seedProjects;
