const MongoClient = require('mongodb').MongoClient;
const VcruApi = require('./VcruApi');
const wait = require('./wait');

module.exports = class {
    constructor(conf) {
        this.conf = conf;
        this.vcruApi = new VcruApi(conf.vcru.api);
    }

    async main() {
        console.log(new Date, 'init');
        await this.init();

        console.log(new Date, 'loop');
        await this.loop();
    }

    async init() {
        console.log(new Date, 'init mongo');
        this.mongo = await this.initMongo();
    }

    destroy() {
        console.log(new Date, 'closing mongo');
        this.mongo && this.mongo.close();
    }

    initMongo() {
        return MongoClient.connect(this.conf.mongo.url, this.conf.mongo.options);
    }

    async loop() {
        while (true) {
            console.log(new Date, 'processing');
            await this.process();

            console.log(new Date, `waiting ${this.conf.sleepIntervalMs}ms`);
            await wait(this.conf.sleepIntervalMs);
        }
    }

    async process() {
        try {
            // await this.vcruApi.possess(this.conf.vcru.subsite.id);

            const pr = await this.vcruApi.createPost({
                subsiteId: this.conf.vcru.subsite.id,
                title: 'Команда Digital Ghost захватила власть в Боливии r:' + Date.now(),
                text: 'Это текстовый блок.<br />Здесь работают мягкие переносы <i>строк</i> и <b>жирность</b> со <a href="https://ya.ru/" rel="nofollow noreferrer noopener" target="_blank">ссылками</a>.\nа еще есть параграфы\nлалала r:' + Date.now(),
            });

            const cr = await this.vcruApi.createComment({
                forPostId: pr.id,
                text: 'Норм пост! r:' + Date.now(),
            });

            const cr2 = await this.vcruApi.createComment({
                forPostId: pr.id,
                forCommentId: cr.id,
                text: 'Нет, не согласен. r:' + Date.now(),
            });

            await this.vcruApi.likePost(pr.id, 1);

            await this.vcruApi.likeComment(cr2.id, -1);
        } catch (err) {
            console.log('catch err:', err);
        }
    }
}
