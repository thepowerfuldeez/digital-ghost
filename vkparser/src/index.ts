import { VK } from "vk-io";
import config from "./config";
import mongodb, { MongoClient } from "mongodb";

const parser = new VK({
  token: config.token,
  apiMode: "parallel",
});

const client = new MongoClient(config.mongo.url, {
  useNewUrlParser: true,
  reconnectInterval: 1000,
  reconnectTries: Number.MAX_VALUE,
  auth: {
    user: config.mongo.username,
    password: config.mongo.password,
  },
});

async function connectToDb() {
  const connection = await client.connect();
  const db = await connection.db(config.mongo.dbName);
  return db;
}

async function getSubjects() {
  const db = await connectToDb();
  const subjects = db.collection("subjects");

  const res = await subjects.find({}).toArray();

  return res;
}

getSubjects().then(console.log);
