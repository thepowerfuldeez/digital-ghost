const fetch = require('node-fetch');
const wait = require('./wait');

module.exports = class {
    constructor(conf) {
        this.conf = conf;
    }

    async call(method, params) {
        const url = this.conf.rootPath + method;

        const body = new URLSearchParams;

        Object.keys(params).forEach(key => {
            body.append(key, params[key]);
        });

        let headers;

        const response = await fetch(url, {
            method: 'POST',
            body,
            headers: {
                'X-Device-Token': this.conf.token,
            },
        }).then(res => {
            headers = res.headers.raw();
            return res.json();
        });

        await wait(this.conf.waitAfterEachCallMs);

        return {
            headers,
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

    /**
     * post.subsiteId
     * post.title
     * post.text
     */
    async createPost(post) {
        const params = {};

        params.subsite_id = post.subsiteId;
        params.title = post.title;
        params.text = post.text;
        // if (post.attachments) params.attachments = JSON.stringify([ { type:'image',data:{.....} } ]);

        const result = await this.call('/entry/create', params);
        const data = result && result.response && result.response.result;

        if (!data || !data.id) {
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
        if (comment.forCommentId) params.reply_to = comment.forCommentId;
        // if (comment.attachments) params.attachments = JSON.stringify([ { type:'image',data:{.....} } ]);

        const result = await this.call('/comment/add', params);
        const data = result && result.response && result.response.result;

        if (!data || !data.id) {
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
