import { VK } from "vk-io";
import config from "./config";
import { MongoClient, Collection } from "mongodb";

interface Subject {
  id: number;
  query: string;
  name: string;
}

const parser = new VK({
  token: config.token,
  apiMode: "parallel",
});

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

async function bulkUpsert(array: any[], collection: Collection, field: string) {
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

async function connectToDb() {
  const connection = await client;
  const db = await connection.db(config.mongo.dbName);
  return db;
}

async function getSubjects() {
  const db = await connectToDb();
  const subjects = db.collection("subjects");

  const res = await subjects.find({}).toArray();

  return res;
}

async function getGroups(subject: Subject) {
  // Уменьшаем размер батча для парралельных запросов
  parser.setOptions({ apiExecuteCount: 20 });
  const db = await connectToDb();
  const groupCol = db.collection("groups");

  const groups = await parser.api.groups.search({
    q: subject.query,
    count: 1000,
    sort: 0,
    type: "group",
  });
  console.log(`recive raw groups, subject: ${subject.name}`);
  const ids = groups.items.map(x => x.id.toString());

  // Ограничение в 200 id, чтобы не получился слишком длинный url. Выбрал путем экспирементов
  const chunks = sliceArrayToChunk(ids, 200);
  const promices = [];
  for (const chunk of chunks) {
    const promice = getGroupsById(chunk, subject);
    promices.push(promice);
  }

  const groupsArray = await Promise.all(promices);
  const fullGroups = groupsArray.reduce((a, b) => a.concat(b), []);
  const res = await bulkUpsert(fullGroups, groupCol, "id");
  console.log(`write groups to mongo, subject:${subject.name}`);
  console.log(JSON.stringify(res));
  return res;
}

async function getGroupsById(ids: string[], subject: Subject) {
  try {
    const groups = await parser.api.groups.getById({
      group_ids: ids,
      // нужные нам поля
      fields: ["description", "members_count"],
    });

    groups.forEach(x => {
      // добавляем метку темы, для поиска в дальнейшем
      x.subject = subject.id;
      return x;
    });
    console.log(`recive full groups, subject: ${subject.name}`);
    return groups;
  } catch (err) {
    console.error(`groups parsing error, details: ${err.message}`);
    return [];
  }
}

function sliceArrayToChunk<T>(array: T[], size: number) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    const chunk = array.slice(i, i + size);
    chunks.push(chunk);
  }
  return chunks;
}

async function parseGroups() {
  const start = Date.now();
  const subjects = await getSubjects();
  for (const subject of subjects) {
    await getGroups(subject);
  }
  const end = Date.now();
  const diff = end - start;
  console.log(`group parsing takes ${diff / 1000} seconds`);
}

parseGroups()
  .then(() => {
    console.log("group parsing finished");
  })
  .catch(err => {
    console.log(err);
  });
