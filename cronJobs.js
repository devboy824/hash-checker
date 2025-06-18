const cron = require('node-cron');
const { exec } = require('child_process');
const path = require('path');

// Adjust path as needed for production structure on Render
const syncWorkerPath = 'workers/syncWorker.js';

console.log(syncWorkerPath)

cron.schedule('*/1 * * * *', () => {
  console.log('⏳ Running syncWorker...');
  exec(`node ${syncWorkerPath}`, (error, stdout, stderr) => {
    if (error) {
      console.error(`❌ Sync worker error: ${error.message}`);
    }
    if (stderr) {
      console.error(`⚠️ Sync worker stderr: ${stderr}`);
    }
    if (stdout) {
      console.log(`✅ Sync worker stdout: ${stdout}`);
    }
  });
});
