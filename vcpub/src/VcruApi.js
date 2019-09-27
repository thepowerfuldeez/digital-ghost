const fetch = require('node-fetch');

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

        return {
            headers,
            response,
        };
    }

    async possess(subsiteId) {
        this.possessToken = ....
    }

    async createPost(post) {
        return {
            id: ,
            url: ,
        }
    }

    async createComment(comment) {
        return {
            id: ,
        }
    }

    async likePost(postId, sign) {

    }

    async likeComment(commentId, sign) {

    }
};



    async vcLike(dataset) {
        const apiPath = '/like';
        const params = new URLSearchParams;

        params.append('id', dataset.entityId);
        params.append('type', dataset.type);
        params.append('sign', dataset.sign);

        const result = await fetch(this.conf.vcru.apiHost + apiPath, {
            method: 'POST',
            body: params,
            headers: {
                'X-Device-Token': this.conf.vcru.apiToken,
            },
        }).then(res => res.json());

        console.log('result like:', result);
    }

    async vcCreateComment(comment) {
        const apiPath = '/comment/add';
        const params = new URLSearchParams;

        params.append('id', comment.postId);
        params.append('text', comment.text);

        if (comment.parentCommentId) {
            params.append('reply_to', comment.parentCommentId);
        }

        if (comment.attachments) {
            // params.append('attachments', JSON.stringify([ { type:'image',data:{.....} } ]));
        }

        const result = await fetch(this.conf.vcru.apiHost + apiPath, {
            method: 'POST',
            body: params,
            headers: {
                'X-Device-Token': this.conf.vcru.apiToken,
            },
        }).then(res => res.json());

        if (!result || !result.result || !result.result.id) {
            throw 'commenting failed: result=' + JSON.stringify(result)
                + '; comment=' + JSON.stringify(comment);
        }

        return {
            id: result.result.id,
        };
    }

    async vcCreatePost(post) {
        const apiPath = '/entry/create';
        const params = new URLSearchParams;

        params.append('title', post.title);
        params.append('subsite_id', this.conf.vcru.subsiteId);
        params.append('text', post.text);

        if (post.attachments) {
            // params.append('attachments', JSON.stringify([ { type:'image',data:{.....} } ]));
        }

        const result = await fetch(this.conf.vcru.apiHost + apiPath, {
            method: 'POST',
            body: params,
            headers: {
                'X-Device-Token': this.conf.vcru.apiToken,
            },
        }).then(res => res.json());

        if (!result || !result.result || !result.result.id) {
            throw 'posting failed: result=' + JSON.stringify(result)
                + '; post=' + JSON.stringify(post);
        }

        return {
            id: result.result.id,
            url: result.result.url,
        };
    }

    async vcAuth() {
        const apiPath = '/auth/possess';
        const params = new URLSearchParams;

        params.append('id', this.conf.vcru.subsiteId);

        let responseHeaders;
        const result = await fetch(this.conf.vcru.apiHost + apiPath, {
            method: 'POST',
            body: params,
            headers: {
                'X-Device-Token': this.conf.vcru.apiToken,
            },
        }).then(res => {
            responseHeaders = res.headers.raw();
            return res.json();
        });

        const posToken = responseHeaders['X-Device-Possession-Token'.toLowerCase()];

        if (!posToken) {
            throw 'possess failed: result=' + JSON.stringify(result)
                + '; responseHeaders=' + JSON.stringify(responseHeaders);
        }

        return posToken;
    }
