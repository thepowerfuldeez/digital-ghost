const MongoClient = require('mongodb').MongoClient;

module.exports = class {
    constructor(conf) {
        this.conf = conf;
    }

    async main() {
        console.log(new Date, 'init');
        await this.init();
        console.log(new Date, 'init DONE');

        console.log(new Date, 'loop');
        await this.loop();
        console.log(new Date, 'loop DONE');
    }

    async init() {
        console.log(new Date, 'init mongo');
        await this.initMongo();
        console.log(new Date, 'init mongo DONE');
    }

    initMongo() {
        return MongoClient.connect(this.conf.mongo.url, this.conf.mongo.options);
    }

    async loop() {
        while (true) {
            console.log(new Date, 'processing');
            await this.process();
            console.log(new Date, 'processing DONE');

            console.log(new Date, `waiting ${this.conf.sleepIntervalMs}ms`);
            await this.wait(this.conf.sleepIntervalMs);
            console.log(new Date, 'waiting DONE');
        }
    }

    async process() {
    }

    wait(timeMs) {
        return new Promise(resolve => {
            setTimeout(resolve, timeMs);
        });
    }
}
