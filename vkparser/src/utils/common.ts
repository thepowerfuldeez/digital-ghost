export function sliceArrayToChunk<T>(array: T[], size: number) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) {
    const chunk = array.slice(i, i + size);
    chunks.push(chunk);
  }
  return chunks;
}

export function getMinMongoRes(res: any) {
  if (res) {
    const logRes = {
      nInserted: res.nInserted,
      nUpserted: res.nUpserted,
      nModified: res.nModified,
      nMatched: res.nMatched,
    };
    return logRes;
  }
}
