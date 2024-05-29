const vCards = require('vcards-js');

// Create contact card and save to assets folder
const twilioCard = vCards();
twilioCard.firstName = 'Garden Steward';
twilioCard.organization = 'Garden Steward';
twilioCard.photo.embedFromFile(`../public/gs-logo.png`);
twilioCard.workPhone = '510-519-3276';
twilioCard.type = 'text';
twilioCard.url = 'https://steward.garden/help';
twilioCard.saveToFile('../public/contactcard.vcf');