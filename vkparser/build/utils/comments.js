"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongo_1 = require("./mongo");
const common_1 = require("./common");
const day = 60 * 60 * 24;
const hour = 60 * 60;
async function getComments(parser, subject) {
    const today = Math.floor(Date.now() / 1000);
    const lastParseLimit = today - hour * 1;
    const lastDateLimit = today - day * 7;
    const log = {
        nInserted: 0,
        nUpserted: 0,
        nModified: 0,
        nMatched: 0,
    };
    parser.setOptions({ apiExecuteCount: 25 });
    const db = await mongo_1.connectToDb();
    const postCol = db.collection("raw_posts");
    const commentCol = db.collection("raw_comments");
    const posts = await postCol
        .find({
        subject: subject.id,
    })
        .project({ id: 1, _id: 0, comments: 1, owner_id: 1, likes: 1, views: 1 })
        .toArray();
    const chunks = common_1.sliceArrayToChunk(posts, 500);
    for (const chunk of chunks) {
        const promices = [];
        for (const post of chunk) {
            for (let i = 0; i < post.comments.count; i += 100) {
                const promice = getCommentsByPostId(parser, post, i, subject);
                promices.push(promice);
            }
        }
        const commentsArray = await Promise.all(promices);
        const comments = commentsArray.reduce((a, b) => a.concat(b), []);
        parser.setOptions({ apiExecuteCount: 15 });
        const userPromices = [];
        const set = new Set();
        comments.forEach(x => {
            if (x && x.from_id) {
                set.add(x.from_id.toString());
            }
        });
        const uniqIds = Array.from(set);
        const chunks = common_1.sliceArrayToChunk(uniqIds, 500);
        for (const chunk of chunks) {
            userPromices.push(getUser(parser, chunk));
        }
        const userObj = {};
        try {
            const usersArray = await Promise.all(userPromices);
            for (const x of usersArray) {
                for (const y of x) {
                    userObj[y.id] = y;
                }
            }
            comments.forEach(x => {
                x.user = userObj[x.from_id];
                if (x.user && x.user.screen_name) {
                    x.user.url = `https://vk.com/${x.user.screen_name}`;
                }
                return x;
            });
        }
        catch (err) {
            console.log(err.message);
        }
        const res = await mongo_1.bulkUpsert(comments, commentCol, "id");
        if (res) {
            log.nInserted += res.nInserted;
            log.nModified += res.nModified;
            log.nUpserted += res.nUpserted;
            log.nMatched += res.nMatched;
            const postIds = chunk.map(x => x.id);
            const message = "add parsedDate to posts, timestamp: " +
                new Date(today * 1000).toLocaleString();
            await mongo_1.updateCollection(message, postIds, postCol, {
                $set: { parseDate: today },
            });
        }
        console.log(`write comments to mongo, subject:${subject.name}`);
    }
    return log;
}
exports.getComments = getComments;
async function getCommentsByPostId(parser, post, offset, subject) {
    try {
        const comments = await parser.api.wall
            .getComments({
            owner_id: post.owner_id,
            count: 100,
            post_id: post.id,
            need_likes: true,
            offset,
        })
            .then(x => x.items);
        comments.forEach(x => {
            x.subject = subject.id;
            if (x.likes && post.views && post.views.count > 0) {
                x.popularity = x.likes.count / post.views.count;
                x.postViews = post.views.count;
            }
            return x;
        });
        return comments;
    }
    catch (err) {
        console.error(`comments parsing error, details: ${err.message}`);
        return [];
    }
}
async function getUser(parser, ids) {
    const users = await parser.api.users.get({
        user_ids: ids,
        fields: ["screen_name"],
    });
    return users;
}
//# sourceMappingURL=comments.js.map