
const weeklyScheduleHelper = {};


weeklyScheduleHelper.getAssignees = async ({id, schedulers})=> {
      // Logic for picking a volunteer out of a batch of volunteers.
      function chooseVolunteer(volunteers, {chosenArr, flatSchedulerList, lastWeekSchedulers}) {

        //Filter out previously chosen weekly schedulers.
        let weekPool = volunteers.filter(v=> !chosenArr.includes(v.id));
        //Filter out paused volunteers
        weekPool = weekPool.filter(v=> !v.paused);
  
        weekPool = weekPool.map(f=>{return f.id})
  
        // If any of the volunteers have only this day of schedulers add them once more
        const extraSolo = weekPool.filter((v)=> flatSchedulerList.filter(x => x==v).length == 1);
  
        // If any volunteer is NOT in last week add them once more
        const extraBenched = weekPool.filter(v=> lastWeekSchedulers.indexOf(v) == -1);
        
        weekPool = weekPool.concat(extraSolo,extraBenched)
        // console.log(extraBenched, lastWeekSchedulers, "weekPool: ", weekPool, "chosen: ", chosenArr)
  
        const randomIndex = Math.floor(Math.random() * weekPool.length);
        return weekPool[randomIndex];
      }
  
      let chosenArr = [] // tracks already chosen volunteers so we don't give them multiple days.

      let flatSchedulerList = schedulers.map((v)=> {
        return v.backup_volunteers.map((bv) => {return bv.id})
      }).flat(1)
      let lastWeekSchedulers = []
      try {
        const weeklySchedule = await strapi.service('api::weekly-schedule.weekly-schedule').getWeeklySchedule(id);
        if (weeklySchedule) {
          lastWeekSchedulers = weeklySchedule.assignees.map(a=> {return a.assignee.id})
        }
      } catch (err) {
        console.error(err);
      }
  
      let assignees = schedulers.map(s=> {
        let chosenIdx = chooseVolunteer(s.backup_volunteers, {chosenArr, flatSchedulerList, lastWeekSchedulers})
        chosenArr.push(chosenIdx)
        return {day: s.day, assignee: chosenIdx}
      })
      return assignees;
}
module.exports = weeklyScheduleHelper;

