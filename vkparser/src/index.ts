import { VK } from "vk-io";
import config from "./config";
import { getSubjects, Subject } from "./utils/mongo";
import { getGroups } from "./utils/groups";
import { getPosts } from "./utils/posts";
import { BulkWriteResult } from "mongodb";

const parser = new VK({
  token: config.token,
  apiMode: "parallel",
});

async function parse(
  name: string,
  parseFunc: (parser: VK, subject: Subject) => Promise<BulkWriteResult>
) {
  const start = Date.now();
  const subjects = await getSubjects();
  for (const subject of subjects) {
    const res = await parseFunc(parser, subject);
    if (res) {
      const logRes = {
        nInserted: res.nInserted,
        nUpserted: res.nUpserted,
        nModified: res.nModified,
      };
      console.log(JSON.stringify(logRes));
    }
  }
  const end = Date.now();
  const diff = end - start;
  console.log(`${name} parsing takes ${diff / 1000} seconds`);
}

parse("groups", getGroups)
  .then(() => parse("posts", getPosts))
  .catch(err => {
    console.log(err);
  });
