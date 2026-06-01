module.exports = {
  pgConnectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/mahjong',
  encryption: {
    key: process.env.ENCRYPTION_KEY || 'mahjong-secret-key-2024',
    algorithm: 'aes-256-cbc',
    ivLength: 16,
  },
  contactRetentionDays: 7,
  wechat: {
    appid: process.env.WECHAT_APPID || 'wxbe4bf89d21368018',
    secret: process.env.WECHAT_SECRET || '8f16da86ebd5414b135d760885d8e5f8',
  },
};
