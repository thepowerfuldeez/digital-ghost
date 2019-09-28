//eslint-ignore-next-line
import gtrend from "google-trends-api";
import { connectToDb, bulkUpsert } from "./mongo";
import { finished } from "stream";

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
    await fetchTrends(cat);
  }
  console.log("finish parsing trends");
}
