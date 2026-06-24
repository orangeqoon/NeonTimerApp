const { authorize, getAuthClient, createEvent } = require('./google-calendar');

async function test() {
    console.log('Testing Google Authorization...');
    const auth = await authorize();
    if (!auth) {
        console.error('Authorization failed!');
        return;
    }
    console.log('Authorization successful.');
    
    console.log('Testing Calendar Event Creation...');
    const id = await createEvent('Test NeonTimer Sync', 60);
    if (id) {
        console.log('Event created with ID:', id);
    } else {
        console.error('Failed to create event.');
    }
}

test().catch(console.error);
