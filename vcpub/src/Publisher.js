const { MongoClient, ObjectID } = require('mongodb');

const VcruApi = require('./VcruApi');
const wait = require('./wait');
const rnd = require('./rnd');
const replaceUrls = require('./replaceUrls');

const STATUS_NOT_PUBLISHED = 'not_published'; // or $exists:false
const STATUS_PUBLISHING = 'publishing';
const STATUS_PUBLISHED = 'published';

const VC_POST_MAX_TITLE_LENGTH = 117;

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
                // await this.vcruApi.possess(this.conf.vcru.subsite.id);
                await this.process();
            } catch (error) {
                console.log(new Date, 'Error:', error);

                await this.failTrend(error);
                await this.failPost(error);
            }

            console.log(new Date, `iteration wait: ${this.conf.sleepIntervalMs}ms`);
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
            // trends is a guarantee for uniqueness of posts and comments
            // state: { $nin: [STATUS_PUBLISHING, STATUS_PUBLISHED] },
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

    async getCommentsByPostPid(postPid, limit, otherPostPids = []) {
        console.log(new Date, 'searching for comments by postPid:', postPid);

        const filter = {
            post_id: postPid,
            // trends is a guarantee for uniqueness of posts and comments
            // state: { $nin: [STATUS_PUBLISHING, STATUS_PUBLISHED] },
        };

        const options = {
            limit,
            sort: {
                popularity: -1, // more is first
            },
        };

        let result = await this.mongo.comments.find(filter, options).toArray();

        if (!result.length) {
            result = await this.mongo.comments.find({
                post_id: {
                    $in: otherPostPids,
                }
            }, options).toArray();
        }

        return result;
    }

    vcPostAttachments(post) {
        const atts = [];

        let hasPhotos = false;
        let candidateLinkPhotoUrl;

        if (post.attachments && post.attachments.length) {
            post.attachments.forEach(attachment => {
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

        // if (!hasPhotos && candidateLinkPhotoUrl) {
        //     atts.unshift({
        //         type: 'photo',
        //         url: candidateLinkPhotoUrl,
        //     });
        // }

        return atts;
    }

    async createVcPost(post, commentsGood, commentsBad, trend) {
        const vcPost = {
            subsiteId: this.conf.vcru.subsite.id,
            title: this.vcPostTitle(post, trend),
            entry: await this.vcPostEntry(post, commentsGood, commentsBad),
            attachments: this.vcPostAttachments(post),
        };

        const { short, tail } = this.shortTail(vcPost.title, VC_POST_MAX_TITLE_LENGTH);

        if (tail) {
            vcPost.title = short;
            vcPost.entry.blocks[0].data.text = tail + '<br>' + vcPost.entry.blocks[0].data.text;
        }

        return vcPost;
    }

    shortTail(text, limit, addDots = false) {
        if (text.length <= limit) {
            return {
                short: text,
                tail: '',
            };
        }

        text = text.replace(/\.{2,}$/g, '').trim();

        let short = text.substr(0, limit)
            .replace(/[^\s\n]+$/, '')
            .replace(/([\,\.\?\!])[\sa-zа-яёЁ]{1,15}$/i, '$1')
            .trim();

        let tail = text.substr(short.length).trim();

        short = short.replace(/[^a-zа-яёЁ]+$/i, '');

        if (addDots) {
            short += '...';
        }

        return {
            short,
            tail,
        };
    }

    splitText(rawText) {
        const { short, tail } = this.shortTail(rawText, 200, true);

        return {
            subtitle: short,
            text: tail,
        }
    }

    textNormalizer(text) {
        return text
            .replace(/&nbsp;/g, ' ')
            .replace(/ ([,\.\!\?:;])/g, '$1')
            .replace(/(\s?\n){2,}/g, '\n')
            .trim();
    }

    vcPostTitle(post, trend) {
        return this.textNormalizer(post.title || trend.trend_snippet || '');
    }

    async vcPostEntry(post, commentsGood, commentsBad) {
        const entry = {
            blocks: [],
        };

        const { subtitle, text } = this.splitText(this.textNormalizer(post.text || ''));

        entry.blocks.push({
            type: 'text',
            cover: true,
            data: {
                format: 'html',
                text: replaceUrls(subtitle),
                text_truncated: '<<<same>>>',
            },
        });

        entry.blocks.push({
            type: 'text',
            data: {
                format: 'html',
                text: replaceUrls(text),
                text_truncated: '<<<same>>>',
            },
        });

        if (commentsGood.length) {
            const items = this.commentsToItems(commentsGood);

            if (items.length) {
                entry.blocks.push({
                    type: 'header',
                    data: {
                        style: 'h4',
                        text: 'Позитивные мнения:',
                    },
                });

                entry.blocks.push({
                    type: 'list',
                    data: {
                        type: 'UL',
                        items,
                    },
                });
            }
        }

        if (commentsBad.length) {
            const items = this.commentsToItems(commentsBad);

            if (items.length) {
                entry.blocks.push({
                    type: 'header',
                    data: {
                        style: 'h4',
                        text: 'Негативные мнения:',
                    },
                });

                entry.blocks.push({
                    type: 'list',
                    data: {
                        type: 'UL',
                        items,
                    },
                });
            }
        }

        const sourceUrl = post.url;

        const sourceUrlShort = sourceUrl
            .replace(/^[a-z]+:\/\//i, '')
            .replace(/\?.*?$/, '');

        entry.blocks.push({
            type: 'text',
            data: {
                format: 'html',
                text: `<p>Источник: <a href="${sourceUrl}" target="_blank">${sourceUrlShort}</a></p>`,
                text_truncated: '<<<same>>>',
            },
        });

        return entry;
    }

    commentsToItems(comments) {
        const items = [];

        comments.forEach(comment => {
            comment.user = comment.user || {};

            // TODO @marsgpl community url
            const authorUrl = comment.user.url || 'https://vk.com/id' + comment.owner_id;
            // TODO @marsgpl community name
            const authorName = this.shortTail(this.textNormalizer(comment.user.first_name || 'Аноним'), 32);
            // TODO @marsgpl attachments
            const text = this.shortTail(this.textNormalizer(comment.text || '?'), 128, true).short;

            items.push(`<a href="${authorUrl}" target="_blank">${authorName}</a>: ${text}`);
        });

        return items;
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
        if (!post) throw 'post not found';

        this.bookedPostId = post._id;
        console.log(new Date, 'bookedPostId:', this.bookedPostId);

        // 3 for good, 3 for bad
        const comments = await this.getCommentsByPostPid(postPid, 6, trend.post_ids);
        const commentsPerSection = Math.ceil(comments.length / 2);
        const commentsGood = comments.slice(0, commentsPerSection);
        const commentsBad = comments.slice(commentsPerSection);

        this.currentCommentsIds = comments.map(comment => new ObjectID(comment._id));

        console.log(new Date, 'comments:', comments.length);
        console.log(new Date, 'commentsGood:', commentsGood.length);
        console.log(new Date, 'commentsBad:', commentsBad.length);
        console.log(new Date, 'currentCommentsIds:', this.currentCommentsIds);

        const vcPost = await this.createVcPost(post, commentsGood, commentsBad, trend);

        console.log(new Date, 'vcPost title:', vcPost.title.length);
        console.log(new Date, 'vcPost attachments:', vcPost.attachments.length);

        console.log(new Date, 'posting to vcru');
        const pr = await this.vcruApi.createPost(vcPost);

        await this.updatePostByVc(this.bookedPostId, pr);
        await this.successTrend();
        await this.successComments();

        console.log(new Date, 'lifecycle DONE');
    }

    async updatePostByVc(postId, vcPostData) {
        console.log(new Date, 'vcruPostId', vcPostData.id);
        console.log(new Date, 'vcruPostUrl', vcPostData.url);

        const filter = {
            _id: new ObjectID(postId),
        };

        const update = {
            $set: {
                state: STATUS_PUBLISHED,
                vcruId: vcPostData.id,
                vcruUrl: vcPostData.url,
                vcruPubDate: new Date,
            }
        };

        await this.mongo.posts.updateOne(filter, update);
    }

    async failTrend(error) {
        if (!this.bookedTrendId) return;
        console.log(new Date, 'unbooking trendId:', this.bookedTrendId);

        await this.mongo.trends.updateOne({
            _id: new ObjectID(this.bookedTrendId),
        }, {
            $set: {
                state: STATUS_NOT_PUBLISHED,
                error: JSON.stringify(error),
            },
        });

        delete this.bookedTrendId;
    }

    async failPost(error) {
        if (!this.bookedPostId) return;
        console.log(new Date, 'unbooking postId:', this.bookedPostId);

        await this.mongo.posts.updateOne({
            _id: new ObjectID(this.bookedPostId),
        }, {
            $set: {
                state: STATUS_NOT_PUBLISHED,
                error: JSON.stringify(error),
            },
        });

        delete this.bookedPostId;
    }

    async successTrend() {
        if (!this.bookedTrendId) return;
        console.log(new Date, 'successing trendId:', this.bookedTrendId);

        await this.mongo.trends.updateOne({
            _id: new ObjectID(this.bookedTrendId),
        }, {
            $set: {
                state: STATUS_PUBLISHED,
            },
        });
    }

    async successComments() {
        if (!this.currentCommentsIds || !this.currentCommentsIds.length) return;
        console.log(new Date, 'successing currentCommentsIds:', this.currentCommentsIds);

        await this.mongo.comments.updateMany({
            _id: { $in: this.currentCommentsIds },
        }, {
            $set: {
                state: STATUS_PUBLISHED,
            },
        });
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
