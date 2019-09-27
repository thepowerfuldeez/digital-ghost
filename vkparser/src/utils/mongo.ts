import config from "../config";
import { MongoClient, Collection } from "mongodb";

export interface Subject {
  id: number;
  query: string;
  name: string;
}

const client = MongoClient.connect(config.mongo.url, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  reconnectInterval: 1000,
  reconnectTries: Number.MAX_VALUE,
  auth: {
    user: config.mongo.username,
    password: config.mongo.password,
  },
  authMechanism: "SCRAM-SHA-1",
});

export async function bulkUpsert(
  array: any[],
  collection: Collection,
  field: string
) {
  if (!array || array.length === 0) {
    console.error("resive empty array for upsert");
    return;
  }
  const bulk = collection.initializeUnorderedBulkOp();

  array.forEach(obj => {
    const search = {
      [field]: obj[field],
    };
    bulk
      .find(search)
      .upsert()
      .update({ $set: obj });
  });

  const res = await bulk.execute();
  return res;
}

export async function connectToDb() {
  const connection = await client;
  const db = await connection.db(config.mongo.dbName);
  return db;
}

export async function getSubjects() {
  const db = await connectToDb();
  const subjects = db.collection("subjects");

  const res = await subjects.find({}).toArray();

  return res;
}
