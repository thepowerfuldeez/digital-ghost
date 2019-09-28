const { MongoClient, ObjectID } = require('mongodb');

const VcruApi = require('./VcruApi');
const wait = require('./wait');
const rnd = require('./rnd');
const replaceUrls = require('./replaceUrls');

const STATUS_NOT_PUBLISHED = 'not_published'; // or $exists:false
const STATUS_PUBLISHING = 'publishing';
const STATUS_PUBLISHED = 'published';

module.exports = class {
    constructor(conf) {
        this.conf = conf;
        this.vcruApi = new VcruApi(conf.vcru.api);
    }

    async main() {
        await this.init();
        await this.loop();
    }

    async init() {
        this.mongo = {
            client: await this.initMongoClient(),
        };

        this.initMongoResources();
    }

    destroy() {
        console.log(new Date, 'closing mongo');

        this.mongo && this.mongo.client && this.mongo.client.close();
    }

    initMongoClient() {
        console.log(new Date, 'init mongo');

        return MongoClient.connect(this.conf.mongo.url, this.conf.mongo.options);
    }

    initMongoResources() {
        this.mongo.db = this.mongo.client.db(this.conf.mongo.db);

        Object.keys(this.conf.mongo.collections).forEach(key => {
            if (key === 'db') {
                throw 'mongo collection name "db" is not allowed';
            }

            this.mongo[key] = this.mongo.db.collection(this.conf.mongo.collections[key]);
        });
    }

    async loop() {
        while (true) {
            try {
                await this.process();

                this.successTrend();
                this.successPost();
                this.successComments();
            } catch (error) {
                console.log(new Date, 'Error:', error);

                this.failTrend();
                this.failPost();
            }

            console.log(new Date, `iteration wait ${this.conf.sleepIntervalMs}ms`);
            await wait(this.conf.sleepIntervalMs);
        }
    }

    async bookTopTrend() {
        console.log(new Date, 'booking trend');

        const filter = {
            state: { $nin: [STATUS_PUBLISHING, STATUS_PUBLISHED] },
        };

        const update = {
            $set: {
                state: STATUS_PUBLISHING,
            },
        };

        const options = {
            sort: {
                _id: -1, // latest
            },
            limit: 1,
        };

        const result = await this.mongo.trends.findOneAndUpdate(filter, update, options);

        return result.value;
    }

    getPostPidFromTrend(trend) {
        const postPids = trend.post_ids;

        if (postPids && postPids.length) {
            return postPids[rnd(0, postPids.length - 1)];
        }
    }

    async bookPostByPid(postPid) {
        console.log(new Date, 'booking post by postPid:', postPid);

        const filter = {
            id: postPid,
            state: { $nin: [STATUS_PUBLISHING, STATUS_PUBLISHED] },
        };

        const update = {
            $set: {
                state: STATUS_PUBLISHING,
            },
        };

        const options = {
            limit: 1,
        };

        const result = await this.mongo.posts.findOneAndUpdate(filter, update, options);

        return result.value;
    }

    async getCommentsByPostPid(postPid, limit) {
        console.log(new Date, 'searching for comments by postPid:', postPid);

        const filter = {
            post_id: postPid,
            state: { $nin: [STATUS_PUBLISHING, STATUS_PUBLISHED] },
        };

        const options = {
            limit,
            sort: {
                popularity: -1, // more is first
            },
        };

        const result = await this.mongo.comments.find(filter, options).toArray();

        return result;
    }

    vcPostAttachments(mongoPost) {
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

    async createVcPost(post, commentsGood, commentsBad) {
        return {
            subsiteId: this.conf.vcru.subsite.id,
            title: this.vcPostTitle(post),
            entry: await this.vcPostEntry(post, commentsGood, commentsBad),
            attachments: this.vcPostAttachments(mongoPost),
        };
    }

    vcPostTitle(post) {
        return post.title || 'NO TITLE';
    }

    async vcPostEntry(post, commentsGood, commentsBad) {

    }

    async process() {
        const trend = await this.bookTopTrend();
        if (!trend) throw 'no trends left';

        this.bookedTrendId = trend._id;
        console.log(new Date, 'bookedTrendId:', this.bookedTrendId);

        const postPid = this.getPostPidFromTrend(trend);
        if (!postPid) throw 'cant detect postPid';

        console.log(new Date, 'postPid:', postPid);

        const post = await this.bookPostByPid(postPid);
        if (!post) throw 'post not found or already booked';

        this.bookedPostId = post._id;
        console.log(new Date, 'bookedPostId:', this.bookedPostId);

        // 3 for good, 3 for bad
        const comments = await this.getCommentsByPostPid(postPid, 6);
        const commentsPerSection = Math.ceil(comments.length / 2);
        const commentsGood = comments.slice(0, commentsPerSection);
        const commentsBad = comments.slice(commentsPerSection);

        this.bookedCommentsIds = comments.map(comment => new ObjectID(comment._id));

        console.log(new Date, 'comments:', comments.length);
        console.log(new Date, 'commentsGood:', commentsGood.length);
        console.log(new Date, 'commentsBad:', commentsBad.length);
        console.log(new Date, 'bookedCommentsIds:', this.bookedCommentsIds);

        const vcPost = await this.createVcPost(post, commentsGood, commentsBad);

        console.log('vcPost:', vcPost);
        process.exit(1);

        try {
            const pr = await this.vcruApi.createPost(vcPost);
            await this.updateMongoPostByVc(mongoPost._id, pr);
            await this.updateMongoCommentsBySuccess(positiveComments, negativeComments);
        } catch (error) {
            console.log(new Date, 'vc post error:', error);
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
                state: 'not_published',
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

    async bookLatestPostFromMongo() {
        const filter = {
            state: { $exists: false },
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

        const result = await this.mongo.trends.findOneAndUpdate(filter, update, options);

        const parsedPostsIds = result && result.value && result.value.post_ids;
        if (!parsedPostsIds) return;

        const parsedPostId = parsedPostsIds[rnd(0, parsedPostsIds.length - 1)];
        const post = await this.mongo.posts.findOne({ id:parsedPostId });

        console.log(new Date, 'post:', post);
        process.exit(1);
    }



    detectTitleInMongoPost(mongoPost) {
        return mongoPost.title.replace(/https?:\/\/([a-zа-яёЁ]+)?$/i, '').trim();

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

        const shortDescr = replaceUrls(mongoPost.description);

        entry.blocks.push({
            type: 'text',
            cover: true,
            data: {
                format: 'html',
                text: shortDescr,
                text_truncated: '<<<same>>>',
            },
        });

        const fullDescr = replaceUrls(mongoPost.text);

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
