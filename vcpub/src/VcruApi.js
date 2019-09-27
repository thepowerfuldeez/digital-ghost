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
    // async createPost(post) {
    //     return {
    //         id: ,
    //         url: ,
    //     }
    // }

    // async createComment(comment) {
    //     return {
    //         id: ,
    //     }
    // }

    // async likePost(postId, sign) {

    // }

    // async likeComment(commentId, sign) {

    // }
};



    // async vcLike(dataset) {
    //     const apiPath = '/like';
    //     const params = new URLSearchParams;

    //     params.append('id', dataset.entityId);
    //     params.append('type', dataset.type);
    //     params.append('sign', dataset.sign);

    //     const result = await fetch(this.conf.vcru.apiHost + apiPath, {
    //         method: 'POST',
    //         body: params,
    //         headers: {
    //             'X-Device-Token': this.conf.vcru.apiToken,
    //         },
    //     }).then(res => res.json());

    //     console.log('result like:', result);
    // }

    // async vcCreateComment(comment) {
    //     const apiPath = '/comment/add';
    //     const params = new URLSearchParams;

    //     params.append('id', comment.postId);
    //     params.append('text', comment.text);

    //     if (comment.parentCommentId) {
    //         params.append('reply_to', comment.parentCommentId);
    //     }

    //     if (comment.attachments) {
    //         // params.append('attachments', JSON.stringify([ { type:'image',data:{.....} } ]));
    //     }

    //     const result = await fetch(this.conf.vcru.apiHost + apiPath, {
    //         method: 'POST',
    //         body: params,
    //         headers: {
    //             'X-Device-Token': this.conf.vcru.apiToken,
    //         },
    //     }).then(res => res.json());

    //     if (!result || !result.result || !result.result.id) {
    //         throw 'commenting failed: result=' + JSON.stringify(result)
    //             + '; comment=' + JSON.stringify(comment);
    //     }

    //     return {
    //         id: result.result.id,
    //     };
    // }

    // async vcCreatePost(post) {
    //     const apiPath = '/entry/create';
    //     const params = new URLSearchParams;

    //     params.append('title', post.title);
    //     params.append('subsite_id', this.conf.vcru.subsiteId);
    //     params.append('text', post.text);

    //     if (post.attachments) {
    //         // params.append('attachments', JSON.stringify([ { type:'image',data:{.....} } ]));
    //     }

    //     const result = await fetch(this.conf.vcru.apiHost + apiPath, {
    //         method: 'POST',
    //         body: params,
    //         headers: {
    //             'X-Device-Token': this.conf.vcru.apiToken,
    //         },
    //     }).then(res => res.json());

    //     if (!result || !result.result || !result.result.id) {
    //         throw 'posting failed: result=' + JSON.stringify(result)
    //             + '; post=' + JSON.stringify(post);
    //     }

    //     return {
    //         id: result.result.id,
    //         url: result.result.url,
    //     };
    // }
