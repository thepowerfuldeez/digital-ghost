const URL_REGEX = /(https?:\/\/)?([^@:]:[^@:]+@)?([\-a-zа-яёЁ0-9\._]{1,256}\.[a-zа-яёЁ0-9\-]{2,24}|[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})(:[0-9]{1,5})?\/?([^\s]+)?/ig;
const URL_BAD_LAST_SYMBOLS_REGEX = /[\]\)\},\.:;\?\!"'\-]$/;

module.exports = function(text) {
    let m = text.replace(/<a\s+href=.*?>.*?<\/a>/gi, '').match(URL_REGEX);

    if (m) {
        let used = {};
        let shadow = '.'.repeat(text.length);

        if (m.length > 1) {
            m.sort(function(a,b) {
                if (a > b) {
                    return -1;
                } else if (a < b) {
                    return +1;
                } else {
                    return 0;
                }
            });
        }

        m.forEach(url => {
            // remove all html
            url = url.replace(/<\/?.*?\>/ig, '');

            // remove last punctuation sign
            let last = url.match(URL_BAD_LAST_SYMBOLS_REGEX);
            if (last && last[0].length == 1) {
                url = url.slice(0, -1);
            }

            if (used[url]) { return; }

            let lastPos = 0;

            while (true) {
                let pos = text.indexOf(url, lastPos);
                if (pos < 0) { break };

                if (shadow.slice(pos, pos+1) === 'x') {
                    lastPos = pos + url.length;
                    continue;
                }

                let urlFull = (url.indexOf('http') === 0 || url.indexOf('//') === 0) ? url : '//' + url;
                let tag = `<a href="${urlFull}" target="_blank">${url}</a>`;

                text = text.slice(0, pos) + tag + text.slice(pos + url.length);
                shadow = shadow.slice(0, pos) + 'x'.repeat(tag.length) + shadow.slice(pos + url.length);

                lastPos = pos + tag.length;
            }

            used[url] = true;
        });
    }

    return text;
};
