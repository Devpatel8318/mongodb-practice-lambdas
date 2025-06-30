export const GROUPS = {
    BACKEND: 'backend',
    LAMBDAS: 'lambdas',
};

export const STREAMS = {
    BACKEND: {
        REST: 'rest',
    },
    LAMBDAS: {
        API: 'api',
    },
};

export const getGroupAndStream = (group, stream) => {
    const groupName = GROUPS[group];
    const streamName = `${STREAMS[group][stream]}-${process.env.NODE_ENV}`;

    return {
        group: groupName,
        stream: streamName,
    };
};
