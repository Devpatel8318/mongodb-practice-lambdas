const { sendLogToCloudWatch } = require('./helper.js');

const logToCloudWatch = async ({ data }) => {
    const groupName = 'lambdas';
    const streamName = `queryProcessor-${process.env.NODE_ENV}`;

    const cacheKey = `${groupName}:${streamName}`;

    let message;
    try {
        message = typeof data === 'string' ? data : JSON.stringify(data);
    } catch (error) {
        console.error('Failed to stringify data:', error);
        throw new Error('Failed to stringify data for logging');
    }

    const logEvent = {
        message,
        timestamp: Date.now(),
    };

    await sendLogToCloudWatch(groupName, streamName, logEvent, cacheKey, true);
};

module.exports = { logToCloudWatch };
