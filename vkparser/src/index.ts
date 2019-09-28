import { VK } from "vk-io";
import config from "./config";
import { getSubjects, Subject } from "./utils/mongo";
import { getGroups } from "./utils/groups";
import { getPosts } from "./utils/posts";
import { getComments } from "./utils/comments";
import { getTrends, CATEGORY } from "./utils/trends";

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
    if (res) {
      const logRes = {
        nInserted: res.nInserted,
        nUpserted: res.nUpserted,
        nModified: res.nModified,
        nMatched: res.nMatched,
      };
      console.log(JSON.stringify(logRes));
    }
  }
  const end = Date.now();
  const diff = end - start;
  console.log(`${name} parsing takes ${diff / 1000} seconds`);
}

// parse("comments", getComments).catch(err => {
//   console.log(err);
// });

// parse("groups", getGroups).catch(err => {
//   console.log(err);
// });

// parse("posts", getPosts).catch(err => {
//   console.log(err);
// });

getTrends(CATEGORY.TECH).then(console.log);
