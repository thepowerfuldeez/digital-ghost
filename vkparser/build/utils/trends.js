"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const google_trends_api_1 = __importDefault(require("google-trends-api"));
const mongo_1 = require("./mongo");
const common_1 = require("./common");
const category = ["b", "e", "t", "s", "h"];
var CATEGORY;
(function (CATEGORY) {
    CATEGORY["BUSINESS"] = "b";
    CATEGORY["ENTERTEIMENT"] = "e";
    CATEGORY["TECH"] = "t";
    CATEGORY["SPORT"] = "s";
    CATEGORY["STORY"] = "h";
})(CATEGORY = exports.CATEGORY || (exports.CATEGORY = {}));
async function fetchTrends(category) {
    const db = await mongo_1.connectToDb();
    const trendsCol = db.collection("raw_trends");
    const str = await google_trends_api_1.default.realTimeTrends({
        geo: "RU",
        category,
    });
    const json = JSON.parse(str);
    const array = json.storySummaries.trendingStories;
    const now = Date.now();
    array.forEach((x) => {
        x.category = category;
        x.date = now;
        return x;
    });
    const res = await mongo_1.bulkUpsert(array, trendsCol, "id");
    console.log(`write google trends ${category} to mongo`);
    return res;
}
async function getTrends() {
    for (const cat of category) {
        const res = await fetchTrends(cat);
        const log = common_1.getMinMongoRes(res);
        console.log(log);
    }
    console.log("finish parsing trends");
}
exports.getTrends = getTrends;
//# sourceMappingURL=trends.js.map