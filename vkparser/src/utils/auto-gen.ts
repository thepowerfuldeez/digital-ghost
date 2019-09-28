import SummaryTool from "node-summary";
import { connectToDb } from "./mongo";

async function generate() {
  const db = await connectToDb();
  const trendsCol = db.collection("trends");
  const finalCol = db.collection("auto_posts");

  const rawData = await trendsCol.find({}).toArray();

  let title: string;
  for (const trend of rawData) {
    title = trend.trend_snippet;
    const texts = trend.result_texts;

    const finalData = [];
    for (const text of texts) {
      if (text.length > 50) {
        const sentences = await sum(text, 3);
        const str = sentences.join(" ");
        finalData.push(str);
      }
    }
    const finalText = finalData.join(" ");
    const out = {
      title: title.slice(0, -4),
      text: finalText,
    };

    const res = await finalCol.insertOne(out);
  }
}

async function sum(text: any, count: number) {
  return new Promise<string[]>((resolve, reject) => {
    SummaryTool.getSortedSentences(text, count, function(
      err: any,
      summary: any
    ) {
      if (err) {
        resolve([]);
      }

      resolve(summary);
      console.log(summary);
    });
  });
}

generate().catch(console.log);
