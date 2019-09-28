import { Subject, connectToDb, getSubjects } from "./mongo";
import { Collection } from "mongodb";
import sum from "sum";

const day = 60 * 60 * 24;
const hashReg = /#[^\s]+/;
const urlReg = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/;

async function getTopPosts(subject: Subject, col: Collection) {
  const today = Math.floor(Date.now() / 1000);
  const dayAgo = today - day * 2;
  const posts = await col
    .find({
      $expr: { $gt: [{ $strLenCP: "$text" }, 200] },
      subject: subject.id,
      date: { $gt: dayAgo },
    })
    .sort({ "views.count": -1 })
    .limit(50)
    .toArray();

  posts.forEach(x => {
    let text = x.text as string;

    // ищем хештеги
    const tags = [];
    let tag = text.match(hashReg);
    while (tag && tag[0]) {
      tags.push(tag[0]);
      text = text.replace(tag[0], "");
      tag = text.match(hashReg);
    }

    if (tags.length > 0) {
      x.hashtag = tags;
    }

    // ищем линки
    let textWithoutLinks = text;

    const links = [];
    let link = textWithoutLinks.match(urlReg);
    while (link && link[0]) {
      links.push(link[0]);
      textWithoutLinks = textWithoutLinks.replace(link[0], "");
      link = textWithoutLinks.match(urlReg);
    }

    if (links.length > 0) {
      x.links = links;
    }

    // добавляем заголовок к статье
    const abs = sum({
      corpus: textWithoutLinks,
    });
    let title = abs.summary as string;
    title = title.replace(/\n/g, "");
    x.title = title;
  });

  return posts;
}

export async function populateTopPostsComments() {
  const db = await connectToDb();
  const finalPostsCol = await db.collection("final_posts");
  const commentsCol = await db.collection("raw_comments");
  const finalCommentsCol = await db.collection("final_comments");

  const posts = await finalPostsCol
    .find({ state: "not_published" })
    .project({ id: 1 })
    .toArray();

  const comments = [];
  for (const post of posts) {
    const data = await commentsCol.find({ post_id: post.id }).toArray();
    comments.push(...data);
  }

  const promices = comments.map(x => {
    x.state = "not_published";
    const prom = finalCommentsCol.insert(x).catch(err => {
      console.error(err.message);
    });
    return prom;
  });

  await Promise.all(promices);
  console.log("populated final comments");
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

  const promices = posts.map(x => {
    x.state = "not_published";
    const prom = finalPostsCol.insert(x).catch(err => {
      console.error(err.message);
    });
    return prom;
  });

  await Promise.all(promices);

  console.log("populated final posts");
}

export async function populateTop() {
  await populateTopPosts();
  await populateTopPostsComments();
}
