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
antispam_model = joblib.load("../encoder/antispam.p")
models["antispam"] = antispam_model


def get_title(query_vector, text):
    """heuristics to get title"""
    sentences = []
    for block in text.split("."):
        sentences.extend([clean_text(s) for s in block.split("\n") if len(clean_text(s)) > 12])
    vectorized_sents = vectorize([sent for sent in sentences])
    def scoring_function(x):
        metric = cosine(query_vector, x[1]) / (1.5 * len(sentences[x[0]-1]))
        # metric dependent on position (first position weighs more)
        metric += 0.9 / (250 * (2.7 ** (x[0])))
        metric += (int(bool(sentences[x[0]-1].endswith("?")))) / (250 * (2.7 ** (x[0])))
        return metric
    idx = max(enumerate(vectorized_sents, 1), key=scoring_function)[0]
    return sentences[idx-1]


def make_final_posts(collection_trends, q, collection_posts, models, collection_out):
    texts, post_texts, distances, raw_posts_all = [], [], [], []
    success = 0
    total = 0
    for it in collection_trends.find(q):
        total += 1
        texts.append(it['trend_snippet'])
        distances.append(it['dists'])
        result_texts = it['result_texts']
        if result_texts is None:
            continue
        post_texts.append(result_texts)
        raw_posts = list(collection_posts.find({"id": {"$in": it['post_ids']}}))
        raw_posts_ordering = [result_texts.index(raw_post['text']) for raw_post in raw_posts]
        if len(raw_posts_ordering) != len(result_texts) != len(distances):
            continue
        raw_posts = [raw_posts[idx] for idx in raw_posts_ordering]
        raw_posts_all.append(raw_posts)
        success += 1
    print(f"{success} / {total} successful trends parse")
    
    for trend_text, posts_sample, raw_posts_sample, dists in tqdm(zip(texts, post_texts, raw_posts_all, distances)):
        query_vector = vectorize([clean_text(trend_text)])[0]
        
        # take most similar – minimum distance (temporary solution)
#         idx_min_dist = min(enumerate(dists), key=lambda x: x[1])[0]
#         posts_sample = [posts_sample[idx_min_dist]]
        
        # scores for post candidates from top10
        scores = [0 for _ in range(len(dists))]
        posts_vectors = vectorize([clean_text(post) for post in posts_sample])
        for i, post_text in enumerate(posts_sample):
            post_title = get_title(query_vector, post_text)
            raw_posts_sample[i]['title'] = post_title
            raw_post_text = raw_posts_sample[i]['text']
            l = len(raw_post_text) // 3
            raw_post_text = clean_text(raw_post_text[:l], rm_emoji=False, rm_links=False) + raw_post_text[l:2*l] + clean_text(raw_post_text[-l:], rm_emoji=False, rm_links=False)
            raw_posts_sample[i]['clean_text'] = raw_post_text
            spam_prob = models['antispam'].predict_proba([posts_vectors[i]])[0, 1]
#             popularity = models['popularity'](posts_vectors)
#             subject = models['subject'](posts_vectors)

            no_comments = raw_posts_sample[i]['comments']['count'] < 2
            if spam_prob > 0.66:
                print("spam", spam_prob)
                score = 0
            elif no_comments:
                print("no comments")
                score = 0
            else:
                score = dists[i]
                print("added score")
#             if spam_prob .. popularity .. subject:
            scores[i] = score
        print(scores)
        
        for j, score in enumerate(scores):
            if score > 0.45:
                try:
                    collection_out.insert_one(raw_posts_sample[j])
                except: # DuplicateKeyError
                    print("error")
                    pass
        collection_trends.update_one({"trend_snippet": trend_text}, {"$set": {"processed": 1}})

        
if __name__ == "__main__":
    db = MongoClient(host=mongo_host, port=mongo_port, username=mongo_user, password=mongo_pass)[mongo_db]
    
    query = {"processed": {"$exists": 0}}
    make_final_posts(db.trends, query, db.raw_posts, models, db.final_posts) 
    