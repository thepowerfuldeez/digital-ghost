import { VK } from "vk-io";
import config from "./config";
import { getSubjects, Subject } from "./utils/mongo";
import schedule from "node-schedule";
import { getGroups } from "./utils/groups";
import { getPosts } from "./utils/posts";
import { getComments } from "./utils/comments";
import { getTrends } from "./utils/trends";
import { getMinMongoRes } from "./utils/common";

const parser = new VK({
  token: config.token,
  apiMode: "parallel",
});

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
  // парсим группы каждый день в 00.00
  // топовые группы появляются редко, так что чаще и не надо
  schedule.scheduleJob("0 0 * * *", () => {
    parse("groups", getGroups);
  });

  // каждые 6 часов парсим посты, чаще не можем из-за лимита в 5000 реквестов с токена
  schedule.scheduleJob("30 0,6,12,18 * * *", () => {
    parse("posts", getPosts);
  });

  // каждый час парсим комменты
  schedule.scheduleJob("0 * * * *", () => {
    parse("comments", getComments);
  });

  // каждый час парсим гугл-тренды
  schedule.scheduleJob("48 * * * *", () => {
    getTrends();
  });
}

initSheduler();
