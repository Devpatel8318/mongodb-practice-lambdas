const { Consumer } = require('sqs-consumer');
const { SQSClient } = require('@aws-sdk/client-sqs');
const { config } = require('dotenv');
config();

const startMessageConsumer = () => {
    console.log('Starting SQS message consumer...');
    const consumerApp = Consumer.create({
        queueUrl: process.env.MONGOACADEMY_REST_TO_QUERYPROCESSOR_QUEUE_URL,
        sqs: new SQSClient({
            region: process.env.AWS_REGION,
            credentials: {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
            },
        }),
        // pollingWaitTimeMs: 600000, // 10 minutes
        pollingWaitTimeMs: 5000, // 5 seconds
        messageAttributeNames: ['All'],
        batchSize: 1,
        handleMessage: async (message) => {
            try {
                const result = await require('./src/index.js').handler(message);
                console.log('Lambda result:', result);
            } catch (err) {
                console.error('Lambda failed:', err);
                // throw err;
            }
        },
    });

    consumerApp.on('error', (error) => {
        console.error('Consumer error:', error.message);
    });

    consumerApp.on('processing_error', (error) => {
        console.error('Processing error:', error.message);
    });

    consumerApp.on('timeout_error', (err) => {
        console.error(err.message);
    });

    consumerApp.start();
};

startMessageConsumer();
