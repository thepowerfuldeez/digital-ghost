const Publisher = require('./Publisher');
const conf = require('../conf.json');

const FALLBACK_TIMEOUT_MS = 1000;

const pub = new Publisher(conf);

pub.main().catch(error => {
    console.log(new Date, 'PANIC:', error);
    console.log(new Date, `fallback timeout before restart: ${FALLBACK_TIMEOUT_MS}ms`);

    setTimeout(() => {
        console.log(new Date, 'destroying');
        pub.destroy();
        process.exit(1);
    }, FALLBACK_TIMEOUT_MS);
});
