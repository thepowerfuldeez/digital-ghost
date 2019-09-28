"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_summary_1 = __importDefault(require("node-summary"));
const mongo_1 = require("./mongo");
async function generate() {
    const db = await mongo_1.connectToDb();
    const trendsCol = db.collection("trends");
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
generate().catch(console.log);
//# sourceMappingURL=auto-gen.js.map