import {
    CloudWatchLogsClient,
    PutLogEventsCommand,
    CreateLogGroupCommand,
    CreateLogStreamCommand,
    DescribeLogStreamsCommand,
    PutRetentionPolicyCommand,
} from '@aws-sdk/client-cloudwatch-logs';

import { getGroupAndStream } from './groupsAndStreams.js';

const cloudwatch = new CloudWatchLogsClient({ region: 'ap-south-1' });

const getSequenceToken = async (groupName, streamName) => {
    const describe = await cloudwatch.send(
        new DescribeLogStreamsCommand({
            logGroupName: groupName,
            logStreamNamePrefix: streamName,
        })
    );
    return describe.logStreams?.[0]?.uploadSequenceToken;
};

const createResources = async (groupName, streamName) => {
    try {
        await cloudwatch.send(
            new CreateLogGroupCommand({ logGroupName: groupName })
        );
    } catch (err) {
        if (err.name !== 'ResourceAlreadyExistsException') throw err;
    }

    try {
        await cloudwatch.send(
            new CreateLogStreamCommand({
                logGroupName: groupName,
                logStreamName: streamName,
            })
        );
    } catch (err) {
        if (err.name !== 'ResourceAlreadyExistsException') throw err;
    }

    await cloudwatch.send(
        new PutRetentionPolicyCommand({
            logGroupName: groupName,
            retentionInDays: 14,
        })
    );
};

export const sendLogToCloudWatch = async (
    group,
    stream,
    logEvent,
    cacheKey,
    retry = true
) => {
    const { group: groupName, stream: streamName } = getGroupAndStream(
        group,
        stream
    );

    let sequenceToken = await getSequenceToken(groupName, streamName);

    const attemptSend = async (token) => {
        return cloudwatch.send(
            new PutLogEventsCommand({
                logGroupName: groupName,
                logStreamName: streamName,
                logEvents: [logEvent],
                sequenceToken: token,
            })
        );
    };

    try {
        await attemptSend(sequenceToken);
    } catch (error) {
        if (error.name === 'InvalidSequenceTokenException') {
            const expectedToken = error.message?.match(
                /sequenceToken is: (\w+)/
            )?.[1];
            if (expectedToken) {
                await attemptSend(expectedToken);
                return;
            }
        }

        if (
            retry &&
            (error.name === 'ResourceNotFoundException' ||
                error.message?.includes('log group') ||
                error.message?.includes('log stream'))
        ) {
            await createResources(groupName, streamName);
            return await sendLogToCloudWatch(
                group,
                stream,
                logEvent,
                cacheKey,
                false
            );
        }

        throw error;
    }
};
