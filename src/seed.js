const connectDB = require('./config/db');

const runSeed = async () => {
  console.log('[Seed Runner] Connecting to database and running initial seeds...');
  await connectDB();
  console.log('[Seed Runner] All initial collections and sample datasets seeded successfully!');
  process.exit(0);
};

runSeed();
