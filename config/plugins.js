module.exports = ({ env }) => ({
  "users-permissions": {
    config: {
      jwtSecret: env('JWT_SECRET'),
    }
  },
  upload: {
    config: {
      provider: '@strapi-community/strapi-provider-upload-google-cloud-storage',
      providerOptions: {
          bucketName: 'steward_upload',
          publicFiles: true,
          uniform: false,
          basePath: 'uploads',
          serviceAccount: env('GOOGLE_CLOUD_CREDENTIALS'),
          baseUrl: 'https://storage.googleapis.com/steward_upload',
      },
    },
  },
  email: {
    config: {
      provider: 'sendgrid',
      providerOptions: {
        apiKey: env('SENDGRID_API_KEY'),
      },
      settings: {
        defaultFrom: 'no-reply@steward.garden',
        defaultReplyTo: 'no-reply@steward.garden',
      },
    },
  },
  slugify: {
    enabled: true,
    config: {
      contentTypes: {
        blog: {
          field: 'slug',
          references: 'title',
        },
        plant: {
          field: 'slug',
          references: 'title',
        },
        'volunteer-day': {
          field: 'slug',
          references: 'title',
        },
      },
    },
  },
})