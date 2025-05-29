import {
    EC2Client,
    TerminateInstancesCommand,
    DescribeNatGatewaysCommand,
    DeleteNatGatewayCommand,
    DeleteRouteCommand,
    ReleaseAddressCommand,
} from '@aws-sdk/client-ec2';
import {
    ElasticBeanstalkClient,
    DescribeEnvironmentResourcesCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import {
    AutoScalingClient,
    UpdateAutoScalingGroupCommand,
} from '@aws-sdk/client-auto-scaling';
import { environments, VPC_ID, ROUTE_TABLE_ID } from './config.js';
import { sleep } from './utils.js';

const eb = new ElasticBeanstalkClient({ region: 'ap-south-1' });
const asg = new AutoScalingClient({ region: 'ap-south-1' });
const ec2 = new EC2Client({ region: 'ap-south-1' });

const deleteNatGateway = async () => {
    console.log(`Looking for active NAT Gateways in VPC: ${VPC_ID}`);

    const natResult = await ec2.send(
        new DescribeNatGatewaysCommand({
            Filter: [{ Name: 'vpc-id', Values: [VPC_ID] }],
        })
    );

    const natGateway = natResult.NatGateways?.find(
        (nat) => nat.State === 'pending' || nat.State === 'available'
    );

    if (!natGateway) {
        console.log('No active NAT Gateway found');
        return;
    }

    const natGatewayId = natGateway.NatGatewayId;
    console.log(`Found active NAT Gateway: ${natGatewayId}`);

    // Save EIP allocation ID for later cleanup
    let eipAllocationId = natGateway.NatGatewayAddresses?.[0]?.AllocationId;
    console.log(`Associated EIP allocation ID: ${eipAllocationId}`);

    // Delete route to internet via NAT Gateway
    try {
        console.log(
            `Deleting route to internet (0.0.0.0/0) from route table ${ROUTE_TABLE_ID}`
        );
        await ec2.send(
            new DeleteRouteCommand({
                RouteTableId: ROUTE_TABLE_ID,
                DestinationCidrBlock: '0.0.0.0/0',
            })
        );
        console.log('Route deleted successfully');
    } catch (err) {
        console.warn(`Failed to delete route: ${err.message}`);
    }

    console.log(`Requesting deletion of NAT Gateway: ${natGatewayId}`);
    await ec2.send(new DeleteNatGatewayCommand({ NatGatewayId: natGatewayId }));

    console.log('Waiting for NAT Gateway to be deleted...');
    let attempts = 0;
    let isDeleted = false;

    while (attempts < 30) {
        await sleep(10000);

        const status = await ec2.send(
            new DescribeNatGatewaysCommand({ NatGatewayIds: [natGatewayId] })
        );

        const currentState = status?.NatGateways?.[0]?.State;
        console.log(
            `NAT Gateway deletion check (${attempts + 1}/30): ${currentState}`
        );

        if (!currentState || currentState === 'deleted') {
            isDeleted = true;
            console.log('NAT Gateway deleted successfully');
            break;
        }

        attempts++;
    }

    // Release the Elastic IP if NAT Gateway is deleted
    if (eipAllocationId && isDeleted) {
        console.log(
            `Releasing Elastic IP with allocation ID: ${eipAllocationId}`
        );
        await ec2.send(
            new ReleaseAddressCommand({ AllocationId: eipAllocationId })
        );
        console.log('Elastic IP released successfully');
    } else if (!isDeleted) {
        console.warn('NAT Gateway deletion timed out, EIP not released');
    }
};

const suspendAutoScalingGroups = async () => {
    console.log('Suspending Auto Scaling processes and terminating instances');

    await Promise.all(
        environments.map(async ({ environmentName, environmentId }) => {
            console.log(`Processing environment: ${environmentName}`);

            const envData = await eb.send(
                new DescribeEnvironmentResourcesCommand({
                    EnvironmentName: environmentName,
                    EnvironmentId: environmentId,
                })
            );

            const asgName =
                envData.EnvironmentResources.AutoScalingGroups[0].Name;
            console.log(
                `Found ASG: ${asgName} for environment: ${environmentName}`
            );

            await asg.send(
                new UpdateAutoScalingGroupCommand({
                    AutoScalingGroupName: asgName,
                    MinSize: 0,
                    DesiredCapacity: 0,
                    MaxSize: 0,
                })
            );

            console.log(`Environment ${environmentName} processing complete`);
        })
    );

    console.log('All Auto Scaling groups suspended and instances terminated');
};

export const sleepResources = async () => {
    console.log('Starting sleep operation for all resources');

    await suspendAutoScalingGroups();

    await deleteNatGateway();

    console.log('Sleep operation completed successfully');
};
