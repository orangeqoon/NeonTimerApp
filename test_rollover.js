const obsService = require('./obs-service');
const ytLive = require('./youtube-live');

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest() {
    console.log('--- Starting Rollover Standalone Test ---');
    
    // 1. Check YouTube Auth
    if (!ytLive.isConfigured()) {
        console.error('ERROR: YouTube auth not configured. Please authorize via NeonTimerApp first.');
        process.exit(1);
    }
    console.log('[Test] YouTube Auth is OK.');

    // 2. Connect to OBS
    console.log('[Test] Connecting to OBS...');
    const obsConnected = await obsService.connect();
    if (!obsConnected) {
        console.error('ERROR: Could not connect to OBS. Please start OBS and ensure WebSocket is running on localhost:4455.');
        process.exit(1);
    }
    console.log('[Test] OBS Connected.');

    // 3. Verify stream is active
    const status = await obsService.getStreamStatus();
    if (!status || !status.outputActive) {
        console.error('ERROR: OBS is not currently streaming. Please start streaming manually to test the rollover.');
        process.exit(1);
    }
    console.log(`[Test] OBS is currently streaming. Duration: ${status.outputDuration / 1000} seconds.`);

    console.log('\n[Test] Will execute rollover sequence in 5 seconds...');
    await sleep(5000);

    let isRollingOver = true; // Lock flag simulation
    try {
        console.log('\n--- EXECUTING ROLLOVER SEQUENCE ---');
        
        // 1. Stop OBS
        console.log('[Step 1] Stopping OBS Stream...');
        await obsService.stopStream();
        await sleep(2000); // Wait a bit for OBS to settle
        
        // 2. YouTube Rollover
        console.log('[Step 2] Executing YouTube Rollover (Complete -> Insert -> Bind)...');
        // Passing a test title to make it obvious
        const newTitle = `[Rollover Test] Stream Part 2 - ${new Date().toLocaleTimeString()}`;
        const newBroadcastId = await ytLive.rolloverBroadcast(newTitle, "This is an automated rollover test.");
        
        if (!newBroadcastId) {
            console.error('ERROR: YouTube rollover failed. Aborting.');
            process.exit(1);
        }
        
        console.log(`[Test] YouTube Rollover SUCCESS. New Broadcast ID: ${newBroadcastId}`);
        
        // 3. Wait for YouTube to be ready
        console.log('[Step 3] Waiting 15 seconds for YouTube stream ingestion to be ready...');
        for(let i=15; i>0; i--) {
            process.stdout.write(`${i}.. `);
            await sleep(1000);
        }
        console.log('\n');

        // 4. Start OBS
        console.log('[Step 4] Starting OBS Stream...');
        await obsService.startStream();
        
        console.log('\n--- ROLLOVER SEQUENCE COMPLETE ---');
        console.log('Please check YouTube Studio to confirm the stream is live on the new broadcast.');

    } catch (e) {
        console.error('\n[Test] FAILED during rollover sequence:', e);
    } finally {
        isRollingOver = false;
        await obsService.disconnect();
        process.exit(0);
    }
}

runTest();
