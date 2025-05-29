import {
    EC2Client,
    CreateNatGatewayCommand,
    CreateRouteCommand,
    AllocateAddressCommand,
    DescribeAddressesCommand,
    DescribeNatGatewaysCommand,
} from '@aws-sdk/client-ec2';
import {
    ElasticBeanstalkClient,
    DescribeEnvironmentResourcesCommand,
} from '@aws-sdk/client-elastic-beanstalk';
import {
    AutoScalingClient,
    ResumeProcessesCommand,
} from '@aws-sdk/client-auto-scaling';
import { environments, ROUTE_TABLE_ID, PUBLIC_SUBNET_ID } from './config.js';
import { sleep } from './utils.js';

// Initialize AWS clients
const eb = new ElasticBeanstalkClient({ region: 'ap-south-1' });
const asg = new AutoScalingClient({ region: 'ap-south-1' });
const ec2 = new EC2Client({ region: 'ap-south-1' });

/**
 * Creates a NAT Gateway and configures route table
 * @returns {Promise<string>} NAT Gateway ID
 */
const createNatGateway = async () => {
    console.log('Creating NAT Gateway...');

    console.log(`Looking for available Elastic IPs`);
    const eipResult = await ec2.send(new DescribeAddressesCommand({}));
    let allocationId = eipResult.Addresses?.find(
        (e) => !e.AssociationId
    )?.AllocationId;

    // Create a new EIP if none available
    if (!allocationId) {
        console.log('No available Elastic IPs found, allocating a new one');
        const alloc = await ec2.send(
            new AllocateAddressCommand({ Domain: 'vpc' })
        );
        allocationId = alloc.AllocationId;
        console.log(`New Elastic IP allocated with ID: ${allocationId}`);
    } else {
        console.log(
            `Found available Elastic IP with allocation ID: ${allocationId}`
        );
    }

    console.log(
        `Creating NAT Gateway in subnet ${PUBLIC_SUBNET_ID} using EIP ${allocationId}`
    );
    const natRes = await ec2.send(
        new CreateNatGatewayCommand({
            AllocationId: allocationId,
            SubnetId: PUBLIC_SUBNET_ID,
        })
    );

    const natGatewayId = natRes?.NatGateway?.NatGatewayId;
    console.log(`NAT Gateway creation initiated with ID: ${natGatewayId}`);

    // Wait for NAT Gateway to become available
    console.log('Waiting for NAT Gateway to become available...');
    let attempts = 0;
    let success = false;

    while (attempts < 30) {
        const check = await ec2.send(
            new DescribeNatGatewaysCommand({
                NatGatewayIds: [natGatewayId],
            })
        );

        const state = check?.NatGateways?.[0]?.State;
        console.log(`NAT Gateway state check (${attempts + 1}/30): ${state}`);

        if (state === 'available') {
            success = true;
            break;
        }

        await sleep(15000);
        attempts++;
    }

    if (!success) {
        const error =
            'Failed to create NAT Gateway: Timed out waiting for available state';
        console.error(error);
        throw new Error(error);
    }

    // Create route to internet via NAT Gateway
    console.log(
        `Creating route in table ${ROUTE_TABLE_ID} via NAT Gateway ${natGatewayId}`
    );
    await ec2.send(
        new CreateRouteCommand({
            RouteTableId: ROUTE_TABLE_ID,
            DestinationCidrBlock: '0.0.0.0/0',
            NatGatewayId: natGatewayId,
        })
    );

    console.log(
        `NAT Gateway ${natGatewayId} is ready and route has been added`
    );
    return natGatewayId;
};

const resumeAutoScalingGroups = async () => {
    console.log('Resuming Auto Scaling processes for environments');

    await Promise.all(
        environments.map(async ({ environmentName, environmentId }) => {
            console.log(
                `Resuming processes for environment: ${environmentName}`
            );

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
                new ResumeProcessesCommand({
                    AutoScalingGroupName: asgName,
                })
            );

            console.log(`Successfully resumed processes for ASG: ${asgName}`);
        })
    );

    console.log('All Auto Scaling groups resumed successfully');
};

export const wakeResources = async () => {
    console.log('Starting wake operation for all resources');

    const natGatewayId = await createNatGateway();
    console.log(`NAT Gateway ready: ${natGatewayId}`);

    await resumeAutoScalingGroups();

    console.log('Wake operation completed successfully');
};
