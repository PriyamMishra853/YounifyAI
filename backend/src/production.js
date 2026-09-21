// Entry for `npm run start:prod`: production settings without platform-specific env syntax.
process.env.NODE_ENV = 'production'
await import('./index.js')
