"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongo_1 = require("./mongo");
const hour = 60 * 60;
async function getPosts(parser, subject) {
    const today = Math.floor(Date.now() / 1000);
    const lastParseLimit = today - hour * 6;
    parser.setOptions({ apiExecuteCount: 10 });
    const db = await mongo_1.connectToDb();
    const groupCol = db.collection("raw_groups");
    const postCol = db.collection("raw_posts");
    const groups = await groupCol
        .find({
        subject: subject.id,
        is_closed: 0,
        wall: { $ne: 0 },
        members_count: { $gt: 50000 },
        parseDate: { $lt: lastParseLimit },
    })
        .sort({ members_count: -1 })
        .project({
        id: 1,
        _id: 0,
        members_count: 1,
        description: 1,
        screen_name: 1,
    })
        .limit(100)
        .toArray();
    const promices = [];
    for (const group of groups) {
        const promice = getPostByGroupId(parser, group, subject);
        promices.push(promice);
    }
    const postsArray = await Promise.all(promices);
    const posts = postsArray.reduce((a, b) => a.concat(b), []);
    const groupsIds = groups.map(x => x.id);
    const message = "add parsedDate to groups, timestamp: " +
        new Date(today * 1000).toLocaleString();
    await mongo_1.updateCollection(message, groupsIds, groupCol, {
        $set: { parseDate: today },
    });
    const res = await mongo_1.bulkUpsert(posts, postCol, "id");
    console.log(`write posts to mongo, subject:${subject.name}`);
    return res;
}
exports.getPosts = getPosts;
async function getPostByGroupId(parser, group, subject) {
    try {
        const posts = await parser.api.wall
            .get({
            owner_id: -group.id,
            count: 100,
        })
            .then(x => x.items);
        posts.forEach(x => {
            x.subject = subject.id;
            x.members_count = group.members_count;
            x.description = group.description;
            x.screen_name = group.screen_name;
            x.parseDate = 0;
            x.url = `https://vk.com/${group.screen_name}?w=wall-${group.id}_${x.id}`;
            if (x.likes && x.views && x.views.count > 0) {
                x.popularity = x.likes.count / x.views.count;
            }
            return x;
        });
        return posts;
    }
    catch (err) {
        console.error(`post parsing error, details: ${err.message}`);
        return [];
    }
}
//# sourceMappingURL=posts.js.map