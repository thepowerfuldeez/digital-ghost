const { MongoClient, ObjectID } = require('mongodb');

const VcruApi = require('./VcruApi');
const wait = require('./wait');
const rnd = require('./rnd');
const replaceUrls = require('./replaceUrls');

const STATUS_NOT_PUBLISHED = 'not_published'; // or $exists:false
const STATUS_PUBLISHING = 'publishing';
const STATUS_PUBLISHED = 'published';

const VC_POST_MAX_TITLE_LENGTH = 120;

const INVALID_TITLE_REGEXP = /^[^а-яёЁ ]*$|(цена|продам|продаю)\s+|\[[^\|]+\|([[^\]]+\|?)*\]/i;

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
        const bySinglePost = !(otherPostPids && otherPostPids.length);

        if (bySinglePost) {
            console.log(new Date, 'searching for comments by postPid:', postPid);
        } else {
            console.log(new Date, 'searching for comments by otherPostPids:', otherPostPids);
        }

        const filter = {
            post_id: bySinglePost ? postPid : { $in: otherPostPids },
            text: { $ne: '' },
            user: { $exists: true },
            // trends is a guarantee for uniqueness of posts and comments
            // state: { $nin: [STATUS_PUBLISHING, STATUS_PUBLISHED] },
        };

        const options = {
            limit,
            sort: {
                positive_score: -1, // more is first
            },
        };

        const result = await this.mongo.comments.find(filter, options).toArray();

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

                        // if (size && size.url) {
                        //     candidateLinkPhotoUrl = size.url;
                        // }
                    }
                } else if (attachment.type === 'video' && attachment.video) {
                    if (attachment.video.image) {
                        candidateLinkPhotoUrl = attachment.video.image[attachment.video.image.length-1].url;
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
                short: this.completeBrackets(text.trim()),
                tail: '',
            };
        }

        text = text.replace(/\.{2,}$/g, '').trim();

        let prevBr = text.substr(0, limit).lastIndexOf('\n');
        let nextBr = text.substr(limit).indexOf('\n');

        if (nextBr > -1 && nextBr <= limit * 1.2) {
            return {
                short: this.completeBrackets(text.substr(0, nextBr).trim()),
                tail: this.completeBrackets(text.substr(nextBr).trim()),
            }
        } else if (prevBr >= 120) {
            return {
                short: this.completeBrackets(text.substr(0, prevBr).trim()),
                tail: this.completeBrackets(text.substr(prevBr).trim()),
            }
        }

        let short = text.substr(0, limit)
            .replace(/[^\s\n]+$/, '')
            .trim();

        const tries = [
            short.replace(/([\.?!;])[^\.?!;]+$/, '$1').trim(),
            short.replace(/([,:—\-])[^,:—\-]+$/, '$1').trim(),
        ];

        const triesLimit = [
            30,
            limit/2,
        ];

        for (let i=0; i<tries.length; ++i) {
            const tri = tries[i];
            const lim = triesLimit[i];

            if (tri !== short && tri.length >= lim) {
                short = tri;
                break;
            }
        }

        let tail = text.substr(short.length).trim();

        short = short.replace(/[^a-zа-яёЁ]+$/i, '');

        if (addDots) {
            short += '...';
        }

        return {
            short: this.completeBrackets(short),
            tail: this.completeBrackets(tail),
        };
    }

    completeBrackets(text) {
        const brackets = {
            '«': '»',
            '"': '"',
            '(': ')',
            '[': ']',
            '{': '}',
            "'": "'",
            '`': '`',
        };

        Object.keys(brackets).forEach(opener => {
            const closer = brackets[opener];

            if (text.indexOf(opener) > -1 && text.indexOf(closer) < 0) {
                text += closer;
            }
        });

        return text;
    }

    splitText(rawText) {
        const { short, tail } = this.shortTail(rawText, 200, true);

        return {
            subtitle: short,
            text: tail,
        }
    }

    textNormalizer(text) {
        return String(text || '')
            .replace(/&nbsp;?/g, ' ')
            .replace(/&quot;?/g, '"')
            .replace(/&amp;?/g, '&')
            .replace(/[><��]/g, '')
            .replace(/\[id[0-9]+\|(.*?)\]/g, '$1')
            .replace(/\[[^\|]+\|([[^\]]+\|?)*\]/g, '')
            .replace(/ ([,\.\!\?:;])/g, '$1')
            .replace(/(\s?\n){2,}/g, '\n')
            .trim();
    }

    vcPostTitle(post, trend) {
        let title = this.textNormalizer(post.title || '');

        if (!title || title.match(INVALID_TITLE_REGEXP) || title.length < 20) {
            title = this.textNormalizer(post.trend_snippet);
        }

        return title || '';
    }

    async vcPostEntry(post, commentsGood, commentsBad) {
        const entry = {
            blocks: [],
        };

        const { subtitle, text } = this.splitText(this.textNormalizer(
            post.clean_text || post.text || ''));

        if (subtitle.length) {
            entry.blocks.push({
                type: 'text',
                cover: true,
                data: {
                    format: 'html',
                    text: replaceUrls(subtitle).replace(/\n/g, '<br>'),
                    text_truncated: '<<<same>>>',
                },
            });
        }

        if (text.length) {
            entry.blocks.push({
                type: 'text',
                data: {
                    format: 'html',
                    text: replaceUrls(text.replace(/^[^a-z0-9а-яёЁ]+/i, '')).replace(/\n/g, '<br>'),
                    text_truncated: '<<<same>>>',
                },
            });
        }

        if (commentsGood.length) {
            const items = this.commentsToItems(commentsGood);

            if (items.length) {
                entry.blocks.push({
                    type: 'header',
                    data: {
                        style: 'h4',
                        text: '😄 Позитивные мнения',
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
                        text: '😡 Негативные мнения',
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
                text: `<p>Источник: <a href="${sourceUrl.replace(/"/g, '')}" target="_blank">${sourceUrlShort}</a></p>`,
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
            const authorName = this.shortTail(this.textNormalizer(comment.user.first_name || 'Аноним'), 32).short;
            // TODO @marsgpl attachments
            const text = this.shortTail(this.textNormalizer(comment.text || '?'), 128, true).short;

            items.push(`<a href="${authorUrl.replace(/"/g, '')}" target="_blank">${authorName}</a>: ${text}`);
        });

        return items;
    }

    async bookTopPost() {
        console.log(new Date, 'booking top post');

        const filter = {
            state: { $nin: [STATUS_PUBLISHING, STATUS_PUBLISHED] },
            subject: { $ne: 17 },
        };

        const update = {
            $set: {
                state: STATUS_PUBLISHING,
            },
        };

        const options = {
            sort: {
                score: 1,
            },
            limit: 1,
        };

        const result = await this.mongo.posts.findOneAndUpdate(filter, update, options);

        return result.value;
    }

    async process() {
        const trend = {};
        // const trend = await this.bookTopTrend();
        // if (!trend) throw 'no trends left';

        // this.bookedTrendId = trend._id;
        // console.log(new Date, 'bookedTrendId:', this.bookedTrendId);

        // const postPid = this.getPostPidFromTrend(trend);
        // if (!postPid) throw 'cant detect postPid';

        // console.log(new Date, 'postPid:', postPid);

        // const post = await this.bookPostByPid(postPid);
        // if (!post) throw 'post not found';

        const post = await this.bookTopPost();
        if (!post) throw 'no posts left';

        this.bookedPostId = post._id;
        console.log(new Date, 'bookedPostId:', this.bookedPostId);

        // 3 for good, 3 for bad
        // const comments = await this.getCommentsByPostPid(postPid, 6, trend.post_ids);
        const comments = await this.getCommentsByPostPid(post.id, 10000);
        const commentsGood = [];
        const commentsBad = [];
        const usedCommentsIds = {};

        for (let i=0; i<comments.length; ++i) {
            const comment = comments[i];

            if (comment.positive_score >= .5) {
                commentsGood.push(comment);
                usedCommentsIds[comment._id] = true;
            } else {
                break;
            }

            if (commentsGood.length >= 3) {
                break;
            }
        }

        for (let i=comments.length-1; i>=0; --i) {
            const comment = comments[i];
            if (usedCommentsIds[comment._id]) break;
            usedCommentsIds[comment._id] = true;

            if (comment.positive_score <= .5) {
                commentsBad.push(comment);
            } else {
                break;
            }

            if (commentsBad.length >= 3) {
                break;
            }
        }

        // const commentsGood = comments.slice(0, commentsPerSection).slice(0, 3);
        // const commentsBad = comments.slice(commentsPerSection).reverse().slice(0, 3);

        this.currentCommentsIds = comments.map(comment => new ObjectID(comment._id));

        console.log(new Date, 'comments:', comments.length);
        console.log(new Date, 'commentsGood:', commentsGood.length);
        console.log(new Date, 'commentsBad:', commentsBad.length);
        console.log(new Date, 'currentCommentsIds:', this.currentCommentsIds);
console.log('commentsGood:', commentsGood);
console.log('commentsBad:', commentsBad);
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
