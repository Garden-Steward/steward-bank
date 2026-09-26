/**
 * One-off: create the Franklin verge build-day tasks (voice memo, Sep 26 2026)
 * on volunteer day /d/1756 for project curb-cut-moat-and-little-free-library.
 *
 * Run against prod:   NODE_ENV=prod node scripts/import-franklin-verge-tasks.js
 * Preview only:       NODE_ENV=prod node scripts/import-franklin-verge-tasks.js --dry-run
 *
 * Safe to re-run: tasks whose title already exists on the day are skipped.
 */
const path = require("path");

// Strapi only reads a custom env file via ENV_PATH, so load .env.<NODE_ENV> ourselves
// before it boots. dotenv never overrides vars already set, so these win over .env.
if (process.env.NODE_ENV && process.env.NODE_ENV !== "development") {
  require("dotenv").config({ path: path.join(__dirname, `../.env.${process.env.NODE_ENV}`) });
}
// strapi.load() starts crons (SMS included) unless disabled.
process.env.CRON_ENABLED = "false";

const { createStrapi } = require("@strapi/strapi");

const DRY_RUN = process.argv.includes("--dry-run");
const GARDEN_SLUG = "franklin";
const VOLUNTEER_DAY_ID = 1756;
const PROJECT_SLUG = "curb-cut-moat-and-little-free-library";

// All Normal priority; the day sheet sorts by priority then id, so creation order = step order.
const TASKS = [
  {
    "title": "1. Move the wine barrels",
    "overview": "Roll the half barrels off the dig zone so the sod crew has open ground.",
    "max_volunteers": 2,
    "type": "General",
    "priority": "Normal",
    "task_status": "INITIALIZED",
    "complete_once": true,
    "current_section": "- Tip and roll the barrels, don't lift them full.\n- Park them out of the way of the dig and the sidewalk.",
    "tools_section": "- Gloves\n- Hand truck (if available)",
    "resources_section": ""
  },
  {
    "title": "2. Strip the sod",
    "overview": "Skim the top layer and pull all grass, roots included. Sod goes on a tarp, grass-side down.",
    "max_volunteers": 3,
    "type": "General",
    "priority": "Normal",
    "task_status": "INITIALIZED",
    "complete_once": true,
    "current_section": "- Cut under the roots with a flat spade and lift.\n- Keep the sidewalk clear.",
    "tools_section": "- Flat spades, mattock\n- Tarp, wheelbarrow",
    "resources_section": ""
  },
  {
    "title": "3. Dig the basin (north end)",
    "overview": "Dig the rain basin with gently sloped sides and a level, loosened bottom. Spoil builds the berm.",
    "max_volunteers": 3,
    "type": "General",
    "priority": "Normal",
    "task_status": "INITIALIZED",
    "complete_once": true,
    "current_section": "- Make a bowl, not a box.\n- Don't stand on the loosened bottom.\n- Line it up with the curb cut.",
    "tools_section": "- Shovels, digging bar, mattock\n- Level, wheelbarrow",
    "resources_section": ""
  },
  {
    "title": "4. Curb cut (saw crew)",
    "overview": "Wet-cut the inlet. Cones out, vests on, eye/ear/dust gear. Crisp cut sloped into the basin.",
    "max_volunteers": 2,
    "type": "General",
    "priority": "Normal",
    "task_status": "INITIALIZED",
    "complete_once": true,
    "current_section": "- One person on the saw, one on water and traffic watch.\n- Two parallel cuts, then break the block out.\n- Everyone else stays clear.",
    "tools_section": "- 14in gas cut-off saw + diamond blade\n- Water jug\n- Sledge, cold chisel\n- Cones, vests, PPE",
    "resources_section": ""
  },
  {
    "title": "5. Set stones and urbanite",
    "overview": "Flat urbanite splash pad at the inlet; round stones in a runnel into the basin and along the edge.",
    "max_volunteers": 2,
    "type": "General",
    "priority": "Normal",
    "task_status": "INITIALIZED",
    "complete_once": true,
    "current_section": "- Keep the cut opening itself clear.\n- Bury each stone at least half deep.",
    "tools_section": "- Stones and urbanite\n- Rubber mallet, trowel",
    "resources_section": ""
  },
  {
    "title": "6. Dig the west moat",
    "overview": "Shallow channel along the western passageway, graded toward the basin.",
    "max_volunteers": 2,
    "type": "General",
    "priority": "Normal",
    "task_status": "INITIALIZED",
    "complete_once": true,
    "current_section": "- Test the flow with a bucket of water.",
    "tools_section": "- Shovels, level, bucket",
    "resources_section": ""
  },
  {
    "title": "7. Little Library footing: 18in MAX",
    "overview": "Dig the footing for the cement block to 18in. PG&E limit due to high voltage nearby: do not go deeper.",
    "max_volunteers": 2,
    "type": "General",
    "priority": "Normal",
    "task_status": "INITIALIZED",
    "complete_once": true,
    "current_section": "- Mark 18in on a stick and check often.\n- Hand-dig the last few inches.\n- Hit anything that isn't soil or rock: stop and get the lead.",
    "tools_section": "- Post-hole digger, trowel\n- Marked depth stick",
    "resources_section": ""
  }
];

async function main() {
  const strapi = await createStrapi().load();
  console.log(`DB host: ${process.env.DATABASE_HOST}${DRY_RUN ? "  (dry run)" : ""}`);

  const day = await strapi.db.query("api::volunteer-day.volunteer-day").findOne({
    where: { id: VOLUNTEER_DAY_ID },
    populate: ["garden", "garden_tasks"],
  });
  if (!day) throw new Error(`Volunteer day ${VOLUNTEER_DAY_ID} not found`);
  if (day.garden?.slug !== GARDEN_SLUG) {
    throw new Error(`Day ${VOLUNTEER_DAY_ID} belongs to garden "${day.garden?.slug}", expected "${GARDEN_SLUG}"`);
  }
  console.log(`Day: ${day.title} (${day.startDatetime}), ${day.garden_tasks.length} existing tasks`);

  const existing = new Set(day.garden_tasks.map((t) => t.title));
  for (const task of TASKS) {
    if (existing.has(task.title)) {
      console.log(`skip (exists): ${task.title}`);
      continue;
    }
    if (DRY_RUN) {
      console.log(`would create: ${task.title}`);
      continue;
    }
    const created = await strapi.documents("api::garden-task.garden-task").create({
      data: { ...task, garden: day.garden.documentId, volunteer_day: day.documentId },
      status: "published",
    });
    console.log(`created id=${created.id}: ${task.title}`);
  }

  const project = await strapi.db.query("api::project.project").findOne({
    where: { slug: PROJECT_SLUG, publishedAt: { $notNull: true } },
    populate: ["related_events"],
  });
  if (!project) {
    console.warn(`Project "${PROJECT_SLUG}" not found`);
  } else if (project.related_events.some((e) => e.id === VOLUNTEER_DAY_ID)) {
    console.log(`Project already lists day ${VOLUNTEER_DAY_ID} in related_events`);
  } else {
    console.log(`Project does NOT list day ${VOLUNTEER_DAY_ID} in related_events (add it on the project page or in admin)`);
  }

  await strapi.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
