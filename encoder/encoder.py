import tensorflow as tf
import tensorflow_hub as hub
import tf_sentencepiece  # Not used directly but needed to import TF ops.

# The 16-language multilingual module is the default but feel free
# to pick others from the list and compare the results.
module_url = 'https://tfhub.dev/google/universal-sentence-encoder-multilingual/1'  #@param ['https://tfhub.dev/google/universal-sentence-encoder-multilingual/1', 'https://tfhub.dev/google/universal-sentence-encoder-multilingual-large/1', 'https://tfhub.dev/google/universal-sentence-encoder-xling-many/1']

# Set up graph.
g = tf.Graph()
with g.as_default():
    text_input = tf.placeholder(dtype=tf.string, shape=[None])
    multiling_embed = hub.Module(module_url)
    embedded_text = multiling_embed(text_input)
    init_op = tf.group([tf.global_variables_initializer(), tf.tables_initializer()])
g.finalize()

# Initialize session.
session = tf.Session(graph=g)
session.run(init_op)


def vectorize(cleaned_texts):
    vectors = session.run(embedded_text, feed_dict={text_input: cleaned_texts})
    return vectors