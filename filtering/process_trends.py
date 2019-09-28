from simpleneighbors import SimpleNeighbors
from pymongo import MongoClient
from tqdm import tqdm
import sys
sys.path.append("..")
from config import mongo_host, mongo_port, mongo_user, mongo_pass, mongo_db, index_prefix
from scipy.spatial.distance import cosine

from encoder.encoder import vectorize
from encoder.preprocessing import clean_text


def query_trend_text(query_text, index, num_results=10):
    vector = vectorize([query_text])[0]
    
    # list of num_results texts – results
    search_results = index.nearest(vector, n=num_results)
    dists = [cosine(vector, index.vec(res)) for res in search_results]
    return search_results, dists


def process_trends(collection_in, query, collection_out):
    cur = collection_in.find(query, projection={"articles": 1})
    for item in tqdm(cur, total=collection_in.count_documents(query)):
        articles = item['articles']
        trend_snippet = max(articles, key=lambda x: len(x['snippet']))['snippet']
        trend_snippet = clean_text(trend_snippet)
        vector = vectorize([clean_text(trend_snippet)])[0]
        search_results, dists = query_trend_text(clean_text(trend_snippet), index)
        post_ids = []
        for search_result in search_results:
            post_id_res = db.raw_posts.find_one({"text": search_result})
            if post_id_res:
                post_id = post_id_res['id']
                post_ids.append(post_id)
        if len(post_ids) > 5:
            collection_out.insert_one(
                {"trend_snippet": trend_snippet, "post_ids": post_ids, "result_texts": search_results, "dists": dists}
            )
            collection_in.update_one({"_id": item['_id']}, {"$set": {"processed": 1}}, upsert=True)
        else:
            print(len(post_ids))

if __name__ == "__main__":
    db = MongoClient(host=mongo_host, port=mongo_port, username=mongo_user, password=mongo_pass)[mongo_db]
    index = SimpleNeighbors.load(index_prefix)
    
    query = {"processed": {"$exists": 0}}
    process_trends(db.raw_trends, query, db.trends)
    
    
