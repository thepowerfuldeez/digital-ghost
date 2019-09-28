//eslint-ignore-next-line
import gtrend from "google-trends-api";
import { connectToDb, bulkUpsert } from "./mongo";
import { getMinMongoRes } from "./common";

const category = ["b", "e", "t", "s", "h"];

export enum CATEGORY {
  BUSINESS = "b",
  ENTERTEIMENT = "e",
  TECH = "t",
  SPORT = "s",
  STORY = "h",
}

async function fetchTrends(category: string) {
  const db = await connectToDb();
  const trendsCol = db.collection("raw_trends");

  const str = await gtrend.realTimeTrends({
    geo: "RU",
    category,
  });
  const json = JSON.parse(str);
  const array = json.storySummaries.trendingStories;
  array.forEach((x: any) => {
    x.category = category;
    return x;
  });

  const res = await bulkUpsert(array, trendsCol, "id");
  console.log(`write google trends ${category} to mongo`);
  return res;
}

export async function getTrends() {
  for (const cat of category) {
    const res = await fetchTrends(cat);
    const log = getMinMongoRes(res);
    console.log(log);
  }
  console.log("finish parsing trends");
}
