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
const parser = new vk_io_1.VK({
    token: config_1.default.token,
    apiMode: "parallel",
});
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
populate_1.populateTop();
//# sourceMappingURL=index.js.map