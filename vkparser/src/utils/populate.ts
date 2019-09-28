import { Subject, connectToDb, getSubjects } from "./mongo";
import { Collection } from "mongodb";
import { getMinMongoRes } from "./common";

const day = 60 * 60 * 24;

async function getTopPosts(subject: Subject, col: Collection) {
  const today = Math.floor(Date.now() / 1000);
  const dayAgo = today - day;
  const posts = await col
    .find({
      $expr: { $gt: [{ $strLenCP: "$text" }, 200] },
      subject: subject.id,
      date: { $gt: dayAgo },
    })
    .sort({ "views.count": -1 })
    .limit(20)
    .toArray();

  return posts;
}

export async function populateTopPostsComments() {
  const db = await connectToDb();
  const finalPostsCol = await db.collection("final_posts");
  const commentsCol = await db.collection("raw_comments");
  const finalCommentsCol = await db.collection("final_comments");

  const posts = await finalPostsCol
    .find({})
    .project({ id: 1 })
    .toArray();

  const comments = [];
  for (const post of posts) {
    const data = await commentsCol.find({ post_id: post.id }).toArray();
    comments.push(...data);
  }

  const bulk = finalCommentsCol.initializeUnorderedBulkOp();

  comments.forEach(x => {
    bulk
      .find({ id: x.id })
      .upsert()
      .update({ $set: x, $setOnInsert: { state: "not_published" } });
  });

  const res = await bulk.execute();
  console.log("populated final comments");
  const log = getMinMongoRes(res);
  console.log(log);
}

async function populateTopPosts() {
  const subjects = await getSubjects();
  const db = await connectToDb();
  const postsCol = await db.collection("raw_posts");
  const finalPostsCol = await db.collection("final_posts");

  const posts = [];
  for (const subj of subjects) {
    const data = await getTopPosts(subj, postsCol);
    posts.push(...data);
  }

  const bulk = finalPostsCol.initializeUnorderedBulkOp();

  posts.forEach(x => {
    bulk
      .find({ id: x.id })
      .upsert()
      .update({ $set: x, $setOnInsert: { state: "not_published" } });
  });

  const res = await bulk.execute();
  console.log("populated final posts");
  let log = getMinMongoRes(res);
  console.log(log);
}

export async function populateTop() {
  await populateTopPosts();
  await populateTopPostsComments();
}
