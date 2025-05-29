const methodsReturningCursor = [
    'find',
    'aggregate',
    'listIndexes',
    'listCollections',
];

const getQuestionPromise = (MongoDB, question, messageId) => {
    const { data: questionData } = question;
    const { collection, queryType, queryFilter, chainedOps } = questionData;

    const mongoCollection = MongoDB.collection(collection);

    if (typeof mongoCollection[queryType] === 'function') {
        let query = mongoCollection[queryType](queryFilter);

        // Apply chained operations
        for (const op of chainedOps) {
            query = query[op.operation](op.params);
        }

        if (methodsReturningCursor.includes(queryType)) {
            query = query.toArray();
        }

        return query;
    } else {
        throw new Error(
            `Invalid query type: ${queryType}\n messageId:${messageId}`
        );
    }
};

const getAnswerPromise = (MongoDB, answer, messageId) => {
    const { data: answerData } = answer;
    const { collection, queryType, queryFilter, chainedOps } = answerData;

    const mongoCollection = MongoDB.collection(collection);

    if (typeof mongoCollection[queryType] === 'function') {
        let query = mongoCollection[queryType](queryFilter);

        // Apply chained operations
        for (const op of chainedOps) {
            query = query[op.operation](op.params);
        }

        if (methodsReturningCursor.includes(queryType)) {
            query = query.toArray();
        }

        return query;
    } else {
        throw new Error(
            `Invalid query type: ${queryType}\n messageId:${messageId}`
        );
    }
};

const attachPromise = (MongoDB, question, answer, messageId) => {
    const promises = {};

    if (!question.isResponseCached && !answer.isResponseCached) {
        // question
        const questionPromise = getQuestionPromise(
            MongoDB,
            question,
            messageId
        );
        Object.assign(promises, {
            question: { ...question, promise: questionPromise },
        });

        // answer
        const answerPromise = getAnswerPromise(MongoDB, answer, messageId);
        Object.assign(promises, {
            answer: { ...answer, promise: answerPromise },
        });
    } else if (!question.isResponseCached) {
        const questionPromise = getQuestionPromise(
            MongoDB,
            question,
            messageId
        );
        Object.assign(promises, {
            question: { ...question, promise: questionPromise },
            answer,
        });
    } else if (!answer.isResponseCached) {
        const answerPromise = getAnswerPromise(MongoDB, answer, messageId);
        Object.assign(promises, {
            answer: { ...answer, promise: answerPromise },
            question,
        });
    } else {
        // if both keys are present in redis, then there was no need to call this lambda
        throw new Error('Invalid request');
    }

    return promises;
};

module.exports = attachPromise;
