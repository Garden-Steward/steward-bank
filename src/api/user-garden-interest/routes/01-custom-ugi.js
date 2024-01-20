
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'POST',
      path: '/user-garden-interests/cleartemp', 
      handler: 'user-garden-interest.clearGardenTemp',
    }
  ]
}