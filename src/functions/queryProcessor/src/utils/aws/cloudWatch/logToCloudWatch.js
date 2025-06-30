import { sendLogToCloudWatch } from './helper.js';
import { getGroupAndStream } from './groupsAndStreams.js';

export const logToCloudWatch = async ({ group, stream, data }) => {
    const { group: groupName, stream: streamName } = getGroupAndStream(
        group,
        stream
    );
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

    await sendLogToCloudWatch(group, stream, logEvent, cacheKey, true);
};
