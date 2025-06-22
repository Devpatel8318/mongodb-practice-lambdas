const WRITE_OPS = [
    'insertOne',
    'insertMany',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
];

const DB_NAME = 'mongoacademy-public';

const executeReadQuery = (
    collection,
    queryType,
    queryFilter,
    chainedOps = []
) => {
    if (typeof collection[queryType] !== 'function') {
        throw new Error(`Invalid query type: ${queryType}`);
    }

    let query = collection[queryType](queryFilter);
    for (const { operation, params } of chainedOps) {
        query = query[operation](params);
    }

    return query;
};

const executeSimulatedWriteQuery = async (
    collection,
    queryType,
    queryFilter,
    queryUpdate,
    queryOptions,
    session
) => {
    switch (queryType) {
        case 'insertOne':
            await collection.insertOne(queryFilter, { session });
            break;
        case 'insertMany':
            await collection.insertMany(queryFilter, { session });
            break;
        case 'updateOne':
        case 'updateMany':
            await collection[queryType](queryFilter, queryUpdate, {
                session,
                ...(queryOptions || {}),
            });
            break;
        case 'deleteOne':
        case 'deleteMany':
            await collection[queryType](queryFilter, { session });
            break;
    }

    // remove _id from projection for insert operations as _id is always different due to which we can not compare the results
    const projection = ['insertOne', 'insertMany'].includes(queryType)
        ? { _id: 0 }
        : {};

    return await collection.find({}, { session, projection }).toArray();
};

const getMongoPromise = async (MongoClientRead, MongoClientWrite, item) => {
    const {
        collection,
        queryType,
        queryFilter,
        queryUpdate,
        queryOptions,
        chainedOps,
    } = item.data;

    const ReadCollection = MongoClientRead.db(DB_NAME).collection(collection);
    const WriteCollection = MongoClientWrite.db(DB_NAME).collection(collection);

    const isWriteOperation = WRITE_OPS.includes(queryType);

    if (!isWriteOperation) {
        return executeReadQuery(
            ReadCollection,
            queryType,
            queryFilter,
            chainedOps
        );
    }

    const session = MongoClientWrite.startSession();
    let simulatedDocs;

    try {
        await session.withTransaction(async () => {
            simulatedDocs = await executeSimulatedWriteQuery(
                WriteCollection,
                queryType,
                queryFilter,
                queryUpdate,
                queryOptions,
                session
            );

            throw new Error('Rollback after simulated write');
        });
    } catch (_) {
        // ignore rollback error
    } finally {
        await session.endSession();
    }

    return simulatedDocs;
};

const attachPromise = (
    MongoClientRead,
    MongoClientWrite,
    question,
    answer,
    messageId
) => {
    const wrapWithPromise = (item) => ({
        ...item,
        promise: getMongoPromise(
            MongoClientRead,
            MongoClientWrite,
            item,
            messageId
        ),
    });

    if (answer.isResponseCached && question.isResponseCached) {
        // both question and answer are cached, so we don't need to call the lambda
        throw new Error('Invalid request');
    }

    return {
        question: question.isResponseCached
            ? question
            : wrapWithPromise(question),
        answer: answer.isResponseCached ? answer : wrapWithPromise(answer),
    };
};

module.exports = attachPromise;
