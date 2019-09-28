import { VK } from "vk-io";
import config from "./config";
import { getSubjects, Subject, connectToDb } from "./utils/mongo";
import schedule from "node-schedule";
import { getGroups } from "./utils/groups";
import { getPosts } from "./utils/posts";
import { getComments } from "./utils/comments";
import { getTrends } from "./utils/trends";
import { getMinMongoRes } from "./utils/common";
import { populateTop } from "./utils/populate";
import SummaryTool from "node-summary";

const parser = new VK({
  token: config.token,
  apiMode: "parallel",
});

async function sum(text: any, count: number) {
  return new Promise<string[]>((resolve, reject) => {
    SummaryTool.getSortedSentences(text, count, function(
      err: any,
      summary: any
    ) {
      if (err) {
        resolve([]);
      }

      resolve(summary);
      console.log(summary);
    });
  });
}

async function parse(
  name: string,
  parseFunc: (parser: VK, subject: Subject) => Promise<any>
) {
  const start = Date.now();
  const subjects = await getSubjects();
  for (const subject of subjects) {
    const res: any = await parseFunc(parser, subject);
    const log = getMinMongoRes(res);
    console.log(log);
  }

  const end = Date.now();
  const diff = end - start;
  console.log(`${name} parsing takes ${diff / 1000} seconds`);
}

function initSheduler() {
  // парсим группы каждый день
  // топовые группы появляются редко, так что чаще и не надо
  schedule.scheduleJob("0 */24 * * *", () => {
    parse("groups", getGroups);
  });

  // каждые 6 часов парсим посты, чаще не можем из-за лимита в 5000 реквестов с токена
  schedule.scheduleJob("15 */6 * * *", () => {
    parse("posts", getPosts);
  });

  // каждый час парсим комменты
  schedule.scheduleJob("45 */1 * * *", () => {
    parse("comments", getComments);
  });

  // каждый час парсим гугл-тренды
  schedule.scheduleJob("10 * * * *", () => {
    getTrends();
  });

  // каждые полчаса добавляет 5 топовых постов из каждой группы в финальные таблицы
  schedule.scheduleJob("*/30 * * * *", () => {
    populateTop();
  });
}

initSheduler();

async function generate() {
  const db = await connectToDb();
  const trendsCol = db.collection("trends");
  const postsCol = db.collection("posts");
  const finalCol = db.collection("auto_posts");

  const rawData = await trendsCol.find({}).toArray();

  let title: string;
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
