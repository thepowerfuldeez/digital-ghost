import re
import emoji


def remove_all_occurences(pattern, s):
    while True:
        newS = re.sub(pattern, "", s)
        if newS == s:
            break
        s = newS
    return s
    
    
def clean_text(text, rm_links=True, rm_emoji=True):
    # remove mentions like [club232398/PUBLIC_NAME]
    text = remove_all_occurences("\[club.*\]", text)
    if rm_emoji:
        # rm all emoji
        text = emoji.get_emoji_regexp().sub('', text)
    if rm_links:
        # rm all links
        text = remove_all_occurences("https?://.*(?!\s)", text)
    # rm all hashtags
    text = remove_all_occurences("#\w+", text).strip()
    return text