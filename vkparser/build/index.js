"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vk_io_1 = require("vk-io");
const config_1 = __importDefault(require("./config"));
const mongo_1 = require("./utils/mongo");
const node_schedule_1 = __importDefault(require("node-schedule"));
const groups_1 = require("./utils/groups");
const posts_1 = require("./utils/posts");
const comments_1 = require("./utils/comments");
const trends_1 = require("./utils/trends");
const common_1 = require("./utils/common");
const populate_1 = require("./utils/populate");
const node_summary_1 = __importDefault(require("node-summary"));
const parser = new vk_io_1.VK({
    token: config_1.default.token,
    apiMode: "parallel",
});
async function sum(text, count) {
    return new Promise((resolve, reject) => {
        node_summary_1.default.getSortedSentences(text, count, function (err, summary) {
            if (err) {
                resolve([]);
            }
            resolve(summary);
            console.log(summary);
        });
    });
}
async function parse(name, parseFunc) {
    const start = Date.now();
    const subjects = await mongo_1.getSubjects();
    for (const subject of subjects) {
        const res = await parseFunc(parser, subject);
        const log = common_1.getMinMongoRes(res);
        console.log(log);
    }
    const end = Date.now();
    const diff = end - start;
    console.log(`${name} parsing takes ${diff / 1000} seconds`);
}
function initSheduler() {
    node_schedule_1.default.scheduleJob("0 */24 * * *", () => {
        parse("groups", groups_1.getGroups);
    });
    node_schedule_1.default.scheduleJob("15 */6 * * *", () => {
        parse("posts", posts_1.getPosts);
    });
    node_schedule_1.default.scheduleJob("45 */1 * * *", () => {
        parse("comments", comments_1.getComments);
    });
    node_schedule_1.default.scheduleJob("10 * * * *", () => {
        trends_1.getTrends();
    });
    node_schedule_1.default.scheduleJob("*/30 * * * *", () => {
        populate_1.populateTop();
    });
}
initSheduler();
async function generate() {
    const db = await mongo_1.connectToDb();
    const trendsCol = db.collection("trends");
    const postsCol = db.collection("posts");
    const finalCol = db.collection("auto_posts");
    const rawData = await trendsCol.find({}).toArray();
    let title;
    for (const trend of rawData) {
        title = trend.trend_snippet;
        const texts = trend.result_texts;
        const finalData = [];
        for (const text of texts) {
            if (text.length > 50) {
                const sentences = await sum(text, 3);
                const str = sentences.join(" ");
                finalData.push(str);
            }
        }
        const finalText = finalData.join(" ");
        const out = {
            title: title.slice(0, -4),
            text: finalText,
        };
        const res = await finalCol.insertOne(out);
    }
}
generate().catch(console.log);
//# sourceMappingURL=index.js.map