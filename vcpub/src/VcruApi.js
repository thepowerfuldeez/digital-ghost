const fetch = require('node-fetch');
const wait = require('./wait');

module.exports = class {
    constructor(conf) {
        this.conf = conf;
    }

    async call(method, params) {
        const url = this.conf.rootPath + method;

        const reqParams = new URLSearchParams;

        Object.keys(params).forEach(key => {
            reqParams.append(key, params[key]);
        });

        const reqHeaders = {};

        reqHeaders['X-Device-Token'] = this.conf.token;

        if (this.possessToken) {
            reqHeaders['X-Device-Possession-Token'] = this.possessToken;
        }

        let resHeaders;

        if (this.conf.verbose) {
            console.log('VCRU API CALL:', method, JSON.stringify(params));
        }

        const response = await fetch(url, {
            method: 'POST',
            body: reqParams,
            headers: reqHeaders,
        }).then(res => {
            resHeaders = res.headers.raw();
            return res.json();
        });

        // fixed delay after each query
        // assuming we have single thread
        // TODO @marsgpl: move to mutex-like delays with queue
        await wait(this.conf.waitAfterEachCallMs);

        return {
            headers: resHeaders,
            response,
        };
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

    /**
     * post.subsiteId
     * post.title
     * post.text
     * [post.attachments]
     */
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
                            data = data[0];

                            // data.render = `<div class="andropov_image" style="max-height: 240px;max-width: 240px;" air-module="module.andropov" data-andropov-type="image" data-image-width="240" data-image-height="240" data-image-max-width="240" data-image-max-height="240" data-image-src="https://leonardo.osnova.io/${data.data.uuid}/"><div class="andropov_image__inner" style=";padding-bottom: 100.0000%;background-color: #040404;"></div></div>`;

                            return {
                                title: 'Все изображения принадлежат их авторам',
                                author: 'Digital Ghost',
                                image: data,
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

    /**
     * comment.forPostId
     * [comment.forCommentId]
     * comment.text
     */
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
