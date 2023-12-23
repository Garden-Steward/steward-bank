
module.exports = {
  routes: [
    { // Path defined with an URL parameter
      method: 'POST',
      path: '/instructions/approve', 
      handler: 'instruction.approveTask',
    }
  ]
}