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
        // reqHeaders['Content-Type'] = 'application/json';

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
            // body: JSON.stringify(params),
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
     * [post.attachmentsUrls]
     */
    async createPost(post) {
        const params = {};

        params.subsite_id = post.subsiteId;
        params.title = post.title;
        params.text = post.text;

        let attachments = [];

        if (post.attachmentsUrls) {
            for (let i=0; i<post.attachmentsUrls.length; ++i) {
                const url = post.attachmentsUrls[i];

                try {
                    const atts = await this.attachUrl(url);
                    attachments = attachments.concat(atts);
                } catch (error) {
                    if (this.conf.verbose) {
                        console.log('VCRU API WARN:', error);
                    }
                }
            }
        }

        if (attachments.length) {
            // params.attachments = attachments;
            params.attachments = JSON.stringify(attachments);
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
