const { MongoClient } = require('mongodb');
const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const attachPromise = require('./attachPromise');

const client = new SQSClient();
const mongoUri = process.env.MONGODB_URL;
const responseQueueUrl =
    process.env.MONGOACADEMY_QUERYPROCESSOR_TO_SOCKETSERVER_QUEUE_URL;
const IS_LOCAL = process.env.IS_LOCAL || false;

let mongoClient;

const getMongoClient = async () => {
    if (mongoClient && mongoClient.topology?.isConnected()) {
        console.log('Reusing existing MongoDB client');
        return mongoClient;
    }

    console.log('Initializing new MongoDB client');
    mongoClient = new MongoClient(mongoUri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
    });

    await mongoClient.connect();
    return mongoClient;
};

const sendMessageToSQS = async (message, messageAttributes) => {
    const command = new SendMessageCommand({
        QueueUrl: responseQueueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: messageAttributes,
    });
    await client.send(command);
};

exports.handler = async (event) => {
    console.log('message came: ', JSON.stringify(event));

    let ev;

    if (IS_LOCAL) {
        ev = {
            body: event.Body,
            messageAttributes: event.MessageAttributes,
            messageId: event.MessageId,
        };
    } else {
        ev = event.Records[0];
    }

    const { body: eventRecordBody, messageAttributes, messageId } = ev;

    console.log('MessageId: ', messageId);

    const body = JSON.parse(eventRecordBody);
    console.log('body: ', JSON.stringify(body));

    try {
        const { question, answer, socketId, submissionId } = body;
        const { questionId } = question;

        const client = await getMongoClient();
        console.log('Connected to MongoDB');
        const MongoDB = client.db('mongoDbPractice');

        const promises = attachPromise(MongoDB, question, answer, messageId);

        const promiseArray = [
            promises.question.promise || 'cached',
            promises.answer.promise || 'cached',
        ];

        const [questionResult, answerResult] = await Promise.allSettled(
            promiseArray
        );

        if (questionResult.status === 'rejected')
            throw new Error(questionResult.reason);
        if (answerResult.status === 'rejected')
            throw new Error(answerResult.reason);

        const newMessageAttributes = Object.entries(messageAttributes).reduce(
            (acc, [key, value]) => {
                acc[key] = {
                    DataType: value.dataType || value.DataType,
                    StringValue: value.stringValue || value.StringValue,
                };
                return acc;
            },
            {}
        );

        const responseObject = {
            questionId,
            socketId,
            submissionId,
            question:
                questionResult.value === 'cached'
                    ? question
                    : { ...question, resolved: questionResult.value },
            answer:
                answerResult.value === 'cached'
                    ? answer
                    : { ...answer, resolved: answerResult.value },
        };

        console.log('responseObject: ', JSON.stringify(responseObject));
        console.log('newMessageAttributes: ', newMessageAttributes);

        await sendMessageToSQS(responseObject, newMessageAttributes);
        console.log('Query processed and response sent to SQS:');

        return {
            statusCode: 200,
            body: JSON.stringify({
                success: true,
                message: 'Query processed successfully',
            }),
        };
    } catch (err) {
        console.error(err);
        throw new Error(
            `Query processing failed with messageId:${messageId} \nError:${err.message}`
        );
    }
};
