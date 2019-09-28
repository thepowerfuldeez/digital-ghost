const { MongoClient, ObjectID } = require('mongodb');
const VcruApi = require('./VcruApi');
const wait = require('./wait');

const URL_REGEX = /(https?:\/\/)?([^@:]:[^@:]+@)?([\-a-zа-яёЁ0-9\._]{1,256}\.[a-zа-яёЁ0-9\-]{2,24}|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(:[0-9]{1,5})?\/?([^\s]+)?/ig;
const URL_BAD_LAST_SYMBOLS_REGEX = /[\]\)\},\.:;\?\!"'\-]$/;

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
        this.mongo = {
            client: await this.initMongo(),
        };

        this.mongo.db = this.mongo.client.db(this.conf.mongo.db);
        this.mongo.posts = this.mongo.db.collection(this.conf.mongo.collections.posts);
        this.mongo.comments = this.mongo.db.collection(this.conf.mongo.collections.comments);
    }

    destroy() {
        console.log(new Date, 'closing mongo');
        this.mongo && this.mongo.client && this.mongo.client.close();
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
        const mongoPost = await this.bookLatestPostFromMongo();
        if (!mongoPost) return;

        console.log('using post mongoId=' + mongoPost._id);

        const comments = await this.bookCommentsFromMongoForPostId(mongoPost.id, 6);

        const commentsPerSection = Math.floor(comments.length / 2);
        const commentsLimit = commentsPerSection + (commentsPerSection*2===comments.length ? 0 : 1);

        const positiveComments = comments.slice(0, commentsLimit);
        const negativeComments = comments.slice(commentsLimit);

        if (!positiveComments.length && !negativeComments.length) {
            console.log('skip post:', mongoPost._id, 'no comments');
            await this.fallbackMongoPost(mongoPost._id, 'no_comments');
            return await this.process();
        }

        const vcPost = await this.mongoPostToVcPost(mongoPost, positiveComments, negativeComments);

        try {
            const pr = await this.vcruApi.createPost(vcPost);
            await this.updateMongoPostByVc(mongoPost._id, pr);
            await this.updateMongoCommentsBySuccess(positiveComments, negativeComments);
        } catch (error) {
            console.log('vc post error:', error);
            await this.fallbackMongoPost(mongoPost._id, error);
            await this.fallbackMongoComments(positiveComments, negativeComments);
        }
    }

    async updateMongoCommentsBySuccess(comments) {
        const _ids = comments.map(comment => new ObjectID(comment._id));

        await this.mongo.comments.updateMany({
            _id: { $in: _ids },
        }, {
            $set: {
                state: 'published',
            },
        });
    }

    async fallbackMongoComments(comments) {
        const _ids = comments.map(comment => new ObjectID(comment._id));

        await this.mongo.comments.updateMany({
            _id: { $in: _ids },
        }, {
            $set: {
                state: 'not_published',
            },
        });
    }

    async fallbackMongoPost(postMongoId, error) {
        const filter = {
            _id: new ObjectID(postMongoId),
        };

        const update = {
            $set: {
                state: 'pub_error',
                vcPubError: JSON.stringify(error),
            },
        };

        await this.mongo.posts.updateOne(filter, update);
    }

    async updateMongoPostByVc(postMongoId, vcPostData) {
        const filter = {
            _id: new ObjectID(postMongoId),
        };

        const update = {
            $set: {
                state: 'published',
                vcruId: vcPostData.id,
                vcruUrl: vcPostData.url,
                vcruPubDate: new Date,
            }
        };

        await this.mongo.posts.updateOne(filter, update);
    }

    /**
     * берет свежайший пост и бронирует его через state
     */
    async bookLatestPostFromMongo() {
        const filter = {
            state: 'not_published',
            'comments.count': { $gt: 0 },
        };

        const update = {
            $set: {
                state: 'publishing',
            },
        };

        const options = {
            sort: {
                _id: -1,
            },
            limit: 1,
        };

        const result = await this.mongo.posts.findOneAndUpdate(filter, update, options);

        return result.value;
    }

    async mongoPostToVcPost(mongoPost, positiveComments, negativeComments) {
        return {
            subsiteId: this.conf.vcru.subsite.id,
            title: this.detectTitleInMongoPost(mongoPost),
            // text: this.detectTextInMongoPost(mongoPost),
            attachments: this.detectAttachmentsInMongoPost(mongoPost),
            entry: await this.detectEntryInMongoPost(mongoPost, positiveComments, negativeComments),
        };
    }

    /**
     * берем первое предложение поста
     */
    detectTitleInMongoPost(mongoPost) {
        return mongoPost.title.replace(/https?:\/\/([a-zа-яёЁ]+)?$/i, '');

        // const text = String(mongoPost.text || '');

        // const sentenceSepExpr = /[\.\?\!\n]/;

        // const m = text.match(sentenceSepExpr);

        // if (m && m.index) {
        //     return text.substr(0, m.index).trim();
        // }

        // return text.substr(0, 128).trim();
    }

    async bookCommentsFromMongoForPostId(parsedPostId, limit) {
        const filter = {
            post_id: parsedPostId,
            state: 'not_published',
        };

        const options = {
            limit,
            sort: {
                popularity: -1,
            }
        };

        const result = await this.mongo.comments.find(filter, options).toArray();

        const _ids = result.map(comment => new ObjectID(comment._id));

        await this.mongo.comments.updateMany({
            _id: { $in: _ids },
        }, {
            $set: {
                state: 'publishing',
            },
        });

        return result;
    }

    async detectEntryInMongoPost(mongoPost, positiveComments, negativeComments) {
        const entry = {
            blocks: [],
        };

        const shortDescr = this.replaceUrls(mongoPost.description);

        entry.blocks.push({
            type: 'text',
            cover: true,
            data: {
                format: 'html',
                text: shortDescr,
                text_truncated: '<<<same>>>',
            },
        });

        const fullDescr = this.replaceUrls(mongoPost.text);

        entry.blocks.push({
            type: 'text',
            data: {
                format: 'html',
                text: fullDescr,
                text_truncated: '<<<same>>>',
            },
        });

        let items;

        if (positiveComments.length) {
            entry.blocks.push({
                type: 'header',
                anchor: 'positive',
                data: {
                    style: 'h4',
                    text: '<p>Позитивные мнения:</p>',
                },
            });

            items = positiveComments.map(comment => {
                comment.user = comment.user || {};
                const sourceUrl = comment.user.url || 'https://vk.com/id' + comment.owner_id;
                const sourceUrlShort = comment.user.first_name || 'Аноним';
                const text = comment.text || '?';

                return `<a href="${sourceUrl}" target="_blank">${sourceUrlShort}</a>: ${text}`;
            });

            entry.blocks.push({
                type: 'list',
                data: {
                    type: 'UL',
                    items,
                },
            });
        }

        if (negativeComments.length) {
            entry.blocks.push({
                type: 'header',
                anchor: 'negative',
                data: {
                    style: 'h4',
                    text: '<p>Негативные мнения:</p>',
                },
            });

            items = negativeComments.map(comment => {
                comment.user = comment.user || {};
                const sourceUrl = comment.user.url || 'https://vk.com/id' + comment.owner_id;
                const sourceUrlShort = comment.user.first_name || 'Аноним';
                const text = comment.text || '?';

                return `<a href="${sourceUrl}" target="_blank">${sourceUrlShort}</a>: ${text}`;
            });

            entry.blocks.push({
                type: 'list',
                data: {
                    type: 'UL',
                    items,
                },
            });
        }

        const sourceUrl = mongoPost.url;

        const sourceUrlShort = sourceUrl
            .replace(/^[a-z]+:\/\//i, '')
            .replace(/\?.*?$/, '');

        entry.blocks.push({
            type: 'text',
            anchor: 'source',
            data: {
                format: 'html',
                text: `<p>Источник: <a href="${sourceUrl}" target="_blank">${sourceUrlShort}</a></p>`,
                text_truncated: '<<<same>>>',
            },
        });

        return entry;
    }

    replaceUrls(text) {
        let m = text.replace(/<a\s+href=.*?>.*?<\/a>/gi, '').match(URL_REGEX);

        if (m) {
            let used = {};
            let shadow = '.'.repeat(text.length);

            if (m.length > 1) {
                m.sort(function(a,b) {
                    if (a > b) {
                        return -1;
                    } else if (a < b) {
                        return +1;
                    } else {
                        return 0;
                    }
                });
            }

            m.forEach(url => {
                // remove all html
                url = url.replace(/<\/?.*?\>/ig, '');

                // remove last punctuation sign
                let last = url.match(URL_BAD_LAST_SYMBOLS_REGEX);
                if (last && last[0].length == 1) {
                    url = url.slice(0, -1);
                }

                if (used[url]) { return }

                let lastPos = 0;

                while ( true ) {
                    let pos = text.indexOf(url, lastPos);
                    if (pos < 0) { break };

                    if (shadow.slice(pos, pos+1) === 'x') {
                        lastPos = pos + url.length;
                        continue;
                    }

                    let urlFull = (url.indexOf('http') === 0 || url.indexOf('//') === 0) ? url : '//';
                    let tag = `<a href="${urlFull}" target="_blank">${url}</a>`;

                    text = text.slice(0, pos) + tag + text.slice(pos + url.length);
                    shadow = shadow.slice(0, pos) + 'x'.repeat(tag.length) + shadow.slice(pos + url.length);

                    lastPos = pos + tag.length;
                }

                used[url] = true;
            });

            text = text.replace(/<a>/ig, '');
        }

        return text;
    }

    /**
     * отрезаем первое предложение поста
     */
    detectTextInMongoPost(mongoPost) {
        return this.replaceUrls(mongoPost.description)
            + '\n\n' + this.replaceUrls(mongoPost.text);

        // let text = String(mongoPost.text || '');

        // const title = this.detectTitleInMongoPost(mongoPost);

        // text = text.substr(title.length).replace(/^[\.\?\!\n]+/, '').trim();

        // return text;
    }

    detectAttachmentsInMongoPost(mongoPost) {
        const atts = [];

        let hasPhotos = false;
        let candidateLinkPhotoUrl;

        if (mongoPost.attachments && mongoPost.attachments.length) {
            mongoPost.attachments.forEach(attachment => {
                if (attachment.type === 'photo' && attachment.photo) {
                    const size = attachment.photo.sizes
                        && attachment.photo.sizes[attachment.photo.sizes.length-1];

                    if (size && size.url) {
                        atts.push({
                            type: 'photo',
                            url: size.url,
                        });
                        hasPhotos = true;
                    }
                } else if (attachment.type === 'link' && attachment.link) {
                    if (attachment.link.url) {
                        atts.push({
                            type: 'link',
                            url: attachment.link.url,
                        });
                    }

                    if (attachment.link.photo) {
                        const size = attachment.link.photo.sizes
                            && attachment.link.photo.sizes[attachment.link.photo.sizes.length-1];

                        if (size && size.url) {
                            candidateLinkPhotoUrl = size.url;
                        }
                    }
                }
            });
        }

        if (!hasPhotos && candidateLinkPhotoUrl) {
            atts.unshift({
                type: 'photo',
                url: candidateLinkPhotoUrl,
            });
        }

        return atts;
    }
}

// await this.vcruApi.possess(this.conf.vcru.subsite.id);

// await this.vcruApi.likePost(pr.id, 1);

// await this.vcruApi.likeComment(cr2.id, -1);

// const pr = await this.vcruApi.createPost({
//     subsiteId: this.conf.vcru.subsite.id,
//     title: 'Команда Digital Ghost захватила власть в ' + Math.random(),
//     text: 'Это текстовый блок.<br />Здесь работают мягкие переносы <i>строк</i> и <b>жирность</b> со <a href="https://ya.ru/" rel="nofollow noreferrer noopener" target="_blank">ссылками</a>.\nа еще есть параграфы\nлалала ' + Math.random(),
//     attachmentsUrls: [
//         'https://eki.one/etc/dg1.jpg',
//         'https://eki.one/etc/dg2.jpg',
//     ],
// });

// const cr = await this.vcruApi.createComment({
//     forPostId: pr.id,
//     text: 'Норм пост',
// });

// const cr2 = await this.vcruApi.createComment({
//     forPostId: pr.id,
//     forCommentId: cr.id,
//     text: 'Нет, не согласен',
// });
