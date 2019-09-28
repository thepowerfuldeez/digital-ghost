"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
function sliceArrayToChunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        const chunk = array.slice(i, i + size);
        chunks.push(chunk);
    }
    return chunks;
}
exports.sliceArrayToChunk = sliceArrayToChunk;
function getMinMongoRes(res) {
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
exports.getMinMongoRes = getMinMongoRes;
//# sourceMappingURL=common.js.map