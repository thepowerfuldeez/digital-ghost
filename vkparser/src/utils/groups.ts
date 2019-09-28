import { connectToDb, bulkUpsert, Subject } from "./mongo";
import VK, { GroupsFields } from "vk-io";
import { sliceArrayToChunk } from "./common";

export async function getGroups(parser: VK, subject: Subject) {
  // Уменьшаем размер батча для парралельных запросов
  parser.setOptions({ apiExecuteCount: 20 });
  const db = await connectToDb();
  const groupCol = db.collection("raw_groups");

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
  console.log(`recive full groups, subject: ${subject.name}`);
  for (const chunk of chunks) {
    const promice = getGroupsById(parser, chunk, subject);
    promices.push(promice);
  }

  const groupsArray = await Promise.all(promices);
  const fullGroups = groupsArray.reduce((a, b) => a.concat(b), []);
  const res = await bulkUpsert(fullGroups, groupCol, "id");
  console.log(`write groups to mongo, subject:${subject.name}`);
  return res;
}

async function getGroupsById(parser: VK, ids: string[], subject: Subject) {
  try {
    const fields = ["description", "members_count", "wall"] as GroupsFields[];
    const groups = await parser.api.groups.getById({
      group_ids: ids,
      // нужные нам поля
      fields,
    });

    groups.forEach(x => {
      // добавляем метку темы, для поиска в дальнейшем
      x.subject = subject.id;
      x.parseDate = 0;
      return x;
    });
    return groups;
  } catch (err) {
    console.error(`groups parsing error, details: ${err.message}`);
    return [];
  }
}
