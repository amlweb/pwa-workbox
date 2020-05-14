let config = require('./config.json');

function getFilename(filename, isProduction) {
    if (isProduction || config.settings.constFilenames) filename = filename.replace(/.([^.]*)$/, '.min.$1');

    return filename;
};

module.exports = getFilename;
