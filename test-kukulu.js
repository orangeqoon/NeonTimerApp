const kukuluApi = require('./kukulu');

console.log('--- Testing KukuluLIVE API Integration ---');
console.log('isConfigured():', kukuluApi.isConfigured());

if (!kukuluApi.isConfigured()) {
    console.log('kukulu-config.json is not configured yet (expected if user has not placed their API key).');
    console.log('Module syntax and methods loaded successfully.');
    process.exit(0);
}

// If configured, test fetching port info
kukuluApi.getPortInfo().then(info => {
    console.log('Kukulu Port Info:', info);
}).catch(err => {
    console.error('Kukulu Test Error:', err.message);
});
