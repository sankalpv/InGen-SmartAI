import { startBackgroundAgent } from '../services/background-agent.js';

// Manually trigger the agent logic (simulated by importing and waiting)
console.log('Starting Background Agent Test...');
startBackgroundAgent();

// Keep alive for a minute to let the first sync run
setTimeout(() => {
    console.log('Test complete. Exiting.');
    process.exit(0);
}, 60000);
