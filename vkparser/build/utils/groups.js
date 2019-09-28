"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongo_1 = require("./mongo");
const common_1 = require("./common");
async function getGroups(parser, subject) {
    parser.setOptions({ apiExecuteCount: 20 });
    const db = await mongo_1.connectToDb();
    const groupCol = db.collection("raw_groups");
    const groups = await parser.api.groups.search({
        q: subject.query,
        count: 1000,
        sort: 0,
        type: "group",
    });
    console.log(`recive raw groups, subject: ${subject.name}`);
    const ids = groups.items.map(x => x.id.toString());
    const chunks = common_1.sliceArrayToChunk(ids, 200);
    const promices = [];
    console.log(`recive full groups, subject: ${subject.name}`);
    for (const chunk of chunks) {
        const promice = getGroupsById(parser, chunk, subject);
        promices.push(promice);
    }
    const groupsArray = await Promise.all(promices);
    const fullGroups = groupsArray.reduce((a, b) => a.concat(b), []);
    const res = await mongo_1.bulkUpsert(fullGroups, groupCol, "id");
    console.log(`write groups to mongo, subject:${subject.name}`);
    return res;
}
exports.getGroups = getGroups;
async function getGroupsById(parser, ids, subject) {
    try {
        const fields = ["description", "members_count", "wall"];
        const groups = await parser.api.groups.getById({
            group_ids: ids,
            fields,
        });
        groups.forEach(x => {
            x.subject = subject.id;
            x.parseDate = 0;
            return x;
        });
        return groups;
    }
    catch (err) {
        console.error(`groups parsing error, details: ${err.message}`);
        return [];
    }
}
//# sourceMappingURL=groups.js.map