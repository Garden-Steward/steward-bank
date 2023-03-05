const { format } = require('date-fns');
const VdayHelper = {};

/***
 * Updates tasks like "yes" to find certain status Garden Tasks and update them.
 */
VdayHelper.buildDayCopy = (vDay) => {
  console.log(vDay);
  if (!vDay.garden) {
    return "This Volunteer Day is experiencing an issue with it's garden connection.";
  }
  let date = format(new Date(`${vDay.date} ${vDay.startTime}`),'MMM d');
  let startTime = format(new Date(`${vDay.date} ${vDay.startTime}`),'H:mma');
  let copy = `${vDay.garden.title} has an upcoming volunteer day! Come by for "${vDay.title}". ${vDay.blurb}. ${date}, ${startTime} to about noon.`
  return copy
}

module.exports = VdayHelper;