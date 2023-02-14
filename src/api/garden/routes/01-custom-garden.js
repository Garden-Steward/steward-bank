
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'GET',
      path: '/gardens/:slug/full', 
      handler: 'garden.fullSlug',
    }
  ]
}