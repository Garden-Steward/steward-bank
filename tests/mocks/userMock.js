module.exports = {
  user: {
    id: 3,
    username: "testUser",
    email: "test@example.com",
    provider: "local",
    password: "password123",
    paused: false,
    confirmed: true,
    blocked: false,
    status: "VOLUNTEER",
    phoneNumber: "555-123-4567",
    firstName: "Test",
    lastName: "User",
    bio: "This is a test user bio",
    color: "blue",
    // Relations would be populated with IDs or full objects depending on your needs
    role: 1,
    gardens: [1, 2],
    activeGarden: 1,
    u_g_interests: [1],
    instructions: [1],
    profilePhoto: {
      id: 1,
      name: "test-profile.jpg",
      url: "/uploads/test-profile.jpg"
    }
  }
} 