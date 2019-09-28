import { connectToDb, bulkUpsert, Subject, updateCollection } from "./mongo";
import VK, { WallWallpostFull } from "vk-io";
import { sliceArrayToChunk } from "./common";

const day = 60 * 60 * 24;
const hour = 60 * 60;

export async function getComments(parser: VK, subject: Subject) {
  const today = Math.floor(Date.now() / 1000);
  const lastParseLimit = today - hour * 1;
  const lastDateLimit = today - day * 7;

  const log = {
    nInserted: 0,
    nUpserted: 0,
    nModified: 0,
    nMatched: 0,
  };
  // Уменьшаем размер батча для парралельных запросов
  parser.setOptions({ apiExecuteCount: 25 });
  const db = await connectToDb();
  const postCol = db.collection("raw_posts");
  const commentCol = db.collection("raw_comments");

  const posts = await postCol
    .find<WallWallpostFull>({
      subject: subject.id,
      date: { $gt: lastDateLimit },
      parseDate: { $lt: lastParseLimit },
    })
    .project({ id: 1, _id: 0, comments: 1, owner_id: 1, likes: 1, views: 1 })
    .toArray();

  // постов может быть очень много, делим их на чанки, чтобы не запускать огромные промисы
  const chunks = sliceArrayToChunk(posts, 500);
  for (const chunk of chunks) {
    const promices = [];
    for (const post of chunk) {
      for (let i = 0; i < post.comments.count; i += 100) {
        const promice = getCommentsByPostId(parser, post, i, subject);
        promices.push(promice);
      }
    }
    const commentsArray = await Promise.all(promices);
    const comments = commentsArray.reduce((a, b) => a.concat(b), []);
    const res: any = await bulkUpsert(comments, commentCol, "id");
    if (res) {
      log.nInserted += res.nInserted;
      log.nModified += res.nModified;
      log.nUpserted += res.nUpserted;
      log.nMatched += res.nMatched;

      const postIds = chunk.map(x => x.id);
      const message =
        "add parsedDate to posts, timestamp: " +
        new Date(today * 1000).toLocaleString();

      await updateCollection(message, postIds, postCol, {
        $set: { parseDate: today },
      });
    }
    console.log(`write comments to mongo, subject:${subject.name}`);
  }
  return log;
}

async function getCommentsByPostId(
  parser: VK,
  post: WallWallpostFull,
  offset: number,
  subject: Subject
) {
  try {
    const comments = await parser.api.wall
      .getComments({
        owner_id: post.owner_id,
        count: 100,
        post_id: post.id,
        need_likes: true,
        offset,
      })
      .then(x => x.items);

    comments.forEach(x => {
      // добавляем метку темы, для поиска в дальнейшем
      x.subject = subject.id;
      if (x.likes && post.views && post.views.count > 0) {
        x.popularity = x.likes.count / post.views.count;
        x.postViews = post.views.count;
      }

      return x;
    });
    return comments;
  } catch (err) {
    console.error(`comments parsing error, details: ${err.message}`);
    return [];
  }
}
