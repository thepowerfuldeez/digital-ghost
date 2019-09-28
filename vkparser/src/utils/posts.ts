import { connectToDb, bulkUpsert, Subject, updateCollection } from "./mongo";
import VK, { GroupsGroupFull } from "vk-io";

const hour = 60 * 60;

export async function getPosts(parser: VK, subject: Subject) {
  const today = Math.floor(Date.now() / 1000);
  const lastParseLimit = today - hour * 6;
  // Уменьшаем размер батча для парралельных запросов
  parser.setOptions({ apiExecuteCount: 10 });
  const db = await connectToDb();
  const groupCol = db.collection("raw_groups");
  const postCol = db.collection("raw_posts");

  // получаем 100 самых массовых групп
  const groups = await groupCol
    .find({
      subject: subject.id,
      is_closed: 0,
      wall: 1,
      members_count: { $gt: 50000 },
      parseDate: { $lt: lastParseLimit },
    })
    .sort({ members_count: -1 })
    .project({ id: 1, _id: 0, members_count: 1 })
    .limit(100)
    .toArray();

  const promices = [];

  for (const group of groups) {
    const promice = getPostByGroupId(parser, group, subject);
    promices.push(promice);
  }
  const postsArray = await Promise.all(promices);
  const posts = postsArray.reduce((a, b) => a.concat(b), []);

  const groupsIds = groups.map(x => x.id);
  const message =
    "add parsedDate to groups, timestamp: " +
    new Date(today * 1000).toLocaleString();

  await updateCollection(message, groupsIds, groupCol, {
    $set: { parseDate: today },
  });

  const res = await bulkUpsert(posts, postCol, "id");
  console.log(`write posts to mongo, subject:${subject.name}`);
  return res;
}

async function getPostByGroupId(
  parser: VK,
  group: GroupsGroupFull,
  subject: Subject
) {
  try {
    const posts = await parser.api.wall
      .get({
        owner_id: -group.id,
        count: 100,
      })
      .then(x => x.items);

    posts.forEach(x => {
      // добавляем метку темы, число юзеров в группе и популярность для поиска в дальнейшем
      x.subject = subject.id;
      x.members_count = group.members_count;
      x.parseDate = 0;
      if (x.likes && x.views && x.views.count > 0) {
        x.popylarity = x.likes.count / x.views.count;
      }
      return x;
    });
    return posts;
  } catch (err) {
    console.error(`post parsing error, details: ${err.message}`);
    return [];
  }
}
