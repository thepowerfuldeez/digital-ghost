from scipy.spatial.distance import cosine
from tqdm import tqdm
from pymongo import MongoClient
import sys
sys.path.append("..")
from encoder.preprocessing import clean_text
from encoder.encoder import vectorize
from config import mongo_host, mongo_port, mongo_user, mongo_pass, mongo_db, index_prefix
from sklearn.externals import joblib

models = {}
sentiment = joblib.load("sentiment.p")
models["sentiment"] = sentiment


def make_final_comments(collection_posts, collection_comments, q, models, collection_out):
    for post in tqdm(collection_posts.find(q)):
        post_id = post['id']
        for comment in collection_comments.find({"post_id": post_id}):
            vector = vectorize([comment['text']])[0]
            positive_score = models['sentiment'].predict_proba([vector])[0, 1]
            comment['positive_score'] = positive_score
            collection_out.insert_one(comment)
        collection_posts.update_one({"id": post_id}, {"$set": {"comments_processed": 1}})

        
if __name__ == "__main__":
    db = MongoClient(host=mongo_host, port=mongo_port, username=mongo_user, password=mongo_pass)[mongo_db]
    
    query = {"comments_processed": {"$exists": 0}}
    make_final_comments(db.final_posts, db.raw_comments, query, models, db.final_comments) 
    