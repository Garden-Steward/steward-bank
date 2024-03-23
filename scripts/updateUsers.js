const fetch = require('node-fetch');
 // Your Strapi instance URL
const TOKEN = process.env.SCRIPT_TOKEN; // Your Strapi Personal Access Token

async function updateAllUserPasswords(newPassword) {
  // Fetch users

  const usersResponse = await fetch(`${process.env.API_URL}/users`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
    },
  });
  const users = await usersResponse.json();
  console.log('show users: ', users)
  // Update each user's password
  for (const user of users) {
    const userId = user.id;
    await fetch(`${process.env.API_URL}/users/${userId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${TOKEN}`,
      },
      body: JSON.stringify({
        blocked: false,
        provider: 'local',
      }),
    });
    console.log(`Password updated for user ${userId}`);
  }
}

updateAllUserPasswords('test123').catch(console.error);