import { checkStatus } from './statusCheck.js';
import { wakeResources } from './wake.js';
import { sleepResources } from './sleep.js';

export const handler = async (event) => {
    console.log('Lambda invoked with event:', JSON.stringify(event));

    const queryParams = event.queryStringParameters || {};
    const action = queryParams.action;

    console.log(`Requested action: ${action || 'status check'}`);

    // Status check (no action specified)
    if (!action) {
        try {
            const status = await checkStatus();
            console.log(`Status check complete, result: ${status}`);

            return {
                statusCode: 200,
                body: status,
            };
        } catch (err) {
            console.error('Status check failed:', err);
            return {
                statusCode: 500,
                body: 'Failed to check infrastructure state',
            };
        }
    }

    // Validate action
    if (!['wake', 'sleep'].includes(action)) {
        console.warn(`Invalid action requested: ${action}`);
        return {
            statusCode: 400,
            body: JSON.stringify({
                error: "Invalid action. Use 'wake' or 'sleep'.",
            }),
        };
    }

    try {
        if (action === 'sleep') {
            console.log('Starting sleep operation');
            await sleepResources();
            console.log('Sleep operation completed successfully');
        } else if (action === 'wake') {
            console.log('Starting wake operation');
            await wakeResources();
            console.log('Wake operation completed successfully');
        }

        return {
            statusCode: 200,
            body: `${action} completed successfully`,
        };
    } catch (err) {
        console.error(`${action} operation failed:`, err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: `${action} failed: ${err.message}` }),
        };
    }
};
