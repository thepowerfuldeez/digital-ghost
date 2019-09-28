const fetch = require('node-fetch');

const wait = require('./wait');

module.exports = class {
    constructor(conf) {
        this.conf = conf;
        this.tokenIndex = 0;
        this.token = this.conf.tokens[this.tokenIndex];

        if (this.conf.verbose) {
            console.log(new Date, 'vc api', `token index: ${this.tokenIndex}`);
            console.log(new Date, 'vc api', `token: ${this.token.substr(0,4)}..xxx`);
        }
    }

    async call(method, params) {
        const url = this.conf.rootPath + method;

        const reqParams = new URLSearchParams;

        Object.keys(params).forEach(key => {
            reqParams.append(key, params[key]);
        });

        const reqHeaders = {};

        reqHeaders['X-Device-Token'] = this.token;

        if (this.possessToken) {
            reqHeaders['X-Device-Possession-Token'] = this.possessToken;
        }

        let respHeaders;

        if (this.conf.verbose) {
            console.log(new Date, 'VCRU API CALL:', method, JSON.stringify(params));
        }

        const response = await fetch(url, {
            method: 'POST',
            body: reqParams,
            headers: reqHeaders,
        }).then(res => {
            respHeaders = res.headers.raw();
            return res.json();
        });

        if (this.responseSaysTokenIsBanned(response)) {
            this.tokenIndex++;
            if (this.tokenIndex > this.conf.tokens.length)

            this.token =
        this.tokenIndex = 0;
        this.token = this.conf.tokens[this.tokenIndex];
        }


            this.currentToken = nextTokenTab[this.currentToken];
            const newTokenValue = this.conf[this.currentToken];
            console.log(new Date, `token ${this.currentTokenValue} -> ${newTokenValue}`);
            this.currentTokenValue = newTokenValue;

            console.log(new Date, `token rotation wait ${this.conf.waitOnTokenRotation}ms`);
            await wait(this.conf.waitOnTokenRotation);

            return this.call(method, params);


        // fixed delay after each query
        // assuming we have single thread
        // TODO @marsgpl: move to mutex-like delays with queue to support multithread
        console.log(new Date, `api call wait ${this.conf.waitAfterEachCallMs}ms`);
        await wait(this.conf.waitAfterEachCallMs);

        return {
            response,
            headers: respHeaders,
        };
    }

    responseSaysTokenIsBanned(response) {
        const msg = String(response && response.message || '');
        return msg.toLowerCase().indexOf('робот') > -1;
    }















    async possess(subsiteId) {
        const result = await this.call('/auth/possess', {
            id: subsiteId,
        });

        this.possessToken = result.headers['X-Device-Possession-Token'.toLowerCase()];

        if (!this.possessToken) {
            throw 'possess failed: result=' + JSON.stringify(result);
        }
    }

    async attachUrl(url) {
        const result = await this.call('/uploader/extract', { url });

        const data = result && result.response && result.response.result || [];
        const error = result && result.response && result.response.error;

        if (!data.length || error) {
            throw 'Error: attachUrl: result=' + JSON.stringify(result);
        }

        return data;
    }

    async createPost(post) {
        const params = {};

        params.subsite_id = post.subsiteId;
        params.title = post.title;

        let attachments = [];

        if (post.attachments && post.attachments.length) {
            for (let i=0; i<post.attachments.length; ++i) {
                const att = post.attachments[i];
                const url = att.url;

                try {
                    if (att.type === 'photo') {
                        attachments.push({
                            type: att.type,
                            data: await this.attachUrl(url),
                        });
                    } else if (att.type === 'link') {
                        // attachments.push({
                        //     type: att.type,
                        //     data: await this.attachUrl(url),
                        // });
                    }
                } catch (error) {
                    if (this.conf.verbose) {
                        console.log('VCRU API WARN:', error);
                    }
                }
            }
        }

        if (post.entry) {
            const photos = [];
            const links = [];

            attachments.forEach(att => {
                if (att.type === 'photo') {
                    photos.push(att.data);
                } else if (att.type === 'link') {
                    links.push(att.data);
                }
            });

            if (photos.length) {
                post.entry.blocks.splice(1, 0, {
                    type: 'media',
                    anchor: 'photos',
                    cover: true,
                    data: {
                        items: photos.map(data => {
                            return {
                                title: 'Все изображения принадлежат их авторам',
                                author: 'Digital Ghost',
                                image: data[0],
                            };
                        }),
                        with_background: false,
                        with_border: false,
                    },
                });
            }

            // if (links.length) {
            //     post.entry.blocks.push({
            //         type: 'header',
            //         anchor: 'links',
            //         data: {
            //             style: 'h4',
            //             text: '<p>Ссылки</p>',
            //         },
            //     });

            //     post.entry.blocks.push({
            //         type: 'media',
            //         data: {
            //             items: links.map(data => {
            //                 return {
            //                     title: 'Это изображение, у него может быть описание',
            //                     author: 'И Автор',
            //                     image: data,
            //                 };
            //             }),
            //             with_background: false,
            //             with_border: false,
            //         },
            //     });
            // }

            params.entry = JSON.stringify(post.entry);
        } else {
            params.text = post.text;

            if (attachments.length) {
                params.attachments = JSON.stringify(attachments);
            }
        }

        const result = await this.call('/entry/create', params);
        const data = result && result.response && result.response.result || {};
        // const message = result && result.response && result.response.message;
        // const error = result && result.response && result.response.error;

        if (!data.id) {
            throw 'createPost failed: result=' + JSON.stringify(result)
                + '; post=' + JSON.stringify(post);
        }

        return {
            id: data.id,
            url: data.url,
        };
    }

    async createComment(comment) {
        const params = {};

        params.id = comment.forPostId;
        params.text = comment.text;

        if (comment.forCommentId) {
            params.reply_to = comment.forCommentId;
        }

        const result = await this.call('/comment/add', params);
        const data = result && result.response && result.response.result || {};
        const message = String(result && result.response && result.response.message || '');
        const error = result && result.response && result.response.error;

        if (!data.id) {
            const DUP_ERR_MSG = 'Повторная отправка того же сообщения';

            if (error && message.indexOf(DUP_ERR_MSG) > -1) {
                return this.createComment(Object.assign({}, comment, {
                    text: comment.text + '\n' + Math.random(),
                }));
            }

            throw 'createComment failed: result=' + JSON.stringify(result)
                + '; comment=' + JSON.stringify(comment);
        }

        return {
            id: data.id,
        };
    }

    async likePost(postId, sign) {
        const result = await this.call('/like', {
            id: postId,
            type: 'content',
            sign,
        });

        return result && result.response && !result.response.error && result;
    }

    async likeComment(commentId, sign) {
        const result = await this.call('/like', {
            id: commentId,
            type: 'comment',
            sign,
        });

        return result && result.response && !result.response.error && result;
    }
};
