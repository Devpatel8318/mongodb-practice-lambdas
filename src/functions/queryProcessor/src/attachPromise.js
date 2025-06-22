// * Commenting this as I think it is necessary for user to add .toArray() to the query as it is part of syntax
// const methodsReturningCursor = [
// 'find',
// 'aggregate',
// 'listIndexes',
// 'listCollections',
// ];

const WRITE_OPS = new Set([
    'insertOne',
    'insertMany',
    'updateOne',
    'updateMany',
    'deleteOne',
    'deleteMany',
]);

const getMongoPromise = async (
    MongoClientRead,
    MongoClientWrite,
    item,
    messageId
) => {
    const { data } = item;
    const {
        collection,
        queryType,
        queryFilter,
        queryUpdate,
        queryOptions,
        chainedOps,
    } = data;

    const dbName = 'mongoacademy-public';
    const ReadMongoDB = MongoClientRead.db(dbName);
    const WriteMongoDB = MongoClientWrite.db(dbName);

    if (!WRITE_OPS.has(queryType)) {
        // Read operation
        const mongoCollection = ReadMongoDB.collection(collection);

        if (typeof mongoCollection[queryType] !== 'function') {
            throw new Error(`Invalid query type: ${queryType}`);
        }

        let query = mongoCollection[queryType](queryFilter);
        for (const op of chainedOps || []) {
            query = query[op.operation](op.params);
        }

        return query;
    }

    // Write operation (simulated with rollback)
    const session = MongoClientWrite.startSession();
    const writeCollection = WriteMongoDB.collection(collection);
    let simulatedDocs;

    try {
        await session.withTransaction(async () => {
            switch (queryType) {
                case 'insertOne':
                    await writeCollection.insertOne(queryFilter, { session });
                    break;

                case 'insertMany':
                    await writeCollection.insertMany(queryFilter, { session });
                    break;

                case 'updateOne':
                    await writeCollection.updateOne(queryFilter, queryUpdate, {
                        session,
                        ...(queryOptions || {}),
                    });
                    break;

                case 'updateMany':
                    await writeCollection.updateMany(queryFilter, queryUpdate, {
                        session,
                        ...(queryOptions || {}),
                    });
                    break;

                case 'deleteOne':
                case 'deleteMany':
                    await writeCollection[queryType](queryFilter, { session });
                    break;
            }

            // remove _id from projection for insert operations as _id is always different due to which we can not compare the results
            const projection = ['insertOne', 'insertMany'].includes(queryType)
                ? { _id: 0 }
                : {};
            simulatedDocs = await writeCollection
                .find({}, { session, projection })
                .toArray();

            throw new Error('Rollback after simulated write');
        });
    } catch (e) {
        // ignore
    } finally {
        await session.endSession();
    }

    return simulatedDocs;
};

const attachPromise = (
    MongodbRead,
    MongodbWrite,
    question,
    answer,
    messageId
) => {
    const promises = {};

    if (!question.isResponseCached && !answer.isResponseCached) {
        Object.assign(promises, {
            question: {
                ...question,
                promise: getMongoPromise(
                    MongodbRead,
                    MongodbWrite,
                    question,
                    messageId
                ),
            },
            answer: {
                ...answer,
                promise: getMongoPromise(
                    MongodbRead,
                    MongodbWrite,
                    answer,
                    messageId
                ),
            },
        });
    } else if (!question.isResponseCached) {
        Object.assign(promises, {
            question: {
                ...question,
                promise: getMongoPromise(
                    MongodbRead,
                    MongodbWrite,
                    question,
                    messageId
                ),
            },
            answer,
        });
    } else if (!answer.isResponseCached) {
        Object.assign(promises, {
            answer: {
                ...answer,
                promise: getMongoPromise(
                    MongodbRead,
                    MongodbWrite,
                    answer,
                    messageId
                ),
            },
            question,
        });
    } else {
        // if both keys are present in redis, then there was no need to call this lambda
        throw new Error('Invalid request');
    }

    return promises;
};

module.exports = attachPromise;
