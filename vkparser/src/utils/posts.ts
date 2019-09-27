import { connectToDb, bulkUpsert, Subject } from "./mongo";
import VK from "vk-io";

export async function getPosts(parser: VK, subject: Subject) {
  // Уменьшаем размер батча для парралельных запросов
  parser.setOptions({ apiExecuteCount: 10 });
  const db = await connectToDb();
  const groupCol = db.collection("groups");
  const postCol = db.collection("posts");

  // получаем 200 самых массовых групп
  const groups = await groupCol
    .find({ subject: subject.id, is_closed: 0 })
    .sort({ members_count: -1 })
    .project({ id: 1, _id: 0 })
    .limit(100)
    .toArray();

  const promices = [];

  for (const group of groups) {
    const promice = getPostByGroupId(parser, group.id, subject);
    promices.push(promice);
  }
  const postsArray = await Promise.all(promices);
  const posts = postsArray.reduce((a, b) => a.concat(b), []);

  const res = await bulkUpsert(posts, postCol, "id");
  console.log(`write posts to mongo, subject:${subject.name}`);
  return res;
}

async function getPostByGroupId(parser: VK, groupId: number, subject: Subject) {
  try {
    const posts = await parser.api.wall
      .get({
        owner_id: -groupId,
        count: 100,
      })
      .then(x => x.items);

    posts.forEach(x => {
      // добавляем метку темы, для поиска в дальнейшем
      x.subject = subject.id;
      return x;
    });
    return posts;
  } catch (err) {
    console.error(`post parsing error, details: ${err.message}`);
    return [];
  }
}
