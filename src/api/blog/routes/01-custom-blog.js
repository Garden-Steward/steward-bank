
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'GET',
      path: '/blogs/:slug/full', 
      handler: 'blog.fullSlug',
    }
  ]
}