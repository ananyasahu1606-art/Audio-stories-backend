const mongoose = require('mongoose');

async function main() {
  await mongoose.connect('mongodb://localhost:27017/audio_stories_db');
  const Plan = require('../src/models/Plan');
  const freePlan = await Plan.findOne({ price: 0 });
  if (freePlan) {
    console.log('Current free plan limits:', freePlan.planLimits);
    if (!freePlan.planLimits) freePlan.planLimits = {};
    freePlan.planLimits.downloadAllowed = false;
    freePlan.markModified('planLimits');
    await freePlan.save();
    console.log('Updated free plan limits:', freePlan.planLimits);
  }
  process.exit(0);
}

main();
