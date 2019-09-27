const Publisher = require('./Publisher');
const conf = require('../conf.json');

const pub = new Publisher(conf);

pub.main().catch(err => {
    console.log('Error:', err);
    console.log('fallback timeout before restart: 1000ms');

    setTimeout(() => {
        console.log('restarting ...');
    }, 1000);
});
