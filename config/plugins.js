const path = require('path');

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
          // GCS_BUCKET / GCS_UNIFORM switch buckets without a code change.
          // Defaults are the legacy bucket (project wedding-315405, per-object ACLs).
          // New bucket: GCS_BUCKET=steward-uploads, GCS_UNIFORM=true (garden-steward,
          // uniform access with public read granted on the bucket).
          bucketName: env('GCS_BUCKET', 'steward_upload'),
          publicFiles: true,
          uniform: env.bool('GCS_UNIFORM', false),
          basePath: 'uploads',
          serviceAccount: env('GOOGLE_CLOUD_CREDENTIALS'),
          baseUrl: `https://storage.googleapis.com/${env('GCS_BUCKET', 'steward_upload')}`,
      },
    },
  },
  email: {
    config: {
      provider: path.resolve(__dirname, '..', 'src', 'providers', 'email-resend'),
      providerOptions: {
        apiKey: env('RESEND_API_KEY'),
      },
      settings: {
        defaultFrom: 'no-reply@steward.garden',
        defaultReplyTo: 'no-reply@steward.garden',
      },
    },
  },
})