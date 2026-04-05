/**
 * One-off script to assign instruction 4 to garden task 253.
 * Run with: node scripts/assign-instruction.js
 */
const Strapi = require("@strapi/strapi");

async function main() {
  const instance = await Strapi().load();

  await instance.db.query("api::garden-task.garden-task").update({
    where: { id: 253 },
    data: { instruction: 4 },
  });

  console.log("Assigned instruction 4 to garden task 253");

  await instance.destroy();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
