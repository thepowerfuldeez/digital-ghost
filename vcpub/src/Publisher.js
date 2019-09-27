const MongoClient = require("mongodb").MongoClient;
const fetch = require("node-fetch");

module.exports = class {
  constructor(conf) {
    this.conf = conf;
  }
  MongoClientMongoClient;
  async main() {
    console.log(new Date(), "init");
    await this.init();
    console.log(new Date(), "init DONE");

    console.log(new Date(), "loop");
    await this.loop();
    console.log(new Date(), "loop DONE");
  }

  async init() {
    console.log(new Date(), "init mongo");
    await this.initMongo();
    console.log(new Date(), "init mongo DONE");
  }

  initMongo() {
    return MongoClient.connect(this.conf.mongo.url, this.conf.mongo.options);
  }

  async loop() {
    while (true) {
      console.log(new Date(), "processing");
      await this.process();
      console.log(new Date(), "processing DONE");

      console.log(new Date(), `waiting ${this.conf.sleepIntervalMs}ms`);
      await this.wait(this.conf.sleepIntervalMs);
      console.log(new Date(), "waiting DONE");
    }
  }

  async process() {
    // await this.vcAuth();

    await this.vcCreatePost({
      title: "Команда Digital Ghost захватила власть в Боливии",
      text:
        '<p>Это текстовый блок.<br />Здесь работают мягкие переносы <i>строк</i> и <b>жирность</b> со <a href="https://ya.ru/" rel="nofollow noreferrer noopener" target="_blank">ссылками</a>.</p>'
    });
  }

  async vcCreatePost(post) {
    const apiPath = "/entry/create";

    const params = new URLSearchParams();

    params.append("title", post.title);
    params.append("subsite_id", this.conf.vcru.subsiteId);
    params.append("text", post.text);
    // params.append('attachments', JSON.stringify([ { type:'image',data:{.....} } ]));

    const result = await fetch(this.conf.vcru.apiHost + apiPath, {
      method: "POST",
      body: params,
      headers: {
        "X-Device-Token": this.conf.vcru.apiToken
      }
    }).then(res => res.json());

    console.log("result:", result);
  }

  async vcAuth() {
    let responseHeaders;

    const apiPath = "/auth/possess";

    const params = new URLSearchParams();

    params.append("id", this.conf.vcru.subsiteId);

    const result = await fetch(this.conf.vcru.apiHost + apiPath, {
      method: "POST",
      body: params,
      headers: {
        "X-Device-Token": this.conf.vcru.apiToken
      }
    }).then(res => {
      responseHeaders = res.headers.raw();
      return res.json();
    });

    // console.log('responseHeaders:', responseHeaders);
    // console.log('result:', result);

    const posToken = responseHeaders["X-Device-Possession-Token".toLowerCase()];

    return posToken;
  }

  wait(timeMs) {
    return new Promise(resolve => {
      setTimeout(resolve, timeMs);
    });
  }
};
