import { Subject, connectToDb, getSubjects, bulkUpsert } from "./mongo";
import { Collection } from "mongodb";
import { getMinMongoRes } from "./common";

type State = "published" | "not_published" | "pub_error";
const day = 60 * 60 * 24;

async function getTopPosts(subject: Subject, col: Collection) {
  const today = Math.floor(Date.now() / 1000);
  const dayAgo = today - day;
  const posts = await col
    .find({
      subject: subject.id,
      date: { $gt: dayAgo },
    })
    .sort({ "views.count": -1 })
    .limit(5)
    .toArray();

  posts.forEach(x => {
    const state: State = "not_published";
    x.state = state;
    return x;
  });

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

  comments.forEach(x => {
    const state: State = "not_published";
    x.state = state;
  });

  const res = await bulkUpsert(comments, finalCommentsCol, "id");
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

  let res = await bulkUpsert(posts, finalPostsCol, "id");
  console.log("populated final posts");
  let log = getMinMongoRes(res);
  console.log(log);
}

export async function populateTop() {
  await populateTopPosts();
  await populateTopPostsComments();
}
