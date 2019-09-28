from preprocessing import clean_text
from encoder import vectorize
import sys
sys.path.append("..")
from config import mongo_host, mongo_port, mongo_user, mongo_pass, mongo_db
from pymongo import MongoClient
from tqdm import tqdm


query_posts = {
    "subject": {"$nin": [1, 8, 9, 18]}, 
    "$expr": {"$gt": [{"$strLenCP": "$text"}, 50]},
    "vector": {"$exists": 0}
}


def compute_vectors_on_collection(collection, q, chunksize=1024):
    total_docs = collection.count_documents(q)
    num_processed = 0
    skips_variable = range(0, total_docs, chunksize)
    print(f"processing {total_docs} documents")
    with tqdm(total=total_docs) as pbar:
        for i in range(1, len(skips_variable)):
            # Expand the cursor and retrieve data 
            cur_chunk = collection.find(q, projection={"text": 1})[skips_variable[i-1]:skips_variable[i]]

            items = list(cur_chunk)
            texts_list = [it['text'] for it in items]
            cleaned_texts = [clean_text(text) for text in texts_list]
            vectors = vectorize(cleaned_texts)
            for i in range(len(cleaned_texts)):
                cleaned_text = cleaned_texts[i]
                id_ = items[i]['_id']
                if len(cleaned_text) > 40:
                    num_processed += 1
                    collection.update_one({"_id": id_}, {"$set": {"vector": vectors[i].tolist()}})
            pbar.update(chunksize)
    print(f"processed {num_processed} documents")
    return num_processed

if __name__ == "__main__":
    db = MongoClient(host=mongo_host, port=mongo_port, username=mongo_user, password=mongo_pass)[mongo_db]
    compute_vectors_on_collection(db.raw_posts, query_posts)
