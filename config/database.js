const path = require('path');

module.exports = {
  dbPath: path.join(__dirname, '..', 'database', 'mahjong.db'),
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'mahjong-secret-key-2024',
    algorithm: 'aes-256-cbc',
    ivLength: 16,
  },
  contactRetentionDays: 7,
};
