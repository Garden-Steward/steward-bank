# Garden Steward

A comprehensive community garden management system built with Strapi. Garden Steward helps organizations manage gardens, coordinate volunteers, schedule tasks, and track activities through SMS and web interfaces.

## Features

- **Garden Management**: Create and manage multiple community gardens with location tracking
- **Task Scheduling**: Recurring and one-time garden tasks with volunteer assignment
- **Volunteer Coordination**: Manage volunteers, interests, and garden assignments
- **SMS Integration**: Twilio integration for SMS notifications and communication
- **Weather Integration**: OpenWeatherMap integration for weather-aware task management
- **Content Management**: Blog posts, plant information, and educational content
- **Organization Management**: Multi-organization support for managing multiple garden groups
- **Volunteer Days**: Event management for volunteer workdays with RSVP functionality
- **Media Management**: Google Cloud Storage integration for image and file uploads
- **Mapping Features**: Optional Google Maps integration for location tracking

## Tech Stack

- **Backend**: Strapi 4.25.22
- **Database**: PostgreSQL (production), SQLite (development/testing)
- **Storage**: Google Cloud Storage
- **Email**: SendGrid
- **SMS**: Twilio
- **Weather**: OpenWeatherMap API
- **Maps**: Google Maps Platform (optional)

## Prerequisites

- Node.js >= 16 <= 20.x.x
- npm >= 6.0.0
- PostgreSQL (for production)
- Google Cloud Storage account (for media uploads)
- Twilio account (for SMS features)
- SendGrid account (for email)
- OpenWeatherMap API key (for weather features)
- Google Maps API key (optional, for mapping features)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/cpres/steward-bank.git
cd steward-bank
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Run database migrations (if needed):
```bash
npm run develop
```

5. Seed initial data (optional):
```bash
npm run seed
```

## Configuration

See `.env.example` for all required environment variables. Key configuration includes:

- Database connection settings
- JWT secrets for authentication
- Google Cloud Storage credentials
- Twilio credentials for SMS
- SendGrid API key for emails
- OpenWeatherMap API key
- Google Maps API key (optional)

## Development

Start the development server:
```bash
npm run develop
```

The admin panel will be available at `http://localhost:1337/admin`

## Testing

Run the test suite:
```bash
npm test
```

## Building

Build the admin panel for production:
```bash
npm run build
```

## Deployment

Deploy to Fly.io:
```bash
npm run deploy
```

Or start the production server:
```bash
npm start
```

## Project Structure

```
steward-bank/
├── config/              # Configuration files
│   ├── admin.js        # Admin panel configuration
│   ├── database.js      # Database configuration
│   ├── plugins.js      # Plugin configuration
│   └── server.js       # Server configuration
├── src/
│   ├── api/            # API endpoints and content types
│   ├── components/     # Reusable components
│   └── extensions/     # Strapi extensions
├── database/           # Database migrations
├── scripts/            # Utility scripts
├── tests/              # Test files
└── public/             # Public assets
```

## API Content Types

The application includes the following main content types:

- **Garden**: Community garden information and location
- **Garden Task**: Individual tasks within gardens
- **Recurring Task**: Recurring task templates with scheduling
- **Volunteer Day**: Event management for volunteer workdays
- **Plant**: Plant information and growing guides
- **Blog**: Blog posts and educational content
- **Organization**: Organization management
- **User Garden Interest**: User interest tracking
- **Message**: SMS and email message handling
- **Weather**: Weather data integration

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

For issues and questions, please open an issue on GitHub.

## Acknowledgments

- Built with [Strapi](https://strapi.io/)
- Weather data provided by [OpenWeatherMap](https://openweathermap.org/)
- SMS services by [Twilio](https://www.twilio.com/)
