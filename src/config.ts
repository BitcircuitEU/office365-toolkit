import dotenv from 'dotenv';

dotenv.config();

export default {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || '8f7d3b2a1e6c9f0a4d5e2b7c8a3f6d9e0b1c4a7f2e5d8b3a6c9f0e1d4a7b2c5f8',
  cookieSecure: process.env.NODE_ENV === 'development'
};