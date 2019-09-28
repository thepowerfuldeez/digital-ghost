module.exports = function(timeMs) {
    return new Promise(resolve => {
        setTimeout(resolve, timeMs);
    });
};
