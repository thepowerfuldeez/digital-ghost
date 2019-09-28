"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("../config"));
const mongodb_1 = require("mongodb");
const client = mongodb_1.MongoClient.connect(config_1.default.mongo.url, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    reconnectInterval: 1000,
    reconnectTries: Number.MAX_VALUE,
    auth: {
        user: config_1.default.mongo.username,
        password: config_1.default.mongo.password,
    },
    authMechanism: "SCRAM-SHA-1",
});
async function bulkUpsert(array, collection, field) {
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
exports.bulkUpsert = bulkUpsert;
async function connectToDb() {
    const connection = await client;
    const db = await connection.db(config_1.default.mongo.dbName);
    return db;
}
exports.connectToDb = connectToDb;
async function getSubjects() {
    const db = await connectToDb();
    const subjects = db.collection("subjects");
    const res = await subjects.find({}).toArray();
    return res;
}
exports.getSubjects = getSubjects;
async function updateCollection(message, array, col, updateObj) {
    if (!array || array.length === 0) {
        console.error("resive empty array for update");
        return;
    }
    const bulk = col.initializeUnorderedBulkOp();
    for (const id of array) {
        bulk.find({ id }).update(updateObj);
    }
    const res = await bulk.execute();
    console.log(message);
    return res;
}
exports.updateCollection = updateCollection;
//# sourceMappingURL=mongo.js.map