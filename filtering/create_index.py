import numpy as np
from pymongo import MongoClient
from simpleneighbors import SimpleNeighbors
from tqdm import tqdm, trange
import sys
sys.path.append("..")
from config import mongo_host, mongo_port, mongo_user, mongo_pass, mongo_db, index_prefix


def get_vectors_and_build_index(collection, num_index_trees=40):
    items = list(collection.find({"vector": {"$exists": 1}}, projection={"text": 1, "vector": 1}))
    sentences = [it['text'] for it in items]
    embeddings = np.array([it['vector'] for it in items])
    embedding_dimensions = embeddings.shape[1]
    
    print(f'\nAdding {len(embeddings)} embeddings to index')
    index = SimpleNeighbors(embedding_dimensions, metric='dot')
    for i in trange(embeddings.shape[0]):
        index.add_one(sentences[i], embeddings[i])
    print(f'Building index with {num_index_trees} trees...')
    index.build(n=num_index_trees)
    return index

if __name__ == "__main__":
    db = MongoClient(host=mongo_host, port=mongo_port, username=mongo_user, password=mongo_pass)[mongo_db]
    index = get_vectors_and_build_index(db.raw_posts)
    index.save(index_prefix)